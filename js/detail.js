import { media, userMessage } from './api.js';
import { renderState } from './ui.js';
import { all, isBookmarked, mountBookmarks, syncWithin, toggle } from './bookmarks.js';

const RATING_KEY = 'mf.ratings.v1';

const el = (id) => document.getElementById(id);
const article = el('detail');
const errorBox = el('detail-error');

const titleOf = (m) => m?.title?.english || m?.title?.romaji || 'Untitled';
const scoreOf = (m) => (m?.averageScore ? String(m.averageScore) : '–');
const formatOf = (m) => (m?.format ? m.format.replace(/_/g, ' ') : '–');

function metaLine(m) {
  el('detail-score').textContent = scoreOf(m);
  el('detail-format').textContent = formatOf(m);
  el('detail-episodes').textContent = m.episodes
    ? `${m.episodes} ${m.episodes === 1 ? 'episode' : 'episodes'}`
    : m.duration
      ? `${m.duration} min`
      : '–';
  el('detail-year').textContent = m.seasonYear || '–';
  el('detail-status').textContent = m.status
    ? m.status.charAt(0) + m.status.slice(1).toLowerCase().replace(/_/g, ' ')
    : '–';
}

function paintGenres(genres) {
  const list = el('detail-genres');
  list.replaceChildren(
    ...(genres || []).map((g) => {
      const li = document.createElement('li');
      li.className = 'detail__genre';
      li.textContent = g;
      return li;
    }),
  );
}

// ------------------------------------------------------------------ 相关 / 推荐

function paintMini(containerId, hintId, items) {
  const list = el(containerId);
  const hint = el(hintId);

  if (!items.length) {
    list.replaceChildren();
    hint.hidden = false;
    return;
  }

  hint.hidden = true;
  list.replaceChildren(
    ...items.map((m) => {
      const li = document.createElement('li');
      li.className = 'mini';

      const a = document.createElement('a');
      a.className = 'mini__link';
      a.href = `detail.html?id=${m.id}`;

      const img = document.createElement('img');
      img.className = 'mini__cover';
      img.src = m.coverImage?.large || '';
      img.alt = '';
      img.width = 200;
      img.height = 300;
      img.loading = 'lazy';
      img.decoding = 'async';

      const span = document.createElement('span');
      span.className = 'mini__title';
      span.textContent = titleOf(m);

      const note = document.createElement('span');
      note.className = 'mini__note';
      note.textContent = `${scoreOf(m)} · ${formatOf(m)}`;

      a.append(img, span, note);
      li.append(a);
      return li;
    }),
  );
}

// ------------------------------------------------------------------ 简介

