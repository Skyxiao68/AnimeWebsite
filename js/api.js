// js/api.js - AniList GraphQL data layer.
//
// All transport, cache and error mapping live here. Pages only see KIND,
// never an HTTP status.
// 8s timeout, 5 minute cache, 429 honours Retry-After, Jikan as fallback.
// Each trap is explained where the code handles it.

const ENDPOINT = 'https://graphql.anilist.co';
const TIMEOUT_MS = 8000;
const TTL_MS = 5 * 60 * 1000;

export const KIND = {
  NETWORK: 'network', // offline, DNS or CORS: fetch itself rejects,no answer within 8s, cut by AbortController,429, carrying retryAfter,4xx, or a 200 carrying GraphQL errors
  TIMEOUT: 'timeout', // 
  RATE: 'rate', // 
  CLIENT: 'client', // 
  SERVER: 'server', // 5xx
  PARSE: 'parse', // it came back, but not as JSON
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

// ---------------------------------------------------------------- cache (5 min, across pages and reloads)
// Memory Map first, localStorage second: index -> detail -> back, or a plain reload, must not
// hit the API again. AniList allows 30 calls a minute and a cold home already spends two (feed + hero).
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

// Trim by age, then by character count: one detail record carries relations + recommendations,
// and twenty of them reach 1MB. If localStorage cannot take it, drop the cache rather than fail the page.
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
    // Quota full or storage disabled (private mode): the in-memory copy still serves this session.
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

// Transport queue: the hero, both shelves and the airing list all leave at once, and parallel
// calls are what trip the limit. Neighbours are 600ms apart; each call keeps its own 8s timeout.
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

// ---------------------------------------------------------------- queries and arguments
// Four sections, four different argument sets.
//
// Trap 1: the obvious mapping "tv -> type: TV" is wrong.
//   AniList's MediaType has only ANIME / MANGA; TV and MOVIE are MediaFormat values.
//   AniList answers 400:
//     Variable "$type" got invalid value "TV"; Expected type MediaType.
//   The working shape keeps type: ANIME and splits on format: TV / MOVIE.
//
// Trap 2: format cannot be null. With "format: $format" and $format = null the sort collapses
//   (SCORE_DESC happily returns a page of averageScore: null), so keep two queries - one
//   with format, one without - and pick per section instead of hedging with a variable.
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

// TV and Movies sort by newest. START_DATE_DESC alone leads with
// NOT_YET_RELEASED rows that have no date and often no cover, so both shelves get a second condition:
//   TV     -> status_in: [RELEASING], only what is airing, by start date desc
//   Movies -> status_in: [FINISHED] + startDate_greater(one year ago), only what has opened
const LATEST_QUERY = `query ($page: Int, $perPage: Int, $type: MediaType, $format: MediaFormat, $sort: [MediaSort], $statusIn: [MediaStatus], $startedAfter: FuzzyDateInt) {
    Page(page: $page, perPage: $perPage) {
      media(type: $type, format: $format, sort: $sort, status_in: $statusIn, startDate_greater: $startedAfter, isAdult: false) {${MEDIA_FIELDS}      }
    }
  }`;

// FuzzyDateInt is YYYYMMDD as an integer, not unix seconds; pass it wrong and everything lands before 1970 and comes back empty.
function fuzzyDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Four home sections: Weekly / Top Rated / TV / Movies
const SECTION_SPECS = {
  weekly: { label: 'Weekly', type: 'ANIME', sort: 'TRENDING_DESC' },
  topRated: { label: 'Top Rated', type: 'ANIME', sort: 'SCORE_DESC' },
  // TV: airing, plus anything that finished in the last 90 days. RELEASING alone drops a show the
  // week after its finale; the 90 day window keeps those and still refuses to dig up old titles.
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
  if (spec.format) vars.format = spec.format; // sections without a format must never carry this key
  if (spec.statusIn) vars.statusIn = spec.statusIn;
  if (spec.startedWithinDays) vars.startedAfter = fuzzyDaysAgo(spec.startedWithinDays);
  return vars;
}

// ---------------------------------------------------------------- transport
// raw() owns cache, queue and the single 429 retry; send() only posts, checks status and parses.
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
    // Retry 429 once. Cap Retry-After at 15s: a longer wait freezes the page,
    // and the panel can say "retry in Xs" instead.
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
    // fetch only rejects on network-level failures; 4xx/5xx never land here
    if (err.name === 'AbortError') {
      throw new ApiError(KIND.TIMEOUT, `No response in ${TIMEOUT_MS / 1000}s`);
    }
    throw new ApiError(KIND.NETWORK, 'Network unreachable (offline, DNS or blocked by CORS)', { detail: String(err) });
  } finally {
    clearTimeout(timer);
  }

  const status = res.status;
  const retryAfter = Number(res.headers.get('Retry-After') || 0);

  if (status === 429) {
    throw new ApiError(KIND.RATE, `Rate limited, retry in ${retryAfter || '?'}s`, { status, retryAfter });
  }
  if (status >= 500) {
    throw new ApiError(KIND.SERVER, `Server error ${status}`, { status });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(KIND.CLIENT, `Request rejected ${status}`, { status, detail: body.slice(0, 300) });
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(KIND.PARSE, 'Response was not valid JSON', { status });
  }

  // GraphQL puts failures in a 200 body; treat those as failures too
  if (Array.isArray(json.errors) && json.errors.length) {
    throw new ApiError(KIND.CLIENT, json.errors[0].message || 'GraphQL error', {
      status,
      detail: JSON.stringify(json.errors).slice(0, 300),
    });
  }

  return json.data;
}

