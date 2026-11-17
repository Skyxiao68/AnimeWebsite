// Bookmarks page: the same store the drawer reads, laid out with collections,
// a text filter and a sort. Storage lives in bookmarks.js; this file only reads
// it, asks it to change, and paints the result.

import { card, statePanel, mountToTop } from './ui.js';
import {
  all,
  collections,
  addCollection,
  renameCollection,
  removeCollection,
  moveTo,
  mountBookmarks,
} from './bookmarks.js';

const grid = document.getElementById('saved-grid');
const chips = document.getElementById('saved-chips');
const manage = document.getElementById('saved-manage');
const form = document.getElementById('saved-form');
const input = document.getElementById('saved-form-name');
const confirmBox = document.getElementById('saved-confirm');
const confirmText = document.getElementById('saved-confirm-text');
const search = document.getElementById('saved-search');
const sort = document.getElementById('saved-sort');
const count = document.getElementById('saved-count');
const status = document.getElementById('saved-status');
const menu = document.getElementById('saved-menu');

const view = { collection: 'all', query: '', sort: 'recent' };
let editing = null;
let pendingMove = null;
let menuAnchor = null;

const nameOf = (row) => row.title || '#' + row.id;
const toMedia = (row) => ({
  id: row.id,
  title: { english: row.title },
  coverImage: { large: row.cover },
  averageScore: row.score,
});

function say(message) {
  if (status) status.textContent = message;
}

function bucketName(row, buckets) {
  const hit = buckets.find((col) => String(col.id) === String(row.collection));
  return hit ? hit.name : 'Unsorted';
}

function knownBucket(id, buckets) {
  return buckets.some((col) => String(col.id) === String(id));
}

function currentBucketName() {
  const hit = collections().find((col) => String(col.id) === String(view.collection));
  return hit ? hit.name : 'this collection';
}

// ---------------------------------------------------------------- chips

function makeChip(entry) {
  const chip = document.createElement('button');
  chip.className = 'saved__chip';
  chip.type = 'button';
  chip.dataset.collection = entry.id;
  chip.setAttribute('aria-pressed', String(entry.id === view.collection));

  const label = document.createElement('span');
  label.textContent = entry.name;

  const tally = document.createElement('span');
  tally.className = 'saved__chip-count';
  tally.textContent = String(entry.count);

  chip.append(label, tally);
  return chip;
}

function renderChips(rows, buckets) {
  if (
    view.collection !== 'all' &&
    view.collection !== 'unsorted' &&
    !knownBucket(view.collection, buckets)
  ) {
    // The bucket was deleted in another tab: fall back to the whole shelf.
    view.collection = 'all';
  }

  const counts = new Map();
  rows.forEach((row) => {
    const key = knownBucket(row.collection, buckets) ? String(row.collection) : 'unsorted';
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const entries = [
    { id: 'all', name: 'All', count: rows.length },
    { id: 'unsorted', name: 'Unsorted', count: counts.get('unsorted') || 0 },
    ...buckets.map((col) => ({
      id: String(col.id),
      name: col.name,
      count: counts.get(String(col.id)) || 0,
    })),
  ];

  const adder = document.createElement('button');
  adder.className = 'saved__chip saved__chip--new';
  adder.type = 'button';
  adder.dataset.newCollection = '1';
  adder.textContent = '+ New collection';

  chips.replaceChildren(...entries.map(makeChip), adder);
  manage.hidden = !knownBucket(view.collection, buckets);
}

// ---------------------------------------------------------------- cards

const TICK_PATH = 'M4 8.4 6.7 11 12 5';
const CHEVRON_PATH = 'M2.5 4.5 6 7.5l3.5-3';

function svg(pathData, size = 14) {
  const NS = 'http://www.w3.org/2000/svg';
  const node = document.createElementNS(NS, 'svg');
  node.setAttribute('viewBox', '0 0 16 16');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.7');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', pathData);
  node.append(path);
  return node;
}

function moveControl(row, buckets) {
  const foot = document.createElement('div');
  foot.className = 'card__foot';

  const button = document.createElement('button');
  button.className = 'card__move';
  button.type = 'button';
  button.dataset.id = String(row.id);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Move ' + nameOf(row) + ' to another collection');

  const label = document.createElement('span');
  label.className = 'card__move-label';
  label.textContent = bucketName(row, buckets);

  button.append(label, svg(CHEVRON_PATH, 12));
  foot.append(button);
  return foot;
}

// ---------------------------------------------------------------- menu

function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  menu.replaceChildren();
  if (menuAnchor) {
    menuAnchor.setAttribute('aria-expanded', 'false');
    menuAnchor = null;
  }
}

