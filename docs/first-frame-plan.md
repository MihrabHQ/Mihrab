# The first frame — where the cold start's time goes, and the plan

Written 2026-11-03, against the tree at `c6b8838b` (the launch's reads from
MMKV, WorkManager on demand), at Hassan's request: *"check for general
performance improvement opportunities … start with 1 2 and 3, plan 4"* — this
is 4, the first frame drawn before JavaScript has finished.

Everything measured here is a cold start on the Pixel 10 Pro (Android 17,
the GitHub release build, installed over the existing app, Stockholm), read
off the `[boot]` and `[boot-native]` lines (`src/boot/bootTimeline.ts`,
`MainApplication.kt`) with `tools/startup-trace/cold.sh` and the per-module
trace of `tools/startup-trace/run.sh --trace`. Medians of four to six
launches; the spread is ±20 ms unless said.

---

## 1. The timeline as it stood

As of `c6b8838b`, before §4's work; §4 has what moved since and the
timeline after. Milliseconds. The native marks count from the process's birth; the JS marks
from the bundle's first line (`js0`), which comes ~100 ms after the activity
is created.

| mark | ms | what has happened |
|---|---|---|
| `napp` | 38 | `Application.onCreate` done (fonts registered, React host declared, nothing started) |
| `nrn` | 78 | the React host created |
| `nactivity` | 130 | `MainActivity.onCreate` done; the kept picture of the last screen is the window's first frame from here (`LaunchSnapshot.kt`) |
| `js0` | +100 | Hermes up, the bundle mapped, `index.js` running |
| `app` | 3 | `App` registered |
| `settings` | 70 | settings, sky, layout memory and the clocks' record in hand (the fast store; the 70 is the Keychain read, `readSecureSettings`) |
| `home` | 150 | `HomeScreen`'s first render |
| `ready-cache` | 195 | the day's times from the cache, in state |
| `commit` | 255 | the ready tree committed (layout done — Fabric lays out on the JS thread inside the commit) |
| `raf` | 340–390 | the first animation frame after it, i.e. the JS thread free again |
| `paint` | 370–430 | a tick after that: the live screen is on the glass, the picture starts to fade |
| `run` | 560 | the hero's launch run over |

So from the process's birth the live Today is on screen at about 650 ms,
and the reader sees the kept picture from ~130 ms, which is why the start
*looks* instant already. What this plan is about is the ~520 ms between the
picture and the live screen, because until then nothing responds to a tap,
the countdown in the picture is the old one, and a launch with no picture
(the first after an update, a different look, a widget tap) shows the
skeleton for all of it.

Where the 520 ms go, roughly:

- **100 ms, bundle load to `js0`.** Not the bundle's size: a build with the
  mushaf layouts and the twelve other locales stubbed out — 8.7 MB of
  bytecode instead of 13.4 — loaded in the same 100–119 ms. Hermes maps
  the file; what it costs is the runtime, the module registry and the
  TurboModule setup, not the bytes. (So the idea of moving the data out of
  the bundle into assets is dropped: it would buy nothing at launch, and
  would cost a file read on the first page turn.)
