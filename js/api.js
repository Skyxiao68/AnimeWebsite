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

// ---------------------------------------------------------------- 缓存（5 分钟，跨页面与刷新）
// 一级是内存 Map，二级落到 localStorage：index → detail → 返回，或者干脆刷新一次，
// 都不该再打一遍接口。AniList 只给 30 次/分钟，首页冷启动现在也要发 2 条（feed + hero）。
const cache = new Map(); // key -> { at, items }
const LS_KEY = 'mf.anilist.v1';
const LS_MAX_ENTRIES = 24;
const LS_MAX_CHARS = 700000;

function lsAll() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// 写之前先按时间裁一刀，再按字符数裁一刀：详情页一条数据带 relations + recommendations，
// 二十几条就能顶到 1MB，localStorage 塞不下时宁可丢缓存，也不能让页面因为缓存写失败挂掉。
function lsPut(all) {
  let entries = Object.entries(all).filter(([, v]) => v && Date.now() - v.at <= TTL_MS);
  entries.sort((a, b) => b[1].at - a[1].at);
  entries = entries.slice(0, LS_MAX_ENTRIES);
  let text = JSON.stringify(Object.fromEntries(entries));
  while (text.length > LS_MAX_CHARS && entries.length > 1) {
    entries.pop();
    text = JSON.stringify(Object.fromEntries(entries));
  }
  try {
    localStorage.setItem(LS_KEY, text);
  } catch {
    // 配额满 / 隐私模式禁写：内存那份还在，不影响本次会话
  }
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.items;
  if (hit) cache.delete(key);

  const stored = lsAll()[key];
  if (!stored || Date.now() - stored.at > TTL_MS) return null;
  cache.set(key, { at: stored.at, items: stored.items });
  return stored.items;
}

function cacheSet(key, items) {
  const at = Date.now();
  cache.set(key, { at, items });
  const all = lsAll();
  all[key] = { at, items };
  lsPut(all);
}

export function clearCache() {
  cache.clear();
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

// 传输层排队：一页里 hero / 两份 shelf / 放送表是同时发出去的，并行最容易撞限流。
// 相邻两条至少隔 600ms；单条请求本身还是 8s 超时，不受排队影响。
const MIN_GAP_MS = 600;
let lastSentAt = 0;
let chain = Promise.resolve();

function throttle(task) {
  const run = chain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastSentAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSentAt = Date.now();
    return task();
  });
  chain = run.catch(() => {});
  return run;
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
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
        startDate { year }
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

// TV / Movies 按「最新」排（客户 2026-11-16 定的）。直接 START_DATE_DESC 会先吐出
// 一堆 NOT_YET_RELEASED 的无日期条目（连封面都没有），所以两条 shelf 都要加收口：
//   TV    -> status_in: [RELEASING]，只看还在播的，按开播日倒序
//   Movies-> status_in: [FINISHED] + startDate_greater(一年前)，只看已上映的
const LATEST_QUERY = `query ($page: Int, $perPage: Int, $type: MediaType, $format: MediaFormat, $sort: [MediaSort], $statusIn: [MediaStatus], $startedAfter: FuzzyDateInt) {
    Page(page: $page, perPage: $perPage) {
      media(type: $type, format: $format, sort: $sort, status_in: $statusIn, startDate_greater: $startedAfter, isAdult: false) {${MEDIA_FIELDS}      }
    }
  }`;

// FuzzyDateInt 是 YYYYMMDD 的整数，不是 unix 秒；传错会被当成 1970 年前，静默返回空。
function fuzzyDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// 四段 Home（PLAN.md:25）：Weekly / Top Rated / TV / Movies
const SECTION_SPECS = {
  weekly: { label: 'Weekly', type: 'ANIME', sort: 'TRENDING_DESC' },
  topRated: { label: 'Top Rated', type: 'ANIME', sort: 'SCORE_DESC' },
  // TV：连载中 + 最近 90 天开播的已完结。只留 RELEASING 会让上周刚播完的番
  // 直接从首页消失；90 天窗口既能留住刚完结的，也不会把老番翻出来。
  tv: {
    label: 'TV',
    type: 'ANIME',
    format: 'TV',
    sort: 'START_DATE_DESC',
    statusIn: ['RELEASING', 'FINISHED'],
    startedWithinDays: 90,
  },
  movies: {
    label: 'Movies',
    type: 'ANIME',
    format: 'MOVIE',
    sort: 'START_DATE_DESC',
    statusIn: ['FINISHED'],
    startedWithinDays: 365,
  },
};