// ---------------------------------------------------------------- public entry points
export async function section(name, { page = 1, perPage = 12, fresh = false } = {}) {
  const query = QUERIES[name];
  if (!query) throw new ApiError(KIND.CLIENT, `No such section: ${name}`);

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
    // the fallback runs inside the same try: if Jikan also fails, fallback rethrows the original error
    result = await fallback(err, name, { page, perPage });
  }

  cacheSet(key, result.items);
  return { ...result, cached: false };

  /* result.cached is always false here; only the cache-hit early return sets it true. */
}

// ---------------------------------------------------------------- Jikan fallback
// Only NETWORK / TIMEOUT / RATE / SERVER are worth a fallback. CLIENT and PARSE are not:
// those mean your own query is wrong, and falling back would hide it forever.
//
// Jikan is unreachable from this machine. The path stays for networks where
// it works, and when it does not, the ORIGINAL ApiError is rethrown - never let a Jikan error
// mask the AniList one, or every later diagnosis reads the wrong cause.
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
  if (!extra) throw new Error(`Jikan has no mapping for ${name}`);

  const qs = new URLSearchParams({ limit: String(perPage), page: String(page), ...extra });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${JIKAN_BASE}/top/anime?${qs}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    if (!list.length) throw new Error('Jikan returned an empty list');
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
    // remember why the fallback died, but throw the AniList error
    const note = `jikan fallback failed: ${jikanErr?.message ?? jikanErr}`;
    err.detail = err.detail ? `${err.detail} | ${note}` : note;
    throw err;
  }
}

// ---------------------------------------------------------------- copy
// One sentence per kind, RATE carrying retryAfter.
// Plain language only - the GraphQL text stays in err.message / err.detail.
export function userMessage(err) {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (err.kind) {
    case KIND.NETWORK:
      return 'Could not reach AniList. Check your connection and retry.';
    case KIND.TIMEOUT:
      return `No answer after ${TIMEOUT_MS / 1000}s. The network is slow - try again.`;
    case KIND.RATE:
      return `Too many requests. Try again in ${err.retryAfter || 30}s.`;
    case KIND.SERVER:
      return 'AniList returned a server error. Try again in a moment.';
    case KIND.CLIENT:
      return 'The request was rejected - usually a broken query. Check the console.';
    case KIND.PARSE:
      return 'The response was not data (parse failure). Try again.';
    default:
      return 'Could not load. Try again.';
  }
}

