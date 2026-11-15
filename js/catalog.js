// Catalogue page entry: request cycle, the four interface states, Load More.
import { search, userMessage } from './api.js';
import { card, renderCards, renderState } from './ui.js';
import { getQuery, getState, initFilters, onChange, resetAll } from './filters.js';
import { isBookmarked, mountBookmarks, syncWithin } from './bookmarks.js';

const PER_PAGE = 24;

const grid = document.getElementById('catalog-grid');
const count = document.getElementById('result-count');
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

function setBusy(busy) {
  if (busy) grid.setAttribute('aria-busy', 'true');
  else grid.setAttribute('aria-busy', 'false');
  if (more) more.hidden = busy || !hasMore;
}

function summary(source) {
  if (!shown) return 'Nothing to show';
  const tail = hasMore ? '' : ' · end of list';
  const via = source === 'jikan' ? ' · fallback source, filters limited' : '';
  return `${shown} title${shown === 1 ? '' : 's'}${tail}${via}`;
}

function emptyState() {
  grid.dataset.state = 'empty';
  renderState(grid, 'empty', {
    title: 'Nothing matches those filters',
    message: 'Take one filter off, or clear the search box.',
    actionLabel: 'Clear filters',
    onAction: resetAll,
  });
  say('0 titles');
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
    say(summary(result.source));
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
