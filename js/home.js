import { section, userMessage, SECTIONS, SECTION_LABEL } from './api.js';
import { renderCards, renderState } from './ui.js';
import { isBookmarked, mountBookmarks, syncWithin } from './bookmarks.js';

async function fill(name) {
  const grid = document.querySelector(`.grid[data-section="${name}"]`);
  if (!grid) return;

  // Six columns wide: Weekly and Top Rated fill one row, TV and Movies two.
  const perPage = name === 'tv' || name === 'movies' ? 12 : 4;

  grid.dataset.state = 'loading';
  renderState(grid, 'loading', { count: perPage });

  try {
    const { items, source } = await section(name, { perPage });

    if (!items.length) {
      grid.dataset.state = 'empty';
      renderState(grid, 'empty', {
        title: `Nothing in ${SECTION_LABEL[name]} right now`,
        message: 'AniList sent back an empty shelf — the catalogue is still there.',
      });
      return;
    }

    renderCards(grid, items, { isBookmarked: (media) => isBookmarked(media.id) });
    grid.dataset.state = 'success';
    if (source === 'jikan') grid.dataset.source = 'jikan';
  } catch (err) {
    grid.dataset.state = 'error';
    renderState(grid, 'error', {
      title: `Could not load ${SECTION_LABEL[name]}`,
      message: userMessage(err),
      actionLabel: 'Try again',
      onAction: () => fill(name),
    });
  }
}

mountBookmarks();
await Promise.all(SECTIONS.map(fill));
syncWithin(document.querySelector('main'));
