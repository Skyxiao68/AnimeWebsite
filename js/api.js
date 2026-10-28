// js/api.js —— AniList GraphQL 数据层（S4）
//
// 分工（PLAN.md §2）：
//   我写：传输、8s 超时、5 分钟缓存、错误归一化、429 读 Retry-After、Jikan 兜底位
//   你写：js/filters.js、js/bookmarks.js、detail 评分表单、catalog Load More、js/motion.js
//
// TODO-1/2/3 已补完（2026-10-27）。每处的坑写在对应注释里，先看注释再看实现。
//
// 页面只认 KIND 这一套分类，不认 HTTP 状态码 —— 这是四态渲染的前提。

const ENDPOINT = 'https://graphql.anilist.co';
const TIMEOUT_MS = 8000;
const TTL_MS = 5 * 60 * 1000;

export const KIND = {
  NETWORK: 'network', // 断网 / DNS / CORS 失败：fetch 自己抛
  TIMEOUT: 'timeout', // 8s 没回，被 AbortController 掐断
  RATE: 'rate', // 429，带 retryAfter
  CLIENT: 'client', // 4xx，或 200 里带 GraphQL errors
  SERVER: 'server', // 5xx
  PARSE: 'parse', // 回来了，但不是 JSON
};

export class ApiError extends Error {
  constructor(kind, message, { status = 0, retryAfter = 0, detail = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- 缓存（5 分钟）
const cache = new Map(); // key -> { at, items }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.items;
}

function cacheSet(key, items) {
  cache.set(key, { at: Date.now(), items });
}

export function clearCache() {
  cache.clear();
}

// ---------------------------------------------------------------- 查询与参数
// 【补 TODO-1】四段的参数分流。
//
// 坑一：PLAN.md 里写的「tv -> type: TV、movies -> type: MOVIE」是错的。
//   AniList 的 MediaType 只有 ANIME / MANGA 两个值，TV / MOVIE 属于 MediaFormat。
//   照 PLAN 的原话写会直接 400：
//     Variable "$type" got invalid value "TV"; Expected type MediaType.
//   正确写法是 type: ANIME 恒真，靠 format: TV / MOVIE 分流。
//
// 坑二：format 不能传 null。`format: $format` 且 $format=null 时排序会失效
//   （SCORE_DESC 照样吐出一堆 averageScore: null 的新番），所以这里备两条查询：
//   带 format 的和不带 format 的，按 section 选一条，别用一个变量糊过去。
const MEDIA_FIELDS = `
        id
        title { romaji english }
        coverImage { large }
        averageScore
        format
        type
`;

const PAGE_QUERY = `query ($page: Int, $perPage: Int, $type: MediaType, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      media(type: $type, sort: $sort, isAdult: false) {${MEDIA_FIELDS}      }
    }
  }`;

const PAGE_QUERY_BY_FORMAT = `query ($page: Int, $perPage: Int, $type: MediaType, $format: MediaFormat, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      media(type: $type, format: $format, sort: $sort, isAdult: false) {${MEDIA_FIELDS}      }
    }
  }`;

// 四段 Home（PLAN.md:25）：Weekly / Top Rated / TV / Movies
const SECTION_SPECS = {
  weekly: { label: 'Weekly', type: 'ANIME', sort: 'TRENDING_DESC' },
  topRated: { label: 'Top Rated', type: 'ANIME', sort: 'SCORE_DESC' },
  tv: { label: 'TV', type: 'ANIME', format: 'TV', sort: 'POPULARITY_DESC' },
  movies: { label: 'Movies', type: 'ANIME', format: 'MOVIE', sort: 'POPULARITY_DESC' },
};

const QUERIES = Object.fromEntries(
  Object.entries(SECTION_SPECS).map(([name, spec]) => [
    name,
    spec.format ? PAGE_QUERY_BY_FORMAT : PAGE_QUERY,
  ]),
);

export const SECTIONS = Object.keys(QUERIES);

export const SECTION_LABEL = Object.fromEntries(
  Object.entries(SECTION_SPECS).map(([name, spec]) => [name, spec.label]),
);

export function variablesFor(section, page = 1, perPage = 12) {
  const spec = SECTION_SPECS[section];
  if (!spec) return null;
  const vars = { page, perPage, type: spec.type, sort: [spec.sort] };
  if (spec.format) vars.format = spec.format; // 没有 format 的段绝不能带这个键
  return vars;
}

// ---------------------------------------------------------------- 传输层
async function raw(query, variables) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
    });
  } catch (err) {
    // fetch 只在网络层失败时抛；4xx/5xx 不会走到这里
    if (err.name === 'AbortError') {
      throw new ApiError(KIND.TIMEOUT, `超过 ${TIMEOUT_MS / 1000}s 没响应`);
    }
    throw new ApiError(KIND.NETWORK, '网络不可达（断网、DNS 或跨域被拒）', { detail: String(err) });
  } finally {
    clearTimeout(timer);
  }

  const status = res.status;
  const retryAfter = Number(res.headers.get('Retry-After') || 0);

  if (status === 429) {
    throw new ApiError(KIND.RATE, `被限流，${retryAfter || '?'}s 后可重试`, { status, retryAfter });
  }
  if (status >= 500) {
    throw new ApiError(KIND.SERVER, `服务端错误 ${status}`, { status });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(KIND.CLIENT, `请求有问题 ${status}`, { status, detail: body.slice(0, 300) });
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(KIND.PARSE, '返回的不是合法 JSON', { status });
  }

  // GraphQL 会把错误塞进 200 的 body 里，这种也算失败
  if (Array.isArray(json.errors) && json.errors.length) {
    throw new ApiError(KIND.CLIENT, json.errors[0].message || 'GraphQL 报错', {
      status,
      detail: JSON.stringify(json.errors).slice(0, 300),
    });
  }

  return json.data;
}

