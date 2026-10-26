# The hero — what it does, what is wrong with it, and the plan

Written 2026-10-26, against v2.33.0 (292), at Hassan's request: *"Analyze the
hero, its behaviour, how it is supposed to behave, then its code; look for
bugs, missing optimization, look and feel improvements, and build a plan."*

> **Status (2026-10-26, evening):** all three waves are implemented and on
> the phone (built from this tree, installed over the existing app), with
> the corrections noted under each item where the fix taught something the
> analysis had wrong. What remains open is in §6.

Everything below was checked on the Pixel 10 Pro (Android 17, 2.33.0 from
Obtainium, no reinstall) and on the `Mihrab_Shots_37` emulator (API 37,
1080×2400, 2.33.0 from `android/app/build/outputs/apk/github/release`),
Stockholm, 26 Oct 2026 and 14 Nov 2026. The screenshots and the launch
recording are in `/tmp/sweep`, `/tmp/cres.png`, `/tmp/run.mp4` on the Mac
(not kept in the repo). Nothing in the app was changed for this document.

---

## 1. What the hero is meant to do

The hero is the top of Today: the sky, the city and Qibla chips, the
countdown to the next prayer, and the rail. Its contract, as the code's own
comments state it (`src/screens/home/`, `src/boot/`):

- **The sky is the hour.** `skyModel.ts` cuts the day into five passages —
  night, dawn, day, sunset, dusk — from the day's own timings, and places one
  body (the sun by day, the moon by night) along each passage by its
  progress. The gradient's colours come from `theme/skyMoods.ts`
  (vibrant/realistic anchors, OKLab mixing), its light from `skyLight.ts`
  (Rayleigh tint, air mass, glow). It is painted at full strength whatever
  the theme; with the Sky theme the rest of the app takes its hue from it.
- **The content reads from the sky.** Ink, glow and the status bar's glyphs
  are chosen from the sky's luminance under each line (`skyInkAt`,
  `INK_SWITCH_LUMINANCE`), never from the theme.
- **The bodies live in a band.** On the phone the sky runs under the status
  bar and the countdown; the sun and the moon are confined to the band
  between the top row and the countdown block (`skyScene`), and the stars
  stay out of the countdown.
- **The countdown turns with the clock.** One tick a second, aligned to the
  clock's own seconds, only while the screen is active (`HeroToday`).
- **A launch opens on the prayer and runs to now.** The last screen is kept
  as a picture with the hero drawn *posed* at the start of its interval
  (`boot/poseHero.ts`, `native/LaunchSnapshot.ts`); on the next launch the
  picture is shown first, the live hero takes over under a fade, and runs
  from the prayer to now in under a second (`boot/launchWarp.ts`), timed by
  frames drawn so a stall never ends it early.
- **A tap on a row aims the hero there.** The countdown and the rail follow
  the chosen row until it passes, then hand back (`aimAt`, `onExpire`).
- **Two switches of mood a day** — at sunrise and mid-sunset — are
  crossfaded as a whole screen (`crossfadeScreen`).

## 2. How it was examined

- All of `skyModel.ts`, `HeroSky.tsx`, `TodayCard.tsx`, `skyLight.ts`,
  `moon.ts`, `heroSkyBand.ts`, `HomeStatusBand.tsx`, `HelpMihrabChip.tsx`,
  `boot/launchWarp.ts`, `boot/poseHero.ts`, `boot/bootTimeline.ts`,
  `native/LaunchSnapshot.ts`, `LaunchSnapshot.kt`, `theme/skyMoods.ts`, and
  the tests `heroSky`, `heroSkyEdgeCases`, `launchWarp*`, `todayCountdown`.
- A cold start on the phone recorded with `screenrecord` (60 frames at
  10 fps, plus 20 fps over the hand-over), with the `[boot]` line and the
  `MihrabSnapshot` lines from logcat for the same launch.
- A sweep of the day on the emulator: 03:00, 05:00, 05:45, 06:40, 07:00,
  09:00, 12:00, 15:00, 16:00, 16:25, 16:50, 17:30 (sunrise 06:45, Dhuhr
  11:37, Maghrib 16:19, Isha 18:14), and a crescent night (14 Nov, 20:00).