// ---------------------------------------------------------------- search / filter (catalog)
// Used by js/filters.js. This layer does one thing: turn "keyword + filter set" into a request
// and hand back items plus hasNextPage. Where filter state lives, how the URL syncs and what
// Reset does are not its business.

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

// The full-bleed hero image. A separate query because banner and genres are only needed on home;
// folding them into MEDIA_FIELDS would fatten every card request.
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

// The hero wants the three hottest right now. AniList has no
// popularity-today field, so take today's airing schedule and sort by popularity ourselves;
// then fetch theme, banner and description by id, since the schedule does not carry them.
export async function hero({ count = 3, from = null } = {}) {
  // from is the day list already computed by the home one-shot; without it, fetch one.
  const today = from || (await airingWindow({ days: 1 }));
  const ids = today.slice(0, count).map((m) => m.id);

  // Some days carry fewer than three airing shows, so pad the window to a week
  // instead of showing a hero with a missing image.
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

// Weekly airing list, the Mon-Sun strip of Weekly Keep Ups. AniList's airingSchedule answers
// "what airs on this day", so each chip gets its own list.
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

  // Today's slice is already computed by homeFeed() (it pulls seven days of airing), so do not
  // fetch it again; other days still need their own request.
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

// The five Ranks windows on home. AniList has no daily or weekly chart, but it has the airing
// schedule: take what aired in a window and sort by popularity - "hottest of what updated in
// that window". Season and Year do have native filters, so use those instead of sorting ourselves.
const WINDOW_QUERY = `query ($from: Int, $to: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      media {
        id
        type
        format
        countryOfOrigin
        genres
        averageScore
        popularity
        title { romaji english }
        coverImage { large }
      }
    }
  }
}`;

// Month has no real chart: AniList offers the airing schedule and season/year filters, and Jikan
// or TMDB have no monthly window either. Use "currently releasing, sorted by trending" as a
// stand-in - trending is recent activity, not this month's gain, but at least it differs from Week.
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

// days=1 is "airing today", days=7 is "airing in the last week".
//
// One page carries 50 schedule rows and a day usually has over a hundred, so page one alone is
// only the first half of the day and the evening hits go missing (hero and Day chart both eat this
// number). Walk three pages (150 rows), which covers a day.
//
// Cache by day: the hero and the Day chart ask for the same window and should not fetch twice.
const airingCache = new Map();

export async function airingWindow({ days = 1 } = {}) {
  const now = new Date();
  const span = Math.max(1, days);
  // The week window starts seven days back from today. This used to miss the (days - 1) term, so the
  // week window began at midnight like the day one and after midnight held a few minutes of records -
  // the Week panel came up empty.
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

// ---------------------------------------------------------------- home in one shot
const WINDOW_FIELDS = `
        id
        type
        format
        countryOfOrigin
        genres
        averageScore
        popularity
        title { romaji english }
        coverImage { large }`;

// Home used to send five calls (the schedule alone paged up to three times: nine worst case):
// hero, Weekly, Ranks, TV, Movies. Now aliases fold them into one query and the seven day window
// is sliced locally - five requests become one. Arguments must be literals: GraphQL variables are
// shared by the whole query and the sections filter differently.
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
 * The only data entry for home. Returns { day, week, tv, movies } and seeds the airing cache so
 * hero() / airingDay(0) / chart('day'|'week') hit it instead of fetching again.
 */
export async function homeFeed() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayFrom = Math.floor(todayStart.getTime() / 1000);
  const weekFrom = todayFrom - 6 * 86400;
  // The window ends at "end of today", not "now": Weekly Keep Ups wants the whole day's schedule,
  // and a "now" endpoint changes every second, which changes the cache key and defeats the cache.
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

  // Today's slice keeps airing order (Weekly Keep Ups plays in time order); the week slice is
  // sorted by popularity and is a different thing.
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
  const month = date.getMonth(); // 0 is January
  if (month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'FALL';
}

/**
 * Data source for home Ranks. window: day | week | season | year
 * @returns {Promise<Array>} entries ordered for the window
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
    throw new ApiError(KIND.CLIENT, `No such chart window: ${windowName}`);
  }

  const cut = items.slice(0, perPage);
  cacheSet(key, cut);
  return cut;
}

// Keep these short names on the URL instead of AniList's enums. key is what the URL and
// catalog.html data-value use; the first four follow the mockup's Sort row, newest is the
// catalog's newest-first sort.
export const SEARCH_SORTS = {
  popular: 'POPULARITY_DESC',
  newest: 'START_DATE_DESC',
  score: 'SCORE_DESC',
  trending: 'TRENDING_DESC',
  favourites: 'FAVOURITES_DESC',
};

/**
 * @param {string} q  keyword; an empty string omits the search argument (pure filtering)
 * @param {object} f  { country, format, status, genre, year, sort }
 * @param {object} o  { page, perPage, fresh }
 * @returns {Promise<{items: Array, hasNextPage: boolean, source: string, cached: boolean}>}
 */
export async function search(q, f = {}, { page = 1, perPage = 24, fresh = false } = {}) {
  // f.sort is the short name used by the URL and data-value (popular / score / trending /
  // favourites); AniList wants the enum (POPULARITY_DESC...). Passing the short name returns 400.
  const sort = SEARCH_SORTS[f.sort] || SEARCH_SORTS.popular;
  const vars = { page, perPage, sort: [sort] };

  const text = (q || '').trim();
  if (text) vars.search = text;
  if (f.genre) vars.genre = [f.genre];
  if (f.format) vars.format = [f.format];
  // Newest is START_DATE_DESC: date alone leads with "announced, undated" rows whose coverImage is
  // empty, so the first screen becomes a row of grey boxes. Without an explicit status this sort
  // therefore takes only released and airing titles.
  const newest = sort === SEARCH_SORTS.newest;
  if (f.status) vars.status = [f.status];
  else if (newest) vars.status = ['RELEASING', 'FINISHED'];
  if (f.country) vars.country = f.country; // single value, not an array
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
    // START_DATE_DESC treats "unknown date" as the smallest value, which puts decades-old films with
    // covers but no date up front, so check the date and the cover.
    if (newest) items = items.filter((m) => m.coverImage?.large && m.startDate?.year);
    result = {
      items,
      hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
      source: 'anilist',
    };
  } catch (err) {
    result = await fallbackSearch(err, text, vars);
  }

  // Note: this caches the object (items + hasNextPage) while section() caches an array, and their
  // key prefixes differ (search: vs section name), so they never collide.
  cacheSet(key, result);
  return { ...result, cached: false };
}

// Jikan cannot express region / format / status / year, only q and paging. A failed fallback still
// throws the original AniList error instead of masking it.
async function fallbackSearch(err, text, vars) {
  if (!(err instanceof ApiError) || !FALLBACK_KINDS.has(err.kind)) throw err;

  const qs = new URLSearchParams({
    // Jikan caps a page at 25 rows; asking for 48 is truncated or rejected.
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
    if (!list.length) throw new Error('Jikan returned an empty list');
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

// ------------------------------------------------------------------ detail

// One call for the detail page: description, relations, recommendations, episode count.
// relations is the "related anime" PRD review #01 asked for, and only AniList has it.
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

// No Jikan fallback on detail: Jikan keys on MyAnimeList ids and we only hold AniList ids, with no
// cheap mapping between them. Searching by title would return mismatched synopses and relations,
// which is worse than an error, so failing here shows the error state with a retry.
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
