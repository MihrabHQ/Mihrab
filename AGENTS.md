# AGENTS.md — read this before you change anything

For everyone who works in this repository: Claude and other AI agents,
contributors, and the maintainer on a tired evening. It is short on purpose.
The deep material lives in [ARCHITECTURE.md](ARCHITECTURE.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and
[scripts/copy/README.md](scripts/copy/README.md); this file is what must not
be forgotten.

## 1. What comes first

1. **Prayer times stay correct and available.** A wrong minute at Maghrib is
   the worst bug this app can have. Nothing ships that changes a time without
   a test that pins the new time and a reason it is right.
2. **What the app, the site and the listings say is true.** Every claim about
   accuracy or privacy has to be backed by the code, and is checked by a test
   (§4).
3. Everything else — features, polish, speed.

When two of these pull against each other, the lower number wins. When you are
unsure whether a change touches 1 or 2, assume it does.

## 2. Hard rules

- **Straight to `main`.** Commit and push to `main`; no pull request, unless
  there is a reason to hold the change back (it waits on the maintainer's
  decision, a release is being cut, it comes from outside) — then a branch and
  a PR. Before pushing, the checks pass locally (`tsc`, the full `jest`, and a
  native build where native code changed); after it, watch CI on `main`
  (test, Android, iOS simulator, Mac Catalyst) and fix or revert a red job at
  once.
- **Commits are authored by the maintainer alone.** No `Co-Authored-By`, no
  session links, no "Generated with …" lines — in commits or in PR bodies.
- **Never** run `git checkout -- .` or `git stash` on a working tree that is
  not yours; never commit `desktop/`; never commit secrets, keystores or
  `.env` files.
- `unset NODE_ENV` before `npm ci` / `npm run` (a production `NODE_ENV`
  skips the dev tools and the tests run against nothing).
- **Releases** go through `scripts/release.sh` only, and only when asked: no
  store submission, no tag, no version bump on your own initiative. Small
  changes wait for a bigger release.
- **On a real device**, install over the existing app with
  `adb install -r --user 0`; never uninstall it (that deletes the user's
  journal). Never run a test build against real app data on a Mac — use a
  separate bundle id and `CFFIXED_USER_HOME`.
- **No analytics, trackers, telemetry or ads. Ever.** No new network host
  without §4.
- 13 locales in parity; no raw colours outside `src/theme/tokens.ts`
  (CONTRIBUTING.md has the rest).

## 3. Prayer times: the invariants

- **The computed methods** — Sweden, Diyanet, Morocco, Algeria, Indonesia —
  are developed and certified in
  [mihrab-methods](https://github.com/MihrabHQ/mihrab-methods): a method is
  used only at **0 times off** its authority's published timetable. The app
  carries copies (`src/providers/*Method.ts`, `src/providers/data/`). Change a
  method there first, certify it, raise its revision, then copy it here with
  the same revision in `src/providers/methodRevisions.ts`.
- **The live feed.** At run time the app reads mihrab-methods' `main`:
  `certification.json` and `data/corrections/<authority>.json`. Their shape
  is a contract with every installed app: add fields, never rename or remove
  one (`schemas/` in mihrab-methods; `methodCurrency.ts` here).
- **Don't change a default** (provider, calculation method, high-latitude
  rule, the riwayah fallback) without a test and a note in the PR on who is
  affected.
- **The riwayah on screen** is `resolveRiwayah(prefs.riwayah)`, never the raw
  preference (`__tests__/ayahSheetFollowsShownRiwayah.test.ts`).
- Time zones: use `zoneClock.ts`; never parse an offset from
  `timeZoneName` strings, and never rely on Node's own zone data in a test.

## 4. Claims must match the code

- **Accuracy figures** come only from `data/methods/certification.json`
  (synced from mihrab-methods) through the generators — never typed by hand:
  `node scripts/copy/sync-certification.js ../mihrab-methods`, then
  `node scripts/build-site.js` and `node scripts/build-copy.js`. This also
  happens by itself: every release syncs from mihrab-methods' `main`
  (`scripts/release.sh`), and `.github/workflows/accuracy-figures.yml` checks
  daily and opens an "Accuracy figures" pull request when a figure changed —
  review the numbers, then merge. Wording:
  "matches the published timetable of …", never "official"; no "the only"
  or "the first"; Mihrab is independent and not affiliated with any
  authority. Full rules: [scripts/copy/README.md](scripts/copy/README.md).
- **Privacy.** Every host the code names must be listed in
  [PRIVACY_POLICY.md](PRIVACY_POLICY.md) (`__tests__/networkHosts.test.ts`
  fails otherwise). If a change alters what is sent, or when, update in the
  same PR: the policy (English and Swedish), the site's privacy section
  (`docs/index.html`, `docs/sv/index.html`, `scripts/site/strings.json`),
  and the store paragraph (`scripts/copy/store/`).
- The website ships **no JavaScript, no webfonts, no third-party
  requests**. Generated content is written into the HTML at build time.

## 5. Before you say you are done

Run, and report what you ran:

```sh
npm run preflight        # tsc, the site and copy checks, the whole jest suite
```

Then:

- [ ] The report (and the PR, when there is one) says what changed for the
      user, what was **not** verified, and anything the maintainer must decide.
- [ ] A user-visible change has a line in `CHANGELOG.md` under Unreleased.
- [ ] Text in a language you do not read natively is marked for native
      review (in the PR, and `data-review="native"` on a page).
- [ ] CI is green on every job on `main` after the push (before merge, for a PR).

If a check fails for a reason outside your change (a flaky native build, a
missing patch in `node_modules`), say so plainly in the PR; do not skip it or
weaken the test.

## 6. Where things are

| What | Where |
|---|---|
| Prayer providers, methods, correction lists | `src/providers/` |
| Which source a place gets ("Automatic") | `src/settings/effectiveProvider.ts`, `src/settings/regionalProviders.ts` |
| Method currency and the live feed | `src/providers/methodCurrency.ts`, `src/config/datasets.ts` |
| Quran reader | `src/quran/` |
| Website (static) | `docs/`, generated by `scripts/build-site.js` from `scripts/site/strings.json` |
| Store listings | `fastlane/metadata/`, generated by `scripts/build-copy.js` from `scripts/copy/store/` |
| Release | `scripts/release.sh`, `docs/DISTRIBUTION.md` |

## 7. Scheduled jobs and monitoring

- The scheduled workflows here (`national-tables`, `namazvakti-*`,
  `hijri-*`, `compat-feed`) write files installed apps download from `main`
  (`src/config/datasets.ts`). They stay in this repository, and those paths
  never move or change shape.
- Checks that only watch — the app's methods against the authorities'
  tables (`tools/verify-methods`), every source live (`tools/api-health`) —
  run daily in the maintainer's private monitoring repository, which also
  keeps the status board for every job in this repository and in
  mihrab-methods. A failing or stalled job opens an assigned issue there.
- A new scheduled workflow here must be added to that board: say so in the
  PR, for the maintainer to do.

## 8. The iPhone vertical bar (iPhone Duo, iOS 27.1)

Some iPhones keep a system bar down one side of the screen. Everything the app
does about it hangs off one value, `useVerticalBar()` (`src/native/VerticalBar.ts`):
the bar's side, width and where the clock above it ends — and **null on every
other device**: Android, the iPad and the Mac never read it, and an iPhone
without the bar reads null. So:

- **Duo-only means behind the bar.** A change for the bar is written as
  `vbar ? <new> : <exactly what was there>`. Never retune a shared value
  (a padding, a font size, a column width) for the Duo; branch on the bar.
  `__tests__/verticalBarIsDuoOnly.test.ts` holds the device gate and the
  null-bar results of the shared helpers.
- **New screens are covered by default.** The navigators pad every tab and
  every pushed screen clear of the bar (`MainTabs`, `RootNavigator`
  `screenLayout`); only Today and the muṣḥaf opt out and handle it
  themselves. A new screen needs nothing unless it draws edge to edge, or
  positions things absolutely against the window's sides.
- **Edge to edge, take the bar's side only.** `Math.max(insets.left,
  insets.right)` on both sides (keeping a page centred past a cutout) costs
  the bar's width twice beside it — use `useVerticalBarInsets()` or the bar's
  side. The bar is on a physical side: mark `paddingLeft`/`Right` and
  `left`/`right` with `// rtl-safe: the vertical bar is on a physical side`.
