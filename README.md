# MikuFansAnime

A five-page anime discovery site built from live AniList data. There is no account
and no profile: you pick a shelf or search, open a title, and keep a bookmark in
the browser.

- Live site: https://skyxiao68.github.io/AnimeWebsite/
- Repository: https://github.com/Skyxiao68/AnimeWebsite

## Pages

| Page | File | What it does |
| --- | --- | --- |
| Home | `index.html` | Four shelves (Weekly, Ranks, TV, Movies) and the search bar |
| Catalog | `pages/catalog.html` | Six filter groups (region, format, status, genre, year, sort), its own full-width search box, the "N titles found" line, Load more |
| Rankings | `pages/rankings.html` | Popularity / score / favourites lists, five time windows, genre filter |
| Detail | `pages/detail.html?id=` | Score, format, episodes, synopsis with Read more, related titles, recommendations, a local rating |
| Bookmarks | `pages/saved.html` | Saved titles, grouped into collections, with search and sort |

Every page shares a bookmark drawer: a quick look at what is saved, and a remove
button. The Bookmarks page is where collections, search and sort live. The footer
and the phone tab bar both point there.

## Built with

Plain HTML, CSS and ES modules. No framework, build step or bundler: the files in
the repository are the files the browser runs. GSAP 3.12.5 sits in `vendor/`
(gsap, ScrollTrigger, MotionPathPlugin, Draggable), so the submission does not
depend on a CDN.

```
index.html             home page
pages/catalog.html     catalogue and filters
pages/detail.html      one title
pages/rankings.html    rankings
pages/saved.html       bookmarks page
css/tokens.css         design tokens (colour, spacing, type, motion)
css/style.css          layout, components, page styles
js/api.js              AniList GraphQL, Jikan fallback, cache, typed errors
js/ui.js               cards and state rendering
js/paths.js            page links that work from either folder
js/filters.js          filter state, URL sync, debounce
js/catalog.js          catalogue controller
js/rankings.js         rankings controller
js/detail.js           detail controller
js/bookmarks.js        localStorage bookmarks, collections, drawer, recently viewed
js/saved.js            bookmarks page controller
js/motion.js           the four GSAP moments
js/search.js           keyword typeahead under the header field
js/theme.js            light / dark switch
vendor/                GSAP 3.12.5
```

Only `index.html` sits at the repository root. The other four pages are in
`pages/`, and `js/paths.js` prefixes their links when the page is loaded from
the root.

## Data

AniList's GraphQL API is the source: `https://graphql.anilist.co`, no key, one
endpoint for grid fields and detail fields. Requests carry an abort controller
(8 s) and are cached for five minutes per query in memory and in `localStorage`,
so a reload or `index → detail → back` does not fetch what is already on screen.

AniList documents a **30 requests/minute** limit (it used to be 90). The home page
once spent five requests per load. It now sends one aliased query for the shelves
and the airing window (`homeFeed()`) plus one for the hero's banner fields; a warm
reload sends none. Requests are spaced 600 ms apart, and a 429 is retried once
after the `Retry-After` delay before the error state appears. The catalogue
debounces typing by 300 ms and ignores results from superseded requests.

**Jikan fallback.** When AniList fails with a network error, timeout, rate limit
or 5xx, the catalogue and home shelves retry against `https://api.jikan.moe/v4`.
Jikan speaks MyAnimeList, not AniList, so the fallback only does what it can:

- the catalogue sends the keyword and pagination, and the page says "Jikan
  fallback, filters limited" while it is in use;
- the detail page has no fallback. Jikan addresses titles by MyAnimeList id, we
  hold AniList ids, and matching on titles returns the wrong synopsis and the
  wrong relations. A retry button is better than quietly wrong data.

**Rankings** has three sort lists (popularity, average score, favourites) and five
time windows. AniList publishes no daily or monthly chart, so each window borrows
the nearest signal it does publish: Day and Month read `TRENDING_DESC` (Month
restricted to airing titles), Week is the last seven days of the airing schedule
sorted by popularity, and Season/Year filter by season and year. The tooltips say
which signal a window uses.

## Interactions

Four interactions, each doing a different job:

1. **Search and six filter groups** (`js/filters.js`). Chips are `aria-pressed`
   toggles, the year is a typed input, state is mirrored into the URL, and Reset
   restores the default view.
