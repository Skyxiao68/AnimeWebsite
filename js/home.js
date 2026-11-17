// Home: one poster pick and four shelves. Each shelf loads on its own so a
// single failing request cannot blank the page.

import { homeFeed, hero, airingDay, chart, userMessage } from './api.js';
import { card, titleText, synopsisHtml } from './ui.js';
import { isBookmarked, mountBookmarks, syncWithin } from './bookmarks.js';

const WEEK = 4;
// TV / Movies 固定三排（客户 2026-11-16 定的）。列数由 CSS 断点决定（6 / 4 / 3），
// homeFeed() 按上限 18 张取回来，这里再按「三排 × 当前列数」切 —— 手机上就是三排三格。
const WIDE_ROWS = 3;

const el = {
  hero: document.getElementById('hero'),
  img: document.getElementById('hero-img'),
  tags: document.getElementById('hero-tags'),
  title: document.getElementById('hero-title'),
  titleLink: document.getElementById('hero-title-link'),
  lede: document.getElementById('hero-lede'),
  cta: document.getElementById('hero-cta'),
  thumbs: document.getElementById('hero-thumbs'),
  prev: document.getElementById('hero-prev'),
  next: document.getElementById('hero-next'),
  weekly: document.getElementById('weekly-grid'),
  ranks: document.getElementById('ranks-grid'),
  tv: document.getElementById('tv-grid'),
  movies: document.getElementById('movies-grid'),
  dayChips: document.getElementById('day-chips'),
  rankChips: document.getElementById('rank-chips'),
};

// 换片时推进来的那张图：两张叠着往同一个方向滑，才有 cycani 那种左右切换。
const ghost = document.createElement('img');
ghost.className = 'hero__img hero__img--ghost';
ghost.alt = '';
ghost.setAttribute('aria-hidden', 'true');
el.img.after(ghost);

// YouTube 缺 maxres 时会回一张 120px 的灰图；加载完发现尺寸不对就退回 banner。
[el.img, ghost].forEach((img) => {
  img.addEventListener('load', () => {
    const banner = img.dataset.banner || '';
    if (img.naturalWidth && img.naturalWidth < 1000 && banner && img.getAttribute('src') !== banner) {
      img.classList.remove('hero__img--pv');
      img.src = banner;
    }
  });
});

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

function paint(grid, items) {
  grid.dataset.state = items.length ? 'success' : 'empty';
  grid.setAttribute('aria-busy', 'false');
  grid.replaceChildren(...items.map((m) => card(m, { bookmarked: isBookmarked(m.id) })));
  syncWithin(grid);
}

function paintMessage(grid, kind, title, message, actionLabel, onAction) {
  grid.dataset.state = kind;
  grid.setAttribute('aria-busy', 'false');
  grid.replaceChildren();
  const box = document.createElement('div');
  box.className = kind === 'error' ? 'state state--error' : 'state';
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const t = document.createElement('p');
  t.className = 'state__title';
  t.textContent = title;
  box.append(t);
  if (message) {
    const m = document.createElement('p');
    m.className = 'state__message';
    m.textContent = message;
    box.append(m);
  }
  if (actionLabel && onAction) {
    const b = document.createElement('button');
    b.className = 'btn state__action';
    b.type = 'button';
    b.textContent = actionLabel;
    b.addEventListener('click', onAction);
    box.append(b);
  }
  grid.append(box);
}

// ----------------------------------------------------------------- hero
let picks = [];
let index = 0;

function artFor(m, portrait) {
  const cover = m.coverImage || {};
  // AniList 的 bannerImage 是 1900x400 的横幅，铺进 16:9 的框要纵向放大两倍多，糊；
  // 它同时还存着 PV 的 YouTube id，1280x720 的封面图才是正经的 16:9 主视觉。
  const pv = m.trailer && m.trailer.site === 'youtube' && m.trailer.id
    ? `https://img.youtube.com/vi/${m.trailer.id}/maxresdefault.jpg`
    : '';
  const banner = m.bannerImage || '';
  const src = (portrait ? cover.extraLarge || cover.large : pv || banner)
    || banner || pv || cover.extraLarge || cover.large || '';
  return { src, banner, isPv: !portrait && !!pv };
}

