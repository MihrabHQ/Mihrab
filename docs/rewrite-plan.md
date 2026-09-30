# Targeted rewrites: the four places the bugs keep coming from

> **Status (2026-09-29): P0.1, P1.1–P1.4, P1.6, Phase 2 (and the two-live-plans
> follow-up), P5.1 and P5.3 done. Done in code on the `rewrite` branch and
> waiting on their proof: P1.5 and P1.7 (Phase 1 complete in code), P5.2
> (the Android build with the ported screens patch, the Mac signed and
> notarised, the device pass), P3.1–P3.4 (two releases cut with the
> shadow beside them; 3.5 prepared behind `RELEASE_TS=1`, not switched),
> and Phase 4 (all six widgets on Glance, behind the off-by-default
> `mihrabGlanceWidgets` flag, compile-checked only; its 4.2 gate waits on
> the device measurements). See the progress log and "Open items" below
> it.** Decision (Hassan,
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

And one debt that is an upgrade, not a rewrite: React Native 0.83.1 is four
minors behind. *As written on 2026-09-28* the Mac was also pinned to Xcode
26, because the Catalyst build reported a macOS 10.15 deployment target
Xcode 27 refuses; 5.1 found the cause (an iOS 15.1 minimum missing from
the SDK's iOS-to-Catalyst version map, not React Native) and 5.3 fixed it
— the pin is gone.

## Order, and why

```
Phase 0  Baseline ─────────────┐
Phase 1  Widget/LA data contract ──► Phase 4  Android widgets on Glance
Phase 2  Split quranState.ts          (needs Phase 1's payload)
Phase 5.1  RN upgrade spike (early, small — to learn how big 5 is)
Phase 5.3  Mac off Xcode 26 (done — it did not need 5.2)
Phase 3  Release tooling in TypeScript
Phase 5.2  React Native upgrade, a release of its own
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
both native targets. **Done 2026-09-28** as far as that exit goes — the
helper's to-instant and offset functions (`WallClock.date`, `epochMs`,
`isStale`) have no production caller yet and all 16 parsers are still in
place; replacing them moved to 1.7 — `scripts/contract/widget-contract.js`
→ `npm run gen-widget-contract`; see the progress log.

**1.3 Contract tests across languages.** Today there are no native unit
tests at all. Add a Kotlin JVM test target and a Swift package test for the
decoders; the TypeScript tests write golden payload fixtures that the
native tests decode, and assert the decoded values — Android's reads
default silently, so "it decoded" proves nothing there. *Exit:* a payload
change that one side misreads fails CI. **Done 2026-09-28** — see the
progress log; `contract-swift` and `contract-kotlin` first ran on GitHub
with e370f58 (run 36609171841), both green. They run on pushes and pull
requests to `main` only.

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
both clocks, both platforms. **Done in code 2026-09-29** — see the
progress log; the device check (both clocks, both platforms, the DST night)
is in `docs/device-pass-rewrite.md`.

**1.6 The queues back to the app** (log, tasbih) on the same schema.
**Done 2026-09-28** — see the progress log.

**1.7 Remove v1.** *Done in code 2026-09-29* — see the progress log. The
plan had it wait a release after 1.4–1.6 shipped, so an updated widget never
met a payload only the old app had written; instead the natives keep READING
a stored v1 (and fill its minutes once, through `WallClock`) until the app's
first write after the update replaces it — the same safety in one release.
Originally: remove v1 one release after 1.4–1.6 have shipped, with the dead
fields the inventory found — and move the renderers off the v1-shaped JSON
the 1.4 adapter hands them onto the typed v2 model, which is where the
remaining "HH:mm" parse sites go (on Android, the providers that Phase 4
does not replace first).
Also 1.7's: act on `Day.utcOffsetMinutes` — the reason P1.1 chose
wall-clock times plus the offset was that a widget could notice the
device's offset has moved on and ask for a refresh, and nothing reads it
yet. Note what it can catch: the app writes the DEVICE's offset at noon,
so a changed device zone, not a stored location's zone (#56).
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
2026-09-29, see the progress log). There is only ever one khatmah
(Hassan, 2026-09-29): when the reader finishes or abandons the kept plan,
the plans set aside behind it are abandoned with it (`endSetAside`).
`startKhatmah` also abandons a plan it replaces, and any plan set aside,
instead of dropping it, which could otherwise come back from another device and win on reading.

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
**Done 2026-09-29** — "Phase 3 inventory" and "Phase 3 design" below.

**3.2 Port the read-only parts in shadow mode.** Preflight and verification
first. For two releases the old script decides and the new one runs beside
it, and any disagreement is written down. **Done in code 2026-09-29**
(`preflight.ts`, `verify.ts`, `shadow.ts`); the two shadowed releases are
still to come.

**3.3 Port build and publish,** again shadowed where it is safe to be
(dry-run of the irreversible steps). **Done in code 2026-09-29** —
`build.ts`, `publish.ts`, `catalyst.ts`, `iosAppStore.ts`, `release.ts`;
the build phase is shadowed on the shell's artefacts, the publish phase
after the fact (what the TS would have done, held against what the shell
did). None of it has run on the Mac.

**3.4 Fold in the Python tools** (`xcode-cloud.py`, `appstore-metadata.py`)
so the release is one language. **Done in code 2026-09-29** (`asc.ts`,
`xcodeCloud.ts`, `appstoreMetadata.ts`, same commands and exit codes); the
Python stays, and stays what the shell calls, until the switch-over.

**3.5 Switch over and retire.** `release.sh` becomes a thin wrapper; the
grep-the-source tests are replaced by behavioural ones. *Phase exit:* two
consecutive releases cut by the new tool with no manual step.
**Prepared, not switched (2026-09-29):** `RELEASE_TS=1` makes `release.sh`
and `verify-release.sh` hand their arguments to the TypeScript and exit
with its status; the behavioural tests that replace the text-reading ones
are written (`releaseTool*.test.ts`); the text-reading ones stay until the
switch. What the switch itself is: after two releases whose shadow log is
clean (or whose disagreements are understood and fixed), make
`RELEASE_TS=1` the default, run two releases on it, then cut `release.sh`
and `verify-release.sh` down to the `exec` line, delete the Python and the
Catalyst/iOS shell scripts, and delete the 13 text-reading test files (or
the describes in them that read scripts).

### Phase 3 inventory (P3.1, 2026-09-29)

Measured on `rewrite` at a8192de: `release.sh` 1,196 lines, `build-catalyst.sh`
925, `verify-release.sh` 520, `build-ios-appstore.sh` 363, `xcode-cloud.py`
502, `appstore-metadata.py` 218. The plan says "five scripts"; it is six
with the metadata tool, and all six are inventoried. Numbers in the gate
tables (P1, B3, …) are the ids the TypeScript uses in its outcomes and in
the shadow log.

**Entry points, flags and environment:**

| Script | Arguments | Environment it reads | Writes outside the tree |
|---|---|---|---|
| `release.sh` | `X.Y.Z [--dry-run]`, `--unreleased` | `SKIP_CATALYST`, `SKIP_APP_STORE`, `IOS_LOCAL`, `NO_IOS_LOCAL`, `RELEASE_NOTES` (a notes file); exports `IOS_LOCAL_UPLOAD=1` to the verifier | `.release-attempts.log` (every `die`), `/tmp/release-catalyst.log`, `/tmp/release-brew.log`, the tap `~/git/homebrew-tap` |
| `verify-release.sh` | `vX.Y.Z` | `IOS_LOCAL_UPLOAD`, `JDK` | temp files only |
| `build-catalyst.sh` | `[--check-toolchain]` | `CATALYST_DEVELOPER_DIR`, `SIGN_IDENTITY` (`-` = ad hoc), `SKIP_NOTARIZE`, `NOTARY_PROFILE` (default `mihrab`) | the App Group's preferences (deleted, restored when locked), LaunchServices, `ios/build/catalyst-dist` |
| `build-ios-appstore.sh` | `[--no-upload]` | `SKIP_PODS`, `SKIP_ARCHIVE` | `~/.appstoreconnect/private_keys/AuthKey_<id>.p8` (a link), `ios/build/appstore`, `/tmp/mihrab-{validate,upload}.log` |
| `xcode-cloud.py` | `runs [n]`, `start [--force]`, `why <run>`, `shipped X.Y.Z [sha]` (exit 0 / 2 never / 3 not yet), `ensure <sha> [minutes]` (0 / 2), `pause`, `resume` | `ASC_KEY_PATH`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, else `~/.config/mihrab/asc.json` | App Store Connect (start, pause, resume) |
| `appstore-metadata.py` | `[--dry-run] [--create X.Y.Z]` (exit 3 when frozen) | as `xcode-cloud.py` | the App Store listing |

Fixed facts the scripts share: repo `MihrabHQ/Mihrab`; team `GAW23HT439`;
App Group `group.com.prayerapp`; widget extension id
`maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension`; bundle id
`com.hassan.prayerapp`; release APK certificate SHA-256 `e66c0dab…f997`;
Temurin 21 as `JAVA_HOME`; Play locales `en-US sv-SE ar`; the published
names `Mihrab-vX.Y.Z.apk` and `Mihrab-macOS-X.Y.Z.zip`.

**`release.sh` — preflight (nothing written; every stop is a `die`, logged to the attempts file):**

| # | Gate | Lesson behind it | Pinned by |
|---|---|---|---|
| P1 | `gh git node python3` present | — | — |
| P2 | a working Xcode for Catalyst (`build-catalyst.sh --check-toolchain`), unless `SKIP_CATALYST` | 2.22.0 found out after the Android build | — |
| P3 | on `main`, no tracked changes | the release commit would sweep them up | — |
| P4 | `git fetch`; `origin/main` not ahead of `main` | 2.19.0, 2.21.0, 2.24.0, 2.27.0 aborts (the dataset bot) | — |
| P5 | tag free locally and on origin (captured, not `grep -q` in a pipe) | a pushed tag is never moved; SIGPIPE read "found" as "not found" | releaseScript (before first push) |
| P6 | version moves | — | — |
| P7 | Play notes exist for the new code, ≤ 500 characters, three locales | 2.13.0 (found after the tag), 2.26.0 (Swedish 503) | releaseScript |
| P8 | cask: no `postflight_steps`; a legacy `postflight do` with `chronod`; `pluginkit` (or `SKIP_CATALYST` warns; no tap is a stop) | widgets froze (2026-08-28), were removed (08-29), Homebrew 7's sandbox (09-14) | releaseScript |
| P9 | the last lesson is written (whole-line match) | the header quotes the marker; 2.21.1 | releaseSelfImprovement |
| P10 | last *completed* `ci.yml` on main is success or absent | 2.13.1–2.13.5 red unnoticed | releaseCiGate |
| P11 | `jest` (NODE_ENV=test), `tsc` | — | releaseScript |
| P12 | no Xcode Cloud run PENDING/RUNNING | 2.12.0: two runs kill each other | releaseScript |
| — | "What this ships" (`--unreleased`), and which cycle files changed since the last tag | fixes sat on main for days | releaseScript, releaseSelfImprovement (`CYCLE_PATHS`) |

**Build (writes the tree and `ios/build` only; `REVERT` undoes it):**

| # | Step / gate | Lesson | Pinned by |
|---|---|---|---|
| B1 | stamp `build.gradle` and the pbxproj; `sync-version.js`, `build-site.js`, `build-site.js --check`; the stamps took | 2.15.0 (English site only) | releaseNotes (order), releasePublishStep (`REVERT`) |
| B2 | `build-release-notes.js` after the stamp, `--check`, the table names the version | the APK's changelog stopped one release short | releaseNotes |
| B3 | Gradle: play APK+AAB, github (ARM only), fdroid — three invocations | one run mixed flavours | releaseScript, releasePublishStep |
| B4 | if `aapt2`: badging code and name; ABIs exactly `arm64-v8a armeabi-v7a`; no Play Services / Firebase / Play Core classes | — | releaseScript, releasePublishStep |
| B5 | `build-catalyst.sh` (unless `SKIP_CATALYST`), the zip exists | — | — |
| B6 | the zip about to be published: `TeamIdentifier=GAW23HT439`, App Group, `stapler validate` (never `spctl` on a temp copy); `lsregister -u` the temp copy; put the installed widget back | 2.11.0 ad hoc; 2.11.0–2.13.3 unnotarised; 2026-08-29 blank widgets | releaseScript |
| — | `--dry-run` stops here: cleanup, artefacts, the `REVERT` line | — | — |

**Publish (irreversible; order is the safety):**

| # | Step | Lesson | Pinned by |
|---|---|---|---|
| U1 | journal entry into the release commit: attempts for this version, cycle files, `_(unfilled)_` when either | a second push cancels the iOS run (2.13.0) | releaseSelfImprovement |
| U2 | `git add` gradle, pbxproj, `docs/`, recipe, journal, Play notes, notes table; commit `Release V (C)`; `RELEASE_SHA` | 2.19.0 (`$RELEASE_SHA` never set) | releaseNotes, releaseScript |
| U3 | `SKIP_APP_STORE=1` pauses Xcode Cloud *before* the push | 2.20.0 | skipAppStore |
| U4 | push main; on failure print the mixed-reset recovery | 2.25.1 (`--soft` left stamps staged) | releasePublishStep |
| U5 | annotated tag, push it | tag before main | releaseScript (order) |
| U6 | copy to published names; `gh release create --latest` (notes file or generated); ask GitHub for the asset names | `file#Label` is a label; 2.23.0 (a stalled upload leaves a draft) | releasePublishStep |
| U7 | tap: sha of the zip *as downloaded*; sed version and sha; assert both changed; commit and push (skipped with `SKIP_CATALYST`) | sha drift; a stale cask | releasePublishStep |
| U8 | App Store: skip / `IOS_LOCAL` / `ensure` the push's run → local fallback unless `NO_IOS_LOCAL`; never a stop | 2026-08-07, 08-26, 09-11 (HTTP 500), 2.24.0 | releaseIosGate, skipAppStore |
| V | `verify-release.sh` | — | — |
| I | `brew update`, `brew upgrade` (reinstall when "Not upgrading"), installed version, stapled ticket, extension registered with no launch | 2.11.0–2.13.3; widgets removed on upgrade | — |
| C | CI on the release commit: 40 × 15 s; red is a warning and exit 1 at the very end | five red releases | releaseCiGate |
| — | cleanup (three `pgrep` patterns in `$ROOT`, Gradle daemon, widget re-registration); the "still yours to do" summary per iOS state | orphaned widget extension (2.13.4) | releaseScript, skipAppStore |

**`verify-release.sh`** (✓ / ✗ / ⧗; exit 1 only on a ✗): V1 tag on origin;
V2 release exists, not a draft, both assets; V3 both URLs 200; V4 exactly
one APK, ARM only, no Google classes, signed with the release key (⧗ without
`apksigner`); V5 cask version, sha of the served zip, `postflight_steps` /
`chronod` / `pluginkit`; V6 the served app: not ad hoc, a team, the App Group,
stapled, the cask's macOS major equals `LSMinimumSystemVersion`'s, the cask's
arch matches `lipo`; then unregister the temp copy and put the widget back;
V7 tap pushed; V8 F-Droid `CurrentVersion`; V9 `docs/index.html` and the live
site (with Pages diagnostics); V10 Play notes; V11 iOS shipped (0 ✓, 3 ⧗,
else ✗ unless `IOS_LOCAL_UPLOAD=1` → ⧗); V12 CI on the tag's commit (✓ /
✗ on failure, timed_out, startup_failure / ⧗ otherwise). Pinned by
releaseCiGate, releaseIosGate, releasePublishStep.

**`build-catalyst.sh`** (every stop is `exit 1`): C1 toolchain; C2 signing
identity (found, named, or `-` with a warning); C3 `MIHRAB_CATALYST=1 pod
install` with `Podfile.lock` restored on exit; C4 unsigned `xcodebuild`,
`ditto`; C5 profile readable and carrying the signing certificate (else
AMFI kills at launch); C6 hermes symlink, sign inside out, `--verify
--strict`; C7 `LSMinimumSystemVersion` ≥ 12 (warn if ≠ 12.1); C8 a team id,
the extension sandboxed, keychain group and embedded profile when a profile
exists, app and extension name the same App Group; C9 smoke launch — quit
running copies, back up and delete the payload, `open -g -j`, 30 × 2 s for
the process, alive after 10 s, 12 × 5 s for today's payload, a locked console
reports instead of requiring it, else one visible launch; C10 kill the
extension it spawned; C11 zip; C12 notarise (keychain profile, or
`asc.json`, or stop), read `status: Accepted`, print the log on refusal;
C13 staple, six tries with 10–50 s waits, signature still verifies, re-zip,
the unpacked zip validates, `spctl` on the dist copy says accepted *and*
`Notarized Developer ID`; C14 sha256; C15 LaunchServices: unregister the two
`.app` paths and every other registered copy (never an `.appex`), delete the
dist app, re-register `/Applications`, re-add the extension, re-sweep
ghosts four times and stop if one keeps coming back. Pinned by
releaseCatalystGate, catalystDeploymentTarget (lock trap), releaseScript
(`set -u`).

**`build-ios-appstore.sh`**: A1 an Apple Distribution identity; A2
`asc.json` and its key file; A3 the altool key link; A4 version and build
from the pbxproj; A5 `shipped` → ask before rebuilding a live version; A6
plain-iOS `pod install`; A7 archive; A8 the Live Activity claims no App Group
or keychain, the widget keeps its App Group, the app has both; A9 the scene
manifest names a delegate that is substituted and compiled into the binary
(iOS 27); A10 export, an `.ipa` exists; A11 validate, upload (or stop at
`--no-upload`). Pinned by iosSceneLifecycle, releaseScript (`set -u`).

**Tests that read the scripts' text** (13 files, all kept until the
switch-over): releaseScript, releaseCatalystGate, releaseCiGate,
releaseIosGate, releasePublishStep, releaseSelfImprovement, skipAppStore,
releaseNotes (one describe), catalystDeploymentTarget (one describe),
iosSceneLifecycle (one test), storeListings (the metadata tool's locale
map), and siteVersion / widgetStaleness only mention the verifier in
comments.