2. **Bookmarks** (`js/bookmarks.js`, `js/saved.js`). `localStorage`, capped at
   200 entries, survives reloads, mirrors into the drawer and updates the header
   count. Collections are a second local list; a saved title points at one
   collection id, and deleting a collection drops its titles back into Unsorted.
   With storage disabled, saving degrades to "nothing saved" instead of throwing.
3. **Rating** (`js/detail.js`). 1–10, one value per title, click the same number
   again to clear it. Stored locally, never uploaded.
4. **Load more** (`js/catalog.js`, `js/rankings.js`). Appends the next page
   instead of re-rendering, keeps the rank numbering continuous, and hides itself
   when the API says there is nothing left.

The light / dark switch beside the clock (`js/theme.js`) is separate from these
four. It is described under [Theme](#theme).

## Motion

| Technique | Where | What it does |
| --- | --- | --- |
| Timeline | Home hero | Eyebrow, headline, lede and search bar arrive in reading order |
| ScrollTrigger | Every grid | Cards fade up once, in batches, as they are reached |
| MotionPath | Home, Weekly row | The four Weekly cards land along a shallow arc |
| Draggable | Home, Weekly row (≤599 px) | The row becomes a strip you can push sideways |

`prefers-reduced-motion: reduce` turns all four off. "Back to top" uses smooth
scrolling only when the user has not asked for reduced motion.

Two smaller uses of the same library: saving a title pulses the control and the
header badge, and when the hero pick changes, its tags, title and lede leave and
return in three staggered lines. Both fall back to the CSS behaviour, and to no
motion, under `prefers-reduced-motion: reduce`.

## Theme

Dark is the designed default. The light theme is a complete second palette drawn
from Miku's teal (`#39C5BB` for fills, `#0A7A76` for text and links, `#E7F3F1`
for the page), not an inversion. The switch sits next to the clock on every page,
remembers the choice in `localStorage`, and an inline snippet in each `<head>`
applies it before first paint, so a light-theme reload does not flash dark.

The accent is split into a text accent and a fill accent. One teal cannot be
readable as 14 px text on white and also hold dark ink as a chip behind it, so
`--accent` and `--accent-fill` carry separate values; in dark mode both are the
original `#BD91C8`. The header keeps its dark glass while it floats over the home
hero, even in light mode, because the banner is a photograph and white links need
it. It turns light once the header sticks.

The theme is an additional feature, not a fifth assessed interaction. The four
counted mechanisms are the ones above.

## Accessibility

- Contrast was measured, not eyeballed. `#978FA3` on `#141018` is 6.06:1 and on
  `#1A1424` is 5.79:1; the accent `#BD91C8` is 7.20:1; accent on ink
  (`#1A0F1E`) is 7.12:1. An earlier `#6F6880` body colour came out at 3.55:1 and
  was replaced. The light palette was measured the same way: body `#113033` on
  `#E7F3F1` 12.37:1, muted `#44666A` on `#FBFEFD` 6.17:1, accent `#0A7A76`
  on `#FBFEFD` 5.10:1, ink `#06302E` on the teal fill 6.72:1. The dim tone
  (`#6E8D8F`) is 3.53:1 and only used on disabled chips.
- Loading, empty and error are three rendered states, each with its own copy and
  next step. `aria-busy` marks the grid while it loads.
- A malformed year produces a validation message, not a "no results" message.
- The bookmark drawer uses `inert` when closed, closes on Escape, and returns
  focus to the button that opened it.
- Every page has a skip link, one `<h1>`, and landmarks (`header`, `nav`,
  `main`, `footer`).

## AI use

The course policy asks for this, so here it is.

 AI assistant was used as a  pair reviewer. It
produced the first draft of the HTML shells, and this README. Every file was read,
questioned and adjusted by Ben Lai, who owns the decisions in it: the three-list
rankings, the local-only ratings, the drawer instead of a fifth page, the fallback
limits, and the contrast numbers above.

The research in the submitted PRD (competitor analysis, interviews, affinity
diagram) was done by hand and is not AI-generated. No AI produced the written
analysis or the evidence screenshots.

GSAP is used under its standard "no charge" licence; copyright GreenSock.

Data from [AniList](https://anilist.co). Built for a university assignment and
not affiliated with AniList or MyAnimeList.
