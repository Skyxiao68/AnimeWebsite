import { section, userMessage, SECTIONS, SECTION_LABEL } from './api.js';
import { renderCards, renderState } from './ui.js';

async function fill(name) {
  const grid = document.querySelector(`.grid[data-section="${name}"]`);
  const perPage = name === 'tv' || name === 'movies' ? 12 : 4;  // 先定条数，骨架和请求都用它

  grid.dataset.state = 'loading';
  renderState(grid, 'loading', { count: perPage });

  try {
    const { items, source } = await section(name, { perPage });   // 不要写死 4
    if (!items.length) {
      grid.dataset.state = 'empty';
      renderState(grid, 'empty', { title: `${SECTION_LABEL[name]} 这一段暂时没有内容` });
      return;
    }
    renderCards(grid, items);
    grid.dataset.state = 'success';
    if (source === 'jikan') grid.dataset.source = 'jikan';
  } catch (err) {
    grid.dataset.state = 'error';
    renderState(grid, 'error', {
      title: `${SECTION_LABEL[name]} 没加载出来`,
      message: userMessage(err),
      actionLabel: '重试',
      onAction: () => fill(name),
    });
  }
}

await Promise.all(SECTIONS.map(fill));
const api = await import('/js/api.js?t=c' + Date.now());
await api.section('weekly', { perPage: 4, fresh: true });  
await api.section('weekly', { perPage: 4 });              