- **133 ms of module top-level code before the paint**, of which 73 ms is
  React Native's own and 66 of those are one thing: the legacy
  `UIManager` constants. `BridgelessUIManager` asks the native side for
  the table of every view manager (33 ms), and `UIManager.js` then spreads
  that object, which reads the lazy getter of every view manager's own
  constants (another 33 ms). Nothing reads that table at launch. The
  patch-package change that copies the getters as getters is in (this
  commit): the module top-level code before the paint went from 133 to
  105 ms, and `js0` comes ~40 ms sooner after the activity (the spread
  ran before the `js0` mark, inside `index.js`'s first imports). Part of
  it comes back later — `react-native-svg`'s `SvgTouchableMixin` reads its
  own view manager's constants, 6 ms, and each component type read at its
  first use — so the live screen is ~30 ms sooner from the activity, not
  33. The native half still needs `lazyViewManagersEnabled` or an upstream
  fix (§4, item 1).
  Ours: `diyanetPlaces.json` 8.6 ms (parsed to ask "is the reader near a
  listed place?"), `skyMoods.ts` 7.4 ms (every anchor's OKLCH conversion at
  module load), `diyanetCorrections.json` 5.5 ms (now lazy, this commit).
- **60 ms, `ready-cache` → `commit`**: rendering the ready tree. HeroSky is
  one `Svg` with the gradient, the halo, the stars (a fixed field of
  circles) and the body; the times are a column of rows, each several
  `Text`s; the day pager is a plain day until the run is over. The
  commit includes Yoga's layout and every `Text`'s measurement through
  `TextLayoutManager` (JNI, one call per text node, on the JS thread).
- **90–130 ms, `commit` → `raf`**: the JS thread is still busy after the
  commit. The alert schedule, the widget payload and the rest of the side
  work already wait for `afterFirstPaint()`; what remains here is not yet
  attributed — the first job of the plan.
- The UI thread's mount and draw of the committed tree run in parallel
  with that; the `paint` mark is JS's view, not the display's. The
  display's own first frame of the *live* screen has not been measured
  frame-exact since the picture covers it.

## 2. What "a native first frame" can and cannot mean here

The kept picture already is a native first frame: pixels, no JavaScript,
from `nactivity`. Three things it does not do, and each is a different
plan:

1. **It is yesterday's screen.** The countdown and the sky are the hour the
   app was left at; the run then sweeps them to now. A native first frame
   that is *right* would draw today's hero natively — the sky for this
   minute and the countdown — from data the native side has. It has that
   data: the widgets compute their own sky (`WidgetSkySchedule.kt`) and
   carry the day's times (`PrayerWidgetProvider` prefs). This is the
   ambitious option (§3).
2. **It is not interactive.** Nothing is until `paint`. Only a faster JS
   path shortens that (§4).
3. **It is absent on some launches.** After an update, a look change, a
   font-scale change, a widget tap, or the first launch: the skeleton.
   Option 1 covers these too, since it needs no picture.

## 3. The ambitious option: the hero drawn natively, under the live one

A native view — `LaunchHero` — that `MainActivity` adds to the window at
`nactivity` (where the picture goes today, and on iOS where
`MihrabLaunchSnapshot.swift` puts its image) and that draws, with the data
the widgets already keep:

- the sky: the same gradient, halo, sun/moon and stars the app draws, at
  this minute, from `WidgetSkySchedule`'s segment for now (it is sampled
  every five minutes; the hero's `skyFrame` at the exact minute differs by
  less than a step, and the live sky fades in over it);
