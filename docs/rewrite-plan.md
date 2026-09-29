# Targeted rewrites: the four places the bugs keep coming from

> **Status (2026-09-28): P0.1, P1.1–P1.4, P1.6, Phase 2, P5.1 and P5.3 done; see the progress log.** Decision (Hassan,
> 2026-09-28): no rewrite of the app — React Native stays, and so does the
> language. Instead, rewrite the four parts where the history says the same
> kinds of bug keep returning, one shippable step at a time, riding along
> with ordinary releases rather than getting releases of their own.

## How to use this plan

Every step below is a task in the progress list. Each task does the same
three things, in order:

1. **Recheck the plan before starting.** Re-read this file. Re-measure what
   the step assumes (line counts, call sites, open bugs, what the previous
   step actually delivered). If the code has moved, fix the step here first.
2. **Do the step**, to its exit criterion. Each step is shippable on its own.
3. **Recheck the plan after finishing.** Write what happened into the
   progress log at the bottom — measured, not hoped — and correct any later
   step the result changes. A step that turns out not to be worth it is
   crossed out with the reason, not silently skipped.

## Why these four (measured on `main`, 2026-09-28)

The app is ~119,000 lines of TypeScript (491 files, 393 test files),
~8,800 lines of Swift/Objective-C and ~13,200 of Kotlin, 1,382 commits since
2026-04-10. Churn is commits touching a file since 2026-08-01.

| Area | Size | Churn | The bugs it keeps producing |
|---|---|---|---|
| App → widget / Live Activity data | payload in `buildWidgetPayload.ts`, `widgetBlocks.ts`, `MihrabLiveActivity.ts`; read by ~28 JSON field reads in `PrayerWidgetProvider.kt` alone, ~20 Kotlin and ~8 Swift date/time parse sites | widget files 41 + 29 + 29 | times sent as formatted strings and parsed back natively: the Live Activity never appeared on a 24-hour clock; 12-hour clock needed its own parser fix; the prayer widget archived 11 MB of re-parsed strings |
| `src/quran/quranState.ts` | 4,302 lines, 107 exports, 51 importers | 40 | a deleted khatmah came back; three reading trails fought over one marker |
| Release tooling | `release.sh` 1,195 · `build-catalyst.sh` 930 · `verify-release.sh` 478 · `build-ios-appstore.sh` 363 · `xcode-cloud.py` 502 · `appstore-metadata.py` 218 | 32 + 21 | of 31 entries in `release-log.md`, 27 needed a written lesson and 19 changed the release cycle itself; 5 test files test the scripts by searching their text |
| Android widgets | 5,232 lines of RemoteViews code + 18 layouts | 41 + 29 (provider files) | sizing: height budgets, resize, the picker's double 4×1 tile, the render crash (#31) |

And one debt that is an upgrade, not a rewrite: the Mac app is pinned to
Xcode 26 (`CATALYST_MAX_XCODE` in `build-catalyst.sh`): with React Native
0.83.1 the Catalyst build reports a macOS 10.15 deployment target that no
build setting reaches — most likely Hermes' prebuilt framework — and
Xcode 27 refuses anything below 12.0.

## Order, and why

```
Phase 0  Baseline ─────────────┐
Phase 1  Widget/LA data contract ──► Phase 4  Android widgets on Glance
Phase 2  Split quranState.ts          (needs Phase 1's payload)
Phase 5.1  RN upgrade spike (early, small — to learn how big 5 is)
Phase 3  Release tooling in TypeScript
Phase 5  React Native upgrade, Mac off Xcode 26
```

Phase 1 first: highest value, smallest, and Phase 4 builds on it. Phase 2
next: no user-visible change, lowers the risk of the most-edited area.
Phase 3 touches the one thing that must never break mid-release, so it
runs in shadow mode before it replaces anything. Phase 4 only proceeds if
its trial earns it. Phase 5's spike runs early so the upgrade's size is
known before it is scheduled.

## Phase 0 — Baseline

**0.1 Record the baseline.** Snapshot the numbers in the table above plus:
open issues per area, crash reports per version (App Store Connect
Analytics, Play vitals), widget-related reports. Store them in the
progress log. *Exit:* every later phase can say "before/after" with numbers.

## Phase 1 — One contract for everything the app hands its widgets

Today the app formats times for display, the natives parse those strings
back, and three platforms each keep their own idea of the payload's shape.

Target: one schema, generated types on all three sides, **times as typed
wall-clock data** — the date key plus minutes since midnight, as integers,
with the UTC offset they were computed under — and formatting done where
the text is drawn, with the user's 12/24-hour choice passed as a flag. One
helper per platform turns a wall-clock time into an instant where a native
needs one (countdowns, the Live Activity). A `schemaVersion` on every
payload.

