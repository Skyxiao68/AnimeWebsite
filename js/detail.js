// One title: fetch it, then paint every slot. Descriptions arrive as HTML, so
// everything goes in via textContent or createElement — no innerHTML anywhere.
import { media } from './api.js';
import { card, mountToTop, renderCards, renderState } from './ui.js';
import {
  isBookmarked,
  pulseSave,
  recordView,
  toggle as toggleSave,
  syncWithin,
  mountBookmarks,
} from './bookmarks.js';

const RATING_KEY = 'mf.ratings.v1';
const FORMAT = { TV: 'TV Show', TV_SHORT: 'TV Short', MOVIE: 'Movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special', MUSIC: 'Music' };
const STATUS = { FINISHED: 'Finished', RELEASING: 'Airing', NOT_YET_RELEASED: 'Upcoming', CANCELLED: 'Cancelled' };

const $ = (id) => document.getElementById(id);
const els = {
  cover: $('detail-cover'),
  badge: $('detail-badge'),
  title: $('detail-title'),
  alts: $('detail-alts'),
  genres: $('detail-genres'),
  meta: $('detail-meta'),
  meta2: $('detail-meta2'),
  actions: $('detail-actions'),
  save: $('detail-save'),
  saveLabel: $('detail-save-label'),
  rate: $('detail-rate'),
  rateLabel: $('detail-rate-label'),
  ratePop: $('detail-rating'),
  rateRow: $('rating-row'),
  related: $('related-panel'),
  relatedCount: $('related-count'),
  relatedList: $('related-list'),
  state: $('detail-state'),
  synopsis: $('detail-synopsis'),
  more: $('detail-more'),
  extBlock: $('ext-block'),
  links: $('detail-links'),
  reco: $('reco-grid'),
  toTop: $('to-top'),
};