- the countdown, the next prayer's name and time, the place line, from the
  widget payload (`PrayerWidgetProvider` prefs: the day's times, the names
  in the app's language, the kept look);
- the rows of the day's times under it, as the widget draws them.

Under it, React Native builds the live screen exactly as now, and
`hideLaunchSnapshot()` fades the native hero out instead of the picture.
The picture stays for what the native hero does not cover (the rest of the
page: Quran door, chips, the log) — the two compose: picture at the back,
native hero over its top region, live screen on top at `paint`.

What it buys: a correct hero at ~150 ms on every launch, picture or none,
and a run that starts from the right hour (no sweep for the common case;
`launchWarp` keeps running from the picture's hour when the picture is
older than the native hero can draw — i.e. never, so the warp becomes the
fallback for a native hero that could not draw).

What it costs:

- A second drawing of the hero to keep in step with the first, on two
  platforms. The widgets already pay this for the sky and the rows (and
  the Glance/SwiftUI code is the template), but the hero's typography, the
  countdown's unit letters, the rail, the chips, and every layout tier
  (`layoutKey`: minimal/full, roomy, expanded, insets, font scale,
  language, RTL) would have to match to the pixel or the fade shows a
  jump. The layout memory (`todayLayoutMemory.ts`) gives the exact
  heights; it does not give the glyph positions.
- The widget data is written after the first paint (`afterFirstPaint` →
  `republishWidgetPayload`); a native hero drawn from it is at most one
  launch stale in the *places* (the times are per day, in the payload, so
  the countdown is right as long as the day is in it; a new day with no
  payload for it falls back to the picture).
- Minimal and the full page are two heroes.

Verdict: not now. It is a month of work for ~370 ms of correctness on the
hero only, when the picture already makes the start look instant, and
every pixel of it is a second place to break when the hero changes — and
the hero changes often (docs/hero-plan.md). Revisit if the live screen
cannot be brought under ~400 ms from the process's birth by §4, or if the
no-picture launches (after every update) are what readers notice.

## 4. The plan, and what it found (2026-11-03, the same evening)

The plan was: lazy view-manager constants, then a sampling profile of
the launch, then whatever the profile said. The profile said more than
the hypotheses did, so this section is the record of what was found and
done, in the order it was done, with the numbers; §4.9 is what is left.

**The profile.** `MainActivity` enables Hermes's sampling profiler when
started with `--ez mihrab.profile true` and dumps it to logcat
(`tools/startup-trace/profile.sh`); 100 Hz is too coarse for one launch,
so ten to sixteen are aggregated between two boot marks
(`profile-annotate.js` names the frames from the bundle's source map,
`profile-aggregate.py` counts them). Every number below is from that,
on the Pixel 10 Pro, with the sky theme on and a sync folder paired.

1. **View managers on demand, the native half** (patch to
   `react-native-screens`, `MushafLinePackage`): `RNScreensPackage`
   implements `ViewManagerOnDemandReactPackage`, so its nineteen view
   managers' constants are read when a screen of that kind is first
   rendered rather than all at the first `UIManager` read. Module
   top-level code before the paint 105 → 74 ms; `js0` ~60 ms after the
   activity rather than ~100. `react-native-svg` and gesture-handler
   already were on demand; safe-area-context (2) and blur (2) are not,
   ~3 ms, left.
2. **The sync round ran under the first frame.** `startAutoSync` ran its
   first round as the root mounted; with a folder paired, reading and
   decrypting every peer's envelope (secretbox, in JavaScript) was a
   third of the JS thread's time between `commit` and `raf`. It waits
   for `afterFirstPaint()` now (the paint and the launch run).
3. **The day bar's words.** `toLocaleDateString` five times a render of
   the card — each a formatter built on Hermes — and the first one of
   the process 12 ms (ICU's classes and the locale's data). The words
   are kept per day and language (`HomeScreen`'s `dayWord`), and ICU is
   warmed on a thread of its own from `Application.onCreate`
   (`MainApplication.warmIntl`): 17 → 8 samples in the render.
4. **The correction lists.** The downloaded lists were checked whole at
   launch — Diyanet's nine thousand entries by regex, 22 ms before the
   first times could be read; a stored copy is taken on its outline now
   and checked after the first frame (`methodCurrency.checkStoredLater`),
   put back to the bundled list if it fails. `correctionsKey`, asked once
   a slot by the launch sweep, summarised the whole list each time; it is
   kept per authority.
5. **Two parses of the stored-times cache, and three readers of it.**
   The launch sweep parsed the cache and handed the bytes to the first
   load, which parsed them again (7 ms): it hands the parsed shape now.
   And for a reader whose week is computed on the phone, three things
   read the cache before the first frame for nothing on it: the cache
   status (`usePrayerDay`), the stand-in days' re-fetch (NetInfo calls
   its listener at once) and the saved locations' prefetch. All three
   wait for the first paint.
6. **The first times, 80 ms → 35.** `DIYANET_METHOD_ID` moved to a leaf
   module: comparing a method id against it loaded `diyanetMethod.ts`
   and its 600 KB of places (7 ms) for every reader; the places are
   required at first use. The country outlines are built per country
   when its box holds the point rather than all thirty-nine at the
   first question (7 ms). The nearest Swedish city is kept per spot
   (a haversine over every listed city, a week of times a launch). The
   national tables' seeds and place lists are read when a table is first
   asked, not when the module loads (4 ms). And the device's zone comes
   from a native constant (`SystemClock.timeZone`) rather than the first
   `Intl.DateTimeFormat().resolvedOptions()` (7 ms).
7. **The font store's listing** (`reconcileMushafAssets`, six hundred
   files) waits for the first paint too.

