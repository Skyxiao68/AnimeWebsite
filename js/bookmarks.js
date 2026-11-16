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

// ---------------------------------------------------------------- recent views
// The clock icon in the design opens "what I looked at last". Same store idea as
// bookmarks, but capped and trimmed on every visit, and only written by detail.js.

const RECENT_KEY = 'mf.recent.v1';
const RECENT_KEEP = 24; // history.html 一页能放下的量
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

/** history.html 直接拿这份列表铺页面，跟顶栏小面板是同一份数据 */
export function recentList() {
  return readRecent();
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

    if (event.target.closest('#open-bookmarks, #open-bookmarks-tab')) {
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
