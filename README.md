# MikuFansAnime

A five-page anime discovery site built from live AniList data. No account, no
newsletter, no "create a profile to save one title" — pick a shelf or search,
open a title, keep a bookmark in the browser.

- Live site: _(GitHub Pages URL goes here once Pages is enabled)_
- Repository: https://github.com/Skyxiao68/AnimeWebsite

## Pages

| Page | File | What it does |
| --- | --- | --- |
| Home | `index.html` | Four shelves — Weekly, Top Rated, TV, Movies — plus the sticky search bar |
| Catalog | `catalog.html` | Six filter groups (region, format, status, genre, year, sort), its own full-width search box (no nav search on this page), the "A Total of N Titles have been found" line, Load more |
| Rankings | `rankings.html` | Trending / all-time popular / highest rated lists with a genre filter |
| Detail | `detail.html?id=` | Score, format, episodes, synopsis with Read more, related titles, recommendations, a local rating |
| Bookmarks | `saved.html` | Saved titles, grouped into collections, with search and sort — the full version of the drawer |

The bookmark drawer is shared by all five pages: a quick peek and a remove. The
Bookmarks page is where the organising happens — collections, search, sort — and
both the footer and the mobile tab bar point at it.

## Built with

Plain HTML, CSS and ES modules. No framework, no build step, no bundler — the
files you see are the files the browser runs. GSAP 3.12.5 is vendored in
`vendor/` (gsap, ScrollTrigger, MotionPathPlugin, Draggable) so the submission
does not depend on a CDN staying up.

```
index.html  catalog.html  detail.html  rankings.html  saved.html
css/tokens.css   design tokens (colour, spacing, type, motion)
css/style.css    layout, components, page styles
js/api.js        AniList GraphQL + Jikan fallback + cache + typed errors
js/ui.js         card and state rendering
js/filters.js    filter state, URL sync, debounce
js/catalog.js    catalog page controller
js/rankings.js   rankings page controller
js/detail.js     detail page controller
js/bookmarks.js  localStorage bookmarks, collections, drawer, recently-viewed store
js/saved.js      bookmarks page controller
js/motion.js     the four GSAP moments
vendor/          GSAP 3.12.5
```

## Data

AniList's GraphQL API is the source: `https://graphql.anilist.co`, no key, one
endpoint for both the grid fields and the detail fields. Requests carry an
abort controller (8 s) and are cached for five minutes per query in memory and
in `localStorage`, so a reload, or `index → detail → back`, does not re-fetch
what is already on screen.

AniList currently documents a **30 requests/minute** limit (it was 90). The
home page used to spend five of those per load; it now sends one aliased query
for the shelves and the airing window (`homeFeed()`) plus one for the hero's
banner fields, and a warm reload sends none. Requests are spaced 600 ms apart,
and a 429 is retried once after the `Retry-After` delay before the error state
appears. The catalog debounces typing by 300 ms and ignores results from
superseded requests, which keeps a fast typist under the limit.

**Jikan fallback.** When AniList fails with a network error, timeout, rate limit
or 5xx, the catalog and home shelves retry against `https://api.jikan.moe/v4`.
Jikan speaks MyAnimeList, not AniList, so the fallback is honest about what it
cannot carry:

- the catalog sends only the keyword and pagination, and the page says
  "fallback source, filters limited" when it happens;
- the detail page has **no** fallback at all. Jikan addresses titles by
  MyAnimeList id, we only hold AniList ids, and matching on titles returns the
  wrong synopsis and the wrong relations. An error state with a retry button is
  better than quietly wrong data.

**Rankings** offers three lists rather than the four tabs in the mock-up. AniList
does not publish a weekly chart, so a "this week" tab would be invented. The page
says so in its own lede rather than pretending.

## Interactions

Four, distinct in mechanism:

1. **Search + six filter groups** (`js/filters.js`) — chips are `aria-pressed`
   toggles, the year is a typed input, state is mirrored into the URL, and a
   Reset restores the default view.
2. **Bookmarks** (`js/bookmarks.js`, `js/saved.js`) — `localStorage`, capped at
   200 entries, survives reloads, mirrors into the drawer and updates the header
   count. Collections are a second local list; a saved title points at one
   collection id, and deleting a collection drops its titles back into Unsorted.
   A private window with storage disabled degrades to "nothing saved" instead of
   throwing.
3. **Rating** (`js/detail.js`) — 1–10, one value per title, click the same
   number again to clear it. Stored locally, never uploaded.
4. **Load more** (`js/catalog.js`, `js/rankings.js`) — appends the next page
   instead of re-rendering, keeps the rank numbering continuous, and hides
   itself when the API says there is nothing left.

## Motion

| Technique | Where | What it does |
| --- | --- | --- |
| Timeline | Home hero | Eyebrow, headline, lede and search bar arrive in reading order |
| ScrollTrigger | Every grid | Cards fade up once, in batches, as they are reached |
| MotionPath | Home, Weekly row | The four Weekly cards land along a shallow arc rather than a straight rise |
| Draggable | Home, Weekly row (≤599 px) | The row becomes a strip you can push sideways — the PRD review asked for a horizontal list instead of a stacked column |

`prefers-reduced-motion: reduce` turns all four off and leaves the page still.
The on-screen "Back to top" button uses `behavior: smooth` only when the user
has not asked for reduced motion.

## Accessibility

- Text contrast measured, not eyeballed: `#978FA3` on `#141018` is 6.06:1, on
  `#1A1424` is 5.79:1; the accent `#BD91C8` is 7.20:1; accent on ink
  (`#1A0F1E`) is 7.12:1. An earlier `#6F6880` body colour came out at 3.55:1 and
  was replaced everywhere.
- Loading, empty and error are three separate rendered states, each with its own
  copy and its own next step; `aria-busy` marks the grid while it loads.
- A malformed year is a *validation* message, not a "no results" message — the
  two are deliberately different, which was one of the feedback points.
- The bookmark drawer uses `inert` when closed, traps nothing, closes on Escape
  and returns focus to the button that opened it.
- Every page has a skip link, one `<h1>`, and landmarks (`header`, `nav`,
  `main`, `footer`).

## AI use

This is declared rather than hidden, because the course policy asks for it.

An AI assistant (DeepSeek Harness) was used as a tutor and pair reviewer. It
produced the first draft of the HTML shells, `css/tokens.css`, `css/style.css`,
`js/api.js`, `js/ui.js`, `js/catalog.js`, `js/detail.js`, `js/rankings.js`,
`js/bookmarks.js`, `js/motion.js` and this README, working from the PRD, the
Figma file and the assessment brief. Every file was read, questioned and
adjusted by Ben Lai, who owns the decisions in it — the three-list rankings, the
local-only ratings, the drawer instead of a fifth page, the fallback limits, and
the contrast numbers above are documented choices, not defaults.

The research in the submitted PRD (competitor analysis, interviews, affinity
diagram) was done by hand and is not AI-generated. No AI was used to produce the
written analysis or the evidence screenshots.

GSAP is used under its standard "no charge" licence; copyright GreenSock.

Data from [AniList](https://anilist.co). Built for a university assignment and
not affiliated with AniList or MyAnimeList.