- Pixel measurements of the moon, its halo and the stars on both devices.
- A tap on a row (aim), on the emulator.

## 3. Findings

Each item: what was seen, why, the fix, how to prove it. "Confirmed" means
seen on a device and traced to the line; "measured" means a number was taken;
"to verify" means the code says so but it was not reproduced.

### Bugs

**B1 — The dark side of the moon is a hole in the sky. Confirmed.**
`HeroSky.tsx` draws the moon as a whole lit disc with the shadow laid over it
"in the sky's own top colour" (`<Moon shadow={top}>`, line ~290; the run
layers do the same with `moonFrame.top`, line ~416). But the moon is never
drawn at the sky's top: `skyScene` puts it in the band below the top row,
where the three-stop gradient is already much lighter, and the moon's own
halo lightens the sky around it further. On the 14 Nov crescent the shadow
measured RGB (8, 16, 46) — the gradient's top — against (44, 56, 106) for the
sky beside the moon at the same row: a black disc with a sliver of light on
it, instead of a crescent in the sky (`/tmp/moonzoom.png`). The full moon of
26 Oct hides it (`FULL_MOON_ABOVE`), which is why it was not seen before.
*Fix:* do not fill the shadow at all — draw only the lit part. Build the lit
path as the complement of `moonShadowPath` (the lit limb's semicircle closed
by the same terminator, sweep flags swapped) and fill it with `lit`; the disc
below `NEW_MOON_BELOW` keeps its faint whole-disc ghost. No `shadow` prop,
nothing to keep in step with the gradient, and the halo shows through the
dark limb as it does in the sky. *Verify:* a unit test that `moonLitPath`
and `moonShadowPath` together cover the disc (sample points inside the
circle: exactly one of the two contains each), the emulator crescent at
`2026-11-14 20:00` and a gibbous at `2026-11-20 20:00` with a pixel read
beside and inside the dark limb (same colour within a few units). *Done:*
`moonLitPath`, the complement test, and the 14 Nov crescent on the emulator
is a crescent in the sky.

**B2 — The stars stand in two straight lines. Confirmed.**
`Stars` places each star with `sceneYOf(scene, y / 100)`, the same mapping as
the bodies, and `skyScene.y` maps the model's body range 0.08–0.30 onto the
band and clamps everything outside it (`spread`). The field is written in
card percentages 6–44 (`STAR_FIELD`, `STAR_FIELD_DENSE`): every star past 30
lands on the band's floor, every one under 8 on its ceiling. On the emulator
(1080×2400) five of the nineteen stars sit at y 599–607 px (x 63, 290, 410,
710, 712) and two at y 460–461; on the Pixel a cluster at y 548–555 px
spans 119 px. The eye reads a row of dots at the moon's height, not a field.
The edge-case test only asserts the stars stay *inside* the band, so it
passes. *Fix:* give the stars their own mapping in `skyScene` — `starY(f)`
spreading the field's own range (0.04–0.46) over the whole band with no moon
margin — and use it in `Stars` and `Twinkle`. The three twinklers are stars 1,
5 and 10; 5 and 10 are both on the floor today, so they will move. *Verify:*
extend `heroSkyEdgeCases` ("the stars keep their order and spread": for every
band the mapped y values are strictly increasing in the field's y, and the
span used is at least 80 % of the band), a screenshot at 03:00 and 17:30
with no two stars within 3 px of the same row unless the field says so.
*Done:* `skyScene.starY`, the order-and-spread test; the 03:00 sky on the
emulator is a field.

