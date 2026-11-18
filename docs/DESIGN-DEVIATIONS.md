# Design deviations from the handoff spec

**Why this file exists.** The handoff spec (Figma "Homepage — Desktop HiFi" + IA flow sheets) is the approved production direction, and Assessment Policy §16 allows *minor design and implementation improvements* without written approval — but leaves no trail of why they happened. This file is that trail. Every entry says what the spec asked for, what shipped, and what measurement forced the change.

Nothing here changes the PRD's intent: four states, 2:3 covers, the four GSAP moments, three ranking lists (year as a type-in input), the theme toggle, and the PRD colour tokens (`#141018` / `#1A1424` / `#BD91C8`) are untouched. The deviations are layout maths only.

**Source hierarchy (client ruling, 2026-11-16).** The HiFi renders under `refs/*--render-*` are the source of truth; the Handoff spec sheets (`*--spec-*`) *may be wrong* and are treated as hints, not requirements. Only the renders are measured at 1:1, and every number in this file comes from them.

The sheets have already been caught out more than once, which is why they lost the tie-break:

| Sheet said | Render actually measures |
|---|---|
| Hero section ~480px tall | ~798px on the 1532 artboard |
| Card grid: 4 columns | 6 columns, 205px cards |
| Card grid gap: 24px | ~14px |
| Card title 14/22 | ~14/20, soft grey rather than white |
| Card hover: lift + shadow | posters are flat; the sheet's shadow is not in the render |

Renders win, and where the render itself disagrees with `https://www.cycani.org/` (used mid-way as a density reference), the render still wins.

---

## 1. Content width: clamp(1200px, 50vw + 600px, 1440px)

| | |
|---|---|
| Spec | "Container width: 1200px, centred" |
| Shipped | `--container: clamp(1200px, 50vw + 600px, 1440px)` (css/tokens.css:78) |
| Measured | 1962 px window: content 1440, gutters 261 | 1706: 1440, gutters 126 | 1440: 1320, gutters 60, cards 207 | 1200: 1137, gutters 24 |

A fixed 1200 leaves the gutters growing without limit as the window grows; a hard 1440 would touch the window edges at exactly 1440. The clamp keeps the spec's 1200 at a 1200 viewport, follows the window up to a 1440 ceiling, and stops there. At 1440 the six-column row lands on 207 px cards, which is the render's own 205 px.

Side effect on the detail page: a widened container stretched the old `230px minmax(0, 1fr) 320px` row and left a hole before the Related rail. The row is `230px minmax(0, 760px) 320px` with `justify-content: space-between` (css/style.css:1935).

## 2. Card row gap: 16px, not the spec sheet's 24px

| | |
|---|---|
| Spec | "Card grid: gap 24px, 4 columns per row" |
| Shipped | `.grid { gap: 16px }` (css/style.css:858-863) |
| Measured | the HiFi render's own TV row at 1:1 (1532 px artboard): six 205 px posters with 14 px gutters, content 1328 px wide. 16 px sits between the sheet's 24 and the render's 14 |

The sheet and its own render disagree here; the render wins because the client pointed at it, and 24 px left the row visibly looser than the drawing.

## 3. Hero: width-driven height, capped at one screen

| | |
|---|---|
| Spec | "hero section height: ~480px" (stale — the HiFi render draws ~838px of image at 1460 wide) |
| Shipped | `.hero { display: grid; min-height: clamp(360px, 60vw, 980px); margin-block-end: var(--sp-3) }` (css/style.css:373-385); at 1200px and up `min-height: max(560px, min(60vw, 100dvh))`, plus a `max-height: 640px` variant that tightens the copy's padding; `.hero__media` is an absolute layer filling the band from 640px (3:4 portrait below), `--hero-fade: 190px` scrim |

cycani's hero is width-driven, but the cap is the viewport itself: the art container is `aspect-[3/4] w-full max-h-[100dvh] sm:aspect-[16/9]`, so past a 16:9 window its height is exactly one screen. An earlier version of ours stopped 40px short of the fold and plateaued at 980px, which meant no window could ever fill a screen. Both limits are gone; the copy block is pulled over the art the same way cycani does it, so poster names still sit 16px clear of the fold.

Measured in the browser after the change:

| window | hero | last thumb name bottom | next section top |
|---|---|---|---|
| 1280x720 | 720 | 704 | 764 |
| 1440x1000 | 864 | 848 | 908 |
| 1706x959 | 959 | 943 | 1003 |
| 1920x1080 | 1080 | 1064 | 1124 |
| 2560x1080 | 1080 | 1064 | 1124 |

The first two windows are narrower than 16:9, so the 60vw rule still wins and the next section peeks at the fold; from 1706x959 upward the hero is exactly one screen and the next section starts below it.
| 2560x1440 | 980 | 365 | 964 | 416px |
| 1200x800 | 720 | 163 | 704 | 36px |
| 1460x600 | 586 | 20 | 570 | -68px |
| 954x800 | 572 | 110 | 556 | 184px |

Also taken from cycani:

- **Bottom scrim sized to the poster names** (`--hero-fade: 190px`, i.e. name + bottom padding) instead of a ramp over the lower half. A percentage ramp with no lengths painted the whole element, which read as a mud-coloured wash; the scrim only has to make the names readable.
- **Thumbnails at 13.8vw with a 3:4 ratio** (`clamp(96px, 13.8vw, 214px)`), gap `clamp(12px, 1.5vw, 24px)`. Each poster is cropped by a `.hero__thumb-frame` so the 1.04 hover zoom happens inside a still frame.
- **Type steps at 640 and 1200**: h1 20 / 26 / 32px, `max-width` 280px on phones and 768-816px above.
- **Below 640px the hero art goes 3:4** and the thumbnail row is hidden, matching the reference's portrait hero.

Two small deliberate differences: thumbnails stay visible from 640px (cycani hides them until ~768px) because they are the only entry point to another title on a narrow window; and the copy is aligned to the content container (see entry 1) rather than at cycani's 16px inner padding.

### Hero artwork: blurred banner + the pick's cover as the subject

AniList's `bannerImage` is 1900×400 (4.75:1). A 16:9 hero still upscales it ~2× (measured: file 1900×400 into a 1385×779 box), so as a hero it is always soft, and many banners are scenery rather than characters — unlike the hand-drawn key art in both the render and cycani. No CSS fixes that with the same file.

Shipped at ≥1200px (css/style.css:369-410):

- the banner becomes a background layer: `filter: blur(38px) brightness(.45) saturate(1.25)` + `scale(1.15)`. Blurring hides exactly the detail the upscale destroys, and the grade makes it read as colour and composition rather than a washed-out photo;
- the pick's own cover (`coverImage.extraLarge`, 460×650) is added on the right at `height: min(76%, 640px)`, 2:3, aligned to the content container's right edge. It supplies the character the banner lacks and is a genuine resolution the source actually has (460px into a 412px box — no upscale);
- the copy column gains `padding-inline-end: clamp(0px, 30%, 380px)` so the title and lede cannot run under the cover.

Below 1200px there is no room for both columns, so the hero falls back to the banner at its native aspect, unblurred and with no cover overlay.

Known duplication: the featured pick's cover appears twice — once as the large hero subject, once as the first (ringed) thumbnail. That is deliberate; the thumbnail row is the picker for the other two titles, and hiding the current one would leave a two-item row.

## 4. Weekly / Ranks are tinted panels

```
.pair > .shelf { background: linear-gradient(180deg, rgb(189 145 200 / .18), rgb(189 145 200 / .05)), var(--surface);
                 border: 1px solid rgb(189 145 200 / .22); }   /* css/style.css:526 */
```

The HiFi render draws these two blocks as a pair of coloured cards (cycani uses wine-red and dark-green); the spec's token list only gives `#1A1424`, so the accent is the PRD purple at low alpha rather than an invented colour.

## 5. Card anatomy

| Layer | Before | After | Why |
|---|---|---|---|
| Score | grey text line under the title | accent pill, top-right of the poster | cycani's cards carry the score on the artwork; a text line made every card's title baseline land at a different height |
| Format | "85 · TV" line under the title | removed | the spec's field mapping never asks for format on a card; the line was the main source of the ragged rows |
| Bookmark | pill at the poster's top-right, hover-only | pill at the poster's **bottom-right**, hover-only; in normal flow under the title on mobile | the score pill now owns the top-right corner. `.card__overlay` (css/style.css:892) is a poster-shaped positioning box, `display: contents` below 600px so the button falls back into the body |

## 6. Weekly / Ranks panels stay 4-up at every width

At ≤1199 they used to reflow to 2×2 to keep 190–250px posters. The 2×2 grid made the panel 713px tall against 304px for the 4-up version and broke the two-panel comparison the section exists for. They now stay 4-up (91px posters at 954px) and only collapse to 2-up below 600px — the same behaviour as cycani.

## 7. Hover motion on borderless cards

`translateY(-4px)` (spec) stays on the boxed catalogue cards. The home cards have no background, so lifting the *card* floated a transparent rectangle; the lift is applied to the poster instead (`.card:hover .card__cover { box-shadow: ... }`).

---

## 8. Typography: Inter is self-hosted, and headings are Inter Bold

| | |
|---|---|
| Spec | Hero Title Inter Bold 32/38; Card Title 14/22; the sheet names Inter and Noto Sans SC throughout |
| Shipped | One variable Inter file, self-hosted (`fonts/inter-var.woff2`, 48 KB, latin subset, `font-weight: 100 900`, `font-display: swap`, preloaded on all four pages). `--font-sans` and `--font-display` both lead with Inter; headings `font-weight: 700`; card titles `14px / 22px / 500` |
| Measured | `document.fonts.size` 1 face, status loaded; `.hero__title` Inter 32/700/38.4; `.card__title` Inter 14/500/22 at 1460, 1706, 962 and 375 px wide |

**Why.** The CSS asked for Inter and Space Grotesk but the project shipped no webfont file, no `@font-face` and no Google Fonts `<link>` — so every page silently rendered in Segoe UI, and the headings requested a display face (Space Grotesk) that no browser here has. The type looked generic because it was the system fallback, not the spec's face.

Two judgement calls inside this entry:

- **Card titles use the sheet's weight exactly (400, "Regular"), 14/22.** They were 500 for one round because Inter 400 reads thin on `#141018` at 1x; the client asked for the design as drawn, so the spec value won.
- **Noto Sans SC is not bundled.** The CJK face only matters for the Chinese strings inside the copy and error states; shipping it would add megabytes. It stays as the third entry in both stacks, so the OS supplies it when present and Microsoft YaHei / Segoe UI covers it otherwise.

## 9. Type, spacing and card metrics read off the render, not the sheet

The sheet gives four type sizes and a 24 px grid gap; the render disagrees almost everywhere. Measured at 1:1 off `refs/home--render-desktop.png` (1532 px artboard: content 1310 px from x111 to x1421, six cards of 210 px with a 10 px gap, two panels of 650 px with a 9 px gap) and matched in CSS:

| Element | Sheet | Render | Shipped |
|---|---|---|---|
| Section title ("TV Shows") | — | 26 px bold | 26 px / 700 |
| Panel title ("Weekly Keep Ups") | — | 22 px bold | 22 px / 700 |
| Card title | 14 / 22 | 13 px, soft grey, two-line clamp | 13 / 19, `rgb(242 238 249 / 0.78)` |
| Card grid gap | 24 | 10 | 10 |
| Panel gap / inner padding | — | 9 / ~20 | 10 / 20 |
| Panel card gap | — | 9 | 10 |
| Gap between blocks | — | ~87 from a block's bottom to the next title | `margin-block-end: 64px` + head margin |
| Hero → first block | — | ~78 | `margin-block-end: var(--sp-8)` = 48 + body padding |
| Hero thumb name | — | 13-14 px regular, wraps to two lines, grey; current one white | 13 / 400, two-line clamp, 72% white; current one pure white |
| Hero lede | 20 / 28 | ~15 px, two lines | 15 / 1.45 |
| Card corner radius | — | ~6-8 px | 10 px (was 16) |
| Hero thumb radius / gap | — | ~8 / ~13 | 8 / 12 |

The two-line clamp on hero thumb names is deliberate: the render lets a long title run to a second line instead of ellipsing it. Day chips spell out "Tues" and "Thurs" as the render does.

## 10. Hero copy: lifted off the poster row, softened to the label grey

| | |
|---|---|
| Before | lede sat 16 px above the poster row and was solid `#ded7ea`; labels were 72% white |
| Shipped | `.hero__lede { margin-block: var(--sp-2) var(--sp-6); color: rgb(242 238 249 / 0.82) }`; `.hero__thumb-name` at 0.8 |
| Why | the render and cycani both put clear air between the lede and the posters, and both print the lede in the same soft grey as the card labels rather than as bright body text |

Below 640 px the thumb row is hidden, so the body's `18vh` bottom padding had nothing to sit under and left ~150 px of empty artwork. Mobile now anchors the copy 24 px off the art's bottom (`padding-block-end: 0`) and moves the prev/next arrows back to mid-height, where they no longer cross the lede.

## 11. Hero arrows sit on the poster row, not at the hero's vertical centre

At 1200-1470 px the container edge is close to the window edge, so an arrow centred on the hero landed on top of the lede's first line. The arrows are now anchored to the poster band:

`bottom: calc(var(--sp-5) + 2.5rem + clamp(64px, 9.2vw, 142px))` — padding, half the label block, half the poster. Verified no overlap with the tags or lede at 1962 / 1440 / 1200 / 954. Below 600 px the thumb row is hidden and the arrows go back to mid-height.

## 12. Detail page re-measured against refs/detail--render-desktop.png

