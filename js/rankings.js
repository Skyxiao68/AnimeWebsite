// Rankings as the design frames it: a TOP 5 row of large covers with rank
// badges, then ranks 6-25 as a two-column list. Phones get a TOP 3 row and the
// list starts at 4. AniList supplies the numbers.

import { search, userMessage } from './api.js';
import { renderState, titleText, mountToTop } from './ui.js';
import { mountBookmarks } from './bookmarks.js';

const TOP_WIDE = 5;
const TOP_PHONE = 3;
const TOTAL = 25;
const YEAR = new Date().getFullYear();

const panel = document.querySelector('.rank-panel');
const topSection = document.querySelector('.rank-top');
const topRow = document.getElementById('rank-top-row');
const list = document.getElementById('rank-list');
const countEl = document.getElementById('rank-count');
const stateSlot = document.getElementById('rank-state');

const state = { sort: 'popular', country: '', format: '', genre: '', time: '' };
let ticket = 0;

// The phone design shows three big covers; desktop keeps five. The list numbers
// itself from wherever the row stops, so both counts stay contiguous.
const phoneQuery = window.matchMedia('(max-width: 599px)');
const topCount = () => (phoneQuery.matches ? TOP_PHONE : TOP_WIDE);
let lastItems = [];

// AniList has seasonYear and season, but no month or day window. Those two
// chips are disabled in the markup instead of pretending to work.
function seasonNow() {
  const m = new Date().getMonth() + 1;
  if (m === 12 || m <= 2) return 'WINTER';
  if (m <= 5) return 'SPRING';
  if (m <= 8) return 'SUMMER';
  return 'FALL';
}

function queryFor() {
  const f = { sort: state.time === 'week' ? 'trending' : state.sort };
  if (state.country) f.country = state.country;
  if (state.format) f.format = state.format;
  if (state.genre) f.genre = state.genre;
  if (state.time === 'year') f.year = YEAR;
  if (state.time === 'season') {
    f.year = YEAR;
    f.season = seasonNow();
  }
  return f;
}

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
const coverOf = (m) => (m.coverImage && m.coverImage.large) || '';
const hrefOf = (m) => `detail.html?id=${encodeURIComponent(m.id)}`;

function topCard(m, rank) {
  return `<li class="rank-top__item">
      <a class="rank-top__link" href="${hrefOf(m)}">
        <span class="rank-badge">${rank}</span>
        <img class="rank-top__cover" src="${coverOf(m)}" alt="" width="240" height="360" loading="lazy" />
        <span class="rank-top__name">${esc(titleText(m))}</span>
      </a>
    </li>`;
}

function listItem(m, rank) {
  return `<li class="rank-item">
      <a class="rank-item__link" href="${hrefOf(m)}">
        <span class="rank-item__num">${rank}</span>
        <img class="rank-item__thumb" src="${coverOf(m)}" alt="" width="82" height="123" loading="lazy" />
        <span class="rank-item__name">${esc(titleText(m))}</span>
      </a>
    </li>`;
}

function paintRows(items) {
  const top = topCount();
  topRow.innerHTML = items.slice(0, top).map((m, i) => topCard(m, i + 1)).join('');
  list.innerHTML = items.slice(top).map((m, i) => listItem(m, top + i + 1)).join('');
  const label = document.getElementById('rank-top-title');
  if (label) label.textContent = `TOP ${top}`;
}

phoneQuery.addEventListener('change', () => {
  if (lastItems.length) paintRows(lastItems);
});

function showSkeletons() {
  stateSlot.hidden = true;
  stateSlot.replaceChildren();
  topSection.hidden = false;
  topRow.innerHTML = '<li class="rank-top__item is-loading"></li>'.repeat(topCount());
  list.innerHTML = '<li class="rank-item is-loading"></li>'.repeat(8);
  countEl.textContent = 'Loading…';
}

function filtersOn() {
  const on = [];
  if (state.country) on.push('Region');
  if (state.format) on.push('Format');
  if (state.genre) on.push(state.genre);
  if (state.time) on.push('Time');
  return on.length ? ` · ${on.join(' + ')}` : '';
}

async function load() {
  const mine = ++ticket;
  showSkeletons();
  try {
    const { items, source } = await search('', queryFor(), { page: 1, perPage: TOTAL });
    if (mine !== ticket) return;
    if (!items.length) {
      topSection.hidden = true;
      list.innerHTML = '';
      countEl.textContent = 'No titles for that combination';
      renderState(stateSlot, 'empty', {
        title: 'Nothing to rank',
        message: 'Loosen a filter and the list fills up again.',
        actionLabel: 'Clear filters',
        onAction: resetAll,
      });
      return;
    }
    stateSlot.hidden = true;
    stateSlot.replaceChildren();
    topSection.hidden = false;
    lastItems = items;
    paintRows(items);
    countEl.textContent =
      `${items.length} titles ranked${filtersOn()}` +
      (source === 'jikan' ? ' · fallback source, filters limited' : '');
  } catch (err) {
    if (mine !== ticket) return;
    topSection.hidden = true;
    list.innerHTML = '';
    countEl.textContent = 'Load failed';
    stateSlot.hidden = false;
    renderState(stateSlot, 'error', {
      title: 'Rankings did not load',
      message: userMessage(err),
      actionLabel: 'Try again',
      onAction: load,
    });
  }
}

function syncPressed() {
  panel.querySelectorAll('.rank-sort').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort));
  });
  panel.querySelectorAll('.rank-row').forEach((row) => {
    const current = state[row.dataset.group];
    row.querySelectorAll('.rank-opt').forEach((b) => {
      b.setAttribute('aria-pressed', String((b.dataset.value || '') === current));
    });
  });
}

function resetAll() {
  state.sort = 'popular';
  state.country = '';
  state.format = '';
  state.genre = '';
  state.time = '';
  syncPressed();
  load();
}

// Expand / collapse the Genre row: CSS owns the display, label and aria follow.
function setGenreOpen(row, open) {
  row.dataset.expanded = String(open);
  const more = row.querySelector('.rank-more');
  if (!more) return;
  more.setAttribute('aria-expanded', String(open));
  more.childNodes[0].nodeValue = open ? 'Less ' : 'More ';
  const caret = more.querySelector('span');
  if (caret) caret.textContent = open ? '⌃' : '⌄';
}

panel.addEventListener('click', (e) => {
  const sortBtn = e.target.closest('.rank-sort');
  if (sortBtn) {
    state.sort = sortBtn.dataset.sort;
    syncPressed();
    load();
    return;
  }
  // Genre More / Less only flips data-expanded; CSS picks which chips show.
  const more = e.target.closest('[data-expand]');
  if (more) {
    setGenreOpen(more.closest('.rank-row'), more.closest('.rank-row').dataset.expanded !== 'true');
    return;
  }
  const opt = e.target.closest('.rank-opt');
  if (opt && !opt.disabled) {
    const row = opt.closest('.rank-row');
    state[row.dataset.group] = opt.dataset.value || '';
    // Opening the row keeps a pressed chip visible - the collapse rule would hide it.
    
    if (row.dataset.group === 'genre' && state.genre) setGenreOpen(row, true);
    syncPressed();
    load();
  }
});

mountBookmarks();
mountToTop();
syncPressed();
load();