const QUERIES = Object.fromEntries(
  Object.entries(SECTION_SPECS).map(([name, spec]) => [
    name,
    spec.format ? (spec.statusIn ? LATEST_QUERY : PAGE_QUERY_BY_FORMAT) : PAGE_QUERY,
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
  if (spec.statusIn) vars.statusIn = spec.statusIn;
  if (spec.startedWithinDays) vars.startedAfter = fuzzyDaysAgo(spec.startedWithinDays);
  return vars;
}

// ---------------------------------------------------------------- 传输层
// raw() 负责缓存、排队和一次 429 重试；send() 只做「发出去、判状态、解析」这一件事。
async function raw(query, variables, { noStore = false } = {}) {
  const vars = variables || {};
  const key = `raw:${hash(query + JSON.stringify(vars))}`;
  if (!noStore) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }

  let data;
  try {
    data = await throttle(() => send(query, vars));
  } catch (err) {
    // 429 只自动重试一次：Retry-After 封顶 15s，再久就让页面卡着了，
    // 还不如把 RATE 抛上去让面板说「X 秒后再试」。
    if (!(err instanceof ApiError) || err.kind !== KIND.RATE) throw err;
    const waitMs = Math.min(Math.max(err.retryAfter || 5, 1), 15) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    data = await throttle(() => send(query, vars));
  }

  if (!noStore && data !== undefined && data !== null) cacheSet(key, data);
  return data;
}

async function send(query, variables) {
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

// ---------------------------------------------------------------- 搜索 / 筛选（Catalog）
// 谁用：js/filters.js（你写）。
// 这一层只做一件事：把「关键词 + 一组筛选条件」变成一个请求，再把 items 和
// hasNextPage 一起交出去。筛选状态存哪、URL 怎么同步、Reset 怎么写，都不在这层。

const SEARCH_QUERY = `query ($page: Int, $perPage: Int, $search: String, $genre: [String],
    $format: [MediaFormat], $status: [MediaStatus], $country: CountryCode,
    $year: Int, $season: MediaSeason, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(
        type: ANIME
        isAdult: false
        search: $search
        genre_in: $genre
        format_in: $format
        status_in: $status
        countryOfOrigin: $country
        seasonYear: $year
        season: $season
        sort: $sort
      ) {${MEDIA_FIELDS}      }
    }
  }`;

// 首页整幅海报。单独一条查询，因为 banner、genres 这些字段只有首页用得上，
// 塞进 MEDIA_FIELDS 会让每个卡片请求都变胖。
const HERO_FIELDS = `
      id
      title { romaji english }
      bannerImage
      trailer { id site }
      coverImage { large extraLarge }
      averageScore
      genres
      format
      description(asHtml: false)`;

const HERO_BY_IDS = `query ($ids: [Int]) {
  Page(page: 1, perPage: 25) {
    media(type: ANIME, id_in: $ids, isAdult: false) {${HERO_FIELDS}
    }
  }
}`;

// 主视觉要「今天热度最高的三张」（客户 2026-11-16 定的）。
// AniList 没有现成的「今日热度」字段，所以先拿当天的放送表，再按 popularity 自己排；
// 主题、banner、简介这些只有这里要的字段，按 id 回查一次 —— 放送表那层不带它们。
export async function hero({ count = 3, from = null } = {}) {
  // from 是首页那次「一口气取齐」已经算好的当天列表；没传就自己取一遍（详情页/其它入口）。
  const today = from || (await airingWindow({ days: 1 }));
  const ids = today.slice(0, count).map((m) => m.id);

  // 周中某天排片可能不足三张（放送表按分钟切，冷门日会稀疏），用一周窗口补齐，
  // 别让主视觉缺一张图或少一个按钮。
  if (ids.length < count) {
    for (const m of await airingWindow({ days: 7 })) {
      if (ids.length >= count) break;
      if (!ids.includes(m.id)) ids.push(m.id);
    }
  }

  const data = await raw(HERO_BY_IDS, { ids });
  const byId = new Map(((data && data.Page && data.Page.media) || []).map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// 每周放送表：Weekly Keep Ups 的 Mon–Sun 用它。AniList 的 airingSchedule 能给
// 「某一天正在播什么」，所以日期条是真的在切数据，不是装饰。
const SCHEDULE_QUERY = `query ($from: Int, $to: Int) {
  Page(page: 1, perPage: 30) {
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      airingAt
      media {
        id
        type
        format
        averageScore
        title { romaji english }
        coverImage { large }
      }
    }
  }
}`;

export async function airingDay(dayOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  const from = Math.floor(start.getTime() / 1000);

  // 今天这一格在 homeFeed() 里已经顺手切好了（它本来就拉了 7 天的放送记录），
  // 别再单独打一条回去。其它日期还是要自己的请求。
  const ready = cacheGet(`schedule:${from}`);
  if (ready) return ready;

  const data = await raw(SCHEDULE_QUERY, { from, to: from + 86400 });
  const rows = (data && data.Page && data.Page.airingSchedules) || [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const m = row.media;
    if (!m || m.type !== 'ANIME' || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

// 首页 Ranks 的五个窗口。AniList 没有「日榜/周榜」这种现成的接口，但它有放送表：
// 取某一段时间内播出的番，再按 popularity 自己排一次，口径就是「这段时间更新里最热的」。
// Season/Year 反而有现成过滤条件（season + seasonYear、seasonYear），用得着就不用自己排。
const WINDOW_QUERY = `query ($from: Int, $to: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      media {
        id
        type
        format
        averageScore
        popularity
        title { romaji english }
        coverImage { large }
      }
    }
  }
}`;

// Month 没有真月榜可用：AniList 只给放送表和按季/年过滤，Jikan、TMDB 同样没有月度窗口。
// 拿「正在连载的作品按 trending 排」当替身——trending 是近期活跃度，不是本月增量，
// 但这样排出来的确和 Week（放送表按累计人气）不是同一批，不会两个标签一个内容。
const MONTH_QUERY = `query {
  Page(page: 1, perPage: 30) {
    media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) {
      id
      type
      format
      averageScore
      title { romaji english }
      coverImage { large }
    }
  }
}`;

const CHART_QUERY = `query ($season: MediaSeason, $seasonYear: Int, $sort: [MediaSort]) {
  Page(page: 1, perPage: 30) {
    media(type: ANIME, isAdult: false, season: $season, seasonYear: $seasonYear, sort: $sort) {
      id
      type
      format
      averageScore
      title { romaji english }
      coverImage { large }
    }
  }
}`;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function byPopularity(a, b) {
  return (b.popularity || 0) - (a.popularity || 0);
}

// days=1 是「今天播的」，days=7 是「最近一周播的」。
//
// 一页只给 50 条放送记录，而一天通常有一百多条，只取第一页等于只看到当天前半段，
// 晚上播的高人气番会整段缺席（首页主视觉和 Day 榜都吃这个数）。所以往下翻，
// 最多三页（150 条）足够盖住一天。
//
// 同一天的结果缓存起来：主视觉和 Ranks 的 Day 问的是同一段时间，不该打两遍。
const airingCache = new Map();

async function airingWindow({ days = 1 } = {}) {
  const now = new Date();
  const span = Math.max(1, days);
  // 一周窗口要从「今天往前数第 7 天」起算。原来这里少乘了 (days - 1)，
  // 一周窗口和一天一样都从今天 0 点开始，于是过了午夜就只剩几分钟的放送记录，
  // Week 面板整块空着。
  const fromDay = new Date(startOfDay(now).getTime() - (span - 1) * 86400000);
  const from = Math.floor(fromDay.getTime() / 1000);
  const to = span <= 1 ? from + 86400 : Math.floor(now.getTime() / 1000);

  const key = `${days}:${from}`;
  const cached = airingCache.get(key);
  if (cached) return cached;
  const stored = cacheGet(`airing:${key}`);
  if (stored) {
    airingCache.set(key, stored);
    return stored;
  }

  const seen = new Map();
  for (let page = 1; page <= 3; page += 1) {
    const data = await raw(WINDOW_QUERY, { from, to, page });
    const pageData = (data && data.Page) || {};
    const rows = pageData.airingSchedules || [];
    for (const row of rows) {
      const m = row.media;
      if (!m || m.type !== 'ANIME') continue;
      if (!seen.has(m.id)) seen.set(m.id, m);
    }
    if (!rows.length || !pageData.pageInfo || !pageData.pageInfo.hasNextPage) break;
  }

  const list = [...seen.values()].sort(byPopularity);
  airingCache.set(key, list);
  cacheSet(`airing:${key}`, list);
  return list;
}

// ---------------------------------------------------------------- 首页一次性取齐
const WINDOW_FIELDS = `
        id
        type
        format
        averageScore
        popularity
        title { romaji english }
        coverImage { large }`;

// 首页原来要发 5 条（放送表还会翻到 3 页，最多 9 条）：hero、Weekly、Ranks、TV、Movies。
// 现在用 alias 挤进一条查询，再把 7 天窗口在本地切成「今天 / 这一周」——请求数 5→1。
// 参数只能写字面量：GraphQL 的 variables 是整条查询共享的，几段筛选条件不一样，没法共用。
function homeQuery(weekFrom, to, tvAfter, moviesAfter) {
  const windowPage = (page) => `w${page}: Page(page: ${page}, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: ${weekFrom}, airingAt_lesser: ${to}, sort: TIME) {
      airingAt
      media {${WINDOW_FIELDS}}
    }
  }`;

  return `query {
  ${windowPage(1)}
  ${windowPage(2)}
  ${windowPage(3)}
  tv: Page(page: 1, perPage: 18) {
    media(type: ANIME, isAdult: false, format: TV, sort: START_DATE_DESC,
      status_in: [RELEASING, FINISHED], startDate_greater: ${tvAfter}) {${MEDIA_FIELDS}}
  }
  movies: Page(page: 1, perPage: 18) {
    media(type: ANIME, isAdult: false, format: MOVIE, sort: START_DATE_DESC,
      status_in: [FINISHED], startDate_greater: ${moviesAfter}) {${MEDIA_FIELDS}}
  }
}`;
}

/**
 * 首页唯一的数据入口。返回 { day, week, tv, movies }，并把放送表按缓存键塞好，
 * 让 hero() / airingDay(0) / chart('day'|'week') 直接命中，不再各发一条。
 */
export async function homeFeed() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayFrom = Math.floor(todayStart.getTime() / 1000);
  const weekFrom = todayFrom - 6 * 86400;
  // 窗口右端取「今天结束」，不是「此刻」——两个原因：
  // 一是 Weekly Keep Ups 要整天的排片，凌晨打开时只取到 0 点到现在就只有两三条；
  // 二是右端如果是 now，查询文本每秒都在变，缓存键也跟着变，刷新一次就等于没缓存。
  const to = todayFrom + 86400;

  const data = await raw(homeQuery(weekFrom, to, fuzzyDaysAgo(90), fuzzyDaysAgo(365)));

  const byId = new Map();
  const timed = [];
  for (const alias of ['w1', 'w2', 'w3']) {
    for (const row of (data && data[alias] && data[alias].airingSchedules) || []) {
      const m = row.media;
      if (!m || m.type !== 'ANIME') continue;
      timed.push({ at: row.airingAt, media: m });
      if (!byId.has(m.id)) byId.set(m.id, m);
    }
  }

  const week = [...byId.values()].sort(byPopularity);

  // 当天这份要保留放送顺序（Weekly Keep Ups 是按时间播的），和按人气排的 week 不是一回事。
  const todayEnd = todayFrom + 86400;
  const isToday = (row) => row.at >= todayFrom && row.at < todayEnd;
  const dayIds = new Set(timed.filter(isToday).map((r) => r.media.id));
  const dayPopular = week.filter((m) => dayIds.has(m.id));
  const dayTimed = [];
  const seenDay = new Set();
  for (const row of timed.slice().sort((a, b) => a.at - b.at)) {
    if (!isToday(row) || seenDay.has(row.media.id)) continue;
    seenDay.add(row.media.id);
    dayTimed.push(row.media);
  }

  cacheSet(`airing:7:${weekFrom}`, week);
  cacheSet(`airing:1:${todayFrom}`, dayPopular);
  cacheSet(`schedule:${todayFrom}`, dayTimed);

  return {
    day: dayPopular,
    week,
    tv: (data && data.tv && data.tv.media) || [],
    movies: (data && data.movies && data.movies.media) || [],
  };
}

function currentSeason(date = new Date()) {
  const month = date.getMonth(); // 0 是一月
  if (month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'FALL';
}

/**
 * 首页 Ranks 的数据源。window: day | week | season | year
 * @returns {Promise<Array>} 按窗口排好的条目
 */
export async function chart(windowName, { perPage = 4, fresh = false } = {}) {
  const key = `chart:${windowName}:${perPage}`;
  if (!fresh) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }

  let items;
  if (windowName === 'day' || windowName === 'week') {
    items = await airingWindow({ days: windowName === 'day' ? 1 : 7 });
  } else if (windowName === 'month') {
    const data = await raw(MONTH_QUERY);
    items = (data && data.Page && data.Page.media) || [];
  } else if (windowName === 'season' || windowName === 'year') {
    const now = new Date();
    const vars = { seasonYear: now.getFullYear(), sort: ['POPULARITY_DESC'] };
    if (windowName === 'season') vars.season = currentSeason(now);
    const data = await raw(CHART_QUERY, vars);
    items = (data && data.Page && data.Page.media) || [];
  } else {
    throw new ApiError(KIND.CLIENT, `没有这个榜单窗口：${windowName}`);
  }

  const cut = items.slice(0, perPage);
  cacheSet(key, cut);
  return cut;
}

// URL 上只放这些短名，别把 AniList 的枚举直接写进地址栏。
// key 就是 URL 与 catalog.html 里 data-value 用的短名；前四个照设计稿的 Sort 行，
// newest 是 2026-11-17 客户点的「最新的番」。
export const SEARCH_SORTS = {
  popular: 'POPULARITY_DESC',
  newest: 'START_DATE_DESC',
  score: 'SCORE_DESC',
  trending: 'TRENDING_DESC',
  favourites: 'FAVOURITES_DESC',
};

/**
 * @param {string} q  关键词；空串等于不带 search 参数（此时就是纯筛选）
 * @param {object} f  { country, format, status, genre, year, sort }
 * @param {object} o  { page, perPage, fresh }
 * @returns {Promise<{items: Array, hasNextPage: boolean, source: string, cached: boolean}>}
 */
export async function search(q, f = {}, { page = 1, perPage = 24, fresh = false } = {}) {
  // f.sort 是地址栏和 data-value 用的短名（popular / score / trending / favourites），
  // AniList 要的是枚举值（POPULARITY_DESC…）。直接塞短名接口会回 400。
  const sort = SEARCH_SORTS[f.sort] || SEARCH_SORTS.popular;
  const vars = { page, perPage, sort: [sort] };

  const text = (q || '').trim();
  if (text) vars.search = text;
  if (f.genre) vars.genre = [f.genre];
  if (f.format) vars.format = [f.format];
  // Newest 是 START_DATE_DESC：只按日期倒序的话，AniList 会把「宣布了但没定档」
  // 的条目排在最前，它们的 coverImage 是空的，第一屏就是一排灰框。
  // 所以没显式选状态时，这档只拿已开播和连载中的。
  const newest = sort === SEARCH_SORTS.newest;
  if (f.status) vars.status = [f.status];
  else if (newest) vars.status = ['RELEASING', 'FINISHED'];
  if (f.country) vars.country = f.country; // 单值，不是数组
  if (f.year) vars.year = Number(f.year);
  if (f.season) vars.season = f.season; // WINTER / SPRING / SUMMER / FALL

  const key = `search:${JSON.stringify(vars)}`;
  if (!fresh) {
    const hit = cacheGet(key);
    if (hit) return { ...hit, cached: true, source: 'anilist' };
  }

  let result;
  try {
    const data = await raw(SEARCH_QUERY, vars);
    let items = data?.Page?.media ?? [];
    // START_DATE_DESC 把「日期未知」的条目当空值排在最前（都是几十年前的老片，
    // 有封面但没有开播日），所以日期和封面都得判一下。
    if (newest) items = items.filter((m) => m.coverImage?.large && m.startDate?.year);
    result = {
      items,
      hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
      source: 'anilist',
    };
  } catch (err) {
    result = await fallbackSearch(err, text, vars);
  }

  // 注意：这里缓存的是对象（items + hasNextPage），section() 缓存的是数组；
  // 两者 key 前缀不同（search: / 板块名），不会互相踩。
  cacheSet(key, result);
  return { ...result, cached: false };
}

// Jikan 表达不了 region / format / status / 年份，只能带 q 与分页。
// 兜底失败时仍然抛 AniList 那个原始错误，别用 Jikan 的错盖掉它。
async function fallbackSearch(err, text, vars) {
  if (!(err instanceof ApiError) || !FALLBACK_KINDS.has(err.kind)) throw err;

  const qs = new URLSearchParams({
    // Jikan 单页最多 25 条，放开到 48 会被它自己截断或报错。
    limit: String(Math.min(vars.perPage, 25)),
    page: String(vars.page),
  });
  if (text) qs.set('q', text);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${JIKAN_BASE}/anime?${qs}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    if (!list.length) throw new Error('Jikan 返回空列表');
    return {
      items: list.map(fromJikan),
      hasNextPage: Boolean(json?.pagination?.has_next_page),
      source: 'jikan',
    };
  } catch (jikanErr) {
    const note = `jikan fallback failed: ${jikanErr?.message ?? jikanErr}`;
    err.detail = err.detail ? `${err.detail} | ${note}` : note;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ 详情

// 详情页一次拿齐：简介、关系图、推荐、集数。relations 是 PRD 评审 #01 要的
// 「相关动画」，只有 AniList 有这个字段。
const MEDIA_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${MEDIA_FIELDS}
    description(asHtml: false)
    bannerImage
    season
    seasonYear
    episodes
    duration
    status
    title { native }
    coverImage { extraLarge }
    studios { nodes { name isAnimationStudio } }
    externalLinks { id site url type icon }
    genres
    relations {
      edges {
        relationType(version: 2)
        node {
          id
          type
          format
          averageScore
          title { romaji english }
          coverImage { large }
        }
      }
    }
    recommendations(sort: RATING_DESC, perPage: 12) {
      nodes {
        mediaRecommendation {
          id
          format
          averageScore
          title { romaji english }
          coverImage { large }
        }
      }
    }
  }
}`;

// 详情页没有 Jikan 兜底：Jikan 用 MyAnimeList 的 id，我们手上只有 AniList 的 id，
// 两者之间没有便宜的映射。硬拿标题去搜会给出错位的简介和关系图，比报错更糟。
// 所以这里失败就失败，页面显示错误态 + 重试。
export async function media(id, { fresh = false } = {}) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new ApiError(KIND.CLIENT, 'Missing or malformed title id');
  }

  const key = `media:${numeric}`;
  if (!fresh) {
    const hit = cacheGet(key);
    if (hit) return { ...hit, cached: true };
  }

  const data = await raw(MEDIA_QUERY, { id: numeric });
  const item = data?.Media;
  if (!item) throw new ApiError(KIND.CLIENT, 'AniList returned no title for that id');

  cacheSet(key, item);
  return { ...item, cached: false };
}