**Where it stands** (cold start, median of five, after `js0`):

| mark | before §4 | after |
|---|---|---|
| `settings` | 70 | 73 |
| `home` | 150 | 110 |
| `commit` | 255 | 220 |
| `raf` | 365 | 255 |
| `paint` | 400 | 275 |

and `js0` itself ~60 ms after the activity rather than ~100, so the live
screen is on the glass at ~465 ms from the process's birth, from ~635.
(`settings` did not move: it is the Keychain read, §4.9.)

### 4.9 The second pass (later the same night), and what is left

The five items this section listed are done or closed:

- **`skyMoods` at load**: each variant's moods, anchors and stations are
  built at the variant's first use (`skyMoodsOf`, `trackOf`); a classic
  theme never pays, a Sky theme pays for its own variant only.
- **The bundled Diyanet list at launch**: the bundled lists' summaries are
  written at build time (`scripts/build-corrections-summaries.js`,
  pinned to the lists by a test) and the launch compares against those.
- **`releaseNotes.generated.ts` at the first render**: `changelog()`
  requires the table at its first call; the sheet reads it once visible,
  and the launch's "anything new?" never reaches it on an ordinary day.
- **The Keychain read** is not the head of `settings` after all: the
  profile shows the JS thread busy for 60 of that window's ~68 ms (the
  root render, the module graph, the native modules' constants) while the
  read runs on the native modules thread beside it. Taking it off the
  path would buy under 10 ms. Closed.
- **The screens, lazily.** Every screen but Home was a `component` prop
  on a navigator rendered from the first frame, and a `component` prop
  reads the import: the compass, the surah list, the backup page, the
  sync page and eighteen settings pages — their whole module graphs —
  loaded at every launch. They are `getComponent` now, required at the
  first open. Module top-level code before the paint 74 → 59 ms.
- **The day bar's words** are kept across launches
  (`screens/home/dayWordsMemory.ts`, the fast store): the first formatter
  of the process was still 8 ms in the render after ICU's warm-up; a
  launch on a day already seen builds none before the first frame.
- **The muṣḥaf layout warm-up** (8 ms of bytecode) ran in the first
  paint's own frame, where the run begins; it waits for the run.

**The render** (`ready-cache` → `commit`, ~60 ms now) is what is left,
and it is proportional to the first frame's tree: ~17 ms is Fabric's
commit (Yoga, with a text measurement per `Text`), ~9 ms the shadow
nodes' creation, the rest React's reconciliation of the components,
spread so thin that no component is over 2 ms. The one move that would
cut it is a smaller first commit — the hero and a blank table of the
remembered height, the rows a frame later — which brings the first paint
~25 ms sooner but the complete screen no sooner, and on a launch with no
kept picture would show the rows arriving, which is the settling the
layout memory exists to end. Not taken; the kept picture already covers
the frame it would win.

Where it stands (cold start, median of five, after `js0`): `settings`
~70, `home` ~97, `commit` ~220, `raf` ~255, `paint` ~265; `js0` ~50 ms
after the activity. The live Today on the glass ~450 ms from the
process's birth. §3 stays on the shelf.

## 5. Not doing

- Moving data out of the bundle (measured: nothing to gain at launch).
- A smaller `index.js` / fewer modules for their own sake: 1,143 modules
  initialise before the paint and their self time outside RN is ~60 ms,
  spread thin; nothing but the items above is over 3 ms.
- Preloading the bundle in a warm process (`ReactHost.start()` from a
  widget's broadcast): the OS kills it, and it would cost battery for a
  launch that is already covered by the picture.