function placeMenu(anchor) {
  const spot = anchor.getBoundingClientRect();
  const box = menu.getBoundingClientRect();

  let left = spot.left;
  let top = spot.bottom + 6;

  if (left + box.width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - box.width - 12);
  if (top + box.height > window.innerHeight - 12) top = Math.max(12, spot.top - box.height - 6);

  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
}

function menuRow(option, checked, onPick) {
  const item = document.createElement('button');
  item.className = 'menu__item';
  item.type = 'button';
  item.setAttribute('role', 'menuitemradio');
  item.setAttribute('aria-checked', String(checked));

  const tick = checked ? svg(TICK_PATH) : document.createElement('span');
  tick.classList.add('menu__tick');
  if (!checked) tick.setAttribute('aria-hidden', 'true');

  const name = document.createElement('span');
  name.className = 'menu__name';
  name.textContent = option.name;

  item.append(tick, name);
  item.addEventListener('click', onPick);
  return item;
}

function openMenu(anchor, id) {
  closeMenu();

  const buckets = collections();
  const row = all().find((item) => String(item.id) === String(id));
  const current = row && knownBucket(row.collection, buckets) ? String(row.collection) : '';

  const head = document.createElement('p');
  head.className = 'menu__head';
  head.textContent = 'Move to';

  const options = [
    { id: '', name: 'Unsorted' },
    ...buckets.map((col) => ({ id: String(col.id), name: col.name })),
  ];

  const sep = document.createElement('div');
  sep.className = 'menu__sep';
  sep.setAttribute('role', 'separator');

  const adder = document.createElement('button');
  adder.className = 'menu__item';
  adder.type = 'button';
  adder.setAttribute('role', 'menuitem');
  const adderName = document.createElement('span');
  adderName.className = 'menu__name';
  adderName.textContent = 'New collection…';
  adder.append(adderName);
  adder.addEventListener('click', () => {
    closeMenu();
    openForm('new', id);
  });

  menu.replaceChildren(
    head,
    ...options.map((option) =>
      menuRow(option, current === option.id, () => {
        if (current !== option.id) {
          moveTo(id, option.id || null);
          say('Moved to ' + option.name + '.');
        }
        closeMenu();
        render();
      }),
    ),
    sep,
    adder,
  );

  menu.hidden = false;
  menuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  placeMenu(anchor);
  menu.querySelector('.menu__item')?.focus();
}

// ---------------------------------------------------------------- forms

function openForm(mode, moveId = null) {
  editing = mode;
  pendingMove = moveId;
  form.dataset.mode = mode;
  form.hidden = false;
  confirmBox.hidden = true;
  input.value = mode === 'rename' ? currentBucketName() : '';
  input.focus();
  input.select();
}

function closeForm() {
  editing = null;
  pendingMove = null;
  form.hidden = true;
}

function openConfirm() {
  confirmText.textContent =
    'Delete “' + currentBucketName() + '”? Its bookmarks move back to Unsorted.';
  confirmBox.hidden = false;
  document.getElementById('saved-confirm-cancel')?.focus();
}

// ---------------------------------------------------------------- render

function sortRows(rows) {
  const list = rows.slice();
  if (view.sort === 'title') list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'en'));
  if (view.sort === 'score') {
    const value = (row) => (typeof row.score === 'number' ? row.score : -1);
    list.sort((a, b) => value(b) - value(a));
  }
  return list;
}