**Two constraints the plan names that are not in the scripts:** there is no
`RELEASE_EXIT=` line in any of them — it is printed by whatever wraps
`release.sh` (Paperclip), from its exit status — so what must stay is the
exit status: 0, or 1 for a stop, a failed verification or a red release
commit. "The log" is the output plus `.release-attempts.log` and
`docs/release-log.md`.

### Phase 3 design (P3.1)

`scripts/release/`, TypeScript run by Node's own type stripping (`node
--experimental-strip-types`, Node ≥ 22.6; `package.json` asks for ≥ 22.11).
No new dependency: no `tsx`, no build step, nothing checked in twice. The
cost is a subset of TypeScript — no enums, no parameter properties, `import
type` for types, `.ts` in import paths — which `scripts/release/tsconfig.json`
(`erasableSyntaxOnly`, `verbatimModuleSyntax`) enforces and a test runs.
CI runs Node 22 since it began building the native code, so the test that
launches it runs there as on the Mac; it still skips itself on a Node
older than 22.6. jest runs the modules through Babel as it does the app.

| Module | Holds |
|---|---|
| `io.ts` | the injected world: `Exec` (run a command, captured or streamed), `Http` (request, download), `Fs`, `Clock` (now, sleep), `Env`; `realIo()` for the Mac |
| `report.ts` | the outcome log (`ok`, `warn`, `fail`, `pend`, `skip`, `stop`) printed in the shell's own format, and what shadow mode compares |
| `common.ts` | the shared facts above, `has`, version and code readers, the published names, the APK checks, `keepInstalledWidgetRegistered`, `irreversible()` |
| `toolchain.ts`, `self.ts` | which Xcode and which signing identity (asked by preflight and both builds); how the tool runs a part of itself as a process |
| `preflight.ts` | P1–P12, `unreleased` |
| `build.ts` | B1–B6 |
| `publish.ts` | U1–U8, I, C, cleanup, the summary; every irreversible call goes through `irreversible()`, which only says what it would do under dry-run |
| `verify.ts` | V1–V12 |
| `catalyst.ts`, `iosAppStore.ts` | C1–C15, A1–A11 |
| `asc.ts`, `xcodeCloud.ts`, `appstoreMetadata.ts` | the App Store Connect client (ES256 JWT with `node:crypto`), the Xcode Cloud commands with the same exit codes, the listing writer |
| `release.ts` | the whole cut in the shell's order, for `RELEASE_TS=1` |
| `shadow.ts` | compare a phase's TS outcomes with the shell's record; write `.release-shadow.log`; print one line |
| `main.ts` | the command line |

Every gate is a function of a context (`io`, root, env, reporter, dry-run),
so a test hands it fakes and asserts the outcome. **Shadow mode** is on by
default (`RELEASE_SHADOW=0` turns it off): the shell records each of its own
✓/✗/⧗ lines, and at four points — end of preflight (or a stop inside
it), end of the build phase, after verification (publish: what the TS
would have done against what the shell did), and inside `verify-release.sh`
before its summary — runs the TS phase beside itself with every
irreversible step in dry-run and the expensive ones (jest, Gradle, the
Catalyst build) trusted from the shell's record. The TS
never decides: it cannot stop the release, its exit status is ignored, it
has a time limit, and it prints one line — agrees, or how many
disagreements and where the log is. **`RELEASE_TS=1`** is the switch-over,
prepared and off: `release.sh` and `verify-release.sh` hand the same
arguments to the TS and exit with its status.

## Phase 4 — Android widgets on Jetpack Glance (only if the trial earns it)

**4.1 Trial one widget.** Port the smallest (Hijri, 185 lines, or Tasbih,
295) to Glance, reading the Phase 1 payload. Measure: lines of code, APK
size, resize behaviour on at least three launchers, the F-Droid build
(Compose compiler with Kotlin ~~2.1~~ 2.2 — the branch is on 2.2.0 since
5.2), memory and render time. **Done in code 2026-09-29** on
the `rewrite` branch (Hassan: finish the steps in code, verify on devices
later) — Hijri, from payload v2's typed `hijri` block through the
generated reader. The measurements that need a device are the 4.2 table
below; see the progress log.

*How it is built.* Everything Glance lives in `android/app/src/glance`
and is compiled only with `-PmihrabGlanceWidgets=true` (default `false` in
`gradle.properties`): the sources and resources, the receivers (merged as
the build types' manifest), `androidx.glance:glance-appwidget:1.1.1` and
the Kotlin Compose compiler plugin. The default build compiles
`src/glanceOff`'s no-op `GlanceWidgetHook`, so the shipping app has no
Glance, no Compose and no new receivers; with the flag, each Glance card
sits in the picker beside the RemoteViews card it ports ("… (Glance)"),
which stays registered as it was. `PrayerWidgetProvider`'s fan-out calls
the hook, so boot, unlock, the boundary alarm, the payload write and every
tap redraw both kinds, and a home screen of Glance cards alone still arms
the alarms.

*F-Droid.* Since Kotlin 2.0 the Compose compiler is part of Kotlin
(`org.jetbrains.kotlin.plugin.compose`, versioned with it, on Maven
Central, built from JetBrains' Apache-2.0 source), so there is no separate
Google-hosted compiler artifact to trust. Glance and what it brings (the
Compose runtime, WorkManager with Room, DataStore) are AOSP androidx
libraries from Google's Maven, which F-Droid's builds already take for
`androidx.camera` and the rest; none is Play Services. What F-Droid does
change is the size: its build runs without R8, so every class of those
libraries lands in the APK — the number to measure.

**4.2 Decision gate.** Continue only if the trial is smaller and sizes
correctly everywhere tested. Otherwise record why and stop here — the
Phase 1 contract already removes the parsing half of the widget bugs.
**Written down 2026-09-29; not passed** — half of it can only be measured
on devices. What was measured here, with no Android SDK (a JVM compile
against Robolectric's android-all for API 37 and Glance's published 1.1
API — see the progress log):

| Measured here | Result |
|---|---|
| Code, the trial (Hijri) | 214 code lines (provider 121 + layout 93) → 86 (`HijriGlanceWidget.kt`); non-blank, non-comment |
| Code, all six | 3,954 → 1,949 code lines. The RemoteViews side counts all of `PrayerWidgetProvider.kt` (1,059), whose fan-out, alarms and payload cache stay; the Glance side includes its shared support (`GlanceSupport.kt`, the base class, the receiver registry, three small layouts: 476) |
| Per widget | Tasbih 367 → 206, Streak 353 → 188, Reading 507 → 250, Log 691 → 298, Prayer times: layouts 663 + provider → 445 |
| Compile | Kotlin 2.2.0 with its Compose compiler plugin: every Glance file, the contract and the 18 widget files of `src/main` they reach, 31 files, no warnings in new code; each 4.x commit compiled on its own |
| Our code's weight (JVM class files, a proxy for dex) | Glance widgets 59 classes / 414 methods / 384 KiB; the RemoteViews providers and helpers they replace 22 / 217 / 196 KiB |
| Library weight (proxy) | Compose runtime 1.6 (JetBrains' JVM build of the same code): 598 classes / 4,992 methods; ui-unit and ui-geometry 58 / 784. Glance itself, WorkManager/Room and DataStore could not be fetched here (Google's Maven is blocked) |

| Must be measured on devices | Pass if |
|---|---|
| APK size, `assembleFdroidRelease` and `bundlePlayRelease`, flag on vs off | the growth is written down and Hassan accepts it (proposed: under 1 MB on Play's download; F-Droid, without R8, will be several MB) |
| Resize on three launchers (Pixel, One UI, one more — EMUI or Lawnchair), every Glance card beside its RemoteViews twin, 1×1 to 4×4, both orientations | every card shows the same variant as its twin and no line is cut |
| API 24–30 (emulator) | the card is rounded and tinted (it is the RemoteViews card, embedded) and the countdown ticks |
| Memory: `dumpsys meminfo` across a redraw of nine placed cards | within a few MB of the RemoteViews-only build; no widget process death |
| Render time: payload write to every card redrawn (logcat) | under a second for nine cards on a mid-range phone |
| The F-Droid recipe with the flag | builds from source unchanged apart from the flag; the scanner is clean |
| Parity: en/sv/ar (RTL), 12/24 h, opacity, tint, highlight; tasbih and log taps (queue, undo, the app told); countdown past ʿIshāʾ; tap targets | as the RemoteViews twin, apart from the differences listed under 4.3 |
| The flag build itself | never built by AGP yet: it has to assemble, merge the manifest and pass R8 on Play |

**4.3 Port the rest, one widget per release** (Streak, Reading, Log,
Prayer times last); the practice graph stays a bitmap inside Glance.
*Phase exit:* RemoteViews layouts deleted; widget fixes per release down
against the Phase 0 baseline. **Done in code 2026-09-29, not switched**:
Tasbih, Streak, Reading, Log (both picker entries), Prayer times (all
three), one commit each, behind the same flag. No "HH:mm" is parsed: times
are the contract's minutes, text is `WallClock.text`/`parts`, instants
`WallClock.epochMs` on the event's own date. The practice graph is still
`PracticeGridBitmap`, shown as a Glance `Image`. "One widget per release"
now means one *switch* per release: after the gate, each release moves one
widget's picker entry and intent filters onto its Glance receiver and
drops its RemoteViews provider and layout (keeping the `*_preview.xml`
layouts, which the picker shows). With the last switch, boot, unlock and
the boundary alarm — received by `PrayerWidgetProvider` today, which then
redraws the Glance cards through the hook — need a receiver of their own
(the fan-out and the alarms are not rendering and stay). The refresh
glyph already has its own Glance callback (`PrayerRefresh`).

*What Glance could not do as RemoteViews did, and what stands in:*
- no Chronometer — the countdown is a Chronometer embedded with
  `AndroidRemoteViews` (`glance_countdown.xml`);
- `cornerRadius` rounds on Android 12+ only — the card is the RemoteViews
  card embedded (`glance_card.xml`, painted by `WidgetCard.paint`);
- no text auto-sizing — the Hijri date and the compact line's time are
  measured, as the strip's times already were;
- no spans — the 62% meridiem and the red make-up count in the streak
  summary are separate Texts on one line, bottom-aligned where the layouts
  aligned baselines;
- no letter spacing, no `includeFontPadding`, no light weight (the compact
  line's time is regular, not light);
- the Continue Reading bar is Glance's, in the accent on a faint track,
  where the ProgressBar took the launcher theme's colours;
- a Row, Column or Box takes at most ten children — the rule is one
  element and the tasbih dots carry their own gap;
- no v1 fallback: without payload v2 a Glance card says "Open Mihrab".

*And where it now does better:* the countdown past ʿIshāʾ aims at the next
day's first time exactly (the provider counted to today's first time plus
24 hours); the Log's 30dp chips on a short card apply below Android 12 too;
a Log block that is not today's no longer counts down to a time on another
day.

## Phase 5 — React Native upgrade (and the Mac off Xcode 26, done in 5.3)

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
- *Left, and now done on `rn-0.87` (2026-09-29)* — the spike replayed onto
  current `main`, keeping 5.3's Mac-only Catalyst setting rather than the
  spike's 15.2 for iOS too:
  - the 51 type errors in 29 files, all mechanical (ScrollView refs are
    `ScrollViewInstance`, `ColorValue` includes null, `StatusBar` lost
    `translucent`/`backgroundColor` — no-ops under edge-to-edge — and six
    one-offs); tsc clean, jest green;
  - the `react-native-screens` patch ported to 4.28: the bug is still
    upstream, the fix is the same on 4.28's code, the legacy-architecture
    half is gone with the legacy code; it applies cleanly to the published
    4.28.0, and was **not compiled** here (no Android SDK in the session);
  - the Mac signing blocker worked around: under `MIHRAB_CATALYST` the
    Podfile turns `RCT_USE_PREBUILT_RNCORE` and `RCT_USE_RN_DEP` off, so
    the Mac builds React from source as every signed Mac release through
    0.83 did, and iOS keeps the prebuilt core; `build-catalyst.sh` puts
    back the `Podfile.lock` that install rewrites. **Not proven** until
    `build-catalyst.sh` signs and notarises on the Mac. It gives back
    most of the prebuilt core's build-time saving on the Mac only.
  AGP 9's optimize rules still need the full pass on the phone.
- *Costs:* the F-Droid APK grows about 9 MB (native libraries 7.7 MB over
  four ABIs, the Hermes V1 bundle 8.5 → 9.2 MB); the Mac app 130 → 189 MB.
  In return the Catalyst Release build compiles a third of what it did
  (about 2,250 compile steps → 840, 4 minutes), because React's core now
  comes prebuilt.
- *The device pass:* `docs/device-pass-rewrite.md`, the checklist for
  everything on `rewrite` that only a device can confirm.
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
| 2026-09-29 | P5.1 | Recheck: the plan's facts still held — 0.83.1 on the Mac, Xcode 27 selected with 26 kept beside it for Catalyst — and the current release is 0.87.1 (0.88 due 2026-10-12). Branch `spike/rn-0.87` in its own worktree, so main was never touched. First the baseline, measured rather than trusted: 0.83.1 still fails on Xcode 27 with the same 105 targets at macOS 10.15. The cause, found this time: iOS 15.1 is missing from the SDK's iOS-to-Catalyst version map in both Xcodes, so the Catalyst deployment target falls back to iOS 13.1 = macOS 10.15, which Xcode 26 allowed and 27 does not. That is why every earlier attempt failed — it set the macOS target, and Xcode derives it from the iOS one; a blanket override to 15.2 lowered the widget extension (16.1 — *correction: the widget extension is 17.0; 16.1 is the Live Activity, which does not build for the Mac*) and broke it; raising only what said 15.1 built 0.83.1 for Catalyst on Xcode 27, and the app launched. Then 0.87.1: package bumps and the template's changes; Android failed on AGP 9's refusal of `proguard-android.txt` and on two libraries' legacy-architecture code (safe-area-context, screens), iOS on three (gesture-handler, screens, view-shot); each fixed by the library's current version. The F-Droid release and beta build, and the beta ran on the emulator (API 37) to onboarding with no errors; the iOS simulator Debug build succeeds; the Catalyst Release build succeeds in 4 minutes and the app ran and drew Today from the Mac's own data. Jest: 7 failures from the two removed APIs, all fixed on the branch — 399 suites / 6,091 tests pass. Found and not fixed: 51 type errors in 29 files; the screens patch has to be ported to 4.28; `codesign` refuses the prebuilt React framework in the Mac bundle; the APK is about 9 MB bigger and the Mac app 59 MB. | Yes. 5.3 moves ahead of 5.2 and no longer depends on it: the Catalyst fix is one setting per side and works on 0.83.1 — it needs Hassan's yes on raising the Mac minimum to macOS 12.1. 5.2 is rewritten from the spike's list, estimated at two to three sessions plus a phone pass, as a release of its own. |
| 2026-09-29 | P5.3 | Hassan agreed to the Mac minimum going from macOS 10.15 to 12.1. Done without the React Native upgrade: `"IPHONEOS_DEPLOYMENT_TARGET[sdk=macosx*]" = 15.2` on the four configurations of the app project that say 15.1, and the same for every pod below 15.2 and for the pods project in the Podfile — conditional, so the iOS build keeps 15.1 (checked: iOS simulator settings 15.1, Catalyst 15.2 → macOS 12.1). `build-catalyst.sh` lost its Xcode-version pin and fallback; `--check-toolchain` now reports the selected Xcode, and `CATALYST_DEVELOPER_DIR` still names another. Verified with the real script on Xcode 27, notarisation skipped: built, Developer ID signature verifies, Keychain group and App Group sealed in, the extension signed and sandboxed, the smoke launch came up and wrote today's widget payload, `LSMinimumSystemVersion` 12.1, SDK 27.0. The first run stopped at the script's last gate — LaunchServices still knew a widget extension inside the spike's copy of the app, launched from /tmp in 5.1 and deleted afterwards, which would have blanked every widget on this Mac; unregistered it, and the second run passed every gate. `catalystDeploymentTarget.test.ts` holds the configuration; its first draft missed the app target's configurations (CocoaPods puts a line between `isa` and `buildSettings`) and passed with one removed — caught by breaking it on purpose, fixed, and it now fails that way. DISTRIBUTION.md and release.sh say what the cause was; CHANGELOG says the Mac needs 12.1. Full jest 400 suites / 6,095 tests, tsc clean. | The Homebrew cask already requires Ventura, so it needs no change. Notarising an Xcode 27 build is left to the next release, which does it anyway. |
| 2026-09-29 | 2.1 finding, review | A review of a79eb29 found the choice itself was unsafe to store. `oneLivePlan` wrote the loser's `abandonedAt`, which is permanent and one side's word is enough, from the reading the merging device could see — and folder sync merges the other device's file as it was when written. Phone (P 10 pages, Mac's old file Q 5) abandoned Q while the Mac (Q 20, phone's P 10) abandoned P: the next exchange left no live plan, and the result depended on the order of merges (not associative). Separately the loser was dated at the plans' starts, so two plans over 90 days old produced a tombstone the next read pruned — never reaching the other device. Now the loser carries `supersededBy` (the kept plan's id), cleared and recomputed from the merged plans on every merge, every read of a blob and every store write; it has no date and never expires; it becomes live again if the kept plan is abandoned or finished; `startKhatmah` abandons it. 5 new tests (stale copies on each side converge, both merge orders equal, old plans survive two reads, set-aside plan live at once after the kept one is abandoned, a new start ends it); 7 of the 14 fail on a79eb29, checked. | No. A build without the field sees both plans live, as before a79eb29 (which never shipped). |
| 2026-09-29 | P1.6, review | A review found an upgrade loss P1.6 introduced: the iOS/Mac widgets before the contract wrote a queued tap's `t` as `Date().timeIntervalSince1970 * 1000`, a fractional Double, and the contract's `long` reader (all three platforms) drops a number with a fraction — so every Log Today tap and tasbih bead still queued when the update landed would have been dropped by the app's drain and by the widget's next tap. The fixture "as Swift writes it" used `1759000000000.0`, a whole number, so it never saw the real case. The schema gained `truncate` for a long (refused on list elements); both queues' `t` use it and read any finite number below 9e15 with its fraction dropped. 5 new fixture cases (fractional log tap and bead, a mixed old/new queue, `t` as text still unreadable) and one app-level test per queue; the TS and Kotlin sides fail on them without the change, checked; Kotlin harness 10 tests pass. | No. The Swift harness is left to CI's `contract-swift` job (no swiftc in the session that made the change). |
| 2026-09-29 | review | A review of everything above (three reviewers, then fixes). Two bugs fixed and logged in their own rows (the two-live-plans choice, the fractional queue times); the iOS widgets now read date keys on a Gregorian calendar (on a Buddhist, Japanese or Islamic system calendar today's key matched no payload day); the Catalyst test holds every Mac target's minimum, and `build-catalyst.sh` reads the product's `LSMinimumSystemVersion` and stops below 12. Checked and correct: every widget on both platforms reads through the adapter; every app write goes through `setDataV2` with `setData` as the fallback; the quranState move was mechanical; the DST fix holds in seven zones over 800 days. | Yes: the status line, the order, the 1.2/1.3/1.5/1.7 texts, and "Open items" below. |
| 2026-09-29 | 2.1 finding, again | Hassan: there is always one khatmah. The fix above let a plan set aside come back when the kept one was finished or abandoned; now `endSetAside`, run on every store write, abandons the plans set aside behind a kept plan the reader finishes or abandons, at the same moment — the reader's act, so a real tombstone that travels and expires with the kept plan's. The choice between open plans stays derived. A draft that instead kept the marker through merges and re-checked it against a closed winner failed a new fuzz test — the result depended on the order of merges once devices could end plans — and was dropped. `khatmahOneLivePlanFuzz.test.ts`: 1,500 random runs (up to three plans on three devices, stale copies, some devices ending their plan), every merge order must leave the same one live plan, and settling or self-merging must change nothing; 20,000 runs clean while developing. 4 tests replaced in `khatmahOneLivePlan.test.ts` (abandoning or finishing the kept plan ends the other, the ending travels and expires, a sync alone never ends a plan). | No. |
| 2026-09-29 | khatmah recheck | Every khatmah flow walked through the shipping writers, on one device and on two that sync (`khatmahJourneys.test.ts`, 20 journeys), and the screens reviewed. Found and fixed: "restart the khatmah" (and reset today, step back, un-marking) could move the reader onto a plan a sync had set aside, because every write re-chose by reading — the reader's own write now never switches their plan (`keepReadersPlan`); "previous day" on a deadline plan used the duration plan's arithmetic (a double "done" on day one rewound to page 0; behind schedule it did nothing) and refused whenever a page was left unread behind the reader; with only skipped pages left the card's "done" and the reader's pill were offered and did nothing (`khatmahCanFinish`); the reader's pill and portion-end marker did not refresh at the day's turn; un-pinning re-stamped the pins of abandoned and set-aside plans. 8 of the new tests fail on the code before, checked. Not changed: the last "done" of a khatmah cannot be undone (the plan is finished and no writer touches it), and the translation view does not credit the khatmah (by design, `readerMarks.ts`). | No. |
| 2026-09-29 | P5.2, part | Hassan pushed `spike/rn-0.87`. Replayed onto current `main` as `rn-0.87` (the one conflict, the project file: 5.3's `[sdk=macosx*]` setting kept instead of the spike's iOS 15.2; the template's `RCT_REMOVE_LEGACY_ARCH` flags and `PODFILE_DIR` kept). Measured the spike's 51 type errors in 29 files, fixed all of them (tsc clean; jest 402 suites / 6,127 tests; no new lint warnings). Ported the screens patch to 4.28 (checked that the bug is still there — the commit hook still resets frames, `onLayout` still pushes only on change, the memo still swallows a repeat — and that the patch applies to the published 4.28.0). Worked around the Mac signing blocker by building React from source for the Mac only. The prebuilt artifact could not be inspected from the session (repo.reactnative.dev is outside its network policy). | No. Still to do before 5.2 ships: build Android with the ported patch and check rotation on the phone; `build-catalyst.sh` on the Mac to prove signing and notarisation; the device pass the step always had. |
| 2026-09-29 | P1.5 | One `LiveActivity` in the contract — the widget payload's own `Day`/`Row`/`Clock`, plus the Hijri line per day, each prayer's alert mode, the appearance, the Android channels and the Android words — built once in TS (`buildLiveActivityV2`) for both platforms. The dead fields the inventory found are not carried. Each native adapts it for the minute it draws at, as the widgets do: `LiveActivityV1.swift` → the ActivityKit `ContentState` JSON (unchanged type), `LiveActivityV1.kt` → the payload `MihrabLiveActivityModule` and its service already read; the next prayer's instant now comes from its day and minutes (`WallClock`), not from "HH:mm" re-parsed on today and pushed a day when past (an hour off on the DST night). New native entry points `startV2` (iOS) and `displayV2` (Android) store the payload; the iOS background refresh and a revived card re-adapt the stored days, so the card rolls past ʿIshāʾ into tomorrow on its own, which the old re-parse of its own rows could not. The "where do the days stand" rule is now one function per platform (`widgetMoment`/`moment`), shared by the widget and Live Activity adapters. Found on the way and fixed: v2 dropped a tomorrow the app knew but held outside the widget window (after ʿIshāʾ nothing was ahead — no next prayer on a v2 widget, no Live Activity); a scenario pins it. Verified here: 8+1 new contract fixtures (`liveActivity`), Kotlin harness 11 tests (fails on a broken adapter, checked); TS reference tests; the old iOS content tests pass unchanged through the new path; full jest 403 suites; the Swift adapter and module changes are **not compiled** (no swiftc). | No. The service's own roll-forward on Android still parses the v1 days it stores — that, and the old `start`/`display` entry points, go in 1.7. |
| 2026-09-30 | P4.3 switch | Hassan: switch to Glance; size is not a problem (F-Droid/Play release APK +2.1 MB, +2.2%, R8 clean). `mihrabGlanceWidgets` now defaults to true (`-P…=false` builds the RemoteViews-only app). The picker offers the Glance cards under the real, translated names (`glance_strings.xml` deleted). The RemoteViews providers stay registered so widgets already placed keep drawing, and are hidden from the picker on Android 12+ (`res/xml-v31`, `hide_from_picker`); below 12 the picker still lists both. Not done: deleting the RemoteViews providers and layouts (only once no one has one placed), and the device measurements of the 4.2 table. | Yes. |
| 2026-09-30 | P3.5 switch | Hassan: do the tooling switch. `release.sh` and `verify-release.sh` now hand off to the TypeScript unless `RELEASE_TS=0` (then the shell runs, with the TypeScript in shadow mode, as before); the shell is retired after two real releases have been cut by the TypeScript. Found first, by the dry run: the tests that run the real scripts inherited `RELEASE_TS=1` from the environment and failed inside the tool's own jest gate (`releaseToolShell.test.ts` now scrubs it and runs the shell paths with `RELEASE_TS=0`). Not yet run: a full `--dry-run` through the TypeScript (Android build, Catalyst sign and notarise) and a real release. | Yes: two releases on the TypeScript are the phase exit. |
| 2026-09-30 | P4 device, first run | Hassan: placing the new widgets did nothing. Logcat on his phone: `WM-InputMerger: NoSuchMethodException: OverwritingInputMerger.<init>` — R8 (release, Glance on) stripped the constructor WorkManager reflects on, so every Glance session failed. The CI and local release builds all passed: only a placed widget on a release build shows it. Keep rules added for the input mergers, every worker's constructor and Glance's session classes; verified on the phone (release build, over the installed app): the Prayer times card draws today's times. The picker's 4×1 preview also had a void under its last line and, in the first fix, a `Space` (not allowed in a RemoteViews preview) made it "Couldn't add widget"; both fixed. | Yes: the widget device pass is worth doing on a release build only. |
| 2026-09-29 | P1.7 | The app writes payload v2 alone (`setDataV2('', v2)`: the empty v1 makes each native remove the old key; the language now comes from v2; Android's "unchanged, skip the redraw" check reads a removed key as empty). Every row the adapters hand the renderers carries `minutes` (TS reference, Swift, Kotlin, both Live Activity adapters), and every renderer places times by them: iOS `widgetDate(minutes:on:)` and `Row.at`/`TodayPrayer.at` (Prayer, Log Today, Hijri widgets, the progress ring, the multi-day timeline — on the row's own day, so a First Third after midnight lands on its night), the Live Activity card and its legacy roll-forward; Android `WidgetPayloadV1.minutesOf(row)` in the provider's three walks and the Log provider, the Live Activity module's and service's day walks (`epochOfRow` → `WallClock.epochMs`, replacing both copies of `epochForDayTime`), the service's single-day fallback, and the "at" metric (from the instant, not the text). The only parser left is `WallClock`'s own, for a v1 the app stored before this update; `noNativeTimeParsing.test.ts` scans every Swift and Kotlin file and holds that (it fails on the code before, checked). The offset check P1.1 was for: an Android widget whose today was built under another UTC offset starts the app's refresh task headlessly, once per payload and offset; iOS has no way to run the app from a widget, so it draws the table it has. Dead fields: none left to drop in v2 (1.4 and 1.5 never carried them). Verified: TS tests (the adapter's minutes, a First Third at 1445), contract fixtures regenerated, Kotlin harness 11 tests, full jest. **Not compiled:** the Android providers and Live Activity module/service (no Android SDK; to be run through the Phase 4 harness), and all Swift. | Phase 1's exit is met in code: no native code parses a formatted time (bar the legacy reader), one schema, contract tests in CI. The renderers still draw from the v1-shaped JSON the adapters produce — moving the SwiftUI views onto the typed model was judged not worth a blind 2,000-line rewrite without a compiler; the text is written by the adapter from the typed model, and every time is placed by minutes. |
| 2026-09-29 | P3.1 | Recheck: the scripts had not moved since the plan was written (release.sh 1,196 lines, build-catalyst.sh 925, verify-release.sh 520 — 42 more than the plan's table, from the cask's `depends_on` checks — build-ios-appstore.sh 363, xcode-cloud.py 502, appstore-metadata.py 218). Inventory and design written ("Phase 3 inventory", "Phase 3 design"): 12 preflight gates, 6 build steps, 8 publish steps plus install, CI and cleanup, 12 verification checks, 15 Catalyst steps, 11 local-iOS steps, 7 Xcode Cloud commands; 13 test files read the scripts' text. Two things the plan named are not in the scripts: there is no `RELEASE_EXIT=` line anywhere (whatever wraps the release prints it from the exit status, so the status is what must stay), and "five scripts" are six. Runtime chosen: Node's own type stripping (`node --experimental-strip-types`, ≥ 22.6; `package.json` asks for ≥ 22.11), no new dependency — the repo has `tsc` and nothing to run TypeScript with, and a compiled copy would be a second thing to keep in step. | The design section is the plan for 3.2–3.5. |
| 2026-09-29 | P3.2–P3.4 | Written on `rewrite`: `scripts/release/`, 17 modules, 5,089 lines, every command, HTTP call, file and clock reached through `io.ts` — preflight P1–P12, build B1–B6, publish U1–U8 with install, CI and cleanup, verification V1–V12, the Catalyst build C1–C15, the local iOS build A1–A11, `xcode-cloud` (all seven commands, same exit codes, ES256 token from `node:crypto` instead of pyjwt) and the listing writer; every lesson comment that explains a gate carried over, shortened. Shadow mode in `release.sh` (preflight, build, publish) and `verify-release.sh` (every check, `pend` included, through a wrapper that leaves the one pinned `PENDING=1` line alone): the shell notes each verdict, the TS compares and appends to `.release-shadow.log` (gitignored) and prints one line; it cannot change the shell's verdict or status — tested by running the real scripts against a stub. Verified here: `npx tsc --noEmit` clean, `tsc -p scripts/release` (erasable syntax only) clean, eslint clean on the new files, `bash -n` on both scripts, 9 new test files / 191 tests — every gate against fakes in both directions, the publish order and a dry run that pushes, tags, uploads and submits nothing, and the two shell scripts run for real with a stub — and the 13 text-reading test files unchanged and green; full jest 411 suites / 6,320 tests (1 skipped, as before; 402 / 6,129 before). Nothing has run on a Mac: no gate has met a real `codesign`, `notarytool`, App Store Connect, GitHub or Gradle. Found while porting (the shell is unchanged; the TS does the right thing, and the shadow log will show where they differ): the Google-classes gate in both release.sh and verify-release.sh is `unzip -p … \| strings \| grep -qE` under `pipefail`, the very trap the script's own header warns about — `grep -q` leaves on the first match, `strings` takes SIGPIPE, the pipeline reports 141 and the `if` reads a found class as "not found", so on a real-size dex it cannot fire; `xcode-cloud.py ensure` turned every exit from `start` into a bare 2 and dropped Apple's message, which is why 2.25.0's log said "Starting one by hand" and nothing after; build-catalyst.sh's `codesign --verify --strict "$APP" && echo …` is an AND-list, exempt from `set -e`, so a signature that fails to verify is passed over in silence; release.sh's zip gate exits before unregistering the temp copy when it stops, leaving the LaunchServices record its own comment warns about. | Yes: 3.1–3.4 marked done in code, 3.5 written out as prepared-not-switched with what the switch itself is. The shell's `CYCLE_PATHS` gains `scripts/release`. |
| 2026-09-29 | P3.5, prepared | `RELEASE_TS=1 ./scripts/release.sh X.Y.Z [--dry-run]` and `RELEASE_TS=1 ./scripts/verify-release.sh vX.Y.Z` hand everything to the TypeScript (`exec`, so the exit status is the TS's); off by default, documented in DISTRIBUTION.md §1. Signing secrets stay where they were: the TS reads the same keychain profile, `asc.json` and provisioning profile on the Mac, and nothing new is stored. Behavioural tests for everything the text-reading tests hold are in `releaseTool*.test.ts`; the text-reading tests are kept, all green. Left for the Mac, in order: (1) check the Mac's Node (`node --version` ≥ 22.6; the shadow says so in one line if not); (2) cut the next two releases as usual and read `.release-shadow.log` after each — every disagreement is either a TS bug to fix or a shell bug to decide on (the four above are expected to show only if they fire); (3) `RELEASE_TS=1 ./scripts/release.sh X.Y.Z --dry-run` on the Mac, the first time the TS builds, signs and notarises for real; (4) two releases on `RELEASE_TS=1`, which is the phase exit; then retire the shell and the text-reading tests. | No. |
| 2026-09-29 | P1 finding | Found while porting the widgets: `WallClock.kt` built every date with `Calendar.getInstance`, which follows the locale. On the JVM a Thai locale gives a BuddhistCalendar: the device's key came out as 2569-09-21 — the v2 adapter would match no payload day and draw the last one — and an instant from a payload key landed 543 years out. The bug the iOS widgets had (fixed in the review above) and that `PrayerWidgetProvider.todayDateKey` guards against; whether Android's own libcore ever returns a non-Gregorian `Calendar` could not be checked here (its source is outside the session's network), so the device pass has a Thai item. Every WallClock date now goes through a `GregorianCalendar` either way. `WallClockCalendarTest` (contract-tests/kotlin) asks the same four questions under th-TH, th-TH-u-nu-thai, ja-JP-u-ca-japanese, fa-IR and ar-SA-u-ca-islamic and wants the root locale's answers; it fails on th-TH without the change, checked. Kotlin harness 11 tests pass. | No. |
| 2026-09-29 | P4.1 | Recheck: the branch is on Kotlin 2.2.0 (5.2), not 2.1, so the Compose compiler is the Kotlin plugin at 2.2.0; Hijri is still the smallest (185 lines + a 124-line layout). Hassan's instruction: do the steps in code now, measure on devices later. Hijri ported (`HijriGlanceWidget.kt`) from payload v2's typed `hijri` block; everything Glance in `src/glance` behind `-PmihrabGlanceWidgets` (off by default), with a no-op hook for the default build — the shipping build is unchanged and every RemoteViews provider stays registered. The shared part written once for all six: the typed payload read once per version, "today"/"next" by the v1 adapter's rules with instants from `WallClock.epochMs`, clock text from `WallClock.parts`, the card as the RemoteViews card embedded (Glance only rounds on 12+), a Chronometer embedded for the countdown (Glance has none), measured text where the layouts auto-sized, the error card with the class name. Compile-checked, not built: no Android SDK in the session and Google's Maven blocked, so a JVM Gradle project compiled the Glance sources, the contract and the 18 `src/main` widget files they reach with Kotlin 2.2.0 and its Compose plugin, against Robolectric's android-all for API 37, the Compose runtime/ui-unit/ui-graphics (JetBrains' JVM builds of the same packages), an `R` generated from the repo's `res/`, and Glance API stubs whose 78 declarations a script holds to androidx's published `api/1.1.0-beta01.txt` (names and parameter order; it fails on a renamed parameter, checked). Also checked: each commit on its own. | Yes: 4.1's measurements split into what a JVM can say and what a device must (the 4.2 table), and the F-Droid question answered in the text (the compiler is Kotlin's; the size is the cost, without R8). |
| 2026-09-29 | P4.2 | Gate written as a table (Phase 4 above): measured here — code 214 → 86 lines for Hijri and 3,954 → 1,949 for all six (the first figure includes the fan-out and alarms that stay), the Glance code at 59 classes / 414 methods of JVM bytecode against the RemoteViews code's 22 / 217, the Compose runtime at 598 classes / 4,992 methods as a proxy; not measurable here — Glance's own size, WorkManager/Room/DataStore, the APK, launchers, memory, render time, the F-Droid recipe, and the flag build under AGP at all. Pass criteria proposed for each. **Not passed; not claimed.** | Yes: the gate now says what has to be measured and what passes, and the APK-size bar needs Hassan's number. |
| 2026-09-29 | P4.3 | Ported in code, not switched: Tasbih (queue and projection through an `ActionCallback`), Streak (graph still `PracticeGridBitmap`, fed the typed days in the v1 shape it reads), Continue Reading (three states, three tiers, both taps), Log Today (two entries, dueness and countdown from minutes and instants), Prayer times last (three entries, three designs by `selectLayout`'s rules, extras contained as #31 asks), one commit each, every commit compile-checked on its own. No "HH:mm" parsed in any new code. Same sizes, variants, tap targets and intents as each RemoteViews twin; RTL through start/end as before; opacity, tint and highlight from `resolvedColors` as before — the dark/OLED/UI-style hints the app writes are read by no Android widget, RemoteViews or Glance. What Glance could not do and what stands in is listed under 4.3, as are three places it now does better (the countdown past ʿIshāʾ is exact). Found on the way: a Glance Row/Column/Box takes at most ten children (the strip's rules and the tasbih dots were rebuilt to stay under). Jest 402 suites / 6,129 tests unchanged and green (no JS touched); the contract harness green. | Yes: "one widget per release" becomes one *switch* per release after the gate; the last switch has to give boot, unlock and the alarm a receiver that is not a RemoteViews provider; the `*_preview.xml` layouts stay at the phase exit. |
| 2026-09-29 | P1.5, P1.7, compile check | The Android side of 1.5 and 1.7 compiled against the real Android framework (API 37 android-all, org.json) with Kotlin 2.2.0, the React Native bridge and `androidx.core` stubbed (their Maven hosts are blocked here): `PrayerWidgetProvider`, `PrayerWidgetLogProvider`, `PrayerWidgetModule`, `WidgetPayloadSource`, `MihrabLiveActivityModule`, `MihrabLiveActivityService`, together with the contract and every Glance file. No errors, no new warnings. Not an AGP build: the device pass step 0 still builds it for real. The Swift side of both steps is still not compiled anywhere; the contract harness in CI compiles `ios/Contract`, not the app or widget targets. | No. |
| 2026-09-29 | P3, shell fixes | The four gates the port found wrong are fixed in the shell too, so shadow mode compares two correct answers: the Google-classes check counts matches (`grep -c`) instead of `grep -q` in a `pipefail` pipe, in release.sh and verify-release.sh; `xcode-cloud.py ensure` prints why `start` failed before it exits 2; build-catalyst.sh stops on a signature that does not verify (both now `--verify --strict --deep`, same words); release.sh unregisters the unpacked zip on every `die` (`forget_unpacked_app`). The other pipes into `grep -q` were captured too, among them `git log | grep -q .` in the tap check, which read "unpushed" as "pushed". Also found: build-catalyst.sh (and the port) waited for `prayer_widget_payload_v1`, which 1.7 stopped writing — it waits for `_v2` now, and docs/release/catalyst-widgets.md says so. | No. |
| 2026-09-29 | P3, review fixes | A review of the release tool, fixed in the shell wherever the shell does the same thing, so shadow mode still compares like with like. The HTTP timeout now covers the body (it was cleared on the headers) and a request with no answer keeps its reason. A failing command that decides a stop has its stderr shown (`shown()`); a crash is written to `.release-attempts.log` like a stop; a dry run no longer appends the journal or makes the release commit. The Catalyst build hands the machine back on every exit after the smoke launch (the shell from its EXIT trap), unregisters the notarisation check copy before removing it, and restores Podfile.lock on a Ctrl-C (`Io.onInterrupt`). Gates that passed without looking: the Google-classes check on an APK with no readable dex, P12 on a commit message containing RUNNING, `ensure` on minutes that are not a number (NaN polled for ever). The cask's `depends_on` is compared with the app before publishing (B6 and release.sh's zip gate), not only in verification, and the array form `[:arm64]` is read. Shadow mode writes nothing: no fetch, git with `GIT_OPTIONAL_LOCKS=0`, no app unpacked (the cask compared off the plist and executable alone), held by a read-only allow-list test; it stops where the shell stopped on jest or tsc; iOS and CI lines asked a minute apart are notes when either is ⧗; U8 is held against XC_STARTED. `RELEASE_TS=1` on Node < 22.6 warns and runs the shell. | No. |
| 2026-09-29 | Review of the rewrite | Every part of `rewrite` reviewed again (iOS, Android, TypeScript, the release tool) and each finding fixed with a test where one can hold it. **Build breaks:** the Live Activity's `Row.CodingKeys` lacked `minutes`, so neither the app nor the Live Activity extension compiled — found by type-checking the non-contract Swift against stubs of SwiftUI, WidgetKit and ActivityKit under a Linux Swift 6.1, with runtime harnesses over the fixtures; build-catalyst.sh (and the port) waited for `prayer_widget_payload_v1`, which 1.7 stopped writing. **iOS:** `startV2` with nothing ahead ends the card; one `Row.at`; v2 adapted once per payload, day and minute, and logged when it does not adapt. **Android:** countdowns and the boundary alarm are instants (`WidgetInstants`, tested across Stockholm's spring and autumn nights), the Live Activity's Hijri date key is `WallClock`'s (Arabic digits and the Buddhist year had kept it from ever matching), the service no longer crashes when started with nothing to draw, the Live Activity re-adapts the stored shared payload on every start without one, a clock or zone change redraws through its own receiver and the stale-offset rebuild is retried only from contexts allowed to start it, and the three compiler warnings are gone. **Khatmah:** "previous day" on a plan by date counts yesterday in pages; an abandoned plan past the TTL is kept as a skeleton (dropped, an offline copy came back and took the khatmah over); "most progress" is Ḥafṣ pages, then ayahs; the merged list is ordered by start then id. **Widgets:** a week of today alone carries a known tomorrow (no next prayer after ʿIshāʾ otherwise); a week of per-day Hijri dates (`hijriDays`); a headless refresh builds in the app's language. **Tests:** jest never reaches the network (the audio suites were fetching everyayah.com — the flake); a store-level khatmah fuzz through the wire. **CI:** Node 22; a "Native builds" workflow builds Android with the Glance flag off and on, the iOS app with both extensions, and Mac Catalyst — its first runs found the CodingKeys break, the WorkManager duplicates and `mutableIntStateOf` in the Glance build. Jest 420 suites / 6,394 tests; the Swift and Kotlin contract harnesses; the Kotlin compile check with no warnings. | No. |

## Open items (not a step yet, each needs an owner)


- **P1.4's exit is not fully met.** Light/dark were not re-shot; on
  devices only two Android widgets were seen (Arabic, 24-hour); iOS was
  checked by comparing decoded content, not by drawing; the native
  adapters are held to the 8 English scenarios only. The next release's
  device pass should cover en/sv/ar × 12/24 h × light/dark on both.
- ~~**iOS falls back from v2 to v1 silently**~~ — done 2026-09-29: a v2
  that does not adapt is logged once per payload (category `payload`).
- ~~**The adapter's cost on iOS**~~ — done 2026-09-29: adapted once per
  stored payload, day and minute, shared by every widget kind and entry
  (as Android). Not measured on a device.
- ~~**`setDataV2` with an empty v2**~~ — done 2026-09-29: both platforms
  remove the key, and Android rejects a write that leaves nothing readable.
- ~~**Headless clock language**~~ — done 2026-09-29: a headless republish
  applies the saved language and the madhab's name for dawn before it
  builds, so the whole payload — not only the clock — is in the app's
  language.
- ~~**Khatmah reading in the translation view**~~ — decided 2026-09-30 (Hassan): reading in the translation view does not count towards a khatmah; only muṣḥaf page turns do, and "in both modes" meant the two plan types. As built; nothing to change.
- **Two live khatmahs**: the losing plan's reading is not carried into the
  kept plan (not asked for). A device on a build from before `supersededBy`
  shows both plans live and the earlier one first, as it always did. A
  kept plan that ended on a device that never knew the other plan leaves
  that plan as the khatmah elsewhere — a merge alone never ends a plan.
- **The Mac is signed and notarised nowhere but a release.** CI builds it
  (unsigned, React from source) on every push since 2026-09-29, so a
  compile break shows on the pull request; signing and notarising an
  Xcode 27 build is still first proven by the next release.
- **5.2's Mac zip**: worked around on `rn-0.87` (React built from source
  for the Mac); proven only when `build-catalyst.sh` signs and notarises.
- ~~**The Glance build under R8.**~~ — built 2026-09-30: `assembleFdroidRelease` (R8 and
  shrinking on) succeeds with and without `-PmihrabGlanceWidgets=true`, no
  WorkManager, Room or Glance warnings. APK 96,161,828 → 98,265,213 bytes
  (+2.1 MB, +2.2%), dex 28.2 → 32.5 MB uncompressed. Not run: the Play
  flavour's signed bundle, and the widgets on a device from that APK.
  The APK-size bar for the 4.2 gate is still Hassan's number.
- **Glance's version**: 1.1.1 is the last release checked here (against
  its published API file, not its binary); take the current stable at the
  gate and re-check the stubs' API against it.
- ~~**The v1 fallback**~~ — moot since 1.7: the app writes v2 alone.
- **Hijri dates past a week**: the payload carries a week of per-day Hijri
  dates (`hijriDays`); a widget left longer than that without the app
  shows no Hijri date rather than a stale one.
- **Android 17's "At" metric** decides 12- or 24-hour from whether the
  payload's `nextTimeDisplay` differs from `nextTime`, because the
  v1-shaped payload carries no `hour12`. Right for every payload the app
  writes; an `hour12` in the Live Activity payload would make it explicit.
- ~~**CI on pushes to `rewrite`**~~ — done 2026-09-30: the branch merged, and `native.yml` now runs on pushes to `main` only.
- ~~**The Homebrew cask**~~ — done 2026-09-29: it asked for Ventura (a
  guess from the day the tap was made) while the app needs 12.1, so it
  now says `:monterey`, keeps `:arm64` (the build is Apple silicon only),
  and its README says both and that the widgets need macOS 14.
  `verify-release.sh` compares the cask's `depends_on` with the published
  app. The app has not been run on Monterey or Ventura by anyone yet.
