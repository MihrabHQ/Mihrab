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
- [ ] Live Activity (Android 16 chip and notification) on both clocks.

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
- [ ] Live Activity on both clocks.

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
