# Targeted rewrites: the four places the bugs keep coming from

> **Status (2026-09-28): P0.1 and P1.1–P1.4 done; see the progress log.** Decision (Hassan,
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

Seams already visible in the file: the store (shape, hydrate, persist,
prefs — lines ~1–1190), bookmarks and reading trails (~1190–1756), the
khatmah lifecycle (~1756–3088), and khatmah portions and schedule maths
(~3088–4302, almost all pure functions).

**2.1 Map and pin.** Dependency map of the 107 exports and 51 importers;
run coverage on the file and add characterisation tests wherever a
behaviour is untested (sync merges and deletions first). *Exit:* coverage
report in the progress log; gaps closed.

**2.2 Extract the schedule maths** (portions, days left, gaps, finish
targets) into a pure module — no state, easiest to move and to test.

**2.3 Extract bookmarks and reading trails.**

**2.4 Extract the khatmah lifecycle** (start, progress, reset, abandon and
its dated removal record).

**2.5 Retire the compatibility layer.** During 2.2–2.4 `quranState.ts`
re-exports what moved, so importers change gradually; this step moves the
last importers and deletes the re-exports. *Phase exit:* no module over
~1,000 lines, each with its own test file, every existing test green.

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

**5.1 Spike (run early, after Phase 1 starts).** On a branch: the current
React Native release with Hermes V1, built for iOS, Android and Catalyst
with Xcode 27. Record every break — native modules, the new architecture,
the Catalyst bundle issue reported against 0.84 — and estimate 5.2 from it.

**5.2 Upgrade** on all platforms, full device pass (widgets, Live
Activity, the muṣḥaf, sync, notifications).

**5.3 Unpin the Mac.** Remove `CATALYST_MAX_XCODE` and the Xcode 26
fallback; one Xcode builds everything. *Phase exit:* the Catalyst app built
with Xcode 27 passes the smoke test on macOS 27.

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
