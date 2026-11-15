import { search, userMessage } from './api.js';
import { renderCards, renderState } from './ui.js';
import { isBookmarked, mountBookmarks, syncWithin } from './bookmarks.js';

const PER_PAGE = 24;

// 与 catalog.html 的 Genre 行同一批值，避免两页给出不一样的选项
const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Mystery',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
];

// 三个列表对应 AniList 的三种排序；没有「本周榜单」这种数据，就不编一个
const LISTS = {
  trending: { sort: 'trending', label: 'Trending now' },
  popular: { sort: 'popular', label: 'All-time popular' },
  score: { sort: 'score', label: 'Highest rated' },
};

const el = (id) => document.getElementById(id);
const grid = el('rank-grid');
const countLine = el('rank-count');
const moreBtn = el('rank-more');

let list = 'trending';
let genre = '';
let page = 1;
let ticket = 0;
let seen = 0;

function fillGenres() {
  const select = el('rank-genre');
  select.append(
    ...GENRES.map((g) => {
      const option = document.createElement('option');
      option.value = g;
      option.textContent = g;
      return option;
    }),
  );
}

function paintCount(source, total, isLast) {
  const bits = [`${total} title${total === 1 ? '' : 's'}`, LISTS[list].label];
  if (genre) bits.push(genre);
  if (isLast) bits.push('end of list');
  if (source === 'jikan') bits.push('fallback source, filters limited');
  countLine.textContent = bits.join(' · ');
}

function numberCards(offset) {
  grid.querySelectorAll('.card').forEach((card, i) => {
    const badge = document.createElement('span');
    badge.className = 'card__rank';
    badge.textContent = String(offset + i + 1);
    badge.setAttribute('aria-hidden', 'true');
    card.append(badge);
  });
}

async function load({ reset }) {
  const mine = ++ticket;

  if (reset) {
    page = 1;
    seen = 0;
  }

  if (reset) {
    grid.dataset.state = 'loading';
    grid.setAttribute('aria-busy', 'true');
    renderState(grid, 'loading', { count: PER_PAGE > 8 ? 8 : PER_PAGE });
  } else {
    moreBtn.disabled = true;
    moreBtn.textContent = 'Loading…';
  }

  try {
    const { items, hasNextPage, source } = await search(
      '',
      { genre, sort: LISTS[list].sort },
      { page, perPage: PER_PAGE },
    );

    if (mine !== ticket) return; // 切标签太快时，旧请求不许覆盖新结果

    const offset = reset ? 0 : seen;

    if (reset) {
      grid.replaceChildren();
      renderCards(grid, items, { isBookmarked: (m) => isBookmarked(m.id) });
    } else {
      const holder = document.createElement('div');
      renderCards(holder, items, { isBookmarked: (m) => isBookmarked(m.id) });
      grid.append(...holder.children);
    }

    numberCards(offset);
    seen += items.length;

    grid.dataset.state = items.length ? 'success' : 'empty';
    grid.setAttribute('aria-busy', 'false');

    if (!items.length && reset) {
      renderState(grid, 'empty', {
        title: 'Nothing ranked here yet',
        message: 'That genre has no titles in this list. Try another one.',
      });
    }

    paintCount(source, seen, !hasNextPage);
    moreBtn.hidden = !hasNextPage;
    syncWithin(grid);
  } catch (err) {
    if (mine !== ticket) return;

    grid.dataset.state = 'error';
    grid.setAttribute('aria-busy', 'false');
    renderState(grid, 'error', {
      title: 'Rankings did not load',
      message: userMessage(err),
      actionLabel: 'Try again',
      onAction: () => load({ reset: true }),
    });
    countLine.textContent = 'Load failed';
    moreBtn.hidden = true;
  } finally {
    moreBtn.disabled = false;
    moreBtn.textContent = 'Load more';
  }
}

function wireTabs() {
  document.querySelectorAll('.rank-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.list === list) return;
      list = tab.dataset.list;
      document
        .querySelectorAll('.rank-tab')
        .forEach((other) =>
          other.setAttribute('aria-pressed', String(other.dataset.list === list)),
        );
      load({ reset: true });
    });
  });
}

fillGenres();
mountBookmarks();
wireTabs();

el('rank-genre').addEventListener('change', (event) => {
  genre = event.target.value;
  load({ reset: true });
});

moreBtn.addEventListener('click', () => {
  page += 1;
  load({ reset: false });
});

load({ reset: true });
