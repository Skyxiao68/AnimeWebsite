// js/ui.js —— 渲染辅助：卡片 / 骨架 / 错误 / 空态
//
// 分工（PLAN.md:47）：这一层只管「把一份数据变成 DOM」，不碰请求、不碰筛选、不碰动效。
// S5 你要写的 home.js 只需要：拿 api.js 的 items → renderCards(容器, items)。
//
// 约定：
//   - 所有函数都返回 DOM 节点（或 DocumentFragment），由调用方决定挂到哪儿
//   - 不读全局状态、不写 localStorage —— 收藏状态用 data 属性表达，交给 bookmarks.js 改
//   - 卡片的 class 结构与 index.html 里手写的静态卡片一致，别在别处另起一套

const COVER_W = 400; // 2:3 的比例写进属性，图片没加载完时也不跳动
const COVER_H = 600;

/** 把 averageScore 变成人能看的样子（null 是合法的：新番还没评分） */
export function scoreText(media) {
  return typeof media?.averageScore === 'number' ? String(media.averageScore) : '—';
}

/** 标题只用 romaji/english，两者都空就退回 id，别渲染成 undefined */
export function titleText(media) {
  return media?.title?.english || media?.title?.romaji || `#${media?.id ?? '?'}`;
}

/**
 * 单张卡片。
 * @param {object} media  api.js 返回的条目（id/title/coverImage/averageScore/format）
 * @param {object} [opts]
 * @param {boolean} [opts.bookmarked=false] 收藏按钮的初始 aria-pressed
 * @param {string} [opts.href]  默认 detail.html?id=<id>
 */
export function card(media, { bookmarked = false, href } = {}) {
  const title = titleText(media);
  const id = media?.id ?? '';

  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.id = String(id);

  const link = document.createElement('a');
  link.className = 'card__link';
  link.href = href || `detail.html?id=${encodeURIComponent(id)}`;

  const img = document.createElement('img');
  img.className = 'card__cover';
  img.src = media?.coverImage?.large || '';
  img.alt = `Cover of ${title}`;
  img.width = COVER_W;
  img.height = COVER_H;
  img.loading = 'lazy';
  img.decoding = 'async';

  const body = document.createElement('div');
  body.className = 'card__body';

  const h3 = document.createElement('h3');
  h3.className = 'card__title';
  h3.textContent = title;

  const meta = document.createElement('p');
  meta.className = 'card__meta';

  const score = document.createElement('span');
  score.className = 'card__score';
  score.textContent = scoreText(media);
  score.title = `平均分 ${scoreText(media)}`;

  meta.append(score);
  if (media?.format) {
    const fmt = document.createElement('span');
    fmt.className = 'card__format';
    fmt.textContent = media.format;
    meta.append(fmt);
  }

  body.append(h3, meta);
  link.append(img, body);

  // 收藏按钮：可见文字 + aria-pressed（PRD #05）。
  // 这里只写初始状态，点击行为归 bookmarks.js —— 它会改 aria-pressed 与 .card__save 的文字。
  const save = document.createElement('button');
  save.className = 'card__save';
  save.type = 'button';
  save.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
  save.setAttribute('aria-label', `Bookmark: ${title}`);
  save.textContent = bookmarked ? 'Bookmarked' : 'Bookmark';

  article.append(link, save);
  return article;
}

/**
 * 把条目列表渲染进容器（先清空）。
 * @param {Element} container
 * @param {object[]} items
 * @param {object} [opts] 透传给 card()；也可以给 opts.isBookmarked(media) => boolean
 */
export function renderCards(container, items, opts = {}) {
  const { isBookmarked, ...rest } = opts;
  container.replaceChildren(
    ...items.map((m) => card(m, { ...rest, bookmarked: isBookmarked ? isBookmarked(m) : false })),
  );
}

/** n 张骨架卡；尺寸与真卡片一致，加载完不跳版 */
export function skeletonCards(n = 6) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i += 1) {
    const article = document.createElement('article');
    article.className = 'card card--skeleton';
    article.setAttribute('aria-hidden', 'true');

    const cover = document.createElement('div');
    cover.className = 'card__cover';

    const line1 = document.createElement('div');
    line1.className = 'skeleton-line';

    const line2 = document.createElement('div');
    line2.className = 'skeleton-line skeleton-line--short';

    article.append(cover, line1, line2);
    frag.append(article);
  }
  return frag;
}

/** 骨架态：清空容器并塞入 n 张骨架卡 */
export function showSkeleton(container, n = 6) {
  container.replaceChildren(skeletonCards(n));
}

/**
 * 错误 / 空态面板。
 * @param {'error'|'empty'} kind
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {string} [opts.actionLabel] 给了才出按钮
 * @param {Function} [opts.onAction]
 */
export function statePanel(kind, { title, message = '', actionLabel, onAction } = {}) {
  const box = document.createElement('div');
  box.className = `state state--${kind === 'error' ? 'error' : 'empty'}`;
  // 错误要立刻被读屏念出来；空态不需要打断
  if (kind === 'error') box.setAttribute('role', 'alert');

  const h = document.createElement('h3');
  h.className = 'state__title';
  h.textContent = title || (kind === 'error' ? '加载失败' : '这里还空着');

  box.append(h);

  if (message) {
    const p = document.createElement('p');
    p.className = 'state__message';
    p.textContent = message;
    box.append(p);
  }

  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'btn btn--accent state__action';
    btn.type = 'button';
    btn.textContent = actionLabel;
    if (onAction) btn.addEventListener('click', onAction);
    box.append(btn);
  }

  return box;
}

/** 四态的统一入口：section 容器里该显示什么，这里一次说清 */
export function renderState(container, kind, opts) {
  if (kind === 'loading') {
    showSkeleton(container, opts?.count ?? 6);
    return;
  }
  container.replaceChildren(statePanel(kind, opts));
}