*Changed at P1.1 (was "times as epoch timestamps"):* every prayer time the
app holds is a wall-clock string in the clock of the place it belongs to
(`src/prayer/timezoneShift.ts`, issue #56). Sending instants would quietly
re-render a stored location's table in the device's zone for anyone
travelling; sending the offset instead lets a widget notice that the
device's offset has moved on and ask for a refresh rather than draw a
stale table.

**1.1 Inventory.** Every value that crosses TS → native (widget payload,
widget blocks, Live Activity payload, the widget refresh path) and native →
TS (`WidgetLogQueue`, `WidgetTasbihQueue`): who writes it, who reads it, and
whether it is data or pre-formatted text. *Exit:* a table in this file.
**Done 2026-09-28 — see "Phase 1 inventory" below.**

**1.2 Schema and generation.** One schema (JSON Schema, or TypeScript types
the generator reads) → Swift `Codable` and Kotlin data classes, generated
by a script and checked in; a test fails when the checked-in code is stale.
Choose the generator (quicktype or similar) by trying it on the real
payload. The generated decoders must be lenient the way the widget's
hand-written one already is: only the fields a surface cannot draw
without are required; everything else is optional with a default, so a
missing or mistyped field costs one detail, never the whole payload (the
24-hour Live Activity bug was one strict field). Includes the wall-clock
helper per platform (parse, format 12/24 h, to-instant) that replaces the
16 hand-written parsers. *Exit:* generated types and the helper compile in
both native targets. **Done 2026-09-28** — `scripts/contract/widget-contract.js`
→ `npm run gen-widget-contract`; see the progress log.

**1.3 Contract tests across languages.** Today there are no native unit
tests at all. Add a Kotlin JVM test target and a Swift package test for the
decoders; the TypeScript tests write golden payload fixtures that the
native tests decode, and assert the decoded values — Android's reads
default silently, so "it decoded" proves nothing there. *Exit:* a payload
change that one side misreads fails CI. **Done 2026-09-28** (CI jobs live
once `ci.yml` next reaches GitHub) — see the progress log.

**1.4 Widget payload v2, written beside v1.** The app writes both; natives
read v2 when present and fall back to v1, so an app update and a widget
reading an old payload never disagree. Formatting moves into the natives.
*Exit:* all widgets on both platforms draw from v2, verified in en/sv/ar,
12- and 24-hour, light/dark. **Done 2026-09-28**, by an adapter rather than
by rewriting the renderers — see the progress log; the renderers move onto
the typed v2 model in 1.7.

**1.5 Live Activity payload v2** (iOS ActivityKit attributes, Android
service) — one payload for both platforms, where today there are two built
in two places with instants in two units. *Exit:* Live Activity correct on
both clocks, both platforms.

**1.6 The queues back to the app** (log, tasbih) on the same schema.
**Done 2026-09-28** — see the progress log.

**1.7 Remove v1** one release after 1.4–1.6 have shipped, with the dead
fields the inventory found — and move the renderers off the v1-shaped JSON
the 1.4 adapter hands them onto the typed v2 model, which is where the
remaining "HH:mm" parse sites go (on Android, the providers that Phase 4
does not replace first).
*Phase exit:* no native code parses a formatted time; one schema; contract
tests in CI.

### Phase 1 inventory (P1.1, 2026-09-28)

**Every channel between the app and its widgets and Live Activities:**

| Direction | What | Written by | Stored / carried as | Read by |
|---|---|---|---|---|
| app → widgets | `WidgetPrayerPayload`: rows, `days[]`, and the `today`, `practice`, `reading`, `hijri`, `tasbih`, `seasonal` blocks | `src/widget/buildWidgetPayload.ts`, `widgetBlocks.ts`, `collectWidgetExtras.ts`; pushed by `syncPrayerWidget.ts` / `republishWidgetPayload.ts` through `PrayerWidget.setData(json)` | iOS: App Group defaults `prayer_widget_payload_v1`. Android: prefs `prayer_widget` / `payload_v1` | iOS: one `WidgetPayload: Codable` (PrayerWidgetExtension.swift), decoded separately in six widget files. Android: six provider classes each read the JSON on their own with `org.json` (the Large/Small variants subclass them) |
| app → widgets | Appearance, outside the payload: language, UI style, OLED, highlight id/hex/dynamic, tinted, opacity (Android) | `syncWidgetUiHints.ts` and the appearance setters in `PrayerWidget.ts` | separate keys in the same stores | every widget |
| app → iOS Live Activity | `PrayerLiveActivityContent` — derived from the widget payload | `src/liveActivity/syncLiveActivity.ts` → `PrayerLiveActivity.start/update(json)` | ActivityKit `ContentState` (ios/MihrabLiveActivity) | `PrayerLiveActivityWidget.swift`; the app's background refresher re-derives the next prayer natively (`PrayerLiveActivity.swift`) |
| app → Android Live Activity | `MihrabLiveActivityPayload` — built separately, with ~15 localised words and the channel ids the alert button needs | `src/notifications/liveActivity.ts` → `MihrabLiveActivity.display(json)` | prefs `mihrab_live_activity` / `last_payload` | `MihrabLiveActivityModule.kt`, `MihrabLiveActivityService.kt` |
| widget → app | Log taps `{d: 'YYYY-MM-DD', p: prayer, t: epoch ms}[]` | iOS `WidgetLogQueue.swift` (AppIntent); Android `WidgetLogQueue.kt` (`widget_log_queue`) | JSON string via `takeLogQueue()` | `coerceLogQueue` in `widgetLogQueue.ts` |
| widget → app | Tasbih taps `{a: 'inc' \| 'reset' \| 'next', t: epoch ms, n?: run}` | iOS `TasbihWidget.swift`; Android `WidgetTasbihQueue.kt` (`widget_tasbih_queue`) | JSON string via `takeTasbihQueue()` | `widgetTasbihQueue.ts` |
| widget → app (iOS, Mac) | "a queue changed", no data | the widget posts a Darwin notification; `WidgetQueueWatcher` native module | event | `WidgetQueueWatcher.ts` → queue drain |
| Live Activity → app (Android) | Alert button: `epoch`, `name`, `mode`; the one-occurrence override kept natively (`alert_override_*`) | `MihrabLiveActivityActionReceiver.kt` | intent extras → `AdhanMuteToggle` headless task | `adhanMuteToggleTask`; cleared by `clearAlertOverride()` |
| widget → app (Android) | "rebuild the payload" | `WidgetRefreshHeadlessService.kt` | `WidgetRefresh` headless task, no data | `widgetRefreshTask.ts` |

**Data or pre-formatted text:**

- *Times, as text:* `rows[].time` is "HH:mm" (24-hour, data carried as
  text) and `rows[].display` the 12-hour text, absent on a 24-hour clock;
  the same pair in `sunriseRow`, `extraRows`, `days[].rows`,
  `today.prayers[]`, `nextPrayerTime`/`nextPrayerDisplay`, the Live
  Activity rows and `nextTime`/`nextTimeDisplay`.
- *Instants:* only the Live Activities carry them, in **two units** —
  iOS `nextEpochSeconds`/`prevEpochSeconds`, Android
  `nextEpochMs`/`prevEpochMs`. Android also turns its `days[]` rows into
  instants itself.
- *Dates:* `dateKey` "YYYY-MM-DD" (`days[]`, `today`, practice days `d`).
- *Localised words written by the app:* `dayLabel`, row `name`/`abbr`,
  `nextPrayerName`, `locationName`, Hijri `label`/`monthName`/
  `nextMonthName`, `surahName`, tasbih `label`/`labels`/`arabic`,
  `practice.since`, and every Live Activity label. These stay app-written
  in v2 — the thirteen locales live in the app — only times and numbers
  change form.
- *Everything else is plain data* (counts, page, streak, the practice
  day codes, Hijri numbers, khatmah numbers, `lastReadAt` in epoch ms).

**The parsers v2 replaces:** 16 hand-written "HH:mm" parsers — Swift 10
(`PrayerWidgetExtension.swift` ×5, `LogTodayWidget.swift` ×2,
`HijriWidget.swift`, `PrayerLiveActivity.swift`,
`PrayerLiveActivityWidget.swift`), Kotlin 6 (`PrayerWidgetProvider.kt` ×3,
`PrayerWidgetLogProvider.kt`, and two separate copies of `epochForDayTime`
in the Live Activity module and service). This replaces the rough "~20
Kotlin and ~8 Swift" in the table at the top.

**How strictly each side decodes:**

- iOS widgets: only `dayLabel` and `rows` required; every block decoded
  with `try?` — a bad block costs that block. Lenient, and right.
- iOS Live Activity: `nextLabel`, `nextTime`, `nextEpochSeconds`,
  `nextKey`, `rows` and each row's `key`/`abbr`/`time` required, the rest
  `decodeIfPresent` without `try?` — one mistyped field fails the whole
  payload. The app works around it by always writing `display` (the
  comment saying so appears twice in `syncLiveActivity.ts`).
- Android: ~260 `opt*` reads that turn a missing or renamed key into an
  empty default with no error, plus `get*` reads that throw into the error
  card every provider has had since #31. So a contract test there has to
  assert values, not just "it decoded".

**Dead or write-only fields** (removed in 1.7):

- Widget: `tomorrowEstimated` — no reader on either platform.
- iOS Live Activity: `locale` is sent but not decoded; `hijriLabel`,
  `locationLabel`, `compactMode`, `showSunrise`, `showHijri`,
  `showLocation` are decoded and never drawn.
- Android Live Activity: `sinceWord`, `progressFraction`, `locationLabel`,
  `compactMode`, `showSunrise`, `showLocation` are written and never read.

## Phase 2 — Split `quranState.ts`

The file reads as four sections: the store (shape, coerce, hydrate,
persist — lines ~1–1190), bookmarks and reading trails (~1190–1756), the
khatmah lifecycle (~1756–3088), and khatmah portions and schedule maths
(~3088–4324). **Measured in 2.1, those are not the seams.** The two khatmah
sections call each other — 22 calls from "lifecycle" into "schedule" and
34 back — so moving either one out as a block makes an import cycle. The
functions themselves have none: the call graph of the pure functions is
acyclic. So the file is cut by purity, not by position:

| Part | Functions | Lines |
|---|---|---|
| Pure khatmah model (units, done set, reach, holes, days, portions, today's cut, pace, plan transforms) | 72 | ~1,650 + ~100 of types |
| Khatmah writers (start, re-pace, progress, page toggles, position, reset, finish, step back, abandon) | 14 | ~820 |
| Marks: bookmarks, stars, reading trails (9 pure, 12 writers) | 21 | ~570 |
| Store: types and defaults, coerce (pure, ~510), hydrate, persist, subscribe | 47 | ~1,130 |

**2.1 Map and pin.** *Done 2026-09-28* — see the progress log.

**2.2 Extract the pure khatmah model.** *Done 2026-09-28* — see the
progress log. Four modules beside the existing `khatmahPace.ts` and
`khatmahDone.ts`, each importing only the ones before it:
`quranTypes.ts` (the blob's types, 493 lines), `khatmahProgress.ts`
(units, done set, reach, holes; 499), `khatmahSchedule.ts` (mode, days,
portions, today's cut, credit window, gap report; 586), `khatmahStatus.ts`
(today's state and pages, days left, finish target, behind-by, outgrown
pace, length for days left; 545). `quranState.ts` re-exports; 2,409 lines.

**2.3 Extract bookmarks, stars and reading trails.** *Done 2026-09-28* —
see the progress log. `readerMarks.ts` (577 lines) writes through the
store and sits above it, so the store could not re-export it without an
import cycle; its 12 importers were pointed at it in the same step
instead. `isReadingHere` deleted. `quranState.ts` 1,850 lines.

**2.4 Extract the khatmah writers.** *Done 2026-09-28* — see the
progress log. `khatmahActions.ts` (the 14 writers, 786 lines) above the
store, importers pointed at it in the same step; `khatmahEdits.ts` (the
pure edits only they apply, and the claim log's bound the coerce also
uses; 348) below it. `quranState.ts` is the store: 791 lines.

**2.5 Retire the compatibility layer.** *Done 2026-09-28* — see the
progress log. The store re-exports nothing; 48 files import each name
from the module that holds it. *Phase exit met:* the largest module is
786 lines (`khatmahActions.ts`; the store is 728), every module with
code has tests that import it directly (`khatmahEdits.ts` got its own
file), and every test is green.

**Found in 2.1, decided by Hassan (2026-09-29), done after the phase.**
Two devices that each started a khatmah before they synced kept BOTH live
plans after the merge, and every screen showed the earlier-started one.
Now one stays: the plan with more reading in it, even if started later;
with equal reading, the one started last (`oneLivePlan`, applied by the
merge, when a stored blob is read, and after every write). The other is
set aside (`supersededBy`), not abandoned: the marker is worked out again
from the merged plans every time, so devices that saw each other's
reading at different times still converge — the first version wrote the
choice as `abandonedAt`, which could leave no live plan at all (fixed
2026-09-29, see the progress log). `startKhatmah` also abandons a plan it
replaces, and any plan set aside, instead of dropping it, which could
otherwise come back from another device and win on reading.

## Phase 3 — Release tooling in TypeScript

The shell scripts encode years of lessons, and they are right — but they
can only be tested by grepping their source. The rewrite keeps every gate
and every lesson and makes each one a function that can be tested.

Constraints that do not move: `scripts/release.sh X.Y.Z` keeps working
with the same flags (Paperclip triggers it, and so do people), the log and
`RELEASE_EXIT=` line stay, signing secrets stay on the Mac.

**3.1 Inventory and design.** Every step, gate, flag and env var of the
five scripts; which tests pin which gate; a design for `scripts/release/`
(steps as functions, shell and API calls injected so tests can fake them).

**3.2 Port the read-only parts in shadow mode.** Preflight and verification
first. For two releases the old script decides and the new one runs beside
it, and any disagreement is written down.

**3.3 Port build and publish,** again shadowed where it is safe to be
(dry-run of the irreversible steps).

**3.4 Fold in the Python tools** (`xcode-cloud.py`, `appstore-metadata.py`)
so the release is one language.

**3.5 Switch over and retire.** `release.sh` becomes a thin wrapper; the
grep-the-source tests are replaced by behavioural ones. *Phase exit:* two
consecutive releases cut by the new tool with no manual step.

## Phase 4 — Android widgets on Jetpack Glance (only if the trial earns it)

**4.1 Trial one widget.** Port the smallest (Hijri, 185 lines, or Tasbih,
295) to Glance, reading the Phase 1 payload. Measure: lines of code, APK
size, resize behaviour on at least three launchers, the F-Droid build
(Compose compiler with Kotlin 2.1), memory and render time.

**4.2 Decision gate.** Continue only if the trial is smaller and sizes
correctly everywhere tested. Otherwise record why and stop here — the
Phase 1 contract already removes the parsing half of the widget bugs.

**4.3 Port the rest, one widget per release** (Streak, Reading, Log,
Prayer times last); the practice graph stays a bitmap inside Glance.
*Phase exit:* RemoteViews layouts deleted; widget fixes per release down
against the Phase 0 baseline.

## Phase 5 — React Native upgrade, and the Mac off Xcode 26

**5.1 Spike.** *Done 2026-09-29* — see the progress log. Branch
`spike/rn-0.87` (local, worktree `../PrayerApp-rn087`): React Native
0.87.1 with Hermes V1 builds for Android, the iOS simulator and Mac
Catalyst on Xcode 27, the Android and Mac builds launch, and every test
passes. It also found that the Mac's Xcode 27 break is not React Native's
at all, which reorders the phase: 5.3 no longer waits for 5.2.

**5.3 Unpin the Mac.** *Done 2026-09-29* — see the progress log. Catalyst
builds say iOS 15.2 (`[sdk=macosx*]` on the app target, and for the pods
in the Podfile), iOS stays at 15.1, `CATALYST_MAX_XCODE` and the Xcode 26
fallback are gone, and `build-catalyst.sh` builds, signs and smoke-tests
the Mac app with Xcode 27. The Mac app now needs macOS 12.1 (Hassan,
2026-09-29: no problem). Notarisation of an Xcode 27 build is proven by
the next release, which notarises as it always does.

**5.2 Upgrade to the current React Native** (0.87 now; 0.88 is due
2026-10-12). What the spike had to change, and what it left:
- *Done on the branch:* the version bumps and the template's Android
  changes (Gradle 9.4.1, Kotlin 2.2.0, AGP 9's two opt-outs, the jest
  preset's new package); four libraries up a version for code the new
  core no longer has (gesture-handler 2.33, screens 4.28, safe-area-context
  5.10, view-shot 6.0); `InteractionManager` (4 files) and
  `StyleSheet.absoluteFillObject` (9 files) replaced.
- *Left:* 51 type errors in 29 files from the strict TypeScript API, most
  of them ScrollView refs that now need instance types, the rest colour
  values — mechanical. The `react-native-screens` patch (the Android
  rotation fix for press rects) does not apply to 4.28 and is not
  upstream, so it is ported again. AGP 9 refuses `proguard-android.txt`;
  the optimize rules turn more of R8 on for the Play build, which then
  needs a full pass on the phone. The prebuilt React framework makes
  `codesign` refuse the Mac bundle ("bundle format is ambiguous" — the
  0.84 report, still in 0.87.1), so the Mac zip cannot be signed until
  that is worked around or React is built from source for Catalyst.
- *Costs:* the F-Droid APK grows about 9 MB (native libraries 7.7 MB over
  four ABIs, the Hermes V1 bundle 8.5 → 9.2 MB); the Mac app 130 → 189 MB.
  In return the Catalyst Release build compiles a third of what it did
  (about 2,250 compile steps → 840, 4 minutes), because React's core now
  comes prebuilt.
- *Still to prove on devices:* the libraries nobody maintains any more —
  notifee, encrypted-storage, sensors, blur, geolocation — build and run
  through the interop layer, but notifications, secure storage and the
  compass have to be checked on the phone; widgets, Live Activity, the
  muṣḥaf and sync as the step always said.
- *Estimate:* two to three sessions of work plus a device pass with the
  phone, taken as one release of its own rather than folded into another.

## Baseline (P0.1, 2026-09-28)

What every phase is measured against. Window: 2026-08-01 → 2026-09-28
(767 commits on `main`). "Fix-like" = subject says fix/stop/no longer/
never/crash/bug/wrong/fail or names an issue — a rough rate, compared only
against itself later.

| Area | Commits | Fix-like | Issues closed since Aug | Crash / ANR reports |
|---|---|---|---|---|
| Widget + Live Activity data and renderers (both platforms) | 119 | 18 | #31 (Android widgets stopped loading) | none attributed |
| `quranState.ts` | 40 | 8 | #41, #44, #53, #54 | none |
| Release tooling | 69 | 15 | — | — (the iOS 27 launch failure shipped through it: 38 opt-in crashes on iOS 27.0, 2.25.1 ×30 and 2.23.0 ×8) |
| Android widgets (providers, bitmap, layouts) | 73 | 11 | #31 | none attributed |

Open GitHub issues: none.

Crash and ANR reports (last 28 days):

- **App Store** (opt-in): iOS 27.0 — 2.25.1 ×30, 2.23.0 ×8, the launch
  failure fixed by 2.27.1 (283); iOS 26.6 — 2.21.1 ×9 (Sept 14–15, not seen
  in any later version).
- **Google Play**: one crash cluster, `rnscreens.ScreenFragment.<init>`
  IllegalStateException, 2.10.1 only (3 users, 23 days ago — the restore
  crash fixed in `MainActivity.onCreate`). Four ANRs, 1 user each, all in
  the system's text rendering — `libhwui GrTextBlob::Key::operator==` (2.25.1,
  13 events; once while notifee's foreground service ran), `libGLES_mali
  glTexSubImage2D` (2.25.1) and `GrTextBlobRedrawCoordinator` (2.18.4).

**Not in this plan, but measured:** the Android ANRs all sit in text
drawing, which in Mihrab means the muṣḥaf's native lines. One user, so no
pattern yet — watch it at each recheck, and investigate before it becomes
one. It is not a rewrite target.

## Progress log

| Date | Step | What happened | Plan changed? |
|---|---|---|---|
| 2026-09-28 | — | Plan written from the measurements above. | — |
| 2026-09-28 | P0.1 | Baseline recorded (section above). Sizes and churn re-measured: unchanged since the plan was written. | No change to phases. Added the text-rendering ANRs as a watch item outside the plan. |
| 2026-09-28 | P1.1 | Inventory written ("Phase 1 inventory"). Nine channels, not the five the step named: two separate Live Activity payloads (iOS in seconds, Android in ms), an appearance side channel, the Android alert button, and two data-less signals back to the app. 16 hand-written "HH:mm" parsers (10 Swift, 6 Kotlin). 14 dead or write-only fields across the three payloads. | Yes. Target changed from epoch timestamps to typed wall-clock plus the UTC offset (the app's times are wall-clock by design, #56). 1.2 now requires lenient generated decoders and ships the per-platform time helper; 1.3 asserts values; 1.5 merges the two Live Activity payloads; 1.7 drops the dead fields. |
| 2026-09-28 | P1.2 | quicktype tried on the payload and rejected: its Swift is synthesized `Codable` (one mistyped optional fails the whole payload — the bug being fixed) and its Kotlin needs Jackson, Klaxon or kotlinx.serialization where the app uses only org.json. Wrote a small generator instead (`scripts/gen-widget-contract.js`, ~730 lines) from a schema file with the field docs in it; it emits TS types, Swift with lenient `init(from:)`, Kotlin with lenient `fromJson`/`toJson`. `WallClock` written for all three platforms. Verified: 21 jest tests (generated files current, generator refuses bad schemas, the TS formatter matches the app's own for all 1,440 minutes × 2 clocks × 6 locales); Swift compiles in all three iOS targets (both simulator archs, no warnings) and a scratch decode of a deliberately broken payload dropped only the broken parts; Kotlin compiles (F-Droid release). Found on the way: for a time the clock shows twice (the night it goes back), `java.util.Calendar` picks the later instant and Foundation/JS the earlier — Android was an hour off the other two on that night. `WallClock.kt` now picks the earlier. | Yes, small. The Live Activity root type moves to 1.5 (it is designed there, from the same `Day`/`Row`/`Clock`). Whether the natives compute "next" themselves or the app passes it is decided in 1.4, with the builder in hand. The TS side has types only; a generated TS reader for the queues waits for 1.6. 1.3 must pin the DST choice on all three platforms. |
| 2026-09-28 | P1.3 | `contract-tests/`: 23 decode cases (whole payload, every kind of breakage, both queue shapes, how Swift writes an epoch) and 150-odd time cases (v1 parsing, 12/24-hour text in four marker styles, instants and offsets in six zones including both DST transitions in Stockholm and New York, Lord Howe's half-hour DST and Chatham's +12:45). The generator now also writes the TS reference readers and a type→reader registry for each native harness. `npm run contract-fixtures` records the app's answers in `fixtures.json`; `scripts/contract-test-native.sh` runs them through Swift (plain `swiftc`, 177 checks) and Kotlin (a JVM Gradle project compiling the app's own contract sources, 8 tests); both pass, and both fail on a deliberately broken fixture. CI gets `contract-swift` (macOS) and `contract-kotlin` (Ubuntu) jobs. Two traps found: jest gives each file its own `process.env`, so setting `TZ` never reached V8 — zone answers now come from a child Node started in the zone; and Gradle called the Kotlin tests up to date after the fixtures changed until the file was declared a task input. | No change to later steps. Noted: the JVM test uses Maven's org.json, not Android's own implementation; the two agree on everything the contract reads (typed values, `isNull`), and 1.4's device pass covers the rest. The CI jobs are unproven until `ci.yml` is pushed with the next release. |
| 2026-09-28 | P1.4 | Recheck changed the approach: rewriting 13 widgets' rendering to read v2 would be Phase 4's work done twice, so the natives read v2 through an adapter (`WidgetPayloadV1`, Swift and Kotlin, TS reference `widgetPayloadV1FromV2`) that hands the unchanged renderers the v1 JSON they draw, computed for the current minute. v2 is derived from the v1 payload in TS (`widgetPayloadV2FromV1`), so the two cannot disagree; the app writes both in ONE native call (`setDataV2`), and plain `setData` removes v2 so a stale v2 can never outrank a newer v1. Contract changes: `Day.estimated` (after ʿIshāʾ with no tomorrow, v1 put today's times under tomorrow's label at the top level; v2 says so), a First Third after midnight counts past 1440 on its own day, `builtAt` dropped (it made every push unique and would have defeated Android's redraw coalescing). Verified: jest round trip v1 → v2 → v1 is exact for 10 scenarios (midday, on a prayer's minute, after ʿIshāʾ with/without tomorrow, night marks, a First Third after midnight, no ʿIshāʾ at this latitude, every block, en/ar/sv, 12/24-hour) apart from the two fields not carried (`tomorrowEstimated`, read by nothing; practice `k`, superseded by `kw` and written as 0 only because the iOS decoder requires it); the Swift and Kotlin adapters match the TS reference on the 8 English scenarios (185 Swift checks, 9 Kotlin tests); Android emulator: a 2.21.0 install with Prayer times and Continue Reading widgets placed, upgraded to this build — logcat `drawing from payload v2`, both widgets drawn correctly (Arabic, 24-hour, Isha next with countdown); iOS simulator (Release): the app writes both keys (30 days, all blocks), and the extension's own `WidgetPayload` decoder reads identical content from v1 and from adapted v2. Full jest 394 suites / 6,031 tests, tsc clean, Kotlin and iOS builds clean. | Yes. The renderers move onto the typed v2 model in 1.7, which is also where the remaining "HH:mm" parse sites are removed (the phase exit is unchanged; its timing moves). Light/dark was not re-shot: the data path changed, the drawing did not. |
| 2026-09-28 | P1.6 | Taken before 1.5: smaller, and it found a real bug. Both iOS queues decoded their array whole, so one entry another writer got wrong emptied the queue — every Log Today tap or bead waiting in it. All three platforms now read each queue through the contract's types and a lossy top-level list reader (`WidgetContract.readList`, generated for Swift and Kotlin; the TS coercers read each item through the generated reader); each queue's own rules (date format, the five prayers, action set, run clamp) are unchanged and stay hand-written. The run length `n` became a `long` in the contract so an absurd count is clamped by the rule, not dropped by the reader — the TS tests pinned exactly that. Verified: 4 new list cases through TS, Swift (189 checks) and Kotlin (10 tests); the queue suites and the mirror tests (updated to the new code) pass; full jest 394/6,031; Kotlin and iOS builds clean. | Two rules now agree across platforms that did not before, both edge cases no writer produces: a fractional run length reads as one tap (TS used to floor it), and a run length written as text reads as one tap (Kotlin used to parse it). Cross-platform tests of the queue RULES would need the pure logic split from the platform storage code; not worth it for five-line rules already mirrored and pinned — left as is. |
| 2026-09-28 | P2.1 | Coverage of `quranState.ts` with every suite: 97.76% of lines, 87.84% of branches; `merge.ts` 98.03%. The gaps were not random — they sat on deletions and on the merge's tie-breaks: `abandonKhatmah` was never called by a test, nor the removal record the bookmark de-duplication writes, nor any same-millisecond tie in `mergeKhatmah` or `mergeFasting`. `quranStateCharacterization.test.ts` (21 tests) pins those, plus today's cut (dropped from a duration plan, dropped on restart, portions past today) and the disk failing (a store that cannot be read starts from the defaults once; a failed write does not hold up the next). After: 99.86% / 89.41%, `merge.ts` 100% of lines; the one line left is `isReadingHere`, which nothing uses. Map: 4,324 lines, 107 exports, 51 app importers — of the 50 the script resolved, 23 use only the store, 10 the store and the marks, 17 reach into the khatmah — and 38 test files. Two real bugs found and fixed (committed on their own, with 6 tests): a khatmah's day N was its start plus (N−1)×24 h, a day off after the night the clocks go back (`khatmahDayWhen`, `khatmahDayAnchor`), and the coerce's stale-day check did the same sum; both now step the calendar. Five test files that failed between 00:00 and 00:59 on autumn nights in Stockholm now build their dates the same way (`__tests__/fixtures/localDays.ts`). Verified: full jest 396 suites / 6,058 tests; the new and DST tests also in UTC and New York; tsc and eslint clean. | Yes. The four sections are not the seams (22 calls one way between the khatmah sections, 34 the other), so 2.2 as written would have made an import cycle; the pure functions' call graph has none, so the file is cut by purity: 2.2 the 72 pure khatmah functions as downward-importing layers, 2.3 the marks (deleting `isReadingHere`), 2.4 the 14 khatmah writers, the store last. Found and NOT changed: two devices that each start a khatmah before syncing keep both live plans, and both show the earlier one — written up under Phase 2 as an open question for Hassan. |
| 2026-09-28 | P2.2 | Recheck: the pure khatmah model re-derived from the call graph — 73 declarations, ~1,725 lines with their doc comments, no cycle among them — and 62 of them cut into three layers by depth: progress (units, done set, reach, holes), schedule (mode, days, portions, today's cut, credit window, gap report) and status (today's state, days left, finish target, behind-by, outgrown pace). The step as written had them in one `khatmah/` directory; they went beside `khatmahPace.ts` and `khatmahDone.ts` instead, which is how the repo already names these. The blob's types went to `quranTypes.ts` first, so no layer imports the store even for a type. The move is mechanical and was checked as one: every line that left `quranState.ts` is in exactly one new file, byte for byte, apart from `export` on 8 helpers another layer now calls and the gap memo's reset (a module's `let` cannot be assigned from outside, so the store's test reset calls `resetKhatmahGapMemo`). The plan edits only the writers apply (`withMarks`, `pinned`, `settled`, `withDaySnapshot` and five more) stayed with the writers. `khatmahModules.test.ts` pins the layering (fails on a deliberately wrong import, checked) and that every re-export is the layer's own function. One source-reading test followed the store's day to `khatmahProgress.ts`, and its negative checks now cover all four store files. Verified: full jest 397 suites / 6,063 tests, also in UTC; the khatmah suites in New York; tsc, eslint and a release Android bundle clean; the three layers 100% line-covered by the existing suites. `quranState.ts` 4,324 → 2,409 lines. | Yes. 2.4 takes the writers together with the pure edits only they apply (~1,000 lines, two modules if over). 2.5 also gives each new module its own test file — the suites still import through the store — and re-checks the four test files that mock `quranState`. |
| 2026-09-28 | P2.3 | Recheck found what 2.2's re-export approach would have done here: the marks write through the store (`updateQuranState`, `getQuranState`, `mergeRemovals`), so a store that re-exported them would import its own client — a cycle, harmless only while nothing reads an import at load time. So `readerMarks.ts` (the reading marker, bookmarks, stars and the rules for which a page turn moves; 19 declarations, 577 lines) sits above the store, and its importers — 6 app files, 6 test files — were pointed at it in the same step; the store re-exports none of it. The call graph confirmed the rest separates the same way: the marks and the khatmah writers never call each other, and the store calls neither (two apparent calls were `pinned:` object keys). `setQuranPrefs` stays with the store — it writes the prefs, not a mark. `isReadingHere` deleted (exported, used nowhere; the AyahActionSheet name is a local). Checked as in 2.2: every line that left the store is in `readerMarks.ts` unchanged except the four of `isReadingHere`. `khatmahModules.test.ts` now also pins that the store never imports `readerMarks`. Verified: full jest 397 suites / 6,064 tests, also in UTC; tsc clean; eslint no new warnings; both files 100% line-covered. `quranState.ts` 2,409 → 1,850 lines. | Yes. 2.4 moves the khatmah writers the same way (importers repointed in the step, no re-export), with their pure edits in a module below them; `quranState.ts` stays the store under its own name. 2.5 shrinks to 2.2's re-exports, the per-module test files and the four mocks. |
| 2026-09-28 | P2.4 | Recheck: the writers and the pure edits separate as planned, and the edits need nothing from the store except the claim log's bound (`KHATMAH_MARK_LIMIT`), so the bound moved down with them and the store imports it — the edits are a pure layer below the store, the writers a client above it. `khatmahEdits.ts` (a new plan's start, the day's snapshot and pinned cut, a dated re-pace, the claim log, the pinned position, keeping the read set and the high-water fields in step; 16 declarations, 348 lines) and `khatmahActions.ts` (the 14 writers, with `khatmahTracksPage`, the question every page turn asks before it writes; 786 lines). 23 importers pointed at them (7 app files, 16 test files); the store re-exports neither. Found on the way: the scripts' call-graph scan read `...pinned(` as a property access and missed every call made through a spread — harmless for 2.2 and 2.3, whose imports tsc checked complete, but it means 2.1's edge counts were low; the layering test, not those counts, is what holds the cut. Three tests followed the code: the pin test now reads the writers and the helper where they live and is stricter than before (it used to check only the code after `pinned`, which was near the end of the file, so the writers above it went unchecked); the day test's negative checks cover all seven store files; the QuranCard suite mocks the two pacing writers where the card now imports them. Checked as before: every line that left the store is in one of the two files unchanged (bar `export` on 13 helpers), except the "── Khatmah" banner, dropped. Verified: full jest 397 suites / 6,066 tests, also in UTC; tsc clean; eslint no new warnings; a release Android bundle; the three files 100% line-covered. `quranState.ts` 1,850 → 791 lines. | No change to 2.5. Every module is now under ~800 lines; what is left is 2.2's re-exports, the per-module test files and the four mocks. |
| 2026-09-28 | P2.5 | The 54 names the store still re-exported for 2.2's layers: 48 files (src and tests) now import each from the module that holds it, and the re-exports are gone — `quranState.ts` 791 → 728 lines. The four suites that mock the store were the risk the recheck named, and one was real: `notificationRoute` failed four tests, because the khatmah reminder now takes `activeKhatmah` from `khatmahProgress` and the store's mock of it no longer reached it. All four now mock each name where its importer takes it from; the other three passed anyway — the real functions answered the same, or were not reached — so their mocks had quietly stopped mocking anything. `khatmahEdits.ts` was the one module no test imported directly — covered, but only through the writers — so it has its own suite (16 tests: the pin and its date, the claim log's order and its no-op turns, the mirror never past a hole, rewind and fill, a new plan's start, the re-pace stamp, today's cut, the day's snapshot); three of them fail when the pin's or the re-pace's stamp rule is broken, checked. `khatmahModules.test.ts` now pins that the store re-exports nothing. ARCHITECTURE.md has a section on the modules and their order. Verified: full jest 398 suites / 6,082 tests, also in UTC; khatmah, store and sync suites in New York; tsc clean; eslint no new warnings; a release iOS bundle; every module 100% line-covered. | Phase 2 done. `quranState.ts` 4,324 lines → 8 modules, the largest 786. Carried out of the phase, not changed by it: the two-live-plans question for Hassan (above). |
| 2026-09-29 | 2.1 finding | Hassan decided the two-live-plans question: keep the plan with more reading, even if started later; with equal reading, the one started last. `oneLivePlan` (in `khatmahProgress.ts`, beside `isLivePlan`) applies it to the merge's result and to a stored blob as it is read, so the store never holds two live plans; the loser is abandoned at the later of the two starts, a date worked out from the plans alone, so both devices write the same thing. Reading is counted inside each plan's own span, so a plan begun at page 300 is not credited with the pages it skipped. The recheck found a second way in: `startKhatmah` dropped a live plan it replaced rather than abandoning it — unreachable from today's UI, which only offers a start when no plan is live, but under the new rule a dropped plan with more reading would come back from the other device and beat the new one, so it abandons it now. 9 tests (`khatmahOneLivePlan.test.ts`): both merge orders agree, progress beats recency and recency breaks a tie, reading outside a plan's span does not count, the decision holds when the loser arrives again, the store shows the kept plan after a sync, a stored blob with two reads as one, and a replaced plan cannot come back; three of them fail with progress ignored, one with the old drop, checked. Verified: full jest 399 suites / 6,091 tests, also in UTC (the merge property and two-device fuzz suites unchanged and green); tsc clean; no new eslint warnings. CHANGELOG and `docs/sync-conflict-rules.md` updated. | No change to later phases. Not done, and not asked: the losing plan's reading is not carried into the kept plan. |
| 2026-09-29 | P5.1 | Recheck: the plan's facts still held — 0.83.1 on the Mac, Xcode 27 selected with 26 kept beside it for Catalyst — and the current release is 0.87.1 (0.88 due 2026-10-12). Branch `spike/rn-0.87` in its own worktree, so main was never touched. First the baseline, measured rather than trusted: 0.83.1 still fails on Xcode 27 with the same 105 targets at macOS 10.15. The cause, found this time: iOS 15.1 is missing from the SDK's iOS-to-Catalyst version map in both Xcodes, so the Catalyst deployment target falls back to iOS 13.1 = macOS 10.15, which Xcode 26 allowed and 27 does not. That is why every earlier attempt failed — it set the macOS target, and Xcode derives it from the iOS one; a blanket override to 15.2 lowered the widget extension (16.1) and broke it; raising only what said 15.1 built 0.83.1 for Catalyst on Xcode 27, and the app launched. Then 0.87.1: package bumps and the template's changes; Android failed on AGP 9's refusal of `proguard-android.txt` and on two libraries' legacy-architecture code (safe-area-context, screens), iOS on three (gesture-handler, screens, view-shot); each fixed by the library's current version. The F-Droid release and beta build, and the beta ran on the emulator (API 37) to onboarding with no errors; the iOS simulator Debug build succeeds; the Catalyst Release build succeeds in 4 minutes and the app ran and drew Today from the Mac's own data. Jest: 7 failures from the two removed APIs, all fixed on the branch — 399 suites / 6,091 tests pass. Found and not fixed: 51 type errors in 29 files; the screens patch has to be ported to 4.28; `codesign` refuses the prebuilt React framework in the Mac bundle; the APK is about 9 MB bigger and the Mac app 59 MB. | Yes. 5.3 moves ahead of 5.2 and no longer depends on it: the Catalyst fix is one setting per side and works on 0.83.1 — it needs Hassan's yes on raising the Mac minimum to macOS 12.1. 5.2 is rewritten from the spike's list, estimated at two to three sessions plus a phone pass, as a release of its own. |
| 2026-09-29 | P5.3 | Hassan agreed to the Mac minimum going from macOS 10.15 to 12.1. Done without the React Native upgrade: `"IPHONEOS_DEPLOYMENT_TARGET[sdk=macosx*]" = 15.2` on the four configurations of the app project that say 15.1, and the same for every pod below 15.2 and for the pods project in the Podfile — conditional, so the iOS build keeps 15.1 (checked: iOS simulator settings 15.1, Catalyst 15.2 → macOS 12.1). `build-catalyst.sh` lost its Xcode-version pin and fallback; `--check-toolchain` now reports the selected Xcode, and `CATALYST_DEVELOPER_DIR` still names another. Verified with the real script on Xcode 27, notarisation skipped: built, Developer ID signature verifies, Keychain group and App Group sealed in, the extension signed and sandboxed, the smoke launch came up and wrote today's widget payload, `LSMinimumSystemVersion` 12.1, SDK 27.0. The first run stopped at the script's last gate — LaunchServices still knew a widget extension inside the spike's copy of the app, launched from /tmp in 5.1 and deleted afterwards, which would have blanked every widget on this Mac; unregistered it, and the second run passed every gate. `catalystDeploymentTarget.test.ts` holds the configuration; its first draft missed the app target's configurations (CocoaPods puts a line between `isa` and `buildSettings`) and passed with one removed — caught by breaking it on purpose, fixed, and it now fails that way. DISTRIBUTION.md and release.sh say what the cause was; CHANGELOG says the Mac needs 12.1. Full jest 400 suites / 6,095 tests, tsc clean. | The Homebrew cask already requires Ventura, so it needs no change. Notarising an Xcode 27 build is left to the next release, which does it anyway. |
| 2026-09-29 | 2.1 finding, review | A review of a79eb29 found the choice itself was unsafe to store. `oneLivePlan` wrote the loser's `abandonedAt`, which is permanent and one side's word is enough, from the reading the merging device could see — and folder sync merges the other device's file as it was when written. Phone (P 10 pages, Mac's old file Q 5) abandoned Q while the Mac (Q 20, phone's P 10) abandoned P: the next exchange left no live plan, and the result depended on the order of merges (not associative). Separately the loser was dated at the plans' starts, so two plans over 90 days old produced a tombstone the next read pruned — never reaching the other device. Now the loser carries `supersededBy` (the kept plan's id), cleared and recomputed from the merged plans on every merge, every read of a blob and every store write; it has no date and never expires; it becomes live again if the kept plan is abandoned or finished; `startKhatmah` abandons it. 5 new tests (stale copies on each side converge, both merge orders equal, old plans survive two reads, set-aside plan live at once after the kept one is abandoned, a new start ends it); 7 of the 14 fail on a79eb29, checked. | No. A build without the field sees both plans live, as before a79eb29 (which never shipped). |
| 2026-09-29 | P1.6, review | A review found an upgrade loss P1.6 introduced: the iOS/Mac widgets before the contract wrote a queued tap's `t` as `Date().timeIntervalSince1970 * 1000`, a fractional Double, and the contract's `long` reader (all three platforms) drops a number with a fraction — so every Log Today tap and tasbih bead still queued when the update landed would have been dropped by the app's drain and by the widget's next tap. The fixture "as Swift writes it" used `1759000000000.0`, a whole number, so it never saw the real case. The schema gained `truncate` for a long (refused on list elements); both queues' `t` use it and read any finite number below 9e15 with its fraction dropped. 5 new fixture cases (fractional log tap and bead, a mixed old/new queue, `t` as text still unreadable) and one app-level test per queue; the TS and Kotlin sides fail on them without the change, checked; Kotlin harness 10 tests pass. | No. The Swift harness is left to CI's `contract-swift` job (no swiftc in the session that made the change). |
