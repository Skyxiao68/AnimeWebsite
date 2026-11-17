// Saved titles live in localStorage — the PRD has no account, so there is no
// server-side collection. Each entry keeps what a drawer row needs, which means
// opening the drawer never calls the API again.
const KEY = 'mf.bookmarks.v1';
const LIMIT = 200;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((row) => row && row.id);
  } catch {
    // Private windows and hand-edited storage both land here. A broken store
    // should look empty, not take the page down with it.
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    /* quota or private mode: the button still flips, the save just won't last */
  }
}

// Collections are named buckets a saved row can point at. A row with no bucket
// id is "Unsorted", so a store written before this feature still makes sense.
const COLLECTIONS_KEY = 'mf.collections.v1';
const COLLECTIONS_LIMIT = 24;
const COLLECTION_NAME_MAX = 40;

function readCollections() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.filter((row) => {
      if (!row || !row.id || !row.name) return false;
      if (seen.has(String(row.id))) return false;
      seen.add(String(row.id));
      return true;
    });
  } catch {
    // Same rule as the bookmark store: a broken list looks empty.
    return [];
  }
}

function writeCollections(list) {
  try {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(list.slice(0, COLLECTIONS_LIMIT)));
  } catch {
    /* private mode: organising just won't survive a reload */
  }
}

export function collections() {
  return readCollections();
}

export function addCollection(name) {
  const clean = String(name || '').trim().slice(0, COLLECTION_NAME_MAX);
  if (!clean) return null;

  const list = readCollections();
  // Typing the same name twice should not fork a second bucket.
  const dup = list.find((row) => row.name.toLowerCase() === clean.toLowerCase());
  if (dup) return dup.id;
  if (list.length >= COLLECTIONS_LIMIT) return null;

  const row = {
    id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: clean,
  };
  list.push(row);
  writeCollections(list);
  return row.id;
}

export function renameCollection(id, name) {
  const clean = String(name || '').trim().slice(0, COLLECTION_NAME_MAX);
  if (!clean) return false;

  const list = readCollections();
  const hit = list.find((row) => String(row.id) === String(id));
  if (!hit) return false;

  hit.name = clean;
  writeCollections(list);
  return true;
}

/** Deleting a bucket keeps the titles inside it: they fall back to Unsorted. */
export function removeCollection(id) {
  writeCollections(readCollections().filter((row) => String(row.id) !== String(id)));

  const rows = read();
  let changed = false;
  const next = rows.map((row) => {
    if (String(row.collection) !== String(id)) return row;
    changed = true;
    return { ...row, collection: null };
  });
  if (changed) write(next);
}

export function moveTo(id, collectionId) {
  const known = readCollections().some((row) => String(row.id) === String(collectionId));

  const rows = read();
  const hit = rows.find((row) => String(row.id) === String(id));
  if (!hit) return;

  hit.collection = known ? String(collectionId) : null;
  write(rows);
}

export function all() {
  return read();
}

export function isBookmarked(id) {
  return read().some((row) => String(row.id) === String(id));
}

// Callers hand over two different shapes: cards pass the AniList media object
// (title.romaji, coverImage.large) and detail.js passes a flat row. Normalise
// both here so a saved row always has something the drawer can draw.
function snapshot(media) {
  const title =
    typeof media?.title === 'string'
      ? media.title
      : media?.title?.english || media?.title?.romaji || '';
  const cover = media?.coverImage?.large || media?.coverImage?.medium || media?.cover || '';

  return {
    title: title || `#${media?.id}`,
    cover,
    // Cards carry averageScore (0-100), detail.js hands over score (0-100).
    score:
      typeof media?.averageScore === 'number'
        ? media.averageScore
        : typeof media?.score === 'number'
          ? media.score
          : null,
  };
}

export function toggle(media) {
  const id = String(media?.id ?? '');
  if (!id) return false;

  const list = read();
  const at = list.findIndex((row) => String(row.id) === id);
  let saved;

  if (at >= 0) {
    list.splice(at, 1);
    saved = false;
  } else {
    list.unshift({ id: media.id, ...snapshot(media), collection: null });
    saved = true;
  }

  write(list);
  paintAll();
  return saved;
}

export function remove(id) {
  const list = read().filter((row) => String(row.id) !== String(id));
  write(list);
  paintAll();
}

// ---------------------------------------------------------------- buttons

function paintButton(btn, saved) {
  // The control is an icon now, so only the state and the labels change;
  // writing textContent here would wipe the bookmark glyph out.
  btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  const label = btn.getAttribute('aria-label') || '';
  if (!btn.dataset.name) btn.dataset.name = label.replace(/^(Remove bookmark|Bookmark): /, '');
  const name = btn.dataset.name;
  btn.setAttribute('aria-label', saved ? `Remove bookmark: ${name}` : `Bookmark: ${name}`);
  btn.title = saved ? 'Remove bookmark' : 'Bookmark';
}

