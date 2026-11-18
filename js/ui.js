// js/ui.js - render helpers: cards, skeletons, error and empty panels.
//
// Turns data into DOM only. No fetching, filters or motion. Each function
// returns a node; the caller decides where it goes.
// Bookmark state uses data attributes so bookmarks.js can flip it.

import { pageHref } from './paths.js';

const COVER_W = 400; // 2:3 goes into the attributes so nothing shifts before the image loads
const COVER_H = 600;

/** averageScore as a readable number; null is legal while a show is unaired */
export function scoreText(media) {
  return typeof media?.averageScore === 'number' ? String(media.averageScore) : '—';
}

/** Title from romaji or english, falling back to the id so nothing renders "undefined" */
export function titleText(media) {
  return media?.title?.english || media?.title?.romaji || `#${media?.id ?? '?'}`;
}

// One card: poster, title, score chip and bookmark button.
export function card(media, { bookmarked = false, href } = {}) {
  const title = titleText(media);
  const id = media?.id ?? '';

  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.id = String(id);

  const link = document.createElement('a');
  link.className = 'card__link';
  link.href = href || pageHref(`detail.html?id=${encodeURIComponent(id)}`);

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

  // Score rides on the poster as a small chip (the reference cards look like this).
  // Nothing sits under the title: reference cards are poster plus title, and an extra
  // grey row makes baselines ragged across a shelf.
  const score = document.createElement('span');
  score.className = 'card__score';
  // small TV glyph plus the score, same shape as the reference chip
  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  glyph.setAttribute('viewBox', '0 0 16 16');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = '<rect x="1.5" y="3.5" width="13" height="9" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 6.4l4 1.8-4 1.8z" fill="currentColor"/>';
  score.append(glyph, document.createTextNode(scoreText(media)));
  score.title = `Average score ${scoreText(media)}`;

  // The wrapper does the cropping: on hover the poster scales 4% and this layer cuts
  // the overflow so it never reaches the title.
  const frame = document.createElement('span');
  frame.className = 'card__frame';
  frame.append(img);

  body.append(h3);
  link.append(frame, body);

  // Bookmark: icon plus aria-pressed (PRD #05).
  // Initial state only - clicks belong to bookmarks.js, which touches aria-pressed and the label.
  const save = document.createElement('button');
  save.className = 'card__save';
  save.type = 'button';
  save.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
  save.setAttribute('aria-label', bookmarked ? `Remove bookmark: ${title}` : `Bookmark: ${title}`);
  save.title = bookmarked ? 'Remove bookmark' : 'Bookmark';
  save.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6.2 4.4h11.6a1.4 1.4 0 0 1 1.4 1.4V20l-7.2-4.1L4.8 20V5.8a1.4 1.4 0 0 1 1.4-1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  // Bottom-right of the poster is where the reference puts its tags ("finished" etc).
  // A cover-proportioned overlay anchors it: floating on desktop, in flow on mobile.
  const overlay = document.createElement('div');
  overlay.className = 'card__overlay';
  overlay.append(save);

  article.append(link);
  if (typeof media?.averageScore === 'number') article.append(score);
  article.append(overlay);
  return article;
}

/** Replace the container contents with cards for these items
 * @param {object} [opts] forwarded to card(); opts.isBookmarked(media) seeds the button
 */
export function renderCards(container, items, opts = {}) {
  const { isBookmarked, ...rest } = opts;
  container.replaceChildren(
    ...items.map((m) => card(m, { ...rest, bookmarked: isBookmarked ? isBookmarked(m) : false })),
  );
}

/** n skeleton cards, sized like the real ones so nothing jumps on load */
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

/** Loading state: clear the container and show n skeletons */
export function showSkeleton(container, n = 6) {
  container.replaceChildren(skeletonCards(n));
}

/** Error / empty panel.
 * @param {'error'|'empty'} kind
 * @param {object} opts
 * @param {string} [opts.actionLabel] only renders the button when given
 */
export function statePanel(kind, { title, message = '', actionLabel, onAction } = {}) {
  const box = document.createElement('div');
  box.className = `state state--${kind === 'error' ? 'error' : 'empty'}`;
  // errors should be announced right away; an empty shelf is not urgent
  if (kind === 'error') box.setAttribute('role', 'alert');

  const h = document.createElement('h3');
  h.className = 'state__title';
  h.textContent = title || (kind === 'error' ? 'Could not load' : 'Nothing here yet');

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

/** The one entry point for the four states: what goes inside the section */
export function renderState(container, kind, opts) {
  if (kind === 'loading') {
    showSkeleton(container, opts?.count ?? 6);
    return;
  }
  container.replaceChildren(statePanel(kind, opts));
}

// AniList writes the synopsis as HTML with <b>, <br> and entities. Flatten it to
// text, keep the bold spans (the lede styles <strong>), then cut on characters.
const BOLD_ON = '\u0001';
const BOLD_OFF = '\u0002';

export function synopsisHtml(html, max = 190) {
  const flat = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\s*(?:b|strong)\s*>/gi, BOLD_ON)
    .replace(/<\s*\/\s*(?:b|strong)\s*>/gi, BOLD_OFF)
    .replace(/<[^>]*>/g, '');

  // round-trip through a detached node to decode &quot; and friends
  const holder = document.createElement('div');
  holder.innerHTML = flat;
  const text = (holder.textContent || '').replace(/\s+/g, ' ').trim();

  const cut = text.length > max;
  let body = cut ? text.slice(0, max).replace(/[\s,.;:-]+$/, '') : text;
  body = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const opens = (body.match(new RegExp(BOLD_ON, 'g')) || []).length;
  const closes = (body.match(new RegExp(BOLD_OFF, 'g')) || []).length;
  let out = body.split(BOLD_ON).join('<strong>').split(BOLD_OFF).join('</strong>');
  if (closes > opens) out = out.replace(/^(<\/strong>)+/, '');
  if (opens > closes) out += '</strong>'.repeat(opens - closes);

  return cut ? `${out}…` : out;
}

/** Back to top: shows after one screen and retracts once the footer appears.
 * Raising a fixed button only moves it along with the page, so it hides instead.
 */
export function mountToTop(button) {
  const btn = button || document.getElementById('to-top');
  if (!btn) return;

  const footer = document.querySelector('.site-footer');
  const onScroll = () => {
    const footerTop = footer ? footer.getBoundingClientRect().top : Infinity;
    btn.hidden = scrollY < 600 || footerTop < innerHeight;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  btn.addEventListener('click', () => {
    const soft = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: soft ? 'smooth' : 'auto' });
  });
}
