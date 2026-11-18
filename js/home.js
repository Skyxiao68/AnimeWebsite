// Home: one poster pick and four shelves. Each shelf loads on its own so a
// single failing request cannot blank the page.

import { homeFeed, hero, airingDay, chart, userMessage } from './api.js';
import { card, titleText, synopsisHtml, mountToTop } from './ui.js';
import { isBookmarked, mountBookmarks, syncWithin } from './bookmarks.js';
import { pageHref } from './paths.js';

const WEEK = 4;
// TV / Movies stay at three rows; columns come from CSS (6 / 4 / 3), and
// homeFeed() asks for 18 so three rows stay full at the widest layout.
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

// The outgoing image leaves the way the incoming one arrives - that is what reads as a slide.
const ghost = document.createElement('img');
ghost.className = 'hero__img hero__img--ghost';
ghost.alt = '';
ghost.setAttribute('aria-hidden', 'true');
el.img.after(ghost);

// YouTube returns a 120px grey frame when maxres is missing, so only PV frames are
// size-checked: a poster is ~460px wide and a 1000px threshold would swap the phone hero for a banner.
[el.img, ghost].forEach((img) => {
  img.addEventListener('load', () => {
    const banner = img.dataset.banner || '';
    if (!img.classList.contains('hero__img--pv')) return;
    if (img.naturalWidth && img.naturalWidth < 1000 && banner) {
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
  // bannerImage is 1900x400, so a 16:9 box would upscale it more than 2x and blur it.
  // AniList also keeps the PV's YouTube id, and its maxres frame is a real 16:9 still.
  const pv = m.trailer && m.trailer.site === 'youtube' && m.trailer.id
    ? `https://img.youtube.com/vi/${m.trailer.id}/maxresdefault.jpg`
    : '';
  const banner = m.bannerImage || '';
  const src = (portrait ? cover.extraLarge || cover.large : pv || banner)
    || banner || pv || cover.extraLarge || cover.large || '';
  return { src, banner, isPv: !portrait && !!pv };
}

function setArt(img, art) {
  // The PV frame carries a badge in the corner; the class lets CSS push it out of frame.
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
  el.titleLink.href = pageHref(`detail.html?id=${encodeURIComponent(m.id)}`);
  el.lede.innerHTML = synopsisHtml(m.description) || 'No synopsis published yet.';
  if (el.cta) el.cta.href = pageHref(`detail.html?id=${encodeURIComponent(m.id)}`);

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

// Timing copied from cycani: both images shift 4% and scale to 1.02 while cross-fading
// over 650ms with cubic-bezier(.4,0,.2,1). Nothing is pushed off screen, so it reads light.
// The copy swaps halfway and fades back in; thumbnails stay put so the row does not blink.
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
  const gsap = window.gsap;
  const copy = [el.tags, el.title, el.lede];

  if (!animate || reduceMotion.matches) {
    el.hero.classList.remove('is-swapping', 'is-sliding');
    if (gsap) {
      gsap.killTweensOf(copy);
      copy.forEach((node) => {
        node.style.transition = '';
        gsap.set(node, { clearProps: 'opacity,transform,translate,rotate,scale' });
      });
    }
    setArt(el.img, art);
    paintMeta(m);
    el.hero.dataset.state = 'success';
    return;
  }

  // A new pick arrived mid-transition: settle the main image first or it parks halfway.
  if (el.hero.classList.contains('is-sliding')) {
    el.img.style.transition = 'none';
    el.img.style.opacity = '1';
    el.img.style.setProperty('--slide', '0%');
    el.img.style.setProperty('--pop', '1');
    void el.img.offsetWidth;
    el.img.style.transition = '';
  }

  if (gsap) {
    // CSS still fades the copy for browsers without GSAP; here it can go out as
    // three staggered lines instead of one block, then come back the same way.
    el.hero.classList.remove('is-swapping');
    copy.forEach((node) => {
      node.style.transition = 'none';
    });
    gsap.killTweensOf(copy);
    gsap.to(copy, {
      opacity: 0,
      y: 8,
      duration: 0.3,
      ease: 'power1.out',
      stagger: 0.04,
      overwrite: true,
    });
  } else {
    el.hero.classList.add('is-swapping');
  }

  el.hero.classList.add('is-sliding');
  ghost.classList.toggle('hero__img--pv', art.isPv);
  ghost.dataset.banner = art.banner;
  // The incoming frame starts slightly right and 2% larger, then both drift 4% left.
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

  // Settle the new frame into the main slot and reset both; the swap is hard to spot.
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

    if (gsap) {
      gsap.fromTo(
        copy,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
          stagger: 0.06,
          overwrite: true,
          onComplete: () => {
            copy.forEach((node) => {
              node.style.transition = '';
              gsap.set(node, { clearProps: 'opacity,transform,translate,rotate,scale' });
            });
          },
        }
      );
    }
  }, SLIDE_MS);
}

function stopAuto() {
  if (autoTimer) window.clearTimeout(autoTimer);
  autoTimer = 0;
}

// Autoplay stops on hover, on focus and in a hidden tab, then resumes;
// under prefers-reduced-motion it never runs and the arrows do the work.
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
    el.titleLink.href = pageHref('catalog.html');
    el.lede.textContent = userMessage(err);
    if (el.cta) {
      el.cta.href = pageHref('catalog.html');
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
  // Tapping the selected thumbnail means "open the detail page", not "replay the swap".
  if (pick === index && picks[index]) {
    window.location.href = pageHref(`detail.html?id=${encodeURIComponent(picks[index].id)}`);
    return;
  }
  showPick(pick);
  startAuto();
});

// Pause on hover or focus, resume on leave
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
// Same three steps as the CSS grid: six columns from 1024, four from 640, three below.
function wideColumns() {
  if (window.matchMedia('(min-width: 1024px)').matches) return 6;
  if (window.matchMedia('(min-width: 640px)').matches) return 4;
  return 3;
}

// Keep the fetched batch and re-slice on resize instead of asking again.
const shelfItems = new Map();

function fillShelf(grid, name) {
  const items = shelfItems.get(name) || [];
  paint(grid, items.slice(0, WIDE_ROWS * wideColumns()));
}

// homeFeed() returns TV and Movies together; this only splits them into shelves.
// (Both used to fetch on their own, which cost two extra calls on every home load.)
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

// All five Ranks windows use real data: Day/Week sort the airing list by popularity; Season/Year filter.
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
// One merged request fills the airing window and both shelves; hero, today and Ranks read the cache.
// The order is deliberate: hero and Ranks both need the airing window, so it goes first.
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
mountToTop();

let refillTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(refillTimer);
  refillTimer = window.setTimeout(() => {
    fillShelf(el.tv, 'tv');
    fillShelf(el.movies, 'movies');
  }, 150);
});

// ------------------------------------------------------------- navigation
// The home nav sits on the hero at first and turns solid once you scroll past it.
const headerEl = document.querySelector('.site-header');
if (headerEl && document.body.classList.contains('page-hero')) {
  const syncHeader = () => headerEl.classList.toggle('is-stuck', scrollY > 24);
  syncHeader();
  addEventListener('scroll', syncHeader, { passive: true });
}