function idFromUrl() {
  const n = Number(new URLSearchParams(location.search).get('id'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function plainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const nameOf = (media) =>
  media.title?.english || media.title?.romaji || media.title?.native || 'Untitled';

function readRatings() {
  try {
    const raw = JSON.parse(localStorage.getItem(RATING_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeRating(id, score) {
  const all = readRatings();
  if (score) all[id] = score;
  else delete all[id];
  try {
    localStorage.setItem(RATING_KEY, JSON.stringify(all));
  } catch {
    /* private mode: the click still works for this page view */
  }
}

function paintRating(id) {
  const score = readRatings()[id] || 0;
  els.rateRow.replaceChildren(
    ...Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rating__pill';
      btn.dataset.score = String(n);
      btn.textContent = String(n);
      btn.setAttribute('aria-pressed', String(n === score));
      btn.setAttribute('aria-label', `Rate ${n} out of 10`);
      return btn;
    })
  );
  els.rateLabel.textContent = score ? `Your score ${score}/10` : 'Rate';
  els.rate.setAttribute('aria-pressed', String(Boolean(score)));
}

// Fade the bottom edge while the list can scroll; drop the fade at the end.
function syncRelatedFade() {
  const list = els.relatedList;
  list.dataset.more = String(list.scrollHeight - list.clientHeight - list.scrollTop > 8);
}

function paintRelated(item) {
  const edges = (item.relations?.edges || []).filter((e) => e.node?.type === 'ANIME');
  if (!edges.length) {
    els.related.hidden = true;
    return;
  }
  // The panel scrolls (see .related__list), so every relation is rendered.
  const rows = edges.map((edge) => {
    const node = edge.node;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'related__link';
    a.href = `detail.html?id=${node.id}`;
    const img = document.createElement('img');
    img.src = node.coverImage?.large || '';
    img.alt = '';
    img.loading = 'lazy';
    img.width = 42;
    img.height = 60;
    const span = document.createElement('span');
    span.textContent = node.title?.english || node.title?.romaji || 'Untitled';
    a.append(img, span);
    li.append(a);
    return li;
  });
  els.relatedList.replaceChildren(...rows);
  els.relatedList.scrollTop = 0;
  els.relatedCount.textContent = `Total of ${edges.length} ${edges.length === 1 ? 'Title' : 'Titles'}`;
  els.related.hidden = false;
  syncRelatedFade();
}

// One line glyph per link type: play / chat / info / external.
// Brand marks are a dozen different drawings; one line style reads calmer.
const LINK_GLYPH = {
  STREAMING: '<path d="M9 6.6v10.8l9-5.4z" fill="currentColor" stroke="none"/>',
  SOCIAL: '<path d="M4.6 5.6h14.8v9.6H9.4l-4.8 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  INFO: '<circle cx="12" cy="12" r="7.9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11.1v5.1M12 7.7v.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  OTHER: '<path d="M13.4 4.6h5.8v5.8M19.2 4.6l-8 8M11 5.2H5.4v13.4h13.4V13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

// The word on the right: every link says what kind it is, not just Info.
const LINK_KIND = { STREAMING: 'Streaming', SOCIAL: 'Social', INFO: 'Info', OTHER: 'Other' };

// AniList ships an official icon per site; fall back to the glyph when it is missing or broken.
function externalIcon(link) {
  if (link.icon) {
    const img = document.createElement('img');
    img.className = 'ext-link__icon ext-link__icon--brand';
    img.src = link.icon;
    img.alt = '';
    img.width = 16;
    img.height = 16;
    img.loading = 'lazy';
    img.addEventListener('error', () => img.replaceWith(linkIcon(link.type)), { once: true });
    return img;
  }
  return linkIcon(link.type);
}

function linkIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ext-link__icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = LINK_GLYPH[type] || LINK_GLYPH.OTHER;
  return svg;
}

function paintLinks(item) {  const links = (item.externalLinks || []).filter((l) => l?.url).slice(0, 5);
  if (!links.length) {
    els.extBlock.hidden = true;
    return;
  }
  els.links.replaceChildren(
    ...links.map((link) => {
      const a = document.createElement('a');
      a.className = 'ext-link';
      a.href = link.url;
      a.rel = 'noopener';
      a.target = '_blank';
      const name = document.createElement('span');
      name.className = 'ext-link__name';
      name.textContent = link.site || 'Link';
      a.append(externalIcon(link), name);
      const kindLabel = LINK_KIND[link.type];
      if (kindLabel) {
        const kind = document.createElement('span');
        kind.className = 'ext-link__kind';
        kind.textContent = kindLabel;
        a.append(kind);
      }
      return a;
    })
  );
  els.extBlock.hidden = false;
}

function paintActions(item) {
  const id = item.id;
  const row = {
    id,
    title: nameOf(item),
    cover: item.coverImage?.large || '',
    score: item.averageScore || undefined,
  };

  const sync = () => {
    const on = isBookmarked(id);
    els.save.setAttribute('aria-pressed', String(on));
    els.saveLabel.textContent = on ? 'Bookmarked' : 'Bookmark';
  };
  sync();

  els.save.addEventListener('click', () => {
    const saved = toggleSave(row);
    sync();
    pulseSave(els.save);
    if (saved) pulseSave(document.getElementById('open-bookmarks'));
  });

  els.actions.hidden = false;
}

function paintDetails(item) {
  const title = nameOf(item);
  document.title = `${title} · MikuFansAnime`;

  els.title.textContent = title;
  recordView(item);

  const alts = [item.title?.native, item.title?.english && item.title.english !== title ? item.title.english : null]
    .filter(Boolean)
    .join('  |  ');
  els.alts.textContent = alts;

  if (item.coverImage?.extraLarge || item.coverImage?.large) {
    els.cover.src = item.coverImage.extraLarge || item.coverImage.large;
    els.cover.alt = `${title} cover`;
  }

  if (item.averageScore) {
    els.badge.textContent = `${(item.averageScore / 10).toFixed(1)}/10`;
    els.badge.hidden = false;
  }

  els.genres.replaceChildren(
    ...(item.genres || []).slice(0, 4).map((genre) => {
      const li = document.createElement('li');
      li.className = 'detail__genre';
      li.textContent = genre;
      return li;
    })
  );

  const line1 = [FORMAT[item.format] || item.format, item.seasonYear, STATUS[item.status] || item.status]
    .filter(Boolean)
    .join(' · ');
  els.meta.textContent = line1;

  const studio = (item.studios?.nodes || []).find((s) => s.isAnimationStudio)?.name;
  const length = item.episodes
    ? `${item.episodes} Episodes`
    : item.duration
      ? `${item.duration} min`
      : null;
  els.meta2.textContent = [studio, length].filter(Boolean).join(' · ');

  const text = plainText(item.description);
  els.synopsis.textContent = text || 'No synopsis has been written for this title yet.';
  els.synopsis.dataset.clamped = 'true';
  els.more.hidden = text.length < 520;
  els.more.textContent = 'Read more';
  els.more.setAttribute('aria-expanded', 'false');

  paintRelated(item);
  paintLinks(item);
  paintActions(item);
  paintRating(item.id);

  const recs = (item.recommendations?.nodes || [])
    .map((n) => n.mediaRecommendation)
    .filter(Boolean);
  renderCards(els.reco, recs, { isBookmarked: (m) => isBookmarked(m.id) });
  els.reco.dataset.state = recs.length ? 'success' : 'empty';
  els.reco.setAttribute('aria-busy', 'false');
  syncWithin(els.reco);
}

function wire() {
  els.more.addEventListener('click', () => {
    const open = els.more.getAttribute('aria-expanded') === 'true';
    els.more.setAttribute('aria-expanded', String(!open));
    els.synopsis.dataset.clamped = String(open);
    els.more.textContent = open ? 'Read more' : 'Show less';
  });

  els.rate.addEventListener('click', () => {
    const open = els.rate.getAttribute('aria-expanded') === 'true';
    els.rate.setAttribute('aria-expanded', String(!open));
    els.ratePop.hidden = open;
  });

  els.rateRow.addEventListener('click', (event) => {
    const btn = event.target.closest('.rating__pill');
    if (!btn) return;
    const id = idFromUrl();
    if (!id) return;
    const picked = Number(btn.dataset.score);
    const current = readRatings()[id] || 0;
    writeRating(id, current === picked ? 0 : picked); // clicking the same number clears it
    paintRating(id);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.rate')) {
      els.rate.setAttribute('aria-expanded', 'false');
      els.ratePop.hidden = true;
    }
  });

  mountToTop(els.toTop);

  els.relatedList.addEventListener('scroll', syncRelatedFade, { passive: true });
}

async function boot() {
  mountBookmarks();
  wire();

  const id = idFromUrl();
  if (!id) {
    renderState(els.state, 'error', {
      title: 'No title selected',
      message: 'Open a title from the catalogue or the rankings.',
      actionLabel: 'Go to catalogue',
      onAction: () => { location.href = 'catalog.html'; },
    });
    els.title.textContent = 'Nothing to show';
    els.reco.dataset.state = 'empty';
    return;
  }

  try {
    els.reco.dataset.state = 'loading';
    const item = await media(id);
    paintDetails(item);
  } catch (err) {
    els.title.textContent = 'Could not load this title';
    renderState(els.state, 'error', {
      title: 'Could not load this title',
      message: 'The data request failed. Check the connection and try again.',
      actionLabel: 'Try again',
      onAction: () => location.reload(),
    });
    els.reco.dataset.state = 'error';
  }
}

boot();
