// js/search.js - matches under the keyword field while typing.
//
// The header field and phone band were plain forms. Nothing happened until
// Enter sent the text to the catalog. This adds a six-row popover with current
// matches, so results show as you type.
//
// Catalog is skipped: its grid already refetches on every keystroke
// (js/filters.js), and a popover would print the same rows twice.

import { search } from './api.js';
import { titleText } from './ui.js';
import { pageHref } from './paths.js';

const DEBOUNCE = 220;
const MIN_CHARS = 2;
const PER_PAGE = 6;

let popCount = 0;

/** "TV · 2013 · 85%" - the grey line under a title; missing parts drop out. */
function metaLine(media) {
  const parts = [];
  if (media?.format) parts.push(media.format.replace(/_/g, ' '));
  const year = media?.startDate?.year;
  if (year) parts.push(String(year));
  if (typeof media?.averageScore === 'number') parts.push(`${media.averageScore}%`);
  return parts.join(' · ');
}

function hit(media) {
  const link = document.createElement('a');
  link.className = 'search-pop__hit';
  link.href = pageHref(`detail.html?id=${encodeURIComponent(media?.id ?? '')}`);
  link.setAttribute('role', 'option');
  link.setAttribute('aria-selected', 'false');

  const img = document.createElement('img');
  img.className = 'search-pop__cover';
  img.src = media?.coverImage?.large || '';
  img.alt = '';
  img.width = 34;
  img.height = 48;
  img.loading = 'lazy';
  img.decoding = 'async';

  const text = document.createElement('span');
  text.className = 'search-pop__text';

  const title = document.createElement('span');
  title.className = 'search-pop__title';
  title.textContent = titleText(media);

  const meta = document.createElement('span');
  meta.className = 'search-pop__meta';
  meta.textContent = metaLine(media);

  text.append(title, meta);
  link.append(img, text);
  return link;
}

function mount(form) {
  const input = form.querySelector('input[name="q"]');
  if (!input) return;

  const pop = document.createElement('div');
  pop.className = 'search-pop';
  pop.id = `search-pop-${++popCount}`;
  pop.hidden = true;
  pop.setAttribute('role', 'listbox');
  pop.setAttribute('aria-label', 'Search matches');
  form.append(pop);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', pop.id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');

  let timer = 0;
  let pending = 0; // an older response must not overwrite a newer one
  let active = -1;

  const rows = () => [...pop.querySelectorAll('.search-pop__hit')];

  function show() {
    pop.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function hide() {
    pop.hidden = true;
    pop.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  }

  function paintActive(next) {
    const list = rows();
    if (!list.length) return;
    active = (next + list.length) % list.length;
    list.forEach((row, index) => {
      const on = index === active;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-selected', String(on));
    });
    list[active].scrollIntoView({ block: 'nearest' });
  }

  function note(text, query) {
    const line = document.createElement('p');
    line.className = 'search-pop__note';
    line.textContent = text;

    if (query) {
      const all = document.createElement('a');
      all.className = 'search-pop__more';
      all.href = pageHref(`catalog.html?q=${encodeURIComponent(query)}`);
      all.textContent = `See all results for “${query}”`;
      line.append(all);
    }

    pop.replaceChildren(line);
  }

  async function run(query) {
    const token = ++pending;
    pop.dataset.state = 'loading';
    show();
    note('Searching…');

    try {
      // Fresh call: a cached empty answer (say, a throttled minute) would keep
      // saying "no matches" for the rest of the cache window.
      const { items } = await search(query, {}, { perPage: PER_PAGE, fresh: true });
      if (token !== pending) return;

      if (!items.length) {
        pop.dataset.state = 'empty';
        note(`No titles match “${query}”.`, query);
        return;
      }

      pop.dataset.state = 'ok';
      pop.replaceChildren(...items.map(hit));
      active = -1;
    } catch (err) {
      if (token !== pending) return;
      pop.dataset.state = 'error';
      note('Search is unavailable right now.', query);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();

    if (query.length < MIN_CHARS) {
      hide();
      return;
    }

    timer = setTimeout(() => run(query), DEBOUNCE);
  });

  // Coming back to a field that still has a word (after Escape, or a tap elsewhere)
  // should show the matches again.
  input.addEventListener('focus', () => {
    const query = input.value.trim();
    if (query.length < MIN_CHARS || !pop.hidden) return;
    run(query);
  });

  input.addEventListener('keydown', (event) => {
    const list = rows();

    if (event.key === 'Escape') {
      hide();
      input.blur();
      return;
    }

    if (!list.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      paintActive(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      paintActive(active - 1);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      list[active].click();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (form.contains(event.target)) return;
    hide();
  });
}

/** The magnifier in a phone header: it opens the field in place instead of leaving the page. */
function mountPhoneToggle() {
  const header = document.querySelector('.site-header');
  const open = header?.querySelector('.nav-search-open');
  const close = header?.querySelector('.nav-search-close');
  if (!header || !open) return;

  const input = header.querySelector('input[name="q"]');

  function setOpen(on) {
    header.dataset.searchOpen = String(on);
    open.setAttribute('aria-expanded', String(on));

    if (on) {
      input?.focus();
      return;
    }

    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    input?.blur();
  }

  open.addEventListener('click', () => setOpen(header.dataset.searchOpen !== 'true'));
  close?.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.dataset.searchOpen === 'true') setOpen(false);
  });
}

function start() {
  if (!document.body.classList.contains('page-catalog')) {
    document.querySelectorAll('form.nav-search, .search-bar--phone form.search').forEach(mount);
  }
  mountPhoneToggle();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