- **Buttons go in the column, not over it.** Tabs: `VerticalTabBar`. A page's
  own buttons: `setVerticalBarActions` (Today's location and Qibla). A pushed
  screen with a header of its own draws its column itself (the muṣḥaf).
- **Check it on the Duo.** Any change to Today, the tab bar, the reader, its
  sheets, the month table or the walkthrough is looked at on the iPhone Duo
  simulator (iOS 27.1) as well, and the PR says so — or says it was not.

## 9. Minimal's pager — three rules that keep regressing

The swipe between tabs under Minimal (`src/navigation/minimalPager.ts`,
`MinimalSwipe.tsx`, `MinimalTabBar.tsx`, `MinimalScreens.tsx`) has broken
the same ways several times, each time by fixing one of these and undoing
another. Read "A SWIPE'S TURN" in `minimalPager.ts` before touching it.

- **The navigator hears of a swipe's turn when its slide has landed**
  (`holdPendingTurn` → `flushPendingTurn`), never at the release. A tab
  change renders, runs the new page's focus effects and moves the reach —
  UI-thread layout in the frames the slide is drawn in, felt as the page
  slowing mid-swipe.
- **A second swipe straight after the first is the page on show's**:
  its handler is on a view that is the whole screen and does not move
  (the page moves inside it), the turn stays held through a takeover, and
  the turn, the settle and the finger live in `minimalPager.ts`, not in
  one page's refs. Never give the scenes touches the navigator took away
  (`MinimalScreens` keeps its `pointerEvents`): each scene is the whole
  screen, and one that takes touches lies over every page before it.
- **Direction is the app's** (`useLayoutRtl`), never `I18nManager.isRTL`.

`__tests__/minimalPagerTurn.test.ts` holds these. A change to the pager is
tried on a device: a slow swipe, a fast flick, two swipes in quick
succession, a dot tap and a hold, in English and with the app in Arabic.