**B3 — The sun is up before it rises. Confirmed on screen, a model choice in
code.** At 06:40, four minutes before sunrise, the sun is a whole yellow disc
at the band's foot, left; at 16:00, nineteen minutes before Maghrib, the same
on the right. `skyModel` places a body at the horizon at y 0.30 and
`skyScene` turns that into "the largest body still clears the countdown" — so
the horizon is a line the disc sits *on*, never one it sinks *through*. In
the dawn and sunset passages the sun is therefore drawn fully for the whole
twilight. *Fix:* in dawn and sunset, clip the sun to the band's floor and let
its centre go below it: altitude from `moon.ts`'s `sunAltitude` (already
there) mapped so that the disc is half-hidden at sunrise/sunset and gone by
−6° (civil twilight). Keep the glow — the glow is what dawn looks like. The
run layers need the same clip (`SkyRunLayers`). *Verify:* sweep 06:30, 06:40,
06:45, 06:50, 07:00 and 16:05–16:30 on the emulator; a test that
`skyFrame` reports `body.below` (the fraction hidden) rising to 1 as the sun
goes under. *Done:* `below` on the sun, a clip at the horizon in the live
sky and a clipped view in the run layers; 06:40 is a half sun coming up,
16:25 a sun going down behind the Help chip.

**Looked at and found sound.** `sceneTop` (`statusBarInset + topRowH +
SPACING.md`) is the top row's foot — the row's own bottom margin lies inside
the band, which is what the comment in `skyScene` intends. The hero's and
`HomeStatusBand`'s `<StatusBar>` elements rely on React Native's props stack,
so the hero's style comes back by itself when the band unmounts on the
scroll up. `sceneBottom` carries the foot bleed. The pose twin is derived,
not stored, so no frame shows an old pose with a new target. Nothing to do in
these.

### Optimisations

**O1 — The first paint waits 430 ms for a cache status it does not draw.
Measured.** The `[boot]` line of a cold start on the Pixel (19:05:34, 2.33.0):

    index=0 app=4 home=55 settings=101 load=154 tz=181 week=182
    status=608 past=609 ready-cache=610 commit=646 raf=735 paint=786

