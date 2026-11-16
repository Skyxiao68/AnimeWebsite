// Filter bar: chips, Expand rows, Reset, and the address bar.
// The module knows nothing about fetching — catalog.js subscribes to onChange().
import { SEARCH_SORTS } from './api.js';

const GROUPS = ['country', 'format', 'status', 'genre', 'year', 'sort'];
const DEFAULTS = {
  country: '',
  format: '',
  status: '',
  genre: '',
  year: '',
  sort: 'popular',
};

let state = readUrl();
const listeners = new Set();

// ---------------------------------------------------------------- URL

function readUrl() {
  const params = new URLSearchParams(location.search);
  const next = { ...DEFAULTS };

  GROUPS.forEach((group) => {
    const value = params.get(group);
    if (value) next[group] = value;
  });

  if (!SEARCH_SORTS[next.sort]) next.sort = DEFAULTS.sort;
  return next;
}

function writeUrl(values) {
  const params = new URLSearchParams();
  if (values.q) params.set('q', values.q);

  GROUPS.forEach((group) => {
    if (values[group] && values[group] !== DEFAULTS[group]) {
      params.set(group, values[group]);
    }
  });

  const query = params.toString();
  if (query) history.replaceState(null, '', `?${query}`);
  else history.replaceState(null, '', location.pathname);
}

// ---------------------------------------------------------------- state

export function getState() {
  return { ...state };
}

export function getQuery() {
  const input = document.getElementById('q');
  return (input?.value || '').trim();
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const values = { ...state, q: getQuery() };
  writeUrl(values);
  countSelected();
  listeners.forEach((fn) => fn(values));
}

function paint() {
  document.querySelectorAll('.filters__row').forEach((row) => {
    const value = state[row.dataset.group];

    row.querySelectorAll('.opt[data-value]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.value === value ? 'true' : 'false');
    });

    const all = row.querySelector('.filters__all[data-all]');
    if (all) all.setAttribute('aria-pressed', value ? 'false' : 'true');
  });

  const year = document.getElementById('year');
  if (year) year.value = state.year || '';

  countSelected();
}

// ---------------------------------------------------------------- mobile sheet

// Below 600px the six rows would push the grid off screen, so they live in a
// bottom sheet behind one button (PRD review #11). Desktop never opens it.
function mountSheet() {
  const panel = document.getElementById('filters');
  const toggle = document.getElementById('open-filters');
  if (!panel || !toggle) return;

  const backdrop = document.getElementById('filters-backdrop');
  document.body.dataset.filtersReady = 'true';

  const setOpen = (open) => {
    panel.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.dataset.filtersOpen = String(open);
    if (backdrop) backdrop.hidden = !open;

    if (open) {
      panel.setAttribute('tabindex', '-1');
      panel.focus({ preventScroll: true });
    } else {
      toggle.focus({ preventScroll: true });
    }
  };

  toggle.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
  document.getElementById('close-filters')?.addEventListener('click', () => setOpen(false));
  backdrop?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.dataset.open === 'true') setOpen(false);
  });
}

// How many things are actually narrowing the result — tuned groups plus a term.
function countSelected() {
  const badge = document.getElementById('filters-count');
  if (!badge) return;

  const tuned = GROUPS.filter((group) => state[group] && state[group] !== DEFAULTS[group]).length;
  const total = tuned + (getQuery() ? 1 : 0);

  badge.textContent = String(total);
  badge.hidden = total === 0;
}

// ---------------------------------------------------------------- interactions

function pickChip(btn) {
  const row = btn.closest('.filters__row');
  const group = row.dataset.group;
  const value = btn.dataset.value;

  // Sort never empties: a catalogue with no order makes no sense.
  if (group === 'sort') state.sort = value;
  else state[group] = state[group] === value ? '' : value;

  paint();
  emit();
}

function clearGroup(group) {
  state[group] = group === 'sort' ? DEFAULTS.sort : '';
  paint();
  emit();
}

// Collapsing is pure CSS (see .filters__row[data-collapsible]); JS only flips the
// two attributes that selector depends on.
function toggleExpand(btn) {
  const row = btn.closest('.filters__row');
  const open = btn.getAttribute('aria-expanded') === 'true';

  btn.setAttribute('aria-expanded', String(!open));
  row.dataset.expanded = String(!open);
  btn.firstChild.textContent = open ? 'Expand ' : 'Collapse ';
}

export function resetAll() {
  state = { ...DEFAULTS };

  const input = document.getElementById('q');
  if (input) input.value = '';

  paint();
  emit();
}

export function initFilters() {
  const root = document.getElementById('filters');
  if (!root) return () => {};

  let typing = 0;

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn || !root.contains(btn)) return;

    if (btn.dataset.expand) toggleExpand(btn);
    else if (btn.dataset.all) clearGroup(btn.dataset.all);
    else if (btn.dataset.value !== undefined) pickChip(btn);
  });

  document.getElementById('reset-filters')?.addEventListener('click', resetAll);

  // Type-in year (PRD review #19). change, not input: fires when the field is
  // left or the spinner is used, so a half-typed "20" never reaches the API.
  document.getElementById('year')?.addEventListener('change', (event) => {
    state.year = event.target.value.trim();
    paint();
    emit();
  });

  // 300ms debounce on the search box. Everything else is an instant click.
  document.getElementById('q')?.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => emit(), 300);
  });

  // The form still works without JS; with JS we just stay on the page.
  document.querySelector('.search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(typing);
    emit();
  });

  paint();
  mountSheet();
  return () => listeners.clear();
}