function paintCount(count) {
  const header = document.getElementById('open-bookmarks');
  if (header) {
    // The control is an icon, so the number rides on an attribute and CSS
    // paints the badge; writing textContent would wipe the icon out.
    header.dataset.count = String(count);
    header.setAttribute(
      'aria-label',
      count ? `Bookmarks, ${count} saved` : 'Bookmarks, nothing saved yet'
    );
  }

  const tab = document.getElementById('open-bookmarks-tab');
  if (tab) {
    const text = tab.lastChild;
    if (text && text.nodeType === 3) {
      text.textContent = count ? ` Saved · ${count}` : ' Saved';
    }
  }
}

export function paintAll() {
  const list = read();
  const saved = new Set(list.map((row) => String(row.id)));

  document.querySelectorAll('.card').forEach((card) => {
    const btn = card.querySelector('.card__save');
    if (btn) paintButton(btn, saved.has(String(card.dataset.id)));
  });

  paintCount(list.length);
  renderDrawer();

  // The saved page listens for this so unsaving from a card updates the grid
  // in place, without a reload and without a second store.
  document.dispatchEvent(new CustomEvent('mf:bookmarks'));
}

// Call after injecting cards so freshly rendered rows pick up their state.
export function syncWithin(root) {
  if (!root) return;
  const saved = new Set(read().map((row) => String(row.id)));

  root.querySelectorAll('.card').forEach((card) => {
    const btn = card.querySelector('.card__save');
    if (btn) paintButton(btn, saved.has(String(card.dataset.id)));
  });
}

// ---------------------------------------------------------------- drawer

const SVGNS = 'http://www.w3.org/2000/svg';

function icon(pathData, size = 16) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}

const TRASH_PATH = 'M4.8 6.6h14.4M9.4 6.6V4.8h5.2v1.8M6.6 6.6l.8 12.6h9.2l.8-12.6M10.2 10v6M13.8 10v6';
const BOOKMARK_PATH = 'M6.5 4h11v16l-5.5-3.8L6.5 20z';

// Older rows saved from the detail page kept only the id, so the drawer showed
// "#207329" with no poster. The same title is already in the recently-viewed
// store, so fill the gaps from there instead of asking the API again.
function fillGaps(rows) {
  const recent = new Map(readRecent().map((row) => [String(row.id), row]));
  let patched = false;

  const filled = rows.map((row) => {
    const hit = recent.get(String(row.id));
    if (!hit) return row;

    const missingTitle = !row.title || row.title === '#' + row.id;
    if (!missingTitle && row.cover) return row;

    patched = true;
    return {
      ...row,
      title: missingTitle ? hit.title : row.title,
      cover: row.cover || hit.cover || '',
      score: typeof row.score === 'number' ? row.score : hit.score ?? null,
    };
  });

  if (patched) write(filled);
  return filled;
}

function blankCover() {
  const blank = document.createElement('span');
  blank.className = 'drawer__cover drawer__cover--blank';
  blank.setAttribute('aria-hidden', 'true');
  return blank;
}

function renderDrawer() {
  const list = document.getElementById('bookmark-list');
  if (!list) return;

  const rows = fillGaps(read());

  // The header icon carries a badge already; repeat the number next to the
  // drawer title so the panel says how much is in it without looking up.
  const heading = document.getElementById('drawer-title');
  if (heading) {
    let badge = heading.querySelector('.drawer__count');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'drawer__count';
      heading.append(badge);
    }
    badge.textContent = rows.length ? String(rows.length) : '';
    badge.hidden = !rows.length;
  }

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'drawer__empty';

    const mark = document.createElement('span');
    mark.className = 'drawer__empty-mark';
    mark.append(icon(BOOKMARK_PATH, 26));

    const title = document.createElement('strong');
    title.textContent = 'Nothing saved yet';

    const hint = document.createElement('span');
    hint.textContent = 'Tap the bookmark on any poster and it lands here.';

    empty.append(mark, title, hint);
    list.replaceChildren(empty);
    return;
  }

  const buckets = new Map(readCollections().map((col) => [String(col.id), col.name]));

  list.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li');
      item.className = 'drawer__item';

      const link = document.createElement('a');
      link.className = 'drawer__link';
      link.href = 'detail.html?id=' + encodeURIComponent(row.id);

      if (row.cover) {
        const cover = document.createElement('img');
        cover.className = 'drawer__cover';
        cover.src = row.cover;
        cover.alt = '';
        cover.width = 44;
        cover.height = 62;
        cover.loading = 'lazy';
        // A CDN image can rot; show the empty frame rather than a broken glyph.
        cover.addEventListener('error', () => cover.replaceWith(blankCover()), { once: true });
        link.append(cover);
      } else {
        link.append(blankCover());
      }

      const text = document.createElement('span');
      text.className = 'drawer__text';

      const name = document.createElement('span');
      name.className = 'drawer__name';
      name.textContent = row.title;
      text.append(name);

      const bits = [];
      // Same shape the detail page prints, so a score reads the same in both places.
      if (typeof row.score === 'number' && row.score) bits.push((row.score / 10).toFixed(1) + '/10');
      const bucket = buckets.get(String(row.collection));
      if (bucket) bits.push(bucket);

      if (bits.length) {
        const meta = document.createElement('span');
        meta.className = 'drawer__meta';
        meta.textContent = bits.join(' · ');
        text.append(meta);
      }

      link.append(text);

      const drop = document.createElement('button');
      drop.className = 'drawer__remove';
      drop.type = 'button';
      drop.title = 'Remove';
      drop.append(icon(TRASH_PATH));
      drop.setAttribute('aria-label', 'Remove ' + row.title + ' from bookmarks');
      drop.addEventListener('click', () => remove(row.id));

      item.append(link, drop);
      return item;
    }),
  );
}