function setArt(img, art) {
  // PV 封面图右下角有「本PV」白框，用类名让 CSS 往左上放大一点，把它裁到画外。
  img.classList.toggle('hero__img--pv', art.isPv);
  img.dataset.banner = art.banner;
  img.style.setProperty('--slide', '0%');
  img.style.setProperty('--pop', '1');
  img.style.opacity = '1';
  img.src = art.src;
  img.alt = '';
}

function paintMeta(m) {
  const tags = [...(m.genres || []).slice(0, 2)];
  if (m.averageScore) tags.push(`${m.averageScore}%`);
  el.tags.innerHTML = tags
    .map((t) => `<span class="hero__tag">${esc(t)}</span>`)
    .join('');

  el.titleLink.textContent = titleText(m);
  el.titleLink.href = `detail.html?id=${encodeURIComponent(m.id)}`;
  el.lede.innerHTML = synopsisHtml(m.description) || 'No synopsis published yet.';
  if (el.cta) el.cta.href = `detail.html?id=${encodeURIComponent(m.id)}`;

  el.thumbs.innerHTML = picks
    .map(
      (p, i) => `<li class="hero__thumb${i === index ? ' is-current' : ''}">
        <button type="button" class="hero__thumb-btn" data-pick="${i}" aria-pressed="${i === index}">
          <span class="hero__thumb-frame">
            <img src="${(p.coverImage && p.coverImage.large) || ''}" alt="" width="150" height="217" loading="lazy" />
          </span>
          <span class="hero__thumb-name">${esc(titleText(p))}</span>
        </button>
      </li>`
    )
    .join('');
}

// 换片照 cycani 的实测数据：两张图各自横移 4%、放大到 1.02，同时交叉淡化，
// 650ms、cubic-bezier(.4,0,.2,1)——不是整幅推走，所以看着慢而轻。
// 文案在淡到一半时换掉再淡回来；缩略图不参与，免得整排跟着闪。
const SLIDE_MS = 650;
const AUTO_MS = 7000;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let swapToken = 0;
let autoTimer = 0;

function showPick(i, { animate = true } = {}) {
  if (!picks.length) return;
  const n = picks.length;
  index = ((i % n) + n) % n;

  const m = picks[index];
  const token = (swapToken += 1);
  const art = artFor(m, window.matchMedia('(max-width: 639px)').matches);

  if (!animate || reduceMotion.matches) {
    el.hero.classList.remove('is-swapping', 'is-sliding');
    setArt(el.img, art);
    paintMeta(m);
    el.hero.dataset.state = 'success';
    return;
  }

  // 上一轮还没落定就来了新的：先把主图扶回原位，不然它会停在半路。
  if (el.hero.classList.contains('is-sliding')) {
    el.img.style.transition = 'none';
    el.img.style.opacity = '1';
    el.img.style.setProperty('--slide', '0%');
    el.img.style.setProperty('--pop', '1');
    void el.img.offsetWidth;
    el.img.style.transition = '';
  }

  el.hero.classList.add('is-swapping', 'is-sliding');
  ghost.classList.toggle('hero__img--pv', art.isPv);
  ghost.dataset.banner = art.banner;
  // 进来的那张先站到右边一点点、比画面大 2%，然后和旧图一起往左挪 4%。
  ghost.style.transition = 'none';
  ghost.style.opacity = '0';
  ghost.style.setProperty('--slide', '4%');
  ghost.style.setProperty('--pop', '1.02');
  ghost.src = art.src;
  el.img.style.transition = 'none';
  el.img.style.opacity = '1';
  el.img.style.setProperty('--slide', '0%');
  el.img.style.setProperty('--pop', '1');
  void el.img.offsetWidth;

  ghost.style.transition = '';
  el.img.style.transition = '';
  ghost.style.opacity = '1';
  ghost.style.setProperty('--slide', '0%');
  ghost.style.setProperty('--pop', '1');
  el.img.style.opacity = '0';
  el.img.style.setProperty('--slide', '-4%');
  el.img.style.setProperty('--pop', '1.02');

  window.setTimeout(() => {
    if (token !== swapToken) return;
    paintMeta(m);
  }, SLIDE_MS / 2);

  // 淡完把新图落到主图、两张都复位，人眼几乎看不出这一下。
  window.setTimeout(() => {
    if (token !== swapToken) return;
    el.img.style.transition = 'none';
    el.img.classList.toggle('hero__img--pv', art.isPv);
    el.img.dataset.banner = art.banner;
    el.img.src = art.src;
    el.img.style.opacity = '1';
    el.img.style.setProperty('--slide', '0%');
    el.img.style.setProperty('--pop', '1');
    ghost.style.transition = 'none';
    ghost.style.opacity = '0';
    ghost.style.setProperty('--slide', '4%');
    ghost.style.setProperty('--pop', '1.02');
    void el.img.offsetWidth;
    el.img.style.transition = '';
    ghost.style.transition = '';
    el.hero.classList.remove('is-swapping', 'is-sliding');
    el.hero.dataset.state = 'success';
  }, SLIDE_MS);
}