// ---------------------------------------------------------------- 对外入口
export async function section(name, { page = 1, perPage = 12, fresh = false } = {}) {
  const query = QUERIES[name];
  if (!query) throw new ApiError(KIND.CLIENT, `没有这个板块：${name}`);

  const key = `${name}:${page}:${perPage}`;
  if (!fresh) {
    const hit = cacheGet(key);
    if (hit) return { items: hit, cached: true, source: 'anilist' };
  }

  let result;
  try {
    const data = await raw(query, variablesFor(name, page, perPage));
    result = { items: data?.Page?.media ?? [], source: 'anilist' };
  } catch (err) {
    // 兜底也在 try 里：Jikan 兜不住时 fallback 会把原始错误原样抛回来
    result = await fallback(err, name, { page, perPage });
  }

  cacheSet(key, result.items);
  return { ...result, cached: false };

  /* 注意：result.cached 恒为 false —— 只有缓存命中那条早退分支给 true。 */
}

// ---------------------------------------------------------------- Jikan 兜底
// 【补 TODO-3】只兜 NETWORK / TIMEOUT / RATE / SERVER 四类。
// CLIENT 和 PARSE 不兜：query 是你自己写错的，兜了你就永远看不到自己的错。
//
// PLAN.md:99 记过 Jikan 这台机器实测不通；这里的代码路径是留给能通的网络环境的，
// 写对了但可能永远走不到 —— 兜不住时把**原始** ApiError 抛回去，别用 Jikan 的错
// 盖掉 AniList 的错，否则排查时看到的失败原因会是假的。
const JIKAN_BASE = 'https://api.jikan.moe/v4';
const FALLBACK_KINDS = new Set([KIND.NETWORK, KIND.TIMEOUT, KIND.RATE, KIND.SERVER]);

const JIKAN_TOP = {
  weekly: { filter: 'airing' },
  topRated: { filter: 'bypopularity' },
  tv: { type: 'tv' },
  movies: { type: 'movie' },
};

function fromJikan(item) {
  return {
    id: item.mal_id,
    title: { romaji: item.title ?? '', english: item.title_english ?? null },
    coverImage: { large: item.images?.jpg?.large_image_url ?? '' },
    averageScore: typeof item.score === 'number' ? item.score : null,
    format: null,
    type: 'ANIME',
  };
}

async function jikanTop(name, page, perPage) {
  const extra = JIKAN_TOP[name];
  if (!extra) throw new Error(`Jikan 没有对应 ${name} 的映射`);

  const qs = new URLSearchParams({ limit: String(perPage), page: String(page), ...extra });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${JIKAN_BASE}/top/anime?${qs}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    if (!list.length) throw new Error('Jikan 返回空列表');
    return list.map(fromJikan);
  } finally {
    clearTimeout(timer);
  }
}

export async function fallback(err, name, { page = 1, perPage = 12 } = {}) {
  if (!(err instanceof ApiError) || !FALLBACK_KINDS.has(err.kind)) throw err;

  try {
    const items = await jikanTop(name, page, perPage);
    return { items, source: 'jikan' };
  } catch (jikanErr) {
    // 记下兜底为什么没成，但抛出去的还是 AniList 那个错
    const note = `jikan fallback failed: ${jikanErr?.message ?? jikanErr}`;
    err.detail = err.detail ? `${err.detail} | ${note}` : note;
    throw err;
  }
}

// ---------------------------------------------------------------- 文案
// 【补 TODO-2】六类各一句，RATE 带 retryAfter。
// 这里只说人话，别把 GraphQL 原文丢给用户；要看原文去 err.message / err.detail。
export function userMessage(err) {
  if (!(err instanceof ApiError)) return '出了点问题，再试一次。';
  switch (err.kind) {
    case KIND.NETWORK:
      return '连不上 AniList，检查网络后重试。';
    case KIND.TIMEOUT:
      return `等了 ${TIMEOUT_MS / 1000} 秒没回音，网络很慢，重试一次。`;
    case KIND.RATE:
      return `请求太频繁，${err.retryAfter || 30} 秒后再试。`;
    case KIND.SERVER:
      return 'AniList 服务端出错了，过一会儿再试。';
    case KIND.CLIENT:
      return '请求被拒了，多半是查询写错了，去 Console 看原文。';
    case KIND.PARSE:
      return '拿回来的不是数据（解析失败），重试一次。';
    default:
      return '加载失败，再试一次。';
  }
}
