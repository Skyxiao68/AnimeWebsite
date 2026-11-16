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

  // 分数做成海报角上的小牌子（cycani 的卡就是这个长相）。
  // 标题下不再挂分数/格式行：设计稿和 cycani 的卡都只有海报 + 标题，
  // 多一行灰字会让整排卡片的文字基线参差。
  const score = document.createElement('span');
  score.className = 'card__score';
  // 小电视图标 + 分数，跟 cycani 的角标一个长相
  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  glyph.setAttribute('viewBox', '0 0 16 16');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = '<rect x="1.5" y="3.5" width="13" height="9" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 6.4l4 1.8-4 1.8z" fill="currentColor"/>';
  score.append(glyph, document.createTextNode(scoreText(media)));
  score.title = `平均分 ${scoreText(media)}`;

  // 海报包一层只负责裁切：hover 时图放大 4%，超出的部分被这层剪掉，
  // 不会盖到下面的标题（卡片本身只裁到自己的圆角边界）。
  const frame = document.createElement('span');
  frame.className = 'card__frame';
  frame.append(img);

  body.append(h3);
  link.append(frame, body);

  // 收藏按钮：图标 + aria-pressed（PRD #05）。
  // 这里只写初始状态，点击行为归 bookmarks.js —— 它只改 aria-pressed 和标签，不动图标。
  const save = document.createElement('button');
  save.className = 'card__save';
  save.type = 'button';
  save.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
  save.setAttribute('aria-label', bookmarked ? `Remove bookmark: ${title}` : `Bookmark: ${title}`);
  save.title = bookmarked ? 'Remove bookmark' : 'Bookmark';
  save.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6.2 4.4h11.6a1.4 1.4 0 0 1 1.4 1.4V20l-7.2-4.1L4.8 20V5.8a1.4 1.4 0 0 1 1.4-1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  // 海报右下角是 Bookmark 的位置（cycani 在那儿放「已完结」这类标签）。
  // 用一个和封面同比例的覆盖层当锚点，桌面端浮在海报上、手机端拆回文档流。
  const overlay = document.createElement('div');
  overlay.className = 'card__overlay';
  overlay.append(save);

  article.append(link);
  if (typeof media?.averageScore === 'number') article.append(score);
  article.append(overlay);
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

/**
 * 把 AniList 的 description（HTML）变成一行安全的富文本。
 *
 * 描述里带 <b>、<br>、&quot; 这类标记：直接 textContent 会把 "<b>" 原样打出来，
 * 直接 innerHTML 又等于让接口决定我们能插什么。这里只保留加粗，其余标签拆成
 * 文字、<br> 当一个空格，最后按字数裁断。
 *
 * @param {string} html 原始描述
 * @param {number} [max=190] 最多保留多少字
 * @returns {string} 可直接塞进 innerHTML 的字符串（已转义）
 */
export function synopsisHtml(html, max = 190) {
  const doc = document.implementation.createHTMLDocument('');
  const box = doc.createElement('div');
  box.innerHTML = String(html || '');

  const segments = [];
  const walk = (node, bold) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        segments.push({ text: child.nodeValue.replace(/\s+/g, ' '), bold });
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'br') segments.push({ text: ' ', bold });
        else walk(child, bold || tag === 'b' || tag === 'strong');
      }
    }
  };
  walk(box, false);

  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = [];
  let left = max;
  let cut = false;

  for (const seg of segments) {
    if (!left) { cut = true; break; }
    if (!seg.text) continue;
    const piece = seg.text.length > left ? seg.text.slice(0, left) : seg.text;
    if (piece.length < seg.text.length) cut = true;
    left -= piece.length;
    parts.push(seg.bold ? `<strong>${escape(piece)}</strong>` : escape(piece));
    if (cut) break;
  }

  const joined = parts.join('').replace(/\s+/g, ' ').trim();
  return cut ? `${joined.replace(/[\s,.;:-]+$/, '')}…` : joined;
}