function stopAuto() {
  if (autoTimer) window.clearTimeout(autoTimer);
  autoTimer = 0;
}

// 自动轮播：鼠标进来、键盘聚焦、标签页切走都停，离开再继续；
// 系统开了「减少动态效果」就整个不转，让人自己点。
function startAuto() {
  stopAuto();
  if (reduceMotion.matches || picks.length < 2) return;
  autoTimer = window.setTimeout(() => {
    if (document.hidden) return startAuto();
    showPick(index + 1);
    startAuto();
  }, AUTO_MS);
}

async function loadHero(seed = null) {
  try {
    picks = await hero({ count: 3, from: seed });
    if (!picks.length) throw new Error('empty');
    showPick(0, { animate: false });
    startAuto();
  } catch (err) {
    el.hero.dataset.state = 'error';
    el.tags.innerHTML = '';
    el.titleLink.textContent = 'The pick of the week did not load';
    el.titleLink.href = 'catalog.html';
    el.lede.textContent = userMessage(err);
    if (el.cta) {
      el.cta.href = 'catalog.html';
      el.cta.textContent = 'Browse the catalogue';
    }
  }
}

// Repaint the hero art when the window crosses the portrait breakpoint.
window.matchMedia('(max-width: 639px)').addEventListener('change', () => {
  if (picks.length) showPick(index);
});

el.prev.addEventListener('click', () => {
  showPick(index - 1);
  startAuto();
});
el.next.addEventListener('click', () => {
  showPick(index + 1);
  startAuto();
});
el.thumbs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pick]');
  if (!btn) return;
  const pick = Number(btn.dataset.pick);
  // 点已经选中的那张就是「我想看详情」（cycani 也是这个行为），不是重播一遍切换。
  if (pick === index && picks[index]) {
    window.location.href = `detail.html?id=${encodeURIComponent(picks[index].id)}`;
    return;
  }
  showPick(pick);
  startAuto();
});

// 悬停 / 聚焦时暂停，离开后重新计时
el.hero.addEventListener('mouseenter', stopAuto);
el.hero.addEventListener('mouseleave', startAuto);
el.hero.addEventListener('focusin', stopAuto);
el.hero.addEventListener('focusout', () => {
  if (!el.hero.contains(document.activeElement)) startAuto();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAuto();
  else startAuto();
});
reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches) stopAuto();
  else startAuto();
});

// ----------------------------------------------------------------- shelves
// 列数与 CSS 的三档保持一致：>=1024 六列、>=640 四列、其余三列。
function wideColumns() {
  if (window.matchMedia('(min-width: 1024px)').matches) return 6;
  if (window.matchMedia('(min-width: 640px)').matches) return 4;
  return 3;
}

