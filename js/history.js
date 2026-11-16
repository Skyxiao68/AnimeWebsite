import { card, statePanel } from './ui.js';
import { mountBookmarks, recentList } from './bookmarks.js';

const grid = document.getElementById('history-grid');
const rows = recentList();

// Stored rows are trimmed down to id/title/cover/score; the card component wants
// the AniList media shape, so reshape rather than keep a second copy in storage.
const toMedia = (row) => ({
  id: row.id,
  title: { english: row.title },
  coverImage: { large: row.cover },
  averageScore: row.score,
});

grid.dataset.state = rows.length ? 'success' : 'empty';
grid.replaceChildren(
  ...rows.map((row) =>
    card(toMedia(row), { href: `detail.html?id=${encodeURIComponent(row.id)}` }),
  ),
);

if (!rows.length) {
  grid.append(
    statePanel('empty', {
      title: 'Nothing here yet',
      message: 'Open any title and it lands on this page, newest first.',
      actionLabel: 'Browse catalog',
      onAction: () => {
        window.location.href = 'catalog.html';
      },
    }),
  );
}

mountBookmarks();