| | Render | Was | Now |
|---|---|---|---|
| Cover | 296x410, 24px radius | 230x330, 16px | 296x410, 24px |
| Title | ~38px | 32.8px | 38px |
| Score | 22px text line above the buttons | chip on the poster corner | 22px line above the buttons |
| Bookmark button | filled, 44px tall | outlined, 42px | filled `--surface-2`, 44px |
| Related rail | 332px wide, 60x60 thumbs, 82px rows | 320px, 42x60, 74px | 340px, 60x60, 82px rows, 10px radius |
| Section headings | 26px | 20px | 26px |
| Introduction | full content width, ~13px | capped 82ch, 14px | full width, 13px |
| External links | one row of 5 pills | 6 pills | 5 `minmax(230px,1fr)` columns, 258px each |

Verified at 1440: poster 296x410 at y=96, Introduction heading y=530 (24px under the poster), copy 1320 wide at 13px, links row 5x258, recommendation cards 207. At 954 the poster drops to 200x277 through the existing 1024 breakpoint, at 375 to 132x183; no horizontal overflow on any width.

Still different from the render, deliberately: the link pills carry no site icons (we would have to fetch favicons), and paragraph gaps inside the synopsis are larger because the text keeps its blank-line formatting.

## 13. Ranks windows: Day/Week computed locally, Month is a trending proxy

The render shows `Day · Week · Month · Season · Year` and the PRD's ranking list only has Week/Month/Season/Year. AniList has no daily or weekly chart endpoint, so three of those tabs could not be wired to a real request.

| Tab | Data behind it now |
|---|---|
| Day | `AiringSchedule` for today (local midnight → midnight), de-duplicated, sorted by `popularity` |
| Week | the same schedule over the last 7 days |
| Month | airing titles sorted by `TRENDING_DESC` — enabled 2026-11-17 (see below) |
| Season | `season` + `seasonYear` = the current season, `sort: POPULARITY_DESC` |
| Year | `seasonYear` = the current year, `sort: POPULARITY_DESC` |

While checking Month the Week tab turned out to be broken: `airingWindow()` ignored its `days` argument when computing the window start, so a 7-day window actually covered *today's midnight → now*. After midnight it held minutes of data and painted the empty state (reported as a blank Ranks panel at 00:53). Fixed 2026-11-17; the window now starts `days - 1` midnights back and Week returns four titles again.

So the Day/Week tabs mean *"among the titles that air in that window, the most popular"* — a real, live-filtered ranking, just not the site-wide daily chart that a traffic-based site like cycani can compute. Twelve titles come back for a typical day and thirty for a week, so a 4-card panel always fills.

**Month, opened on 2026-11-17.** No public anime API sells a monthly chart: AniList has only schedule windows plus season/year filters, Jikan exposes `top` and `seasons`, TMDB's trending windows are day/week. A real 30-day window built from `airingSchedules` is not an option either — that window holds 5000 records (100 pages of 50), so a page load can only sample ~6% of it. So `Month` now means *"currently airing titles, ordered by `TRENDING_DESC`"* (`MONTH_QUERY` in js/api.js). Trending is computed from recent activity, which is the closest thing AniList has to a monthly signal, and it is a genuinely different list from Week (ONE PIECE sits third, behind a season-show nobody would call the most popular title of all time). This is a proxy and is labelled as one: the chip tooltip reads "Airing titles ranked by what people are watching this month".

On `rankings.html` the same name stayed disabled on purpose at the time: that page's **Week** filter was `TRENDING_DESC`, so a monthly chip there would have repeated Week exactly. **Superseded by §62** — on the client's request the rankings page now gives all three windows their own meaning.

Re-checked in the browser: all five chip states paint `data-state="success"` with 4 cards, e.g. Day → `Hello, I am a Witch…` (74), `PSYREN` (70), `So What's Wrong with Getting Reborn as a Goblin?` (65), `MAGICAL GIRL RAISING PROJECT restart` (61). Screenshots `docs/evidence/ranks-day-1460.png`, `ranks-week-1460.png`, `ranks-season-1460.png`.

Panel card titles were also 6px too tall (`min-height: 44px` against a 19px line-height), which leaked a sliver of a third line under two-line titles; now `38px`, matching the clamp.
## 14. Header: script wordmark, bare icons, and a working clock

The render's nav is deliberately quieter than the spec sheet's:

| Item | Spec sheet | Render (and now shipped) |
|---|---|---|
| Wordmark | round mark + "MikuFansAnime" in the UI face | hand-brushed script, 132px wide, soft grey `rgb(130 121 145)` |
| Nav links | pill buttons, active pill filled | plain text, 13px/450, no pill, no active colour |
| Search | one 420px capsule | width tracks the placeholder: long on the home page, short elsewhere |
| Clock / bookmark / avatar | bordered round buttons | chrome-less 30px icons, 38px translucent avatar disc |

Entry `css/style.css:119-362` carries all of it; `--header-h` is 64 (was 60), and the page-hero pages pull their hero up by `calc(-1 * var(--header-h))` so the image still starts at the window's top edge.

Two of those need explaining rather than just listing:

- **The wordmark is a stand-in.** The client's logo exists only inside the render as pixels, with no vector and no font name. `Caveat 700` (self-hosted, `fonts/caveat-700.woff2`, declared in `css/tokens.css:21`) is the closest brush face tested against three alternatives (`kalam-700`, `sriracha-400`, `nothing-400`, kept in `fonts/` unused) — comparison at `docs/evidence/font-test.png`. If the real logo arrives as SVG, only `.brand` and the `.brand__mark` rule at `css/style.css:152` need touching.
- **The clock opens a compact Recently viewed panel, not a full page.** It lists the last six titles the visitor opened (`localStorage` key `mf.recent.v1`, written by `recordView()`, painted by `paintRecent()`); the store keeps 24 rows so a page opened days ago still has its title, cover and score when the drawer needs to repair a row (section 38). Empty state says so plainly instead of showing a blank panel. The full History page that used to read the same store was retired on 2026-11-17 (section 17).

Measured at 1440: header 64, wordmark 53-195, Home at 219, capsule 769-1239 (470), clock 1251-1281, avatar 1335-1373; at 375 the capsule drops out and the three icons sit 222-344. Horizontal overflow stays at −15 at 1440 / 375 / 320, and the home hero is still 860 tall with its thumbnails crossing at 844, i.e. the +4px header cost no vertical room.

## 15. Home TV / Movies: newest first, always three rows

Two client rulings arrived together on 2026-11-16, both about the home page's two wide shelves:

| | |
|---|---|
| Data | "TV 和 Movies 要按最新来" — sorted by start date, not all-time popularity |
| Shape | three rows at every width, six per row on desktop and three per row on a phone, the same way cycani's home page does it |

**Data.** `START_DATE_DESC` alone is not usable: AniList returns rows for titles that are announced but undated, with no cover image. So the TV shelf asks for `status_in: [RELEASING, FINISHED]` plus `startDate_greater` 90 days back, and the Movies shelf for `status_in: [FINISHED]` plus one year back (a fuzzy date `YYYYMMDD`, not a unix timestamp; passing seconds silently returns nothing). Query at `js/api.js:89-170`.

**Why the TV window is wider than "airing now".** A show that finished last week is neither announced nor absent; hiding it the day it ends makes the shelf drop titles the user was watching. The 90-day window keeps them eligible. Measured on 2026-11-17, though, the first two pages of 18 are still all `RELEASING` — currently airing titles have newer start dates than anything already finished inside the window — so the shelf looks unchanged today and a finished title only enters the visible 18 when the airing roster thins out. If a finished title has to be visible regardless, the fix is a second query (`FINISHED`, sorted by end date) merged into the same 18, at the cost of one request per load; that is not wired up.

**Shape.** The column count is already a CSS decision (6 / 4 / 3 at the `shelf--wide` breakpoints), so the count of cards follows it: `rows × columns` = 18 / 12 / 9. `js/home.js:9-12` fetches the largest batch once, then `fillShelf()` slices to the current width; resizing re-slices the same batch instead of firing another request. Measured: 1440 → 18 cards, 6 columns, 3 rows; 954 → 12 / 4 / 3; 375 → 9 / 3 / 3; live resize 1440 → 375 → 1440 gives 18 → 9 → 18 with no reload.

**Hero follows the day.** The same ruling made the hero thumbs "today's hottest three", so `hero()` now reads the airing schedule for today and sorts it by `popularity` before asking for the banner/genre/synopsis fields by id. That makes the hero and the Ranks *Day* window the same list, which is deliberate — two panels on one page disagreeing about what is hot today would be a bug the user can see.

While wiring that up, the schedule day turned out to be truncated at 50 records, i.e. roughly the first half of the day, because that is the first page of `airingSchedules`. Evening shows were missing from both the hero and the Day chart. `airingWindow()` now pages until `hasNextPage` is false (three pages at most, 150 records) and caches the result per day so the hero and the Day tab share one request.

## 16. Footer takes the design's purple band