// 取回来的整批先存着，窗口改宽度时只重切，不再打一次接口。
const shelfItems = new Map();

function fillShelf(grid, name) {
  const items = shelfItems.get(name) || [];
  paint(grid, items.slice(0, WIDE_ROWS * wideColumns()));
}

// TV / Movies 的两份数据由 homeFeed() 一起带回来，这里只负责落进 shelfItems 和上屏；
// 曾经各自 section() 一条，等于首页开局就多发两条请求。
function showShelves(feed) {
  shelfItems.set('tv', feed.tv);
  shelfItems.set('movies', feed.movies);
  fillShelf(el.tv, 'tv');
  fillShelf(el.movies, 'movies');
}

function failShelves(err) {
  const message = userMessage(err);
  paintMessage(el.tv, 'error', 'Could not load this shelf', message);
  paintMessage(el.movies, 'error', 'Could not load this shelf', message);
}

// Mon=0 … Sun=6, matching the chip order in the markup.
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function pressOnly(row, attr, value) {
  row.querySelectorAll('[data-' + attr + ']').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
  });
}

async function loadDay(dayIndex, btn) {
  const offset = dayIndex - todayIndex();
  pressOnly(el.dayChips, 'day', String(dayIndex));
  el.weekly.dataset.state = 'loading';
  el.weekly.setAttribute('aria-busy', 'true');
  try {
    const items = await airingDay(offset);
    if (items.length) {
      paint(el.weekly, items.slice(0, WEEK));
    } else {
      paintMessage(
        el.weekly,
        'empty',
        'Nothing airing that day',
        'Try another day — the schedule is read live and quiet days happen.'
      );
    }
  } catch (err) {
    paintMessage(el.weekly, 'error', 'The schedule did not load', userMessage(err), 'Try again', () =>
      btn && loadDay(dayIndex, btn)
    );
  }
}

el.dayChips.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-day]');
  if (btn) loadDay(Number(btn.dataset.day), btn);
});

// Ranks 的五个窗口都换真数据：Day/Week 是放送表按人气本地排，Season/Year 走季节、年份过滤。
async function loadChart(which) {
  pressOnly(el.rankChips, 'window', which);
  el.ranks.dataset.state = 'loading';
  el.ranks.setAttribute('aria-busy', 'true');
  try {
    const items = await chart(which, { perPage: WEEK });
    if (items.length) {
      paint(el.ranks, items);
    } else {
      paintMessage(el.ranks, 'empty', 'Nothing charted for this window', 'The chart is read live — a quiet window happens.');
    }
  } catch (err) {
    paintMessage(el.ranks, 'error', 'The chart did not load', userMessage(err), 'Try again', () =>
      loadChart(which)
    );
  }
}

el.rankChips.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-window]');
  if (!btn || btn.disabled) return;
  loadChart(btn.dataset.window);
});

// ----------------------------------------------------------------- boot
// 先发一条合并请求把放送窗口和两条 shelf 拿回来，再让 hero / 今日 / Ranks 吃缓存。
// 顺序是有意的：hero 和 Ranks 都依赖那份放送窗口，先拿它就不用各自再发一条。
async function boot() {
  let feed = null;
  try {
    feed = await homeFeed();
    showShelves(feed);
  } catch (err) {
    failShelves(err);
  }

  loadHero(feed ? feed.day : null);
  loadDay(todayIndex());
  loadChart('week');
}

mountBookmarks();
boot();

let refillTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(refillTimer);
  refillTimer = window.setTimeout(() => {
    fillShelf(el.tv, 'tv');
    fillShelf(el.movies, 'movies');
  }, 150);
});

// ---------------------------------------------------------------- 导航
// 首页的导航压在 hero 上（透明），滚过一段后切成实心条，否则一直看不清。
const headerEl = document.querySelector('.site-header');
if (headerEl && document.body.classList.contains('page-hero')) {
  const syncHeader = () => headerEl.classList.toggle('is-stuck', scrollY > 24);
  syncHeader();
  addEventListener('scroll', syncHeader, { passive: true });
}
