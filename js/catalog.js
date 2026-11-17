// Catalogue page entry: request cycle, the four interface states, Load More.
import { search, userMessage } from './api.js';
import { card, renderCards, renderState } from './ui.js';
import { getQuery, getState, initFilters, onChange, resetAll } from './filters.js';
import { isBookmarked, mountBookmarks, syncWithin } from './bookmarks.js';

// 48 = 每 6 列一行的整数倍（桌面 8 行），AniList 单页上限是 50。
const PER_PAGE = 48;

const grid = document.getElementById('catalog-grid');
const count = document.getElementById('result-count');
const tagLine = document.getElementById('tag-summary');
const more = document.getElementById('load-more');

let page = 1;
let hasMore = false;
let shown = 0;
// Only the newest request may paint. Debounced typing can leave two in flight.
let ticket = 0;

function yearProblem(value) {
  if (!value) return '';
  if (!/^\d{4}$/.test(value)) return 'Release year needs four digits, for example 2019.';

  const year = Number(value);
  if (year < 1960 || year > 2026) return 'Pick a year between 1960 and 2026.';
  return '';
}

function say(text) {
  if (count) count.textContent = text;
}

// Left half of the result line: which tags are on. Sort is always set, so it
// is not a "tag"; the search box counts separately and reads as a quote.
const TAGS = ['country', 'format', 'status', 'genre', 'year'];

function sayTags(source) {
  if (!tagLine) return;

  const state = getState();
  const picked = TAGS.filter((key) => state[key]).length;
  const parts = [];

  if (picked) parts.push(`${picked} tag${picked === 1 ? '' : 's'} selected`);
  else parts.push('No tags selected');

  const query = getQuery();
  if (query) parts.push(`"${query}"`);

  // Jikan cannot honour every filter; say so here instead of burying it.
  if (source === 'jikan') parts.push('Jikan fallback, filters limited');

  tagLine.textContent = parts.join(' · ');
}

// Right half: how many titles are on the page right now. The number grows when
// Load More is used, which is why it is read from the running total.
function sayFound() {
  if (!count) return;

  const lead = document.createElement('strong');
  lead.className = 'result-count__lead';
  lead.textContent = `A Total of ${shown}`;

  count.replaceChildren(lead, ' Titles have been found');
}

function setBusy(busy) {
  if (busy) grid.setAttribute('aria-busy', 'true');
  else grid.setAttribute('aria-busy', 'false');
  if (more) more.hidden = busy || !hasMore;
}

function emptyState() {
  grid.dataset.state = 'empty';
  renderState(grid, 'empty', {
    title: 'Nothing matches those filters',
    message: 'Take one filter off, or clear the search box.',
    actionLabel: 'Clear filters',
    onAction: resetAll,
  });
  sayFound();
}

function errorState(err) {
  grid.dataset.state = 'error';
  renderState(grid, 'error', {
    title: 'Could not load titles',
    message: userMessage(err),
    actionLabel: 'Try again',
    onAction: () => load({ reset: true }),
  });
  say('Load failed');
}

// A year like "20" or "18xx" is not an empty result — it is input the app can
// tell is wrong before it asks anyone. Kept separate on purpose (PRD review #11).
function badYearState(problem) {
  grid.dataset.state = 'error';
  renderState(grid, 'error', {
    title: 'That year does not look right',
    message: problem,
    actionLabel: 'Clear the year',
    onAction: () => {
      const input = document.getElementById('year');
      if (input) input.value = '';
      document.getElementById('year')?.dispatchEvent(new Event('change'));
    },
  });
  say('Invalid year');
}

async function load({ reset = true } = {}) {
  const state = getState();
  const problem = yearProblem(state.year);

  if (problem) {
    hasMore = false;
    if (more) more.hidden = true;
    badYearState(problem);
    return;
  }

  const mine = ++ticket;
  if (reset) {
    page = 1;
    shown = 0;
    grid.dataset.state = 'loading';
    renderState(grid, 'loading', { count: PER_PAGE });
    say('Loading…');
    sayTags();
  }

  setBusy(true);

  try {
    const result = await search(getQuery(), state, { page, perPage: PER_PAGE });
    if (mine !== ticket) return;

    const items = result.items || [];
    hasMore = Boolean(result.hasNextPage);

    if (!reset && !items.length) {
      hasMore = false;
      return;
    }

    if (reset && !items.length) {
      emptyState();
      return;
    }

    grid.dataset.state = 'success';

    if (reset) {
      renderCards(grid, items, { isBookmarked: (media) => isBookmarked(media.id) });
    } else {
      items.forEach((media) => {
        grid.append(card(media, { bookmarked: isBookmarked(media.id) }));
      });
    }

    shown += items.length;
    syncWithin(grid);
    sayTags(result.source);
    sayFound();
  } catch (err) {
    if (mine !== ticket) return;
    errorState(err);
  } finally {
    if (mine === ticket) setBusy(false);
  }
}

function init() {
  if (!grid) return;

  mountBookmarks();
  initFilters();

  onChange(() => load({ reset: true }));

  more?.addEventListener('click', () => {
    page += 1;
    load({ reset: false });
  });

  load({ reset: true });
}

init();
