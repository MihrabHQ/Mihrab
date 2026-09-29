# Device pass for the `rewrite` branch

Everything on `rewrite` that tests in CI or in jest cannot prove. Work
down the list on the `rewrite` branch after `npm ci` and
`cd ios && pod install`. Record each result, and every failure with its
steps, in the progress log of `docs/rewrite-plan.md`.

## 0. Builds

- [ ] `npx tsc --noEmit` and `npx jest` are clean.
- [ ] `scripts/contract-test-native.sh` passes. It compiles the Swift
  changes, which nothing has compiled yet: fractional queue times and
  `WallClock.localCalendar`.
- [ ] Android builds with the ported screens patch:
  `npm run android:assembleFdroidRelease`, and the beta build.
- [ ] iOS simulator Debug and Release build.
- [ ] `scripts/build-catalyst.sh` builds, **signs and notarises** the Mac
  app with React built from source. Check the new gate's line: "Mac
  minimum: macOS 12.1 (widgets: macOS 14.0)". Check `git status` is
  clean afterwards (the script puts `Podfile.lock` back).

## 1. Android phone (connected, `npm run android`)

- [ ] **Rotation touches (screens patch).** Open a screen pushed on a
  stack (Settings → any page), go back so it is in the background, rotate
  twice, open it again. Tap and scroll buttons with a real finger; each
  must respond. Repeat with split screen.
- [ ] **Release build, R8 optimize rules (AGP 9).** Install the release
  build. Walk Today, Quran (muṣḥaf and translation), tasbih, log,
  settings, sync, backup. Nothing crashes, and nothing is missing that
  reflection would need.
- [ ] Unmaintained libraries through the interop layer: notifications
  and adhan (notifee), secure storage (sync keys survive a restart), the
  compass (sensors), blur, location.
- [ ] Status bar over the Home sky and the page (the `translucent` props
  are gone, since edge-to-edge does it).
- [ ] **Widgets, v2 payload.** Every widget in Arabic, Swedish and
  English, on a 12-hour and a 24-hour clock, light and dark. Times and
  next prayer are right, and `drawing from payload v2` is in logcat.
- [ ] Log Today and Tasbih widget taps reach the app.
- [ ] **Thai calendar (WallClock).** Phone language Thai (ไทย), app in
  English: every widget shows today's times and the right next prayer,
  not the last day of the payload. (On the JVM the old WallClock read the
  date as year 2569; whether Android did is what this finds out.)
- [ ] Live Activity (Android 16 chip and notification) on both clocks.
  It rolls from one prayer to the next and past ʿIshāʾ into tomorrow by
  itself, with the app closed. The "at" time beside the countdown is the
  prayer's own time.
- [ ] **Time zone change.** With a widget placed, change the phone's time
  zone in Settings. The widget starts the app's refresh by itself; logcat
  shows "today's times were built at UTC…". It then shows times for the
  new zone.
- [ ] With the First Third on: after Maghrib the widgets and the Live
  Activity count down to it, and after midnight they do not show it as
  that morning's.
- [ ] **Update over the old build with widgets placed**, without opening
  the app. The widgets still draw, from the stored v1. After the app runs
  once, the v1 key is gone and they draw from v2.

## 2. iPhone simulator

- [ ] App launches (scene life cycle) and the widgets draw from v2.
- [ ] **Non-Gregorian calendar.** Settings → General → Language & Region
  → Calendar: Buddhist, then Japanese, then Islamic. The prayer widget
  shows today's times and the right next prayer on each.
- [ ] 12/24-hour × en/sv/ar × light/dark on the widgets.
- [ ] Tasbih and Log Today widget taps. Queue a few, **install the
  `rewrite` build over the 2.27 App Store build** with taps still
  queued, open the app, and check none were lost (the fractional-time
  fix).
- [ ] Live Activity on both clocks. Leave it running past ʿIshāʾ with the
  app closed: the background refresh moves it to tomorrow's Fajr. Swipe it
  away and open the app: it comes back, current.
- [ ] If possible, a Live Activity running across the night the clocks
  change: the countdown ends at the right minute.

## 3. iPad (simulator) and this Mac

- [ ] iPad: the facing-page spread. The "finish day" pill and the
  portion-end marker, and "done", on a plan by length and a plan by date.
- [ ] Mac: install the notarised zip from step 0. It launches, the
  widgets register and draw, and `brew` users are Apple silicon on 12.1+.
- [ ] Mac: leave the reader open across maghrib on a date plan. The pill
  and the marker move to the new day by themselves.

## 4. Khatmah, on one device and across sync

On the phone and the Mac, paired:

- [ ] Start by length, by date, and from the page you are on. Pages turned
  in the muṣḥaf are counted. The page mark sets and clears.
- [ ] "Done" moves to the next portion on both plan types. "Previous day"
  takes it back on both, including with a page left unread behind you.
- [ ] Switch length ↔ date; the reading is kept.
- [ ] Delete, then start again. Finish a whole khatmah and start another.
- [ ] Each device starts a khatmah before they sync. After the sync both
  show the one with more reading. Restarting it keeps you on it.
  Deleting it leaves none.
- [ ] With only a skipped page left there is no "done" button, and Home
  offers the skipped page.

## 5. The Glance widgets (Phase 4 gate)

The measuring build: `./gradlew assembleFdroidRelease
-PmihrabGlanceWidgets=true` (and `bundlePlayRelease` the same way, in its
own invocation). Each Glance card is in the picker as "… (Glance)" beside
the card it ports. Record the numbers in the 4.2 table of
`docs/rewrite-plan.md`; the pass criteria are there.

- [ ] The flag build assembles at all (first time under AGP), and the
  default build's APK has no `androidx.glance` classes.
- [ ] APK size with and without the flag, F-Droid and Play.
- [ ] Resize, on the Pixel launcher, One UI, and EMUI or Lawnchair: each
  Glance card beside its twin at 1×1 to 4×4, upright and sideways. The
  same variant at every size (compact / strip / list; the Log and Reading
  tiers; the graph arriving), and no line cut.
- [ ] Android 7–11 (emulator): the card is rounded and tinted, the
  countdown ticks.
- [ ] en/sv/ar (RTL), 12/24 h, the opacity, tint and highlight settings:
  each Glance card matches its twin, apart from the differences listed
  under 4.3.
- [ ] Taps: tasbih +1/Reset/Next and a Log chip (and its undo within a
  minute) move the card at once and reach the app; the refresh glyph
  starts a sync; every other tap opens the same screen as the twin's.
- [ ] A home screen with only Glance cards: they roll over at midnight,
  move at each prayer time with the phone asleep, and redraw on unlock and
  after a reboot.
- [ ] Memory (`dumpsys meminfo`) and time from a payload write to every
  card redrawn, with all nine placed.