The footer had drifted into a dark strip: page background, a hairline on top, every line in muted grey. The render shows it the other way round — a solid band of PRD main (#2A1F3A) running edge to edge, white copy, the wordmark at header size. Colours and wordmark now follow that (css/style.css:1416, token --main in css/tokens.css:35); the copyright sits dead centre because the design centres it, and the three-column grid keeps it there regardless of how wide the two side items get.

Two smaller corrections came with it: the year is 2026 (was a 202X placeholder from the render) and the footer wordmark is 25px like the header, not the 15px it had shrunk to.

The footer now carries the design's four links — Home, Categories, Ranks, Bookmarks. Home was missing from the earlier three; the fourth slot was History at first, because the render had a History link and no page behind it (section 17). The client moved that slot to Bookmarks on 2026-11-17, so the footer, the mobile tab bar and the drawer's `View all saved →` all open `saved.html` (section 39).

## 17. History was a page, then stopped being one

The render puts a History link in the footer, and the header's clock already answers "what did I look at" — so the page was built as a wide version of that panel rather than a new feature: the same `mf.recent.v1` rows, 24 kept instead of 6, rendered with the card component at the same column ladder (`js/history.js`, `#history-grid`). It is not AniList watch history — the API has no per-user data without OAuth — so the page said "stored on this device" and its empty state offered the catalog.

That page no longer exists (client, 2026-11-17: "history 不该有一个页面, 给bookmark 一个页面. 然后让用户可以organize 他们的bookmark"). `history.html` and `js/history.js` were deleted, the footer's fourth slot now reads Bookmarks, and the mobile tab bar's fourth item opens `saved.html`. The header clock keeps its Recently viewed panel: viewing history is a glance, not a destination, and the 24 rows in `mf.recent.v1` still earn their keep as the repair source for drawer rows (section 38).

## 18. Card gaps widened to cycani's rhythm

The render's grid spacing measured 10px, which is what the site shipped with. On screen next to cycani it read as cramped: their poster grid keeps a gap equal to about 10.8% of the card width (card 194, gap 21 in the reference screenshot at 1440), while 10 / 211 is only 4.7%.

The client asked for cycani's spacing, so the gap now follows the column ladder instead of staying flat — 10px below 600, 16px at 600, 20px at 992, 24px at 1280 (css/style.css:1098). At 1440 that is card 200 with a 24px gap, 12% — within a rounding of cycani's 10.8%. Shelf titles also start 12px below the poster instead of 8px (css/style.css:793), matching their poster-to-title offset once scaled to our card size.

The hero's three thumbnails follow the same proportion rather than a flat value: their gap is `clamp(12px, 1.5vw, 24px)` (css/style.css:631), which is 21.6px beside a 199px thumbnail at 1440 — 10.9%, the same ratio as the grid. A fixed 24px would have been too airy once the thumbnails shrink to 96px at tablet width.

Two details kept deliberately: the half-width Weekly/Ranks panels stay at 10px because their cards are only ~146px wide and 24px would break the four-up row, and mobile keeps 10px because 3 columns in 343px already land at cycani's ratio.

## 19. Hero PV art carries no extra zoom; card titles warm on hover

`.hero__img--pv` used to scale the PV still to 1.2 from the left edge, so the video's own 「本PV」 label fell outside the frame. Once the hero filled a whole screen that read as "zoomed in": the computed transform was `matrix(1.2235, 0, 0, 1.2235, -57.2, 0)` — 20% larger and shifted left, with the composition cropped on two sides. Ben preferred the un-zoomed frame, so `--zoom` is 1 (css/style.css:499-504): the 16:9 still fills the hero exactly and the label simply stays visible in the bottom-right corner.

Card titles turn to `var(--accent)` on `:hover` and `:focus-within`, with a 180ms colour transition (css/style.css:1233-1248) — the same feedback the header links and the hero thumbnail names already give. The cover's 1.04 hover scale is untouched.

One number worth stating plainly: `--card-cover-ratio` is **3 / 4** (css/tokens.css:94), not the PRD's 2:3, even though the token's own comment says 2:3. AniList serves 230×326 art, so a 198×264 frame crops 16.6px — 5.9% of the image height — from top and bottom. It matches the render's 3:4 cards and was left alone; the earlier "not changed" list below wrongly claimed 2:3.

## 20. Bookmark control is a corner icon, not a labelled pill

The PRD comment behind #05 — "is this for bookmark? It's not very clear" — was answered with visible text (`Bookmark` / `Bookmarked`) plus `aria-pressed`. On 2026-11-16 the client asked for the opposite: "这个book mark 的可以改成icon 吗? 放在左上角这样?" with a card screenshot, so the pill is gone.

Shipped: a 30×30 rounded square sitting 8px from the poster's top-left corner (the score badge keeps the top-right), hidden until hover or keyboard focus on desktop (css/style.css:960-1003), and a 34px outlined square below the title on mobile (css/style.css:1297). Saved state is a solid `var(--accent)` block with a `#1a0f1e` glyph and stays visible without hovering, so the state is readable at a glance; the icon path is filled via `.card__save[aria-pressed="true"] path { fill: currentColor }`.

What replaces the visible words: `title` / `aria-label` carry the title ("Bookmark: <title>" / "Remove bookmark: <title>", js/ui.js:86-89, js/bookmarks.js:69-77), so hovering shows the word and screen readers still hear it. That trades the PRD's visible label for the client's layout, and the trade is recorded here rather than silently dropping the feedback. Measured at 1706: button 30×30 at +9,+9 inside the card, opacity 0→1 on hover, saved state `rgb(189,145,200)` with glyph `rgb(26,15,30)`; at 375 the button is 34×34 under the title with no horizontal overflow.

## 21. One page load is two requests, not five

The home page used to spend its rate budget in one gulp: hero, today's schedule, the Week chart (which itself paged three times) and the two shelves were five independent requests, up to nine with the paging. AniList allows 30 a minute, so browsing a handful of titles back to back walked into 429s.

Now `homeFeed()` (js/api.js:661) sends one aliased query — `w1`/`w2`/`w3` for the seven-day airing window plus `tv` and `movies` — and slices the window locally into "today" (in airing order, for Weekly Keep Ups) and "this week" (by popularity, for Ranks). It also writes `airing:7`, `airing:1` and `schedule:` into the cache, so `hero()`, `airingDay(0)` and `chart('week')` read from it instead of asking again. The only other request a cold load makes is `HERO_BY_IDS`, which needs banner/genre/synopsis fields the window query does not carry.

Measured on a 1440 headless load: **two POSTs** (homeFeed, hero) plus the browser's CORS preflight, then every panel rendered — hero 3 thumbs, Weekly 4, Ranks 4, TV 18, Movies 18. A second load with the cache warm made **zero** requests and painted the same page.

Three supporting changes came with it:

- **The cache survives a reload.** Memory alone dies on refresh, which is exactly when the budget is spent again. `cacheSet` now mirrors into `localStorage` (`mf.anilist.v1`, 24 entries, 700k characters, five-minute TTL, oldest dropped first; a quota or private-mode failure is swallowed, memory still serves the session).
- **Requests queue 600ms apart.** A cold page still fires hero and feed almost together; spacing them keeps bursts from tripping the limit. The queue is a promise chain, so ordering is stable and each request keeps its own 8s timeout.
- **429 retries once.** `Retry-After` is clamped to 1–15s, one retry is allowed, then the normal error state appears. Verified by injecting a synthetic 429 on the first request: the page recovered, no error panel, and only the retry and hero went out.

Two bugs surfaced while measuring and are fixed here. The window's right edge was `now`, so at 02:00 the "today" slice held two hours of schedule and Weekly Keep Ups came up nearly empty — it is now the end of today, with the day slice bounded `[00:00, next 00:00)`. That same `now` was interpolated into the query text, so the cache key changed every second and a reload missed the cache entirely; the query is now stable for a whole day.

Ten rapid page switches in a row cost 7 requests and produced no 429 and no console error.

## 22. The current page's nav link takes the accent colour

The render gives the current page no cue at all — no pill, no underline, no colour shift — so the site matched that and kept `aria-current` for screen readers only. On 2026-11-17 the client asked for the page you are on to be visible at a glance.

Shipped as colour alone: `.site-nav__link[aria-current="page"]` is `var(--accent)` (css/style.css:176-180), everything else keeps `var(--text)`. No pill, no underline, no extra weight — the render is still right that the nav should stay quiet, and one colour is the smallest change that answers the request.

Measured at 1706 on all three pages: the current link computes to `rgb(189, 145, 200)` and the other two to `rgb(242, 238, 249)` — home accents Home, catalog accents Categories, rankings accents Ranks. The mobile tab bar already behaved this way (css/style.css:1499), so the two navs now agree.

## 23. The hero scrim is a frosted band, not a full-frame wash

The layer at `.hero__media::after` used to darken most of the frame: top 42%, left edge 72% fading at 34%, a bottom ramp to the page colour, and a 94% corner radial to hide the PV's own 「本PV」 label. On a bright PV that read as a heavy vignette, and the client asked why the picture was so dark.

Iterated in four steps, each measured on the same 1706 PV still:

1. **Bottom-only** (cycani's shape): the top and left washes were dropped, leaving a gradient that ended at 64%. Brightness recovered, but the title sat on near-white cloud — 1.73:1 against its background — and the muted lede nearly vanished (2.87:1).
2. **Longer ramp** (ends 56%) and **a local band behind the lede**: the band was invisible on this image, and both measured under 2.6:1. Neither reached the 4.5:1 body-text threshold because the still itself is almost white where the copy sits.
3. **Near-white copy**: `.hero__lede` moved from `var(--text-muted)` to `rgb(246 242 252 / 0.94)` (css/style.css:615-631) and the title's single `0 2px 18px` shadow became three layers (css/style.css:600). Legibility now comes from the shadow, not from darkening the art.
4. **Frosted band with grain** (shipped): `backdrop-filter: blur(7px) saturate(108%) brightness(0.8)` masked from the bottom to 56%, a faint SVG grain (soft-light) for the frosted-glass texture, and a separate `.hero__media::before` gradient beneath it that hands off to `var(--bg)` (css/style.css:513-549). Frost on top, gradient underneath, so the seam into the next section is blurred instead of a hard edge.

The first ship had a visible seam where the hero met the next section: the frost's tint and `brightness(0.8)` ran all the way to the hero's last pixel, so the band bottom was lighter than `var(--bg)`. Fixed in two places — the mask now drops to transparent for its bottom 4%, and `::before` holds a flat `var(--bg)` plateau for the bottom 10% before it starts ramping up (css/style.css:536-553). Measured at 1706, the last ~50 rows now sample exactly `rgb(20, 16, 24)` across three x positions, i.e. identical to the page background, so the transition is a slow ramp rather than a line.

The numbers are recorded honestly rather than rounded up: on this still the copy bands sit at background L 0.65–0.70, i.e. 1.33–1.41:1 against near-white text. The band is a texture choice the client asked for, not an accessibility fix; what actually separates the glyphs is the text-shadow. On a darker still the same band clears the threshold easily.

Mobile keeps the plain gradient: `.hero__media::before` is `display: none` under 640px and the frost is switched off (css/style.css:2743-2760), because blurring a full portrait hero both looks muddy and costs paint time. Verified at 375: `backdrop-filter: none`, `::before` display `none`, horizontal overflow 0. Evidence: `docs/evidence/hero-light-1706.png` (desktop, final) and `docs/evidence/hero-frost-375.png`.

## 24. The home header is glass over the hero

On the home page the header sits on top of the hero art, and it used to be a flat gradient (`rgb(10 8 14 / 0.55)` → `0.25`, no blur) so the picture read through it as a dark band. The client asked for the same material as the hero's bottom edge, so the sticky overlay header is now frosted: `rgb(10 8 14 / 0.42)` plus `backdrop-filter: blur(14px) saturate(115%) brightness(0.86)` (css/style.css:2643-2665), and `.is-stuck` doubles the tint to 0.72 because once the hero scrolls away there is nothing colourful left to blur.

Tint was chosen by measurement, not by eye: at 0.30 the band sat at background L 0.318 (white links 2.86:1, under AA), at 0.42 with `brightness(0.86)` it lands at L 0.167 — 4.83:1 for the white nav links. The brand and the icon buttons share the band and read at the same level.

Other pages keep the base header (`color-mix(… 82%)` with `blur(12px)`, css/style.css:119-129), which was already a mild frosted bar over the page background; the change is scoped to `.page-hero` so catalog, detail, rankings and bookmarks render exactly as before. Verified at 1706: index header computes `rgba(10, 8, 14, 0.3)`→`0.42` tint with `blur(14px) saturate(1.15)` at 64px tall, catalog and rankings still report `0.82` with `blur(12px)`, horizontal overflow 0.

## 25. Catalog gained a Newest sort, and the Weekly panel's More link uses it

The spec's Sort row has four values (Popularity / Average Score / Trending / Favorites). On 2026-11-17 the client clicked "More →" on Weekly Keep Ups and landed on a catalog front-page of all-time popular titles — `index.html:123` pointed at a bare `catalog.html`, so the page fell back to `POPULARITY_DESC` and opened on Attack on Titan. He asked for the newest titles instead.

Three small changes:

- **`newest` sort** (`SEARCH_SORTS.newest = 'START_DATE_DESC'`, js/api.js:753-760) and a fifth chip in `catalog.html:305-310`, placed right after Popularity so the default highlight does not move.
- **The link** now carries intent: `catalog.html?sort=newest&format=TV` (index.html:123). `?status=RELEASING` was the first attempt; it answers "what is airing" but opens on ONE PIECE, which is not what "newest" means. `format=TV` keeps the landing page to series, matching the weekly schedule panel — without it the first screen fills with OVAs and pilot films that are technically the newest releases.
- **Null dates have to be filtered.** `START_DATE_DESC` sorts entries with no start date *first* — a 1960s short with a cover image and no date outranks a 2026 premiere. So when the user has not picked a Status, the `newest` query implicitly asks for `status_in: [RELEASING, FINISHED]` (js/api.js:776-783), and rows still missing `startDate.year` or a cover are dropped client-side (js/api.js:799-802). `MEDIA_FIELDS` gained `startDate { year }` (js/api.js:133-141) so that filter can run at all; it is three fields on a payload that already carries a cover URL.

Measured at 1440 with the query `?sort=newest&format=TV`: 24 titles, the Newest chip and the TV Show chip pressed, and the first eight descending by start date — Cardfight!! Vanguard Divinez, DARK MACHINE THE ANIMATION, Chitose-kun 2nd Cour, Ace of the Diamond act II, Yozakura Family S2 P2, Dragon Ball Super: Beerus, Full Clearing Another World, HORROR COLLECTOR. No console errors. At 375 the filter rows collapse into the "Filters 2" sheet as before, horizontal overflow 0, and the extra chip wraps inside the panel (row height 125px, chip 74px wide) rather than pushing the layout.

## 26. The catalog result line got the render's two halves

The render puts a line above the grid: No Tags was selected on the left, A Total of 5000 Titles have been found on the right, with the number in bold accent. Ours had a single grey "24 titles".

It is now two halves (catalog.html:315-327): #tag-summary counts the chips that are off their default (country / format / status / genre / year — Sort is always set, so it never counts) and appends the search term when the header box has one; #result-count carries the count. Sampled from the render: muted text is rgb(138, 129, 152), the bold phrase is accent, both about 13px. In CSS that is --text-muted at --fs-xs for the halves and --accent / 600 for .result-count__lead (css/style.css:1889-1917).

The right half always uses the render's sentence: "A Total of N Titles have been found". An earlier pass switched to "Showing N Titles so far" while Load More was still open, on the grounds that AniList returns pages rather than a grand total; the client asked for the plain result line instead (2026-11-17), so the number is the count currently on the page and grows when Load More is used — measured 48 before the click, 96 after (§31). End-of-list case checked with ?year=2026&format=TV&genre=Sports&country=JP: "4 tags selected" / "A Total of 9 Titles have been found", Load More hidden. Accent rgb(189,145,200) at weight 600, both halves 13px, horizontal overflow 0 at 1440 and 375.

The first pass shipped with a known defect: catalog.html carried two elements with id="q", so the page's big search box was bound to nothing and ?q= was never read. §27 covers the fix and the header change that came with it.

## 27. Catalog owns its search box; the nav one is gone there

Two problems, one cause. catalog.html had **two** elements with id="q" — the header search (line 30) and the page's own full-width box (line 81). getElementById('q') returned the header one, so typing in the big box did nothing, and the big form's submit navigated to ?q=… which no code read; ?q=zzzzz happily returned the 24 most popular titles.

- **Header search removed on this page** (client, 2026-11-17: the page already has one big box). The form is deleted from catalog.html's header rather than hidden, so the duplicate id goes with it and the big box is the only #q. .header-tools keeps its margin-inline-start: auto, so the three icons stay pinned right: measured header 64px, tools right edge 1380 at 1440 and 359 at 375, horizontal overflow 0 on both.
- **?q= is now read** (js/filters.js initFilters): the value is written into the box before the first request, so a link from another page's nav search — or a shared URL — lands filtered instead of looking broken. The box also keeps the address bar in sync through the existing emit()/writeUrl.

Measured: catalog.html?q=naruto opens with the box filled, "No tags selected · \"naruto\"" on the left, and the grid starting Naruto / Naruto: Shippuden / Boruto / The Last: Naruto the Movie. Typing "frieren" into the box (input event, 300ms debounce) filters to 6 titles, URL becomes ?q=frieren, count line reads "A Total of 6 Titles have been found". index.html still reports its nav search (one .nav-search), so the removal is scoped to catalog.

At 375 the two halves of the result line wrap onto separate lines rather than shrinking; both stay 13px and left-aligned, which is where the mobile render puts them too.

The header and the search bar are two stacked sticky bars that share one glass surface, but they were mixed at different strengths — header `color-mix(in srgb, var(--bg) 82%, transparent)`, search bar that same mix at **88%** — and each drew its own bottom border. Scrolled over posters that reads as a tone step plus two hairlines, one at 64px and one at 155px (client, 2026-11-17: "这条线, 还有两个bar 的透明度不一样"). Fixed by giving `.search-bar` the header's 82% mix (same 12px blur) and dropping the seam between them: catalog's header carries `.site-header--joined`, which sets `border-block-end-color: transparent`, leaving only the bar's own bottom border as the divider. Measured at scrollY 700: header and bar both `color(srgb 0.078 0.063 0.094 / 0.82)` + `blur(12px)`, header border `rgba(0,0,0,0)`, bar border `rgba(255,255,255,0.08)`. Evidence: docs/evidence/_new/catalog-bars-joined-1440.png and catalog-bars-375.png.

The box drew **two** focus rings, reported 2026-11-17 while typing in it. `.search:focus-within` paints a purple border plus a 3px ring, and `.search__input` also matched the global `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }` — so a second rounded outline appeared 2px inside the pill, reading as a doubled border. Fixed by turning that outline off on the input (`.search__input:focus-visible { outline: none }`); the container's border + ring is the focus signal, which is the same arrangement the header search already used (`.nav-search:focus-within` with `.nav-search__input:focus-visible { outline: none }`). Measured after the fix: input `outline: none`, container `border-color: rgb(139,123,247)` and ring `0 0 0 3px` at 30%. Evidence: docs/evidence/_new/search-ring-double.png (before) and search-ring-fixed.png (after).

## 28. Catalog / Detail / Bookmarks cards drop their frame, like Home

The grids outside the home page still drew the base `.card` — surface background, 1px border, 10px radius, 12px body padding — so catalog posters sat inside a visible box while the same poster on Home sat directly on the page background. Same component, two looks, depending on which page it landed on.

- **Rule** (css/style.css, next to the `.shelf--wide` block): `.grid > .card` clears `background` and makes the border transparent; `:hover` / `:focus-within` keep the transparent border and drop `box-shadow` — a box shadow around a frameless card draws the box back in; `.card__body` drops its side padding so the title lines up with the poster edge. `.grid > .card` (specificity 0,2,0) beats `.card` (0,1,0), and `.grid > .card:hover` (0,3,0) beats `.card:hover` (0,2,0), so no `!important`.
- **Hover still lifts 4px** — Home's frameless cards already do that, the poster scales 1.04 inside the frame; only the shadow and border are suppressed.
- **Scope**: every `.grid` that holds `.card` — catalog, detail recommendations, bookmarks (`saved.html`). Rankings is untouched: its page is rows plus a top-five strip, not a card grid.

Measured after the change: catalog card at 1440 is `bg rgba(0,0,0,0)`, `border 1px rgba(0,0,0,0)`, `body padding 12px 0 0`, width 200 — byte-for-byte the same numbers as `#tv-grid .card` on the home page. At 375 the catalog card is 167 wide with the same transparent treatment. Detail recommendations: 12 cards, same computed styles, title wraps to two lines under the poster as before.

## 29. `.btn` had no rules at all — buttons were browser defaults

The "Load more" button on the catalog rendered as the OS button: light grey slab, default border, system font weight. It wasn't a disabled state — `.btn` simply had no CSS anywhere in the project, so `button { font: inherit; color: inherit }` was the only thing touching it. The same happened to "Try again" in the error state and "Close" in the bookmarks drawer.

Added one rule set for `.btn` next to the Load-more block:

- transparent background, 1px `var(--accent)` border, `var(--accent)` text, `var(--r-md)` (10px) radius, padding 11px 26px, `var(--fs-sm)` 15px at weight 600
- hover fills the button with accent and flips the label to `#1a0f1e` — the same pressed treatment `.filters__all` and `.chip-chip[aria-pressed="true"]` already use
- `:active` nudges 1px down, `:disabled` drops to 45% opacity and loses the pointer

Label capitalisation matches the reference image too: `Load More`, not `Load more` (catalog.html line 323).

Measured on catalog at 1440: 131×42px, `background rgba(0,0,0,0)`, `color rgb(189,145,200)`, `border 1px rgb(189,145,200)`, `border-radius 10px`, `font-size 15px`, `font-weight 600`. Evidence: docs/evidence/_new/load-more-area-1440.png.

**Not verified**: the hover fill. Headless Chrome ignored the synthetic `mouseMoved` (computed background stayed transparent), so the `:hover` rule is read from the stylesheet, not observed on screen.

## 30. The six filter rows sit on a panel, and the mobile sheet is one too

The render puts Region / Format / Status / Genre / Year / Sort inside a rounded, slightly lighter block, while ours were six hairlines straight on the page background (client call, 2026-11-17: "这里的做成我设计的那样底下颜色跟页面不一样"). The rows are now wrapped in `.filters__panel` (catalog.html:124-299) and styled once (css/style.css, after the `.filters__row` rules) rather than restyling each row:

- `margin-block-start: var(--sp-4)`, `padding: 4px var(--sp-5)`, `background: var(--surface)` (#1A1424), `border: 1px solid var(--line)`, `border-radius: var(--r-lg)` (16px)
- `.filters__panel > .filters__row:first-child` loses its `border-top` and `:last-child` its `border-bottom`, so the two edge rules don't double up with the panel's own border; the four interior dividers stay

Measured at 1440: panel `background rgb(26, 20, 36)`, `border rgba(255,255,255,0.08)`, `border-radius 16px`, `padding 4px 24px`, box x60 w1320 (the 1320 container), six rows, first row `border-top-width 0px`, last row `border-bottom-width 0px`. Evidence: docs/evidence/_new/filters-panel-1440.png.

The mobile drawer had a worse version of the same problem: it had **no background at all** — a probe at 375 with the sheet open returned `backgroundColor rgba(0,0,0,0)`, `padding 0 0 24px`, and the first row spanning the full 375 with x=0, so the rows sat loose on top of the dimmed page. The sheet now takes `background: var(--surface)`, `padding-inline: var(--sp-4)`, its sticky `.filters__head` takes the same colour (otherwise the head band and the sheet body show a seam while scrolling), and `.filters__panel` flattens to `margin/padding/border/background: 0` inside the sheet — the drawer itself is the panel, one layer not two. Measured after: `sheetBg rgb(26, 20, 36)`, `padding 0 16px 24px`, panel `background rgba(0,0,0,0)` / `border 0` / `padding 0px`, first row x16 w343, header background matches the sheet, horizontal overflow 0. Evidence: docs/evidence/_new/filters-sheet-375.png.

**Stacking fix that came with it.** The sheet was on `z-index: 60` while the catalog's sticky search bar sits on `99` (`calc(var(--z-header) - 1)`, css/style.css:1067-1070) — so with the drawer open the search field's bottom arc painted **over** the drawer, and `elementFromPoint(300, 150)` answered `.search-bar` instead of the sheet. The sheet now uses `var(--z-drawer)` (200) and the backdrop `calc(var(--z-drawer) - 1)` (199), the same ladder the bookmarks drawer already used; the three probes at (300,150) / (330,158) / (200,155) now resolve to the drawer's own controls (`.filters__close`, `.filters__reset-icon`). The header and tab bar dim behind the backdrop, which is what a modal sheet should do.

**Not verified**: the drawer was opened by clicking #open-filters in a headless run, not by a real touch drag; the sheet's scroll-inside behaviour at 84vh was not exercised.

## 31. Catalog loads 48 per request, not 24

The catalog opened on 24 titles (four rows of six at 1440) and every Load More added another 24, so reaching anything past the first pageful took repeated clicks (client call, 2026-11-17: "这一页的出现结果是24… 能不能改多一点?"). `PER_PAGE` in js/catalog.js is now **48** — eight full rows on the 6-column desktop grid, and exactly the page size AniList permits in one request (its cap is 50). It is not a bigger request-per-click trade: one page is still one GraphQL call, so the rate-limit budget is untouched; only the amount drawn out of that page grew.

The Jikan fallback keeps its own cap: `fallbackSearch` now sends `Math.min(perPage, 25)` as `limit` (js/api.js), because Jikan truncates or rejects anything past 25 — without the clamp a 48-wide fallback would have come back short or errored while the AniList path looked fine.

Measured at 1440 after `Network.clearBrowserCache`: first paint 48 cards, grid `data-state="success"`, result line "A Total of 48 Titles have been found", Load More visible, horizontal overflow 0; one click sends `page:2, perPage:48` and the grid grows to 96 with "A Total of 96 Titles have been found". Evidence: docs/evidence/_new/catalog-48-1440.png.

At 375 the same request paints 48 cards at 167px wide, horizontal overflow 0, all 48 poster images requested (they are `loading="lazy"`, so the ones below the fold are deferred by the browser). Evidence: docs/evidence/_new/catalog-48-375.png.

**Not verified**: the Jikan fallback path itself — only the `Math.min(perPage, 25)` clamp is code-read, since AniList answered on every run.

## 32. Genre row: collapsed again, plus Mahou Shoujo

The Genre row keeps the sheet's collapsed pattern — five chips plus Expand — and that stayed after a short experiment (2026-11-17) that showed every genre at once (sixteen at the time). The experiment was reverted on the client's word ("改回去"): the remark behind it was that the **genre list itself** is short, not that too few of it were displayed. So the row is back to `data-collapsible="5"` + `.filters__expand` (catalog.html genre row, css/style.css collapsible rule) and the evidence files from the experiment are superseded.

What the experiment did establish, and is kept as a measurement: at 1440 the `.filters__options` column is 1029px with a 6px gap, those sixteen chips totalled 1253px + 15 gaps, so **only 12 fit on one line** — any visible count between 13 and 16 wraps, and a count of 13 leaves Music alone on a second line. Row height 53px collapsed, 87px with all sixteen. Reverted state measured at 1440: collapsed shows Action…Fantasy (5 of 16), `aria-expanded="false"`, Expand opens to all sixteen, horizontal overflow 0. Evidence: docs/evidence/_new/genre-reverted-1440.png.

The list itself: AniList's `GenreCollection` returns 19 names — the sixteen we rendered, plus **Ecchi**, **Mahou Shoujo** and **Hentai**. Hentai is out on principle. **Mahou Shoujo** was added (catalog.html, between Supernatural and Mecha) at the client's word ("可以补"), which makes the row seventeen chips; Ecchi is still omitted — borderline tag, no course value.

Seventeen chips collapse to five and open to two lines at 1440 (row 53px → 87px). Measured: `collapsed total 17 / shown 5 / rowH 53`; after Expand `shown 17 / lines 2 / rowH 87`; picking Mahou Shoujo sends `?genre=Mahou+Shoujo`, grid `data-state="success"`, 48 cards, the row stays open (one click event on the chip, no re-render of the panel), horizontal overflow 0. Evidence: docs/evidence/_new/genre-17-selected-1440.png, genre-17-open-1440.png, genre-mahou-1440.png.

## 33. Catalog intro is a size bigger, and stacks on mobile

"Browse in Categories / Filter Out Your Anime / Select different combinations…" sat at 22px (title) and 15px (kicker, lede) — a section heading scaled to card-body type, which read as undersized next to the 34–41px page title on `rankings.html` (client call, 2026-11-17: "这个字体改大一点").

Now: kicker `--fs-md` (17px), title `clamp(1.6rem, 2.4vw, 2.25rem)` — 34.56px at 1440, same family as the rankings heading, capped at 36px — and lede `--fs-md` with `line-height: 1.55` and a 64ch measure. Measured at 1440: kicker 17/27.2, title 34.56/39.7, lede 17/26.35, intro block 103px tall, horizontal overflow 0. Evidence: docs/evidence/_new/catalog-intro-1440.png.

The bigger type exposed a mobile problem: the intro shares one flex row with Reset and Done, so at 375 it was squeezed into 156px — kicker wrapped to two lines, title to two, lede to five, and the drawer head grew to 255px. The `max-width: 599px` block now wraps the head (`flex-wrap: wrap`), gives `.filters__intro` a full row, pushes Reset/Done to a second row on the right (`.filters__reset { margin-inline-start: auto }`), and drops the type a step there (kicker 15, title 24, lede 15/1.5). Result at 375: intro 343px wide, title one line, head 163px — 92px of vertical space recovered against the first attempt. Evidence: docs/evidence/_new/catalog-intro-375.png.

## 34. Detail page keeps a bottom margin above the footer

`.detail-page` was reset to `padding-block: var(--sp-6) 0` when the old flex + 96px gap layout was pulled out, so the recommendation grid's last row landed on the footer's top edge — the card labels were readable, but the block had no end (client, 2026-11-17: "详细页的底下这边贴住了").

The bottom half is back to `var(--sp-7)` (48px), the same value `main` uses everywhere else. Measured on detail.html?id=16498 scrolled to the end: `main` computed padding-bottom 48px, last card bottom to footer top 48px, at both 1890 and 375. Evidence: docs/evidence/_new/detail-footer-gap-1890.png and detail-footer-gap-375.png.

## 35. The Related panel scrolls instead of stopping at three titles

The panel printed "Total of 10 Titles" above exactly three rows: `paintRelated` did `edges.slice(0, 3)`, so seven relations were silently dropped while the count claimed them (client, 2026-11-17: "这里做scroll").

Now every anime relation is rendered and `.related__list` caps at 288px — three full rows (82px each plus 8px gaps) and a sliver of the fourth, which is what tells you the panel scrolls. `overflow-y: auto` with `overscroll-behavior: contain` so wheeling the list doesn't start scrolling the page, a 6px thumb in `--line-strong`, and 4px of padding pulled back with a -4px margin so the `focus-visible` outline on a row is not clipped.

The cut fourth row looked like a rendering accident rather than an affordance, so `syncRelatedFade()` in js/detail.js sets `data-more` on the list whenever `scrollHeight - clientHeight - scrollTop > 8`, and `.related__list[data-more="true"]` applies a 26px bottom mask. Scroll to the end and the attribute flips to false, so the last row is never left dimmed. Measured on detail.html?id=16498: 10 rows, clientHeight 288, scrollHeight 900; scrollTop 200 sticks, end state scrollTop 612 with `data-more="false"`. Evidence: docs/evidence/_new/detail-related-fade-1890.png.

## 36. "Favorite" is a Bookmark, and it fills when it is on

The detail page's save control read `Favorite` with a heart while every other save affordance in the site — the card overlay, the drawer, the header badge — is a bookmark. Same store, different word (client, 2026-11-17: "这里改成bookmark").

Now: `detail.html` label and icon are the bookmark (`M6.5 4h11v16l-5.5-3.8L6.5 20z`), `js/detail.js` swaps the label to `Bookmarked` on press, and the icon fills with `currentColor`. It was still too quiet — the id rule `#detail-save` out-specifies `.pill-btn[aria-pressed="true"]`, so the pressed state showed no accent at all — so `#detail-save[aria-pressed="true"]` now paints the pill in `var(--accent)` with `#1a0f1e` ink, the same read as the rating pills. Measured at 1440 after a click: `background rgb(189, 145, 200)`, `border-color` the same, `color rgb(26, 15, 30)`, label `Bookmarked`, `aria-pressed="true"`, and `mf.bookmarks.v1` appears in `localStorage` — the card overlay and the drawer show the same title saved, because `toggleSave` is the one writer. Evidence: docs/evidence/_new/detail-bookmark-on-1440.png (before the accent fill), detail-bookmark-accent-1440.png (after).

A fixed button cannot be lifted clear of a footer it scrolls past, so `#to-top` now retires as soon as `.site-footer` enters the viewport (`footerTop < innerHeight`) — the page is already at its end there, and the button was sitting on the copyright line at 375. Measured: 375 / scrollY 900 → visible; 375 / scrollY 3048 (end) → `hidden` true; at 1440 the page tops out at scrollY 839 with the footer in view, so it is hidden from the point the footer appears. Evidence: docs/evidence/_new/detail-footer-clean-375.png.
## 37. External links carry a type icon

The `External & Streaming Links` row was five text-only pills with an `Info` tag on the non-streaming ones — every other control on the page has a glyph next to its label, so this row read as unfinished (client, 2026-11-17: "这里要给也要给icon").

The query now also asks for `externalLinks { … icon }`, and each pill leads with that 16px brand mark when AniList has one — Crunchyroll, Hulu, Netflix, Adult Swim, iQIYI, Twitter (client's call, 2026-11-17: "加 AniList 的 icon 字段"). Those CDN icons are already monochrome line art, so they sit in the row without looking pasted on.

The `type` glyph stays as the fallback (`LINK_GLYPH` / `linkIcon()` in js/detail.js): a play triangle for `STREAMING`, a speech bubble for `SOCIAL`, an info circle for `INFO`, an outbound arrow for anything else. It is drawn when the link has no `icon` and swapped in if the image fails (`img.onerror`), so a blocked CDN degrades to the same line icons instead of broken squares. Both sit at `--text-muted`; the glyph goes `--accent` with the label on hover, the brand image keeps its own colour.

Every pill also carries its type word on the right — `Streaming`, `Social`, `Info`, `Other` (`LINK_KIND` in js/detail.js) — not just the info links (client's call, 2026-11-17: "保留,并且给其他的要文字"). This fixed a real mislabel while it was at it: the old code printed `Info` for every non-streaming type, so the Twitter pill claimed to be an info page.

Measured at 1440 and 375 on detail.html?id=16498 and id=101922: five pills each with one 16px icon; the streaming sites and Twitter resolve to `s4.anilist.co/…/link/icon/…png` (naturalSize 64, drawn at 16), `Official Site` has no `icon` in AniList and renders the info glyph. Pills measure 258px at 1440 and 328px at 375 with no clipping (`scrollWidth` never exceeds the box); `.ext-link__name` holds the site name on one line with an ellipsis so a long site name cannot push the kind word out. Horizontal overflow 0 at both widths. Evidence: docs/evidence/_new/detail-ext-kind-1440.png, detail-ext-kind-social-1440.png, detail-ext-kind-375.png.
## 38. The bookmarks drawer is a list of posters, not ids

The drawer was the only surface still drawn as raw markup: `renderDrawer()` wrote the title into a link and put a bordered `Remove` word next to it. A stylesheet rule for a cover image had been sitting in css/style.css since the drawer was built, but nothing ever created the `<img>` — and a row saved from the detail page could not have filled it anyway (client, 2026-11-17: "这个弄好看").

**The row that said `#207329`.** Two writers hand rows to the one store, in two different shapes: the card overlay passes the AniList media object (`title.romaji`, `coverImage.large`, `averageScore`), and js/detail.js passes a flat row (`title` string, `cover` string, `score` number). The store only understood the first, so a detail-page save kept the fallback `#<id>` title, no cover, and a null score — which is exactly what the drawer drew.

`snapshot()` in js/bookmarks.js now normalises both shapes before writing, and `fillGaps()` repairs rows that were already stored: the same title is sitting in `mf.recent.v1` because detail.js records every view, so the drawer fills the missing title, cover and score from there and writes the repaired list back once. No extra request, and no stale ids left in the client's own browser.

**What a row is now.** 44×62 cover (8px radius, inset hairline so pale posters keep an edge), two-line title, and the score in the same `8.5/10` form the detail page prints — the card badge shows the raw 0-100 number, but a drawer row has room for the readable one. The text `Remove` button became a 32×32 trash glyph that keeps its `aria-label` ("Remove {title} from bookmarks") and turns red on hover. Rows are 78px tall with a 4px gap and fill `var(--surface)` under the pointer or keyboard focus. The panel title carries the same count the header badge shows, and the empty state is the bookmark glyph plus "Nothing saved yet" and a sentence on how to save.

Measured at 1440 and 375 on index.html with a saved row and a deliberately stale `{ id: 207329, title: "#207329", cover: "", score: null }` row: 2 rows, titles resolved to the real names, metas `8.5/10` / `7.4/10`, covers naturalWidth 230 drawn at 44px, row height 78, list gap 4px, hover background `rgb(26, 20, 36)` (`:hover` verified through a synthetic `Input.dispatchMouseEvent`), trash box 32×32, drawer width 380 at 1440 and 375 at 375, horizontal overflow 0 at both. A cover URL that fails loads is swapped for the same empty frame (`blankCover()` on the image's `error` event), so a dead CDN leaves a clean placeholder instead of a broken-image glyph. A fresh save from detail.html?id=16498 now stores `{ title: "Attack on Titan", cover: "…/bx16498-buvcRTBx4NSm.jpg", score: 85 }` instead of a null score. Evidence: docs/evidence/_new/drawer-rows-1440.png, drawer-rows-crop-1440.png, drawer-rows-375.png, drawer-empty-1440.png.

## 39. Bookmarks moved out of the drawer and became a page you can sort out

The drawer could only look and remove. The client asked for the organising half of the feature in the same message that retired the History page (2026-11-17: "history 不该有一个页面, 给bookmark 一个页面. 然后让用户可以organize 他们的bookmark"), so `saved.html` + `js/saved.js` now read the same store as the drawer, and the drawer keeps its glance role with a `View all saved →` row at the bottom (`.drawer__all`, on all four pages).

**Storage grew by one field, not a new store.** Rows in `mf.bookmarks.v1` gained `collection` (a collection id, `null` for Unsorted) and a second key `mf.collections.v1` holds `[{ id, name }]`. Rows written before the page existed have no `collection`, so they read as Unsorted and nothing needs migrating. `all()`, `collections()`, `addCollection()`, `renameCollection()`, `removeCollection()` and `moveTo()` in js/bookmarks.js are the whole API, and both surfaces go through them, so the header badge keeps up whichever one changes the list.

**What the page does.** A search box filters on title; a select sorts by Recently saved / Title A–Z / Highest score; the chip row is All, Unsorted, then one chip per collection with a live count. `+ New collection` opens an inline name field instead of a browser prompt, and the same form does rename duty when a real collection is selected — Rename and Delete only appear there, because All and Unsorted are views rather than buckets. Delete asks first, in one sentence, and says where the rows go: "Delete “Rewatch”? Its bookmarks move back to Unsorted." Each card also carries a `Move` menu (Unsorted / every collection / New collection…) so a title can be filed without leaving the shelf, and a status line reports every change in text for anyone not watching the grid.

**One page out, one page in.** The footer's fourth slot was History (§17) and now reads Bookmarks; the mobile tab bar's fourth item keeps its `Saved` label but opens `saved.html`; the header clock keeps the compact Recently viewed panel rather than a destination page. `history.html`, `js/history.js`, `#history-grid` and `body.page-history` are gone.

**Measured.** Seeded with three rows (scores 85 / 82 / 87), at 1440 the grid is six 200px columns of the frameless card from §28, the chip row fits on one line, the count reads "3 saved", and horizontal overflow is 0; 1256 and 375 also report 0. Search "titan" narrows to one card, sorting by score puts 87 / 85 / 82 in order, and the collection view prints "1 of 3 shown". The phone grid is two columns (159px cards) rather than the three the ladder would give: three leaves 103px posters with truncated titles and no room for the Move button, the same reason `#catalog-grid` is two columns below 600px. The empty state says "Nothing saved yet" and offers the catalog instead of a blank grid.
Evidence: docs/evidence/_new/saved-page-1440.png, saved-move-menu-1440.png, saved-collection-1440.png, saved-rename-1440.png, saved-delete-confirm-1440.png, saved-search-1440.png, saved-empty-1440.png, saved-page-375.png, saved-empty-375.png.

## 40. The five PRD gaps the audit found: home search, rankings genre, bigger thumbs, Overview

A line-by-line re-read of `figma_comments.json` against the running pages (2026-11-15) showed the old "复核" section of `PRD-FEEDBACK-MAP.md` was describing a build that no longer existed: the home search bar had been removed by `fed119c` ("rebuild home, detail and rankings to the Figma reference"), the rankings genre control had never been built, its thumbnails were 46×69 rather than "whole-card covers", and the detail heading was back to `Introduction`. The client approved the repair list ("可以", 2026-11-17); the two items that stay as written answers are #05 (icon-only save button) and #09 (per-row Expand).

**Home search is back, and it is one bar for the whole site.** The header form `.nav-search--long` is gone; a `.search-bar#home-search` band sits between `</header>` and `<main>` on `index.html`, holding the same `.search` component the catalog uses (720px cap, 56px field, 22px placeholder). It is `position: sticky; top: var(--header-h)`, so it joins the header while scrolling the hero, and it submits to `catalog.html?q=` — the catalog already reads `?q=` back into its own field (see §28-era fix), so a search from the home page arrives filtered rather than empty. At `max-width: 599px` the band tightens to a 46px field on `--fs-sm` with 12px inline padding: at 56px the placeholder "Search anime, e.g. Frieren" was cut mid-word at 235px wide. Measured at 1440: band 91px tall at y64, field 56px / 22px, submit 48px, zero horizontal overflow; submitting `frieren` lands on `catalog.html?q=frieren` with the field prefilled and "A Total of 6 Titles have been found". At 375: band 73px, field 235×46, visible in the first screen. The mobile hero starts 64px under the band because `.page-hero .hero` carries `margin-block-start: calc(-1 * var(--header-h))` (css/style.css:2908) — the art bleeds under the glass instead of leaving a strip of page background between bar and image.

**Rankings gained the genre row it never had.** `.rank-row[data-group="genre"]` sits between Format and Time, seeded with the same seventeen genres the catalog offers, collapsed to eight plus a `More ⌄` button (`data-collapsible="8"`, the ninth `.rank-opt` onward hidden by CSS). `setGenreOpen()` in js/rankings.js owns the state so the label ("More ⌄" / "Less ⌃"), `aria-expanded` and `data-expanded` cannot drift apart; picking a genre re-opens the row, because a collapsed row would otherwise hide the chip it just pressed. The filter rides the existing query builder (`f.genre`), and the count line names what is applied — "25 titles ranked · Fantasy" — instead of a bare "· Genre". Measured at 1440: rows country / format / genre / time in that order, 9 visible chips collapsed, 18 opened (panel 302px), picking Fantasy leaves the chip visible with the row open; at 375 the collapsed row shows 9 chips and the More button sits at x262.

**Ranking thumbnails are 82×123, not 46×69.** The complaint was that covers could not be recognised (#04) and that the ranking page looked foreign next to the card grids (#08). The grid track went from 46px to 82px (375: 96px), the thumb to 82×123 (375: 96×144) at a 10px radius, and the skeleton row from 85px to 139px (375: 160px) so the list does not jump when data lands. Rows are 139px tall at 1440 — the page got taller, which is the opposite of what #07 asked for; #07 (compress the gaps) stays refused for the reason in `PRD-FEEDBACK-MAP.md`, and the bigger covers are the answer to the underlying note about wasted space.

**"Introduction" is "Overview".** `detail.html:127` now reads `Overview`, matching the word in the comment (#14). Verified run of `detail.html?id=16498`: the `.detail__h2` sequence is Overview / External & Streaming Links / Recommendations Chosen based on topic tags.

**#05 stays an icon.** The save button on a card is a poster overlay; adding the word `Bookmark` under every poster in a six-column grid pushes two-line titles into three and shrinks the art. It keeps `aria-label="Bookmark: <title>"` + `aria-pressed`, and the page-level entry points (tab bar Saved, footer Bookmarks, drawer "View all saved") carry the word for anyone who reads instead of recognises. That trade is written out as the answer to #05 rather than left as an omission.

Evidence: docs/evidence/_new/home-search-1440.png, home-search-375.png, rankings-genre-1440.png, rankings-genre-open-1440.png, rankings-genre-filtered-1440.png, rankings-genre-375.png, detail-overview-1440.png, catalog-search-compact-375.png.

**Not verified**: keyboard submission from the home field (Tab to Search, Enter) — the submit path was exercised by clicking; and the sticky band's behaviour over the hero on iOS Safari's collapsing toolbar.

**Addendum, later the same day.** The one-bar-per-site rule was read as "put the search where every other page keeps it", so the band came off `index.html` and `.nav-search` went back into `.header-tools` on both `index.html` and `catalog.html` (ids `nav-q` and `q` so the catalog keeps two distinct fields). At 1440 the home header now carries a 264px search field, the hero starts at y0 under the glass again, and typing Frieren in it lands on `catalog.html?q=frieren` with 6 results. The gap this opens: `.nav-search` is hidden at `max-width: 899px` (css/style.css:2849), so the mobile home page currently has no search field at all — the desktop-only fix was not finished for phones, and the decision (restore the band below 900px vs. record the omission against PRD #13/#20) is still open with the client.

## 41. On phones the bookmark sits on the poster, not under the title

The first mobile pass put the save button in the document flow under the title (`.card__overlay` went `position: static; display: contents` at `max-width: 599px`), so every card in a two-column grid carried a 34px button of its own row: the poster lost height, the title row and the button row made the grid look like a list of buttons, and on the bookmarks page the button pushed the "Move to…" control further down. The client asked for it inside the card ("这个bookmark 放在卡片里面", 2026-11-17).

Now the overlay stays with the poster at every width and only the button's position changes. At `max-width: 599px` `.grid .card__save` is pinned 8px from the poster's bottom-right (the score badge already owns the top-right), 30×30, radius 9, `rgb(10 8 14 / 0.62)` behind the icon so it reads over any art, `opacity: 1` because a touch screen has no hover, and `pointer-events: auto` so taps reach it through the `pointer-events: none` overlay. Saved cards fill it with `--accent` and `#1a0f1e` ink, the same pressed look the detail page uses.

Measured at 390×844 (device emulation, `mobile: true`): button 30×30, 8px from the poster's right and bottom edges, fully inside the cover, `position: absolute`, `opacity: 1`; card height 321px on the catalog and 318px on the bookmarks page; saved grid still two columns with a 172px Move button; horizontal overflow 0 on the catalog, home and saved pages and on the detail page's recommendation grid. Clicking the button toggles `aria-pressed` and the store (3 → 2 → 3 rows) without navigating away from `catalog.html`. At 1440 nothing changed: the button is still the 30px hover-only overlay 9px from the card's top-left, card height 318px.

Evidence: docs/evidence/_new/mobile-card-bookmark-390.png, mobile-card-bookmark-saved-390.png, mobile-card-bookmark-home-390.png.

**Not verified**: a real finger tap on a device (the toggle was driven through CDP mouse events), and whether the accent-filled saved state is too loud on a page full of saved cards.

## 42. The phone hero shows the poster, full bleed

The hero was built for a 16:9 desktop frame: the wide art is the anime's own promotion, and on a phone the same shot was cropped into a 3:4 column, so the page opened on a zoomed fragment of a banner. The client asked for the poster art on phones ("在手机上, 这个hero 做成像卡片海报的" → "我的意思是使用卡片的海报", 2026-11-18). A first attempt also framed it as an inset rounded card; that framing was rejected the same evening ("卡片布局不要"), so the hero keeps its edge-to-edge shape and only the image source changed.

The art picker already had the branch — `artFor(m, portrait)` in js/home.js:95 returns `coverImage.extraLarge || coverImage.large` when the viewport is at most 639px and the PV frame or banner otherwise — so no CSS was needed for the switch, and the existing `@media (max-width: 639px)` block still owns the 3:4 frame and the mobile gradient.

**The real bug was the fallback.** js/home.js:39 watches `load` on the hero images because YouTube returns a 120px grey frame when `maxresdefault.jpg` is missing, and swaps to the banner when `naturalWidth < 1000`. That threshold is fine for a 1280-wide PV frame and wrong for a poster: `cover/large` is 460×647, so every mobile paint was immediately replaced by the banner the branch had just avoided. Measured before the fix: at 390 and 596 `matchMedia('(max-width: 639px)')` was true, `coverImage.extraLarge` existed in the API response, `localStorage` was cleared and `Network.setCacheDisabled: true` was set — and `#hero-img` still resolved to `.../banner/159042-X0mqyaUFBkms.jpg`. The fallback now runs only on `img.hero__img--pv`, which is the case it was written for.

**Measured after the revert to full bleed.** 390×844: media 390×520 (3:4, left edge 0, radius 0), hero top 0 so the art still bleeds under the glass header, source `.../cover/large/bx159042-GGFwlDskc5vR.png`, horizontal overflow 0. 375 keeps the same shape at 375×500. Pressing `#hero-next` brings the next cover (`.../cover/large/bx152677-gtJbgjE94lCN.png`, "The Detective Is Already Dead Season 2") and stays on a cover image. 1440 unchanged: the PV frame `maxresdefault.jpg` at 1425×864 with radius 0.

Evidence: docs/evidence/_new/mobile-hero-bleed-390.png, mobile-hero-poster-375.png, mobile-hero-poster-596.png, mobile-hero-poster-390-next.png, desktop-hero-pv-1440.png.

**Not verified**: a real phone (all widths here are device emulation), and auto-advance on a phone — the second pick was driven by clicking the next arrow, not by the 7s timer.

## 43. The mobile tab bar floats, and it is frosted

The tab bar was a full-width strip glued to the bottom edge with a 92% opaque fill and a 1px rule on top — the same shape as the header, which read as a second chrome band rather than as a control over the page. The client asked for it to float and to be glass ("这个做成悬浮, 和毛玻璃的", 2026-11-18).

Now at `max-width: 599px` the bar is an island: `inset-inline: 12px`, `inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 10px)`, 20px radius, one `--line` hairline, `color-mix(in srgb, var(--main) 58%, transparent)` behind `backdrop-filter: blur(18px) saturate(125%)`, and a `0 12px 30px rgb(0 0 0 / 0.45)` shadow so it separates from the art instead of relying on a rule. `overflow: hidden` keeps the active item's colour wash inside the radius. The old `padding-block-end: env(safe-area-inset-bottom, 0)` came off — the safe area now lives in the offset, so the bar never grows a taller foot on gesture phones.

Floating it also moved what sits behind it, so two offsets grew with it: `body` and `main` reserve `--tabbar-h + 16 + 10px + env(safe-area-inset-bottom, 0)` (the extra 10 is the gap under the bar; measured padding is 82px), and `.to-top` on the detail page moved up by the same 10px so it does not land on the bar's shoulder.

**Measured at 390×844** on the home, catalog, saved, rankings and detail pages: bar at x12, width 366, bottom edge 834 (10px of page visible under it), 20px radius, 1px `rgba(255,255,255,0.08)` border, background `color(srgb 0.164706 0.121569 0.227451 / 0.58)`, `blur(18px) saturate(1.25)`, horizontal overflow 0 everywhere. Scrolled to the very bottom, the footer's last line sits 13–14px above the bar on all three pages. On the detail page the Back to top button measures 13px above the bar, i.e. it still floats free.

Evidence: docs/evidence/_new/mobile-tabbar-float-390.png, mobile-tabbar-index-390.png, mobile-tabbar-catalog-390.png, mobile-tabbar-saved-390.png, mobile-tabbar-rankings-390.png, mobile-tabbar-detail-390.png.

**Not verified**: how the glass reads over a fully white poster area (the sampled pages are all dark art), and iOS Safari's `backdrop-filter` on a rounded fixed element with a shadow — only Chromium was measured.

## 44. Tab bar icons are line drawings, and the current tab has a block behind it

The four tabs used text glyphs — `◆ ▤ ▮ ★` — which render as whatever the system font decides, carry no meaning for Catalog or Rankings, and did not match the 1.8px line icons in the header (bookmark, clock, avatar). The client sent a reference with a house, a funnel, a bar chart and a bookmark, each with the label underneath and a rounded block behind the current one ("那些Icon 改一下, 这些icon可以", 2026-11-18).

The glyphs are replaced with inline SVGs on all five pages that carry the bar (index, catalog, detail, rankings, saved): house with a door for Home, funnel for Catalog, three rising bars for Rankings, and the same bookmark outline the header uses for Saved. All are 20×20, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.8"`, so the icon inherits the item colour instead of being a fixed-shape glyph. `.tabbar__icon` became a flex box sized to the svg.

**The current tab is now a block, not just tinted text.** `.tabbar__item` gained `margin: 5px 4px`, `padding-block: 3px`, a 14px radius and a colour/background transition; `[aria-current="page"]` paints `color-mix(in srgb, var(--accent) 18%, transparent)` behind the icon and label, the way the reference does. Because the items now carry their own margin, the bar sits at 62px tall instead of 56 — measured at 390×844: bar x12, width 366, height 62, active item 50px tall, 20px icons, horizontal overflow 0 on every page, footer still 11px clear of the bar when scrolled to the bottom.

Evidence: docs/evidence/_new/mobile-tabbar-icons-390.png.

**Not verified**: the icons at the 1.5px effective stroke a 2x phone screen shows after downscaling (they were sized on a 2x emulated viewport), and nothing on the bar was re-measured on iOS Safari.

## 45. Back to top is on every page, not just the detail page

The button was built for the detail page (its scroll handler lived in js/detail.js) and the other four pages had no way back to the top except dragging — which got worse once the floating tab bar started covering the first row of cards. The client noticed the gap ("其他页面没有back to top 按钮", 2026-11-18).

The behaviour moved into js/ui.js as `mountToTop(button)`, because it is a piece of page furniture rather than detail-page logic: it finds `#to-top`, listens to `scroll` passively, sets `hidden` when `scrollY < 600` or when the footer's top reaches the viewport (the button is `position: fixed`, so moving it up only moves it over the copyright line), and scrolls to `{ top: 0 }` with `behavior: smooth` unless the user asked for reduced motion. `index.html`, `catalog.html`, `rankings.html` and `saved.html` gained the same `<button class="to-top" id="to-top" hidden>Back to top</button>` the detail page already had, and their entry scripts (js/home.js, js/catalog.js, js/rankings.js, js/saved.js) call `mountToTop()` once at boot; js/detail.js went from twenty lines of its own handler to `mountToTop(els.toTop)`, so the five pages cannot drift apart.

**Measured at 390×844** on all five pages: hidden at the top of the page; after scrolling to 900 the button is visible at `right: 16px`, bottom edge 762, i.e. 10px above the floating tab bar; clicking it returns `scrollY` to 0; scrolled to the very bottom it hides again so the footer's last line is readable. On the bookmarks page, which is short, the button never appears because the footer is already on screen at `scrollY` 900 — the same rule doing its job rather than a special case.

Evidence: docs/evidence/_new/mobile-to-top-catalog-390.png.

**Not verified**: the smooth scroll's feel on a real device, and whether the button is reachable on a page that is only slightly taller than the viewport (between 600px and one screen of scroll there is no button at all, by design).

## 46. The filter sheet is placed before the markup paints

On a phone, reloading the catalogue showed the six filter rows for a moment and then they vanished. That was the bottom sheet arriving late rather than a rendering glitch: the sheet only becomes a sheet when `body[data-filters-ready="true"]` is set (css/style.css:2155), and that flag used to be written by js/filters.js — a module, which the browser fetches and evaluates after the markup is already parsed. For one frame the rows sat in normal flow in the middle of the page, then the flag landed and `transform: translateY(101%)` took them off screen.

The flag is now set by a three-line inline script at the top of `<body>` in catalog.html, before the filter block is parsed, so the rows never exist in the flow at any frame. js/filters.js still sets it in `mountSheet()`; the second write is a no-op and keeps the function usable on its own.

The no-JS fallback survives, which is why the inline script rather than a CSS-only default: with scripting off the line never runs, no flag is set, and the panel stays a plain block that still filters on form submit.

**Proved with JS actually blocked**, not just by reading the rule: with `Network.setBlockedURLs` stopping both modules, `#filters` computes to `position: fixed` with `matrix(1, 0, 0, 1, 0, 716.043)` and its box top at 851 — off screen on the first paint, before any module could run. With scripts allowed, the sheet still opens: `data-open="true"`, transform back to `matrix(1, 0, 0, 1, 0, 0)`, top 135, height 709, backdrop `block`, 48 cards underneath. Desktop at 1440 is untouched: `position: static`, `transform: none`, top 227, height 452, toggle `display: none`, no horizontal overflow.

**Not verified**: the flash itself on a real phone at a real network speed — I can no longer observe the frame that used to be wrong, only that the state it depended on is now set before parsing.

## 47. The ranking filters were briefly a matrix on phones — reverted

For one round the mobile ranking panel was rebuilt as an equal-width grid: three fixed columns for the sort pills, one chip matrix per row, `More` pinned to the label line, hairline rules between rows (measured 343×555 at 390×844, every chip 103×33, no truncation).

The client rejected it on sight ("回退吧, 不喜欢.", 2026-11-18). The CSS went back to the ragged-chip layout it had before — `.rank-panel { padding: var(--sp-3) }` and `.rank-row` as a single-column grid, chips flowing on text width — and the two narrow-width breakpoints added to keep the sort row on one line were removed with it.

What it cost and what it bought, for anyone tempted again: the matrix made both edges straight but grew the panel by 41px, because three equal columns push Region and Format's fourth option onto a second row, and it shrank the chips to 33px tall — below the 44px a thumb wants. Four narrower columns would have avoided the orphan rows but truncated `Psychological` and `Supernatural`.

## 48. The mobile genre row shows four chips, and More moved up to the label line

One follow-up on the reverted panel: the client asked for fewer genres on a phone ("genre 显示少一点?", 2026-11-18). Nothing else changed — the ragged chip flow is still the layout.

Inside the same `@media (max-width: 599px)` block, a second collapse rule drops the genre row to `All` plus three: `.rank-row[data-collapsible="8"][data-expanded="false"] .rank-opt:nth-child(n + 5)` (the desktop rule, which starts at `n + 10`, still shows eight). Four chips fit one line and the panel drops from 514 to 442 tall.

Showing four also broke something the old count hid: `More ⌄` no longer fits beside the chips, so it wrapped onto a line of its own and `margin-inline-start: auto` pushed it to the right — a stray word under the row. On mobile `.rank-row` is now `position: relative` and `.rank-more` is absolutely positioned at the label line's top-right, which is where the button stays once the row is expanded and reads `Less ⌃`. Desktop keeps it at the end of the chip line, where there is room.

**Measured at 390×844**: four genre chips (`All`, `Action`, `Adventure`, `Comedy`) on one line at the same height as the rest of the row, `More ⌄` 5px above the label's top and flush with the panel's right edge (346), panel 442 tall. Expanding still gives 18 chips over six rows with `Less ⌃` in the same corner. Desktop at 1440 is untouched: nine chips on one line, `More` at the end of that line, panel 266.

Evidence: docs/evidence/_new/mobile-rank-genre4-390.png.

## 49. Between 600 and 899 there was no navigation at all

The client opened the deployed site in an 854px window and found neither a top navigation nor a bottom one. Both halves were true and neither was a bug on its own: the mobile tab bar was switched off from `min-width: 600px` (css/style.css, old line 1678), while the top navigation and the header search were switched off up to `max-width: 899px`. Every width in between got an empty header and no bar — a 300px-wide dead zone, most visibly a browser window that is not phone-sized but not wide either.

The two handovers are now one handover, at 900px. `@media (min-width: 600px)` keeps only the tablet grid and hero padding; a new `min-width: 900px` block resets the body's bottom padding, hides `.tabbar`, and shows `.site-nav`; and the tab bar stays on screen through 899. Because a 780px-wide phone bar looks like a desktop footer, the bar is capped at `min(620px, 100% - 24px)` and centred via `left: 50%` + `translate: -50% 0` in a `600px–899px` band, so it reads as a floating strip rather than a full-width bar.

**Measured at 900px tall** on index.html: 599 → tab bar only (560 wide, left 12); 600 → tab bar 561 wide, body bottom padding 82; 768 → bar 620 wide, left 67; 854 → 620, left 110; 899 → 620, left 132; 900 and 1440 → top navigation, no bar, body padding 0. Exactly one navigation entry point at every width, no horizontal overflow at any of them. Catalog at 854 keeps its sticky search bar above the panel and gains the same centred tab bar.

Evidence: docs/evidence/_new/nav-854-index.png, nav-854-index-bottom.png, nav-854-catalog.png.

**Not verified**: 600–899 in portrait tablet orientation on a real device (the same rules, but the bar sits closer to the thumb).

## 50. The catalog grid got the home page's column ladder

In an 842px window the catalog put the same posters Home shows at four or six across into **two** very large columns, so the two pages looked like different sites. The cause was two different ladders: Home's wide shelves step 3 → 4 (640) → 6 (1024), while the shared `.grid` (which catalog used) steps 1 → 2 (600) → 3 (992) → 6 (1280).

`#catalog-grid` now uses the shelf ladder directly: 2 columns below 600 (unchanged, 24 cards in one column would be a 16000px page), 3 from 600, 4 from 640, 6 from 1024. The id selector keeps winning over the shared `.grid` rules at every breakpoint, so the generic ladder is untouched for detail's recommendation strip.

**Measured catalog at 900px tall**: 390 → 2 columns, card 167; 599 → 2, 271; 600 → 3, 168; 640 → 4, 132; 842 → 4, 183; 900 → 4, 197; 1024 → 6, 144; 1280 → 6, 183; 1440 → 6, 200 (unchanged). At 842 Home's TV Shows grid measures the same 4 × 182.75px tracks with a 16px gap, so the two pages now agree to the pixel; cards stay flat (transparent background, no border) on both.

Evidence: docs/evidence/_new/catalog-842-cards.png.

**Not verified**: 1024–1279 with a full 48-card load on a real tablet; the 144px cards there are the narrowest this page ever gets.

## 51. The header search came back for tablets, and stopped doubling up on the catalog

After the 600–899 dead zone was fixed, an 813px window still had no way to search from the home page: the header search was hidden up to 899px, and the home search band had been removed when the search moved into the header. The header at that width only holds brand, the search field and three icons, so the field fits — it is now hidden only below 600px.

Two numbers keep it from crowding the bar: `.nav-search` gets `width: clamp(180px, 25vw, 264px)` in the 600–899 band, so it never squeezes the brand at 600 and never runs into the icons at 899.

The catalog page then had two search fields on screen (header field plus its own sticky one). The page already starts with a full-size search field pinned above the results, so `body.page-catalog .nav-search` is hidden at every width; catalog.html now carries a `page-catalog` body class for that rule.

**Measured at 900px tall**: header field visible at 600 (180px), 640 (180), 768 (192), 813 (203), 899 (225), 900 (200 — desktop width rule), 1440 (264); hidden at 599 and 390. `.site-header__inner` scroll width equals client width at every one of those widths, so nothing is clipped; horizontal overflow stays at the scrollbar's 15px. Catalog: header field hidden and page field visible at both 813 and 1440; index: header field visible at 813, none at 390.

Evidence: docs/evidence/_new/nav-search-813-index.png, nav-search-813-catalog.png.

**Open**: below 600px the home page still has no search entry; the catalog's own field is the only one on a phone. Left alone pending the client's call.

## 52. Search on a phone: the bar could not fit, so the band came back

The header search cannot live below ~520px: at 390px the brand is 146px and the three tool buttons 122px, leaving 75px inside the header — not enough for a field. The home page therefore had no search at all on a phone, which is exactly the width the client photographed at 578px and at 390px.

Two mechanisms, one per range. From 520px up the header field is used again: `width: clamp(150px, 27vw, 264px)` keeps the header from clipping (measured overflow of `.site-header__inner` is 0 from 520px on; at 480px it was 27px, which is why 520 is the boundary and not 480). Below 520px the home page gets a `.search-bar--phone` strip under the header — the same `.search` component the catalog page already uses, 73px tall with a 46px input.

Because that band is the first block on the phone screen, the hero can no longer pull itself up under the header on this range: `@media (max-width: 519px) { .page-hero .hero { margin-block-start: 0 } }` sits after the base pull-up rule. Measured at 900px tall: 360 / 390 / 430 / 479 / 519 → band `block`, 73px tall, hero starts exactly at its bottom edge (137px), header search hidden; 520 / 578 / 640 / 813 / 1440 → header field `flex`, band hidden, hero back under the header (top 0), header overflow 0 everywhere.

The catalog page still uses its own full-width field plus the header one hidden by `body.page-catalog`, so only one search field is ever visible per page.

Evidence: docs/evidence/_new/home-search-phone-390.png.

**Not verified**: real iOS Safari safe-area behaviour of the band against the top edge.

## 53. TOP 5 folds 5 / 3 / 2 instead of 3 / 2

The rankings podium was three columns from 899px down, so an 897px window showed three oversized covers with two orphans underneath. It now keeps five across until 768, drops to three between 520 and 767, and two below 520 — the same "fill the row" logic the rest of the site uses.

**Measured on rankings.html at 900px tall**: 390 → 2 columns, cover 166; 519 → 2, 230; 520 → 3, 150; 640 → 3, 184; 767 → 3, 227; 768 → 5, 131; 897 → 5, 157; 900 → 5, 158; 1440 → 5, 254. Five items render at every width, no horizontal overflow.

The single-column ranking list below 900px is unchanged — only the podium row moved.

**Superseded for phones by §56**: below 600 the row now holds three covers and the list starts at 4, because the mobile render does that. 600–767 still shows five across three columns.

Evidence: docs/evidence/_new/rankings-top5-897.png.

## 54. The avatar button is gone

The translucent person icon in the header sat between the bookmark button and the recently-viewed panel and did nothing: the site has no accounts, no sign-in and no profile page (PRD has none, and the README says as much). The client asked for it to be removed ("这个移除掉吧", 2026-11-18).

Removed from all five pages (index, catalog, detail, rankings, saved) together with the `.avatar` rule; `.header-tools` is now the search field plus the clock and bookmark buttons. Nothing in `js/` referenced it, so no script changed.

**Measured**: `.header-tools` children are `nav-search, icon-btn, icon-btn, recent-pop` on all five pages, `.avatar` count 0, horizontal overflow unchanged. The earlier header measurements in §17 of this file still describe the old three-icon row; this section supersedes them for the avatar.

Evidence: docs/evidence/_new/header-no-avatar-1440.png.

## 55. The rankings kicker was inheriting body grey

`rankings.html` opens with "The Popularity of Anime" above the page title. That line carried `page-head__kicker`, a class with no rule anywhere in the stylesheet, so it fell back to the body colour and read as a subtitle. The catalog page's equivalent line (`filters__kicker`, "Browse in Categories") is the accent purple, which is what the client pointed at.

`.page-head__kicker` now copies the catalog values: `color: var(--accent)`, `font-size: var(--fs-md)` (17px), weight 500, letter-spacing 0.01em, 4px below. Measured at 1440: rankings kicker rgb(189, 145, 200) / 17px / 500 — identical to the catalog's.

Evidence: docs/evidence/_new/rankings-kicker-1440.png.

## 56. Phones use the mobile render's three-across cards

The mobile HiFi render (refs/catalog--render-mobile.png, refs/rankings--render-mobile.png, and the "3 column cards" line in all-pages--spec-mobile.png) shows three result cards across on phones. The catalog had been pinned to two since 2026-11-17 to avoid 103px posters, and the rankings podium was two columns of five with an orphan on the last row — both drifted from the render once the home shelves settled at three.

Catalog: `#catalog-grid` is three columns below 600 again, so the ladder reads 3 / 3 / 4 / 6. Measured at 390: three columns of 113px, 10px gap, cover 3:4, bookmark overlay 30px at 8/8, title clamped to two lines, horizontal overflow 0. At 1440 it is still six columns of 200px.

Rankings: the podium count now follows the viewport — five covers from 600 up, three below. `js/rankings.js` picks the count from `matchMedia('(max-width: 599px)')`, repaints on a breakpoint change without refetching, and numbers the list from wherever the row stops (4 on phones, 6 on desktop). The "TOP 5" label is hidden below 600, matching the render, which has no label.

The ranking list rows on phones were 96×144 thumbnails in 160px rows, which dwarfed the three covers above them. They now use the render's compact row: 28px number, 48×72 thumbnail, 88px row, 10px gap. Desktop keeps 82×123 thumbnails and 139px rows.

**Measured**: rankings.html at 390 → 3 podium cards of 113, cover 2:3, first list number 4, row 88 tall, thumbnail 48×72, overflow 0; at 1440 → 5 podium cards of 254, first list number 6, row 139 tall. Saved page and detail recommendations untouched (their own grids).

Evidence: docs/evidence/_new/m3-catalog-390.png, m3-rank-390.png, m4-rank-list-390.png, m4-rank-desk-1440.png.

## 57. The genre row left the phone, and columns replace the long line

The client called the Genre row too long on the rankings page ("genre 这里太长了,", 2026-11-18). Two separate lengths were in it: on a phone it held a row above Time, and once opened the seventeen chips ran the width of the panel and folded into a ragged second line, with the label centred against the pair.

Phones now drop the row entirely — `.rank-row[data-group="genre"] { display: none }` inside the same `max-width: 599px` block — which is what the mobile render shows (Region, Format, Time only). The panel goes from 442 to 370 at 390×844. Genre filtering on a phone goes with it; the desktop page keeps it. This supersedes §48's four-chip compromise, whose rule and its dead `nth-child(5)` collapse are gone.

Desktop keeps the closed state as it was — eight genres plus `More`, one line, panel 266 at 1256 — but the open state is a fixed-column grid instead of a flowing line: `grid-template-columns: repeat(4, …)`, five from 768, seven from 1200, with `justify-self: start` so every pill stays at text width, the label top-aligned, and `Less` on the tail of the last row. The counts are deliberately not divisors of 18: an exact fill would push `Less` onto a line of its own and undo the height saved.

**Measured**: 1256 → 3 chip rows, row 116, panel 338 (was 80 / 266 with the ragged line); 768 → 4 chip rows, row 176, panel 398; 390 → row hidden, panel 370; 18/18 chips visible when open, none clipped, horizontal overflow 0 at every width.

Evidence: docs/evidence/_new/m7-390-collapsed.png, m7-1256-collapsed.png, m7-1256-expanded.png, m7-768-expanded.png.

**Not verified**: a touch device; hiding the row means genre filtering is desktop-only, which is a product call, not a layout one.

## 58. On phones the magnifier in the header is the search entry for rankings and bookmarks

The client reported that rankings and bookmarks have no search on a phone ("手机上ranking 和 book mark 没有搜索", 2026-11-18). Correct: the header field is hidden below 520 (§52) and only the home page had a substitute band, so those two pages had no way in at all. The mobile renders put a magnifier first in the header tools, which is the entry they show.

**Superseded by §59.** The icon first shipped as a link to `catalog.html`; the client then asked for matches to appear while typing (m09951), so the same icon now opens the field in place and the panel is written by `js/search.js`. The measurements below are from the link version and no longer describe the header.

That icon now exists on `rankings.html` and `saved.html` as a `<a class="icon-btn nav-search-link" href="catalog.html">`, first in `.header-tools`. It is `display: none` above 519px, where the field itself is already in the row, and it hands over to the catalog page's own bar rather than opening a second field in a 75px-wide header. No script changed — it is a link, and the catalog bar is the one that owns query state.

**Measured**: 390 → icon 30px visible, header field hidden, `.site-header__inner` scroll width equals client width (358/358), horizontal overflow 0, tap lands on catalog.html with the 265px field on screen; 560 and 1256 → icon hidden, field visible, overflow 0. The resulting header matches the mobile render's order: brand, magnifier, clock, bookmark.

**Not done at the time**: `detail.html` had no phone search entry. §59 added it.

**Not verified**: a touch device; the icon is a plain link, so behaviour should match desktop clicks.

Evidence: docs/evidence/_new/m8-rankings-390-header.png, m8-saved-390-header.png.

## 59. Matches appear under the keyword field on every page

The client's second pass on search (m09951): "没有active searching, 就是我在任何页面输入关键词时候要显示结果. detail.html 可以加一个search". So the header field is no longer a submit-and-leave control. Typing two characters shows up to six matching titles under it, each a link to its detail page, with the full result list one tap away.

The panel lives in `js/search.js`, mounted on `index.html`, `rankings.html`, `saved.html` and `detail.html`. `catalog.html` is excluded on purpose: its own field already re-filters the grid on every keystroke (300ms), and a second list of the same six titles over the results would be noise. The module reads the page's `input[name="q"]`, so the home page's phone band and the header pill share one implementation.

Behaviour: 220ms debounce, minimum two characters; loading / empty / error states; ArrowDown and ArrowUp walk the list, Enter opens the highlighted row, Escape and a tap outside close it, and returning to a field that still holds a word re-runs the query. Each row is a cover (34x48), the title, and a meta line (`TV · 2023 · 90%`); the footer link is "See all results for "q"" → `catalog.html?q=`. Results are requested with `fresh: true`: the API caches answers for five minutes, and a throttled empty answer had already made one manual test report "No titles match" for a word that has matches.

Below 520px the header field is hidden (§52), so the magnifier from §58 now opens that field in place instead of leaving the page: the brand, clock and bookmark step out, a close button takes their place, and the panel hangs off the header (16px gutters) rather than off the 256px field. Above 519px nothing changed in the header — the field is already there and the panel is 420px, right-aligned under it.

**Measured**: 1440 → panel 420 wide, six rows, right edge on the field, horizontal overflow 0; ArrowDown twice + Enter → `detail.html?id=182255` (Frieren: Beyond Journey's End Season 2). 390 → icon opens the field (focused, 256 wide), panel x16 w358 right374, six rows, tap → `detail.html?id=20` (Naruto), overflow 0; close returns the header, field hidden. 519 → field hidden, icon grid; 520 → field flex, icon none. 560 → field visible, panel 420 at x25–445, overflow 0. Home's phone band → panel 356 wide inside the 390 viewport, six rows, overflow 0. Catalog → 0 panels, 0 toggles, its own field intact. Escape then refocus → panel reopens with the same six rows.

**Not verified**: a real touch device; a screen reader (roles and `aria-expanded` are set, but that is not the same as listening to it).

**Not done**: the submit button inside the field still exists, so Enter on an unhighlighted row still goes to the catalog result page, which is the behaviour a plain search form should keep.

Evidence: docs/evidence/_new/m9-rankings-1440-popover.png, m9-rankings-390-open.png, m9-home-390-strip.png.

## 60. A save confirms itself, and the hero copy steps back in

The client asked for one more pass on GSAP (m10190) and approved save feedback plus a hero re-entry (m10199). Neither adds a plugin: both ride the `gsap` instance the five pages already load.

- **Saving** — the card icon and the detail button pulse `scale .84 → 1` over 340 ms with `back.out(2.6)`, and the header badge bumps on the same tick; removing a row from the drawer collapses it (opacity plus 8 px left, 160 ms) before the list re-renders. Before this a save only changed colour and `aria-pressed`, which is easy to miss on a phone with no hover.
- **Hero copy** — tags, title and lede leave as three staggered lines over 300 ms, swap at 325 ms with the image, then return with `power2.out` over 450 ms and a 60 ms stagger. The CSS path (`css/style.css:461-494`) still runs when `window.gsap` is missing, so the old one-block fade is the fallback rather than dead code.
- **Measured** — at 150 ms the three opacities were .26 / .41 / .60, all zero by 550 ms and back to 1 by 1350 ms with no inline styles left behind; autoplay still advanced after 7 s with the copy at 1. With `prefers-reduced-motion: reduce` forced through `Emulation.setEmulatedMedia` the swap is instant, the hero keeps `class="hero"`, no inline styles appear and a 390 px viewport stays at 0 horizontal overflow. The drawer went 2 rows → 2 rows at opacity .88 → 1 row, badge 2 → 1.

**Not verified**: a real touch device; whether a 340 ms pulse reads as deliberate rather than accidental at 60 Hz.

**Not done**: rating stars and filter chips still change with no feedback tween; opening and closing the drawer stays instant.

## 61. A light theme built from Miku's teal, without touching the dark one

The client asked for a light theme in Miku's colours while keeping the dark theme as the default (m10290): "帮我弄一个亮色主题, 我们现在这个是暗色的. 我们的亮色主题是按照初音未来的颜色做."

The dark theme already passed the PRD's palette check, so it had to stay byte-for-byte identical rather than being re-tuned to share values with the new one. That ruled out swapping `--accent` alone: the dark accent does two jobs — text/link colour on dark surfaces (53 uses) and the fill behind dark ink (17 uses) — and one teal cannot satisfy both contrasts on white. So the roles were split first, with the dark values left as they were:

- `--accent` stays the text/outline/marker colour; `--accent-fill` is what sits under `--accent-ink` (chips, badges, the primary button's hover, a selected save). In dark both are `#BD91C8`; in light the text is `#0A7A76` and the fill is `#39C5BB` under `#06302E` ink.
- Artwork keeps its own accent: `--on-art-accent` stays `#BD91C8` in dark and becomes `#6FE7DA` in light so thumbnail frames and arrow hovers stay legible on a photograph.
- Everything else got a named twin (`--brand`, `--icon`, `--text-soft`, `--header-glass`, `--header-glass-stuck`, `--header-blur`, `--scrim`, `--scrim-strong`, `--skeleton-hi`, `--search-line`, `--search-placeholder`, `--search-go`, `--footer-text`, `--footer-note`, `--danger-ink`, `--danger-fill`, `--danger-on-fill`). The dark block carries the exact previous values, so the default rendering does not move.

Light palette: background `#E7F3F1`, page wash `#DDF0ED`, panels `#FBFEFD`, second panel `#D8ECE9`, footer band `#CFE8E4`, body text `#113033`, muted `#44666A`, dim `#6E8D8F`, lines `rgba(16 74 75 / .12)` and `…/24`. The first cut used `#F4FBFB` with pure-white panels; on screen it read as a white page with a faint tint, and the client asked for less white (m10581). The panel wash `.pair > .shelf` was also still the hard-coded purple `rgb(189 145 200 / …)` from the dark design, which looked pink over white; it now mixes `--accent-fill`, so dark stays the identical purple and light gets the same mint as the rest of the page.

Three places needed more than a token swap:

1. **The header over the home hero.** A light glass pane over a bright banner puts white links on pale artwork. In light mode the pane keeps the dark glass and the white links until the header sticks, then turns to `rgb(244 251 251 / .92)` with the ink brand; the theme button follows on the same rule.
2. **Hero thumbnail names.** They sit where the hero gradient meets the page, which is near-white in light mode, so the name drops to `--text-muted` and only the current item takes the teal accent.
3. **Streaming logos.** Crunchyroll, Hulu, Twitter and Netflix ship white artwork for dark chips; on a white panel they vanish. In light mode each brand icon gets a 4px-radius `#1A1424` tile under its 16px box (2px halo), which keeps the marks readable without recolouring someone's logo.

The switch is a header button beside the clock (`js/theme.js`, `data-theme-toggle`), present on all five pages; it writes `localStorage['mf.theme']`, mirrors `aria-pressed` and a changing `aria-label` ("Switch to light theme" / "Switch to dark theme"), and syncs across tabs via `storage`. A four-line inline script in each `<head>` reads the stored value before the stylesheets paint, so a light-theme reload does not flash dark. The default stays dark; the system preference is deliberately not followed — the brief asks for a designed pair, not an automatic one.

**Measured**: at 1440 the light ranking page reported `--bg #E7F3F1`, `--surface #FBFEFD`, `--text #113033`, `--accent #0A7A76`, `--accent-fill #39C5BB`; the button read `aria-pressed="true"` and `localStorage` was `light`, and a reload kept it. Dark comparison values were unchanged: header `rgba(10, 8, 14, 0.42)`, brand `rgb(130, 121, 145)`, card title `rgba(242, 238, 249, 0.78)`, footer `rgb(255, 255, 255)` / note `rgba(255, 255, 255, 0.55)`, panel hairline `color(srgb 0.741 0.569 0.784 / 0.22)`. On a 390 viewport the button is 30×30 at x344 on all five pages, header `scrollWidth - clientWidth` is 0 and page overflow is 0; 375 / 519 / 520 / 768 behaved the same, with the search field hidden at ≤519 and visible from 520 as before. Tapping the moon on a phone switched to dark, stored `dark` and put `body` back to `rgb(20, 16, 24)`. The light search popover is white, 420 wide at 1440 with dark rows; the 390 empty detail state keeps its red dashed card readable. Contrast of the light pairs, computed by value: body `#113033` on `#E7F3F1` 12.37:1, muted `#44666A` on `#FBFEFD` 6.17:1, link/accent `#0A7A76` on `#FBFEFD` 5.10:1, ink `#06302E` on the teal fill 6.72:1. The dim tone, `#6E8D8F` on `#FBFEFD`, is 3.53:1 — it is used on disabled chips (Month / Day), which are inactive controls.

**Not verified**: a real phone; a screen reader on the toggle (it is a labelled `<button>`, but that is not the same as hearing it); an automated contrast audit of every light pair — the body and accent pairs were checked by value, not by a tool run over the rendered page.

**Not done**: no "follow system" option, no per-page override, and the two full-page browser screenshots in `docs/evidence/` still show the dark theme.

Evidence: docs/evidence/_new/theme-dark-1440.png, theme-light-1440.png, theme-light-home-1440.png, theme-light-home-1440-scrolled.png, theme-light-home-1440-footer.png, theme-light-rankings-390.png, theme-light-catalog-390.png, theme-light-detail-390.png, theme-light-saved-390.png, theme-light-index-390.png, theme-light-detail-1440.png, theme-light-search-1440.png, theme-dark-rankings-390.png, theme-dark-home-1440.png, theme-dark-home-1440-footer.png.

## 62. Rankings' Day, Week and Month: three windows, each on the nearest signal AniList sells

The client asked why Month and Day were greyed out on `rankings.html` (m10674), then chose the option that adds no new data source (m10683: "推荐方案（不新增数据源） 我说的是Ranking 页的"). The home Ranks panel keeps the behaviour described in §13; only `rankings.html` changed.

AniList publishes no daily or monthly chart. `mediaTrends` is keyed to one day, so a real 30-day gain would take thirty requests per page load, straight into the 30/min limit. Each window therefore reuses a signal AniList already returns:

| Chip | Now shows | How |
|---|---|---|
| Day | site-wide trending | `search('', { sort: 'trending' })` → `TRENDING_DESC` |
| Week | aired in the last 7 days, most popular first | `airingWindow({ days: 7 })` (three pages of 50 schedule rows), filtered locally, already sorted by `popularity` |
| Month | airing now, ordered by trending | the same search with `status: 'RELEASING'` |

All three still honour Region, Format and Genre. Week does its own filtering because the schedule query has no country/genre arguments: `js/api.js` now exports `airingWindow`, and both `WINDOW_QUERY` and `WINDOW_FIELDS` carry `countryOfOrigin` and `genres` (`JP/CN/KR`, `TV/MOVIE/OVA`). `js/rankings.js` gained `inWeekFilters()`, so Week + Action + Japan + TV narrows the list the same way the other windows do.

The three sort buttons cannot apply while a window is on — Day/Week/Month bring their own order. Rather than let a press look like it worked, `sortLocked()` sets `aria-disabled` on the buttons and the click handler returns early; the pressed look dims to 45%. This also fixed the older Week chip, which silently ignored the sort buttons.

On phones the six Time chips were wrapping Day onto a second row (row height 106px, Day alone at y=627). At ≤599px the Time chips drop to `--fs-xs` with 8px side padding, so all six sit on one line at 375 and 390: row height 67px, one y value, no horizontal overflow.

**Measured** (cache disabled, cache-busting query string): at 1440 Day returned "The World's Strongest Witch / The Laid-Off Cheat-Granting Mage / ONE PIECE …", Week returned "The Apothecary Diaries Season 3 / Black Clover Season 2 / Detective Conan / The Exiled Heavy Knight …", Month returned the trending list restricted to airing titles; 25 rows in each. Week + Action changed the top five ("Black Clover Season 2 / The Exiled Heavy Knight / Overgeared / Reincarnated as a Sword Season 2 / STEEL BALL RUN …"), Week + Action + Japan + TV changed it again (Tokyo Revengers, A Returner's Magic, Dragon Ball Super: Beerus). Clicking Average Score while Week was on left the list and the count unchanged and all three sort buttons reported `aria-disabled="true"`. At 390 Day painted three big covers, `scrollWidth - clientWidth` was 0, and the Time row measured 67px on one line. Evidence: `docs/evidence/_new/m10-rankings-1440-week.png`, `m10-rankings-1440-day.png`, `m10-rankings-390-month.png`, `m10-rankings-390-day.png`.

**Not verified**: a real phone or a screen reader on the new tooltips; the Week sample is the first 150 schedule rows of a seven-day window, not the full week; Day and Month are both trending, so with no filters they overlap heavily (Month only drops finished titles); neither is a 24-hour or 30-day gain, and the chips say so in their `title`.

**Not done**: no dedicated query, no extra requests, no change to the home Ranks panel.

## What was *not* changed

- Four states (loading / success / error / empty), skeleton geometry and `aria-busy`.
- The wide shelves' 6/4/3 ladder and the 3:4 cover frame (§19); only the catalog's phone step moved (§56).
- Four GSAP moments (Timeline, ScrollTrigger, MotionPath, Draggable) and the reduced-motion branch.
- The dark palette. It stays the default and every light token has a dark twin holding the old value (§61).
- Ranking lists: home's Day/Week read the airing schedule, Season/Year filter by season and year, Month is the trending proxy described in §13. `rankings.html` now gives Day/Month/Week their own meanings too (§62); the home Ranks panel was not touched.
- PRD feedback items: all 20 are mapped in `PRD-FEEDBACK-MAP.md`. #20 / #13 / #12 (home search), #17+#15 (rankings genre), #04 / #08 / #07 (ranking thumbnails) and #14 (Overview) were the last five gaps and were closed on 2026-11-17 (§40); #05's visible label became an icon (§20) and #07 / #16 stay as written refusals with reasons in that file.

## How to re-check

Screenshots: `docs/evidence/preview-home-1706.png`, `preview-home-1440.png`, `preview-home-954.png`, `preview-home-375.png`, `preview-catalog-1706.png`, `preview-detail-1706.png`, `preview-rankings-1440.png`.

Measured with DevTools device emulation (`mobile: false`) after a cache clear; each width checked `document.documentElement.scrollWidth - window.innerWidth` (always −15, i.e. no horizontal overflow).