function render() {
  const rows = all();
  const buckets = collections();

  let list = rows;
  if (view.collection === 'unsorted') {
    list = list.filter((row) => !knownBucket(row.collection, buckets));
  } else if (view.collection !== 'all') {
    list = list.filter((row) => String(row.collection) === String(view.collection));
  }

  if (view.query) {
    const needle = view.query.toLowerCase();
    list = list.filter((row) => nameOf(row).toLowerCase().includes(needle));
  }

  list = sortRows(list);
  renderChips(rows, buckets);

  const narrowed = view.collection !== 'all' || Boolean(view.query);
  count.textContent = narrowed ? list.length + ' of ' + rows.length + ' shown' : rows.length + ' saved';

  if (!rows.length) {
    grid.dataset.state = 'empty';
    grid.replaceChildren(
      statePanel('empty', {
        title: 'Nothing saved yet',
        message: 'Tap the bookmark on any poster and it lands here, ready to sort into collections.',
        actionLabel: 'Browse catalog',
        onAction: () => {
          window.location.href = 'catalog.html';
        },
      }),
    );
    return;
  }

  if (!list.length) {
    grid.dataset.state = 'empty';
    grid.replaceChildren(
      statePanel('empty', {
        title: 'Nothing in this view',
        message: view.query
          ? 'No saved title matches “' + view.query + '”.'
          : 'This collection is empty. Move something into it from All.',
        actionLabel: 'Show all saved',
        onAction: () => {
          view.collection = 'all';
          view.query = '';
          search.value = '';
          render();
        },
      }),
    );
    return;
  }

  grid.dataset.state = 'success';
  grid.replaceChildren(...list.map((row) => card(toMedia(row))));

  grid.querySelectorAll('.card').forEach((el) => {
    const row = rows.find((item) => String(item.id) === String(el.dataset.id));
    if (row) el.append(moveControl(row, buckets));
  });
}

// ---------------------------------------------------------------- wiring

chips.addEventListener('click', (event) => {
  if (event.target.closest('[data-new-collection]')) {
    closeMenu();
    openForm('new');
    return;
  }

  const chip = event.target.closest('[data-collection]');
  if (!chip) return;

  view.collection = chip.dataset.collection;
  render();

  // render() rebuilds the row, so put focus back on the chip the user pressed.
  chips.querySelector('[data-collection="' + view.collection + '"]')?.focus();
});

grid.addEventListener('click', (event) => {
  const trigger = event.target.closest('.card__move');
  if (!trigger) return;
  event.preventDefault();
  if (menuAnchor === trigger) {
    closeMenu();
    return;
  }
  openMenu(trigger, trigger.dataset.id);
});

document.addEventListener('click', (event) => {
  if (menu.hidden) return;
  if (event.target.closest('#saved-menu') || event.target.closest('.card__move')) return;
  closeMenu();
});

document.addEventListener('scroll', closeMenu, { passive: true, capture: true });

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!menu.hidden) {
    closeMenu();
    return;
  }
  if (!form.hidden) closeForm();
  if (!confirmBox.hidden) confirmBox.hidden = true;
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    say('Give the collection a name first.');
    input.focus();
    return;
  }

  if (editing === 'rename') {
    if (renameCollection(view.collection, name)) say('Renamed to ' + name + '.');
    else say('Could not rename that collection.');
  } else {
    const id = addCollection(name);
    if (!id) {
      say('Could not add that collection.');
      return;
    }
    if (pendingMove) moveTo(pendingMove, id);
    view.collection = id;
    say('Added ' + name + '.');
  }

  closeForm();
  render();
});

document.getElementById('saved-form-cancel').addEventListener('click', closeForm);
document.getElementById('rename-collection').addEventListener('click', () => {
  closeMenu();
  openForm('rename');
});
document.getElementById('delete-collection').addEventListener('click', () => {
  closeMenu();
  openConfirm();
});
document.getElementById('saved-confirm-cancel').addEventListener('click', () => {
  confirmBox.hidden = true;
});
document.getElementById('saved-confirm-delete').addEventListener('click', () => {
  const name = currentBucketName();
  removeCollection(view.collection);
  view.collection = 'all';
  confirmBox.hidden = true;
  render();
  say('Deleted ' + name + '. Its bookmarks are back in Unsorted.');
});

search.addEventListener('input', () => {
  view.query = search.value.trim();
  render();
});

sort.addEventListener('change', () => {
  view.sort = sort.value;
  render();
});

render();
mountBookmarks();
mountToTop();
document.addEventListener('mf:bookmarks', render);