The week is in hand at 182 ms; the state is not published until 608, because
`usePrayerDay` awaits `getCacheStatus(...)` before it (`statusPromise`, line
~471, collected at ~525) and keeps only a boolean from it, `needsCacheFill`,
to start a *background* fill. For a calculated place (Sweden, Morocco,
Algeria, Indonesia, Türkiye…) the week never touches the cache blob, so the
status call is the first thing that does: `loadV2` waits for the method
currency read, runs the launch sweeps (`getAllKeys` on the first launch after
an update), reads the whole `prayer_times_cache.v2` row and parses it. All of
it on the critical path, for a screen that does not need it. The comment
twenty lines below ("what the screen is waiting for, and what it is not")
already made the same argument for `widgetWeek` and moved it off the path;
`needsCacheFill` was left on it. On this launch the live screen was committed
at 646 ms and the picture's fade asked at 785 ms; moving the status off the
path brings both forward by roughly 400 ms, and the launch run with them.
*Fix:* publish the state as soon as the week is built; resolve
`statusPromise` afterwards and kick the fill from its `.then`. Keep the
generation guard on that continuation. *Verify:* `[boot]` on the phone three
cold starts before and after (`adb logcat -c; am start; grep '\[boot\]'`),
expecting `commit` under ~250 ms for Stockholm; the cache-fill tests still
pass; the fill still starts (log line or test with a mocked `getCacheStatus`).
*Done, with a finding on the way:* the marks put inside `loadV2` showed the
430 ms was not the blob at all — `v2=149 … v2-lists=324 v2-swept=338
v2-read=341 v2-parsed=343`: 175 ms waiting for the correction lists' read
(`methodCurrency.hydrate`: one `AsyncStorage.getItem` per key, in turn, plus
the clock skew's), 14 ms of sweep, 5 ms of read and parse. Two changes: the
lists are read with one `multiGet` alongside the skew (8–13 ms now), and the
status is collected after the state is published (`fillLater`). Three cold
starts after: `commit=237/246/252 paint=423/467/422 run=613/662/607`,
against `commit=365–399 paint=544–557 run=701–759` before — about 140 ms
earlier on the commit, 100 ms on the paint and the run.

**O2 — The run begins ~300 ms after the fade ends. Measured, cause to
verify.** In the recording the picture's fade was asked at +785 ms after
`js0`; `MOUNT_GRACE_MS` (80) + `FADE_MS` (220) end it ~300 ms later and
`WARP_AFTER_HIDE_MS` (320) is meant to start the run right then. The first
frame of the run came ~600 ms after the ask (frame 28 at 10 fps, hero chip
already visible at frame 24). So the run waited on `ready` — the native
value's listener in `SkyRunLayers` — or on a JS stall, for ~300 ms, during
which the live hero stood posed. *Fix:* first instrument: `bootMark('run')`
in `begin()` and `bootMark('sky-ready')` where the listener fires, and read
three launches. If `sky-ready` is the late one, mount the run layers earlier
(their mount is gated on `useAfterFirstPaint`? — check `TodayCard` ~1710)
or start the run on the fade's clock when the layers are within a frame.
*Verify:* the two marks, and the recording again: the run's first frame
within 350 ms of `hide asked`.
*Done — and the diagnosis was wrong.* With the marks in place, `sky-ready`
comes 30–100 ms after the commit and `run` 320 ms after the fade's ask,
which is HomeScreen's layout effect of the commit, not a step after the
paint (the logcat line for the ask is written when native gets to it, which
in the busy first second is 100+ ms later). Six launches ran on time; the
400 ms the recording showed was a JS stall on the first launch of the day,
which the frames-drawn timing then absorbed as designed. Kept: the two
marks (printed after the `[boot]` line as `[boot] run=…`), and the run now
waits for the ask itself rather than assuming it follows the hero's render
(`onHideRequested`, capped at `WARP_HIDE_WAIT_MAX_MS`) — the same timing
on every launch seen, made explicit and tested.

**O3 — The rail is laid out again every second. Minor.** `rail` (TodayCard
~505) recomputes `from`/`span` from twenty `eventAt` calls each tick and the
fill's width is a string with two decimals, so Yoga lays the track out every
second for a change under a pixel for most of an interval. *Fix:* memoise
`from` and `span` on `(today, target.at, dayClock, minute)`, compute `pct`
from them; round the width to the device pixel (`PixelRatio`) so unchanged
widths are the same string and skip layout. The launch run's unrounded slide
is kept by rounding to pixels, not percents. *Verify:* a test that the rail's
width string is unchanged between two ticks a second apart mid-interval;
`todayCountdown.test.tsx` still passes. *Done:* the width is rounded to a
quarter of a percent (a pixel of a 400 dp track); the memo split was not
worth its complexity once the layout was gone.

**O4 — `Twinkle` runs three native loops all night, also under the kept
picture and for the posed twin. Minor.** The twin (`frozenAt` set) mounts its
own `HeroSky`, and with it a second `Twinkle` and a second set of star
circles, for a hero nobody sees. *Fix:* pass `still` to the twin's sky: no
`Twinkle`, no halo animation. *Verify:* count `Animated.loop` starts in a
render test of `TodayCard` with an interval (expect 3, not 6). *Done:*
`HeroSky still` on the twin; the source assertion in `skyTheme.test.ts`.

**O5 — The halo's gradient is in bounding-box units. To verify on a tablet.**
`RadialGradient r="…%"` with the default `objectBoundingBox` scales with the
sky's width and height separately, so the halo is a circle only where the sky
is square. On the Pixel the sky is near enough (luminance right vs down at
60 px: 124.8 vs 133.6; at 200 px: 94.3 vs 100.6). On an iPad's 1100 dp-tall
sky, or a Duo page, it is an ellipse. *Fix:* `gradientUnits="userSpaceOnUse"`
with `r` in dp of the shorter side (`glowCy` already converts dp to the box;
it can go). *Verify:* `heroSky.test.ts` source assertion updated; iPad
simulator screenshot at 03:00, the halo measured along two axes. *Done* in
the live sky and the run layers (`userSpaceOnUse`, radius as a percentage of
the sides' geometric mean, so the area is unchanged on the phone); the iPad
screenshot is still to take.

### Look and feel

**L1 — The moon vanishes at Fajr and appears at Isha; the sun at the
horizon is whole (B3).** At 03:00 the full moon is drawn; at 05:00 ("Sunrise
in") the sky has no body at all, and at 16:25 ("Isha in") none either, though
a full moon rises at sunset and sets at sunrise. The bodies are placed by
passage progress, not by where they are: the moon's track is Isha→Fajr
whatever its phase, so a crescent that in fact set two hours after sunset
crosses the whole night. *Proposal (the "truth" option):* place the moon by
its real altitude and azimuth (`moon.ts` has the phase; add a cheap
position — Meeus's low-precision lunar longitude/latitude is ~40 lines and
good to a degree) in every passage where it is above the horizon, fading
through dawn as the sky brightens (`stars` already does this); keep the sun
on the passage track by day (its real track is what the passages encode).
*Alternative (the "picture" option):* keep the tracks, but fade the moon in
through dusk and out through dawn with the stars, so there is no instant a
body pops. The picture option is an afternoon's work; the truth option a
day's, plus a test against USNO/JPL rise–set times for three cities. Either
removes the pop; only the first makes the crescent's evening-only appearance
right, which a reader who watches the sky will notice. *Done, the picture
option:* `alpha` on the moon, following the stars through dawn and dusk.

**L2 — The full moon's halo at 03:00 reaches under the status bar and the
Qibla chip.** `HALO_MAX_R` 38 % of the sky, centred on a body in the band —
at the top of the band the halo covers the clock. It reads as a torch rather
than a glow when the moon is at the band's ceiling. *Proposal:* cap the halo's
centre-to-edge reach at the band (fade the gradient to 0 by the sky's top
edge: an extra stop at the fraction where the top row sits) — the ink switch
for the status bar then also stops flickering between the halo and the sky.
The run layers' halo gets the same stop. *Done* as a fade painted back in
the gradient's own colours from the top edge to the band's top (`topFade`),
in the live sky and per gradient layer of the run.

**L3 — The band is a sliver on a long table.** With "first time until"
lines on every row the band on the Pixel is ~62 dp; the moon sits on the
countdown's shoulder and the stars (B2) crowd the same rows. `SKY_CRAMPED_BELOW`
hides the bodies only below ~40 dp. *Proposal:* once B2 spreads the stars,
revisit the threshold against the dense table: a body wants ~90 dp; under
that draw the moon at half size rather than none. *Not done:* with B2 in,
the band on the phone reads fine at 62 dp; a half-size moon would be 13 dp
across. Left as it is.

**L4 — Aim: nothing says the hero is aimed.** After a tap on Isha at 09:00
the eyebrow reads "Isha in", the rail "Sunrise → Isha", the row carries a
small square — and the hero itself looks exactly like the ordinary one, so the
reader who forgot the tap sees the app counting to the wrong prayer. *Proposal:*
a one-word trailer in the eyebrow ("Isha in · chosen" / the row's marker in
the eyebrow's colour) and a tap on the eyebrow to clear it, matching the
row's own toggle. Strings in 13 locales. *Verify:* `todayCountdown` test for
the eyebrow with `chosen`. *Done:* "Isha in · chosen", a tap on the line hands
back, `home.chosenTarget` in 13 locales, the eyebrow test.

**L5 — The system splash flashes dark between the launcher and the picture.**
Frames 1.25–1.45 s of the recording: a dark-grey splash with the icon, ~150 ms,
then the kept night sky. `AppTheme` leaves `windowSplashScreenBackground` to
Material's default. *Proposal:* set it to the page colour per `values` /
`values-night`, and `windowSplashScreenAnimationDuration` 0 — the picture is
the splash. iOS has the same question in `LaunchScreen.storyboard`. *Done*
for Android (`values-v31`, `values-night-v31`); iOS's launch screen already
follows `systemBackgroundColor`, so nothing to do there.

## 4. The plan

Three waves, each shippable on its own. Estimates are working days for one
person on the Mac with the emulator and the phone; every wave ends with the
checklist in §5.

**Wave 1 — the bugs and the launch (≈2 days).**

1. O1: publish the week before the cache status; fill from the status's
   continuation. Half a day, with the `[boot]` measurement before and after
   and a test for "the fill still starts".
2. B1: the moon's lit path replaces the shadow fill, in `Moon` and in
   `SkyRunLayers`; `moonShadowPath` stays for the tests and the complement
   test is added. Half a day, emulator crescent and gibbous.
3. B2: `skyScene.starY`, `Stars` and `Twinkle` on it; the edge-case test
   grows the order-and-spread assertion. Half a day.
4. O2: the two boot marks, three launches read, and the fix the marks point
   to. Half a day.

**Wave 2 — the sky's truth (≈2 days).**

5. B3: the sun clipped at the band's floor through dawn and sunset, with
   `body.below` in the frame, in both the live sky and the run layers. A
   day, with the sweep at five-minute steps round sunrise and Maghrib.
6. L1, the picture option first: the moon fades with the stars through dusk
   and dawn (no pop at Isha and Fajr). Half a day. The truth option
   (real altitude/azimuth) is written up as its own item below and done
   only if Hassan wants the crescent's evening to be right.
7. L2: the halo fades to nothing by the sky's top edge. Half a day.

**Wave 3 — polish (≈1.5 days).**

8. O3, O4, O5 — the rail's pixel rounding, the still twin, the halo in user
   units. Half a day together.
9. L4: the aimed hero says so, 13 locales. Half a day.
10. L5: the splash background per night mode; the iOS launch screen checked.
    Quarter day.
11. L3: the dense-table threshold, after B2 — measure on the Pixel with the
    Mālikī rows on. Quarter day.

**Deferred, decided by Hassan:** L1's truth option (the moon placed by its
real position, ~1 day plus a rise–set test against published tables for
Stockholm, Casablanca and Jakarta).

## 5. Verification, every wave

- `npx tsc --noEmit`, `npx jest` (the hero's own: `heroSky`,
  `heroSkyEdgeCases`, `launchWarp`, `launchWarpSimulation`,
  `todayCountdown`, `moon`, `skyLight`, `skyTheme`), `npm run lint`.
- The emulator sweep (`~/Documents/mihrab-shots/sweep.sh 1026 0300 0500 0545
  0640 0700 0900 1200 1500 1600 1625 1650 1730`) laid out as a sheet and read
  against the previous wave's; the crescent at `2026-11-14 20:00`.
- On the phone, installed over the existing app: a cold-start recording
  (`screenrecord`, 6 s) and the `[boot]` line, three launches; the aim tap;
  Reduce Motion on (no run, no twinkle); the largest font size; Arabic
  (RTL: the rail's labels, the time at the far end, the moon's tilt is a
  physical side and must not mirror).
- iPad simulator and the Duo for O5 and the band (`ios.py launch`).
- CHANGELOG "Unreleased" entries per item; `docs/design/sky-palette.md` and
  `ARCHITECTURE.md` §6 updated where the sky's drawing changes (B1, B3, L2).

## 6. What was not done here

- Open after the implementation: the iPad and Duo screenshots for O5; the
  Arabic, Reduce Motion and large-font passes on the phone; a day's sweep
  on the iOS simulator (the clip and the fade are the same SVG, but iOS
  draws it with its own renderer). L3 is left as it is (see above).
- The "truth" option for the moon (its real altitude and azimuth) is still
  Hassan's call.
- Two suites unrelated to the hero were red on the Mac before this work:
  `nationalTables` and `providerMatrix` pinned days (2026-10-14, 10-17)
  that this morning's table refresh moved out of the bundled seeds
  (the seeds now start 2026-10-19). `nationalTables` reads its day from the
  seed now; the matrix's golden instants for the two MUIS places were
  regenerated under TZ=UTC. The mirror job trimming the seeds past a pinned
  day will do this again unless the harness's dates move with the seed.
- Arabic/RTL, Reduce Motion, font scaling and the tablet were not exercised
  in this pass; they are in §5 for each wave.
- The JS cost of the one-second tick was read, not profiled: `HeroToday`
  re-renders once a second (the countdown text, the rail), `HeroSky` once a
  minute, the moods and the ink are memoised. Nothing suggested it matters;
  O3 is the only per-tick saving found.