function openDrawer() {
  const drawer = document.getElementById('bookmark-drawer');
  if (!drawer) return;

  drawer.dataset.open = 'true';
  drawer.removeAttribute('inert');

  const backdrop = document.getElementById('bookmark-backdrop');
  if (backdrop) backdrop.hidden = false;

  document.getElementById('open-bookmarks')?.setAttribute('aria-expanded', 'true');
  drawer.querySelector('.drawer__close')?.focus();
}

function closeDrawer() {
  const drawer = document.getElementById('bookmark-drawer');
  if (!drawer) return;

  drawer.dataset.open = 'false';
  drawer.setAttribute('inert', '');

  const backdrop = document.getElementById('bookmark-backdrop');
  if (backdrop) backdrop.hidden = true;

  const opener = document.getElementById('open-bookmarks');
  opener?.setAttribute('aria-expanded', 'false');
  opener?.focus();
}

// ---------------------------------------------------------------- recent views
// The clock icon in the design opens "what I looked at last". Same store idea as
// bookmarks, but capped and trimmed on every visit, and only written by detail.js.

const RECENT_KEY = 'mf.recent.v1';
const RECENT_KEEP = 24; // 时钟面板只露 6 条，这里多留一档，换布局不用动存储
const RECENT_POP = 6; // 顶栏那个小面板只露最近几条

function readRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((row) => row && row.id) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_KEEP)));
  } catch {
    /* private mode: the panel simply stays empty */
  }
}

export function recordView(media) {
  const id = String(media?.id ?? '');
  if (!id) return;

  const list = readRecent().filter((row) => String(row.id) !== id);
  list.unshift({
    id: media.id,
    title: media.title?.english || media.title?.romaji || `#${media.id}`,
    cover: media.coverImage?.large || media.coverImage?.medium || '',
    score: typeof media.averageScore === 'number' ? media.averageScore : undefined,
  });
  writeRecent(list);
  paintRecent();
}

function paintRecent() {
  const pop = document.getElementById('recent-pop');
  if (!pop) return;

  const rows = readRecent().slice(0, RECENT_POP);
  const head = document.createElement('p');
  head.className = 'recent-pop__head';
  head.textContent = 'Recently viewed';

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'recent-pop__empty';
    empty.textContent = 'Nothing yet — open any title and it shows up here.';
    pop.replaceChildren(head, empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'recent-pop__list';
  list.append(
    ...rows.map((row) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'recent-pop__link';
      link.href = `detail.html?id=${encodeURIComponent(row.id)}`;

      const cover = document.createElement('img');
      cover.src = row.cover;
      cover.alt = '';
      cover.loading = 'lazy';

      const name = document.createElement('span');
      name.textContent = row.title;

      link.append(cover, name);
      item.append(link);
      return item;
    }),
  );
  pop.replaceChildren(head, list);
}

function closeRecent() {
  const pop = document.getElementById('recent-pop');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  document.getElementById('open-recent')?.setAttribute('aria-expanded', 'false');
}

function toggleRecent() {
  const pop = document.getElementById('recent-pop');
  if (!pop) return;

  if (pop.hidden) {
    paintRecent();
    pop.hidden = false;
    document.getElementById('open-recent')?.setAttribute('aria-expanded', 'true');
  } else {
    closeRecent();
  }
}

let mounted = false;

export function mountBookmarks() {
  if (mounted) return;
  mounted = true;

  document.addEventListener('click', (event) => {
    const save = event.target.closest('.card__save');

    if (save) {
      const card = save.closest('.card');
      const cover = card?.querySelector('.card__cover');
      const score = card?.querySelector('.card__score');

      // The card already drew the title and cover, so reuse them — that is what
      // keeps the drawer row intact after a reload, without a second request.
      toggle({
        id: card?.dataset.id,
        title: { romaji: save.getAttribute('aria-label')?.replace(/^Bookmark: /, '') },
        coverImage: { large: cover?.getAttribute('src') || '' },
        averageScore: Number(score?.textContent) || undefined,
      });
      return;
    }

    if (event.target.closest('#open-bookmarks')) {
      closeRecent();
      openDrawer();
      return;
    }

    if (event.target.closest('#open-recent')) {
      toggleRecent();
      return;
    }

    // Any click that is neither the clock nor its panel closes the panel, the
    // same way the drawer behaves.
    if (!event.target.closest('#recent-pop')) closeRecent();

    if (event.target.closest('#close-bookmarks, #bookmark-backdrop')) closeDrawer();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const drawer = document.getElementById('bookmark-drawer');
    if (drawer?.dataset.open === 'true') closeDrawer();
    closeRecent();
  });

  paintAll();
  paintRecent();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paintAll);
} else {
  paintAll();
}