function paintSynopsis(description) {
  const p = el('detail-synopsis');
  const more = el('detail-readmore');

  // AniList 的简介里带 <br> 和少量标签，asHtml:false 之后还有实体；先收成纯文本。
  const text = (description || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  p.textContent = text || 'AniList does not have a synopsis for this title.';
  p.dataset.clamped = 'true';
  more.setAttribute('aria-expanded', 'false');
  more.textContent = 'Read more';
  // 只有真被截断才给按钮，短简介不该出现「Read more」
  more.hidden = p.textContent.length < 420;
}

// ------------------------------------------------------------------ 评分（交互 3）

function readRatings() {
  try {
    const raw = localStorage.getItem(RATING_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRatings(map) {
  try {
    localStorage.setItem(RATING_KEY, JSON.stringify(map));
  } catch {
    // 隐私模式或写满：评分只是锦上添花，不许把页面弄崩
  }
}

function paintRating(id) {
  const row = el('rating-row');
  const saved = Number(readRatings()[id]) || 0;

  row.replaceChildren(
    ...Array.from({ length: 10 }, (_, i) => {
      const value = i + 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rating__pill';
      btn.dataset.value = String(value);
      btn.textContent = String(value);
      btn.setAttribute('aria-pressed', String(value === saved));
      btn.setAttribute('aria-label', `Rate ${value} out of 10`);
      return btn;
    }),
  );

  const note = el('rating-note');
  note.textContent = saved
    ? `You rated this ${saved} / 10. Saved in this browser only.`
    : 'Ratings stay in this browser.';
}

function wireRating(id) {
  el('rating-form').addEventListener('click', (event) => {
    const btn = event.target.closest('.rating__pill');
    if (!btn) return;

    const map = readRatings();
    const value = Number(btn.dataset.value);
    const current = Number(map[id]) || 0;

    // 再点一次同一个分数 = 取消评分
    if (current === value) delete map[id];
    else map[id] = value;

    writeRatings(map);
    paintRating(id);
  });
}

// ------------------------------------------------------------------ 主流程

function paint(detail) {
  document.title = `${titleOf(detail)} · MikuFansAnime`;
  el('detail-title').textContent = titleOf(detail);

  const cover = el('detail-cover');
  if (detail.coverImage?.large) cover.src = detail.coverImage.large;
  cover.alt = `Cover of ${titleOf(detail)}`;

  metaLine(detail);
  paintGenres(detail.genres);
  paintSynopsis(detail.description);

  el('detail-alink').href = `https://anilist.co/anime/${detail.id}`;

  const save = el('detail-save');
  save.dataset.mediaId = String(detail.id);

  const edges = (detail.relations?.edges || []).filter(
    (edge) => edge?.node?.type === 'ANIME' && edge.node.id,
  );
  paintMini('related', 'related-hint', edges.map((edge) => edge.node));

  const recs = (detail.recommendations?.nodes || [])
    .map((node) => node?.mediaRecommendation)
    .filter((node) => node?.id);
  paintMini('recs', 'recs-hint', recs);

  paintRating(detail.id);
  wireRating(detail.id);
}

function showError(err, id) {
  article.hidden = true;
  article.setAttribute('aria-busy', 'false');
  errorBox.hidden = false;
  errorBox.replaceChildren();

  const panel = document.createElement('div');
  errorBox.append(panel);
  renderState(panel, 'error', {
    title: 'This title did not load',
    message: userMessage(err),
    actionLabel: 'Try again',
    onAction: () => window.location.reload(),
  });

  document.title = 'Title not found · MikuFansAnime';
  console.warn('[detail] failed for id', id, err);
}

// 回到顶部：PRD 评审 #02 说那个圆形箭头看不懂，所以这里用带文字的按钮
function wireToTop() {
  const btn = el('to-top');
  const onScroll = () => {
    btn.hidden = window.scrollY < 600;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  btn.addEventListener('click', () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
}

// PRD 评审 #03：简介要能展开
function wireReadMore() {
  const more = el('detail-readmore');
  const p = el('detail-synopsis');

  more.addEventListener('click', () => {
    const clamped = p.dataset.clamped === 'true';
    p.dataset.clamped = clamped ? 'false' : 'true';
    more.setAttribute('aria-expanded', String(clamped));
    more.textContent = clamped ? 'Show less' : 'Read more';
  });
}

function wireBookmark() {
  // 详情页这颗按钮走 bookmarks.js 的同一套存储，卡片与抽屉保持一致
  el('detail-save').addEventListener('click', () => {
    const btn = el('detail-save');
    const id = Number(btn.dataset.mediaId);
    if (!id) return;

    const known = all().find((row) => row.id === id);
    toggle(
      known || {
        id,
        title: el('detail-title').textContent,
        cover: el('detail-cover').src,
        score: el('detail-score').textContent,
      },
    );
    syncWithin(document.querySelector('main'));
  });
}

async function boot() {
  mountBookmarks();
  wireToTop();
  wireReadMore();
  wireBookmark();

  const id = new URLSearchParams(window.location.search).get('id');

  try {
    const detail = await media(id);
    paint(detail);
    article.dataset.state = 'success';
    article.setAttribute('aria-busy', 'false');
    syncWithin(document.querySelector('main'));
  } catch (err) {
    showError(err, id);
  }
}

boot();
