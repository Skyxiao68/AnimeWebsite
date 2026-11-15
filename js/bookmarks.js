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

export function all() {
  return read();
}

export function isBookmarked(id) {
  return read().some((row) => String(row.id) === String(id));
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
    list.unshift({
      id: media.id,
      title: media.title?.english || media.title?.romaji || `#${media.id}`,
      cover: media.coverImage?.large || '',
      score: typeof media.averageScore === 'number' ? media.averageScore : null,
    });
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
  btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  btn.textContent = saved ? 'Bookmarked' : 'Bookmark';
}

function paintCount(count) {
  const header = document.getElementById('open-bookmarks');
  if (header) header.textContent = count ? `Bookmarks · ${count}` : 'Bookmarks';

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

function renderDrawer() {
  const list = document.getElementById('bookmark-list');
  if (!list) return;

  const rows = read();
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'drawer__empty';
    empty.textContent = 'Nothing saved yet. Tap Bookmark on any card.';
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li');
      item.className = 'drawer__item';

      const link = document.createElement('a');
      link.className = 'drawer__link';
      link.href = `detail.html?id=${encodeURIComponent(row.id)}`;
      link.textContent = row.title;

      const drop = document.createElement('button');
      drop.className = 'drawer__remove';
      drop.type = 'button';
      drop.textContent = 'Remove';
      drop.setAttribute('aria-label', `Remove ${row.title} from bookmarks`);
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

    if (event.target.closest('#open-bookmarks, #open-bookmarks-tab')) {
      openDrawer();
      return;
    }

    if (event.target.closest('#close-bookmarks, #bookmark-backdrop')) closeDrawer();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const drawer = document.getElementById('bookmark-drawer');
    if (drawer?.dataset.open === 'true') closeDrawer();
  });

  paintAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paintAll);
} else {
  paintAll();
}
