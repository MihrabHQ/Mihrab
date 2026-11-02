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

## 1. The timeline as it stands

Milliseconds. The native marks count from the process's birth; the JS marks
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

## 4. The plan: the live screen sooner

In order; each step measured on the phone with `tools/startup-trace/cold.sh`
and the trace before it is kept, with the numbers in its commit message.

1. **`UIManager` constants.** The JS half is done (§1). The native 33 ms: `getUIManagerConstants` instantiates every view
   manager to collect its constants; check whether `DefaultReactHost` can
   take `lazyViewManagersEnabled` (it is a `ReactNativeHost` option; the
   bridgeless host builds its `ViewManagerRegistry` from the package list)
   and whether `react-native-svg`, `react-native-screens` and our own
   packages implement `ViewManagerOnDemandReactPackage` (ours can).
2. **Attribute `commit` → `raf`.** A Hermes sampling profile of the launch
   (`HermesSamplingProfiler` from `MainActivity`, 1 ms interval, dumped at
   `run`) and a Perfetto trace with the `rn` tags, read side by side at the
   `commit` mark. The hypotheses, in the order I would bet on them: the
   passive effects of the ready render (`HomeScreen`'s and `TodayCard`'s
   `useEffect`s, the navigation's own, `react-navigation`'s header), the
   `v2-swept/read/parsed` cache sweep that lands in this window on some
   launches (it is already after `commit`, but it is JS; it could wait for
   `paint`), `syncWidgetUiHints`/`setWidgetSkySchedule` (already after the
   run — check), and the i18n/Intl formatters' first use (`Intl.DateTimeFormat`
   construction is 5–15 ms each on Hermes; the hero formats times, dates,
   and the countdown in the first render).
   Expected: 40–80 ms off `raf`.
3. **Text measurement in the commit.** Count the `Text` nodes in the ready
   tree (a `console.count` in a dev build is enough; I expect 60–90: the
   rows alone are 6 × (name, time, two chips)). Each is a JNI measurement.
   Moves: the rows' chips rendered only when they apply (most launches
   have none), `allowFontScaling`-safe fixed heights for the rows so Yoga
   measures fewer nodes (the layout memory already knows the row height),
   and `numberOfLines={1}` on every single-line label (it is a cheaper
   measure path). Expected: 10–20 ms off `commit`.
4. **`skyMoods` at load, 7 ms.** Convert the anchors on first use rather
   than at module load, and memoise per variant — the Sky theme pays it at
   `home` instead; the classic themes never do. Trivial; after 1–3 so it
   is measured on its own.
5. **`diyanetPlaces`, 9 ms.** Not the parse but the question: "is the
   reader within 25 km of one of 8,000 places?". A generated side table of
   the 1°×1° cells that hold a place (~1,500 cells, 15 KB) answers "no"
   without the file; readers in a cell with a place still parse it (so
   Europe, Türkiye, the big cities everywhere). Worth it only if the
   profile shows the parse on the critical path for the readers we think
   about; otherwise leave it.
6. **The Keychain read, 35–45 ms, on the critical path.** `settings` waits
   for `readSecureSettings` because the location is in it and the times
   need the location. Two options: (a) keep the *cached day's times* in
   the fast store too (they are already in the stored-times cache,
   AsyncStorage) so the hero can draw from them before the location is
   known, and reconcile when it is; (b) keep a non-secret hash of the
   location (the cache key) in the fast store so the cache can be read
   before the Keychain answers. (b) is smaller; both change what the
   first render trusts, so this is last and only with the numbers from 2
   showing the Keychain still at the head of the queue.

Expected together: `paint` from ~400 to ~280 ms after `js0`, the live
screen under ~500 ms from the process's birth. If that lands, §3 stays
on the shelf.

## 5. Not doing

- Moving data out of the bundle (measured: nothing to gain at launch).
- A smaller `index.js` / fewer modules for their own sake: 1,143 modules
  initialise before the paint and their self time outside RN is ~60 ms,
  spread thin; nothing but the items above is over 3 ms.
- Preloading the bundle in a warm process (`ReactHost.start()` from a
  widget's broadcast): the OS kills it, and it would cost battery for a
  launch that is already covered by the picture.
