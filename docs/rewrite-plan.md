# Targeted rewrites: the four places the bugs keep coming from

> **Status (2026-09-28): planned, nothing started.** Decision (Hassan,
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

Target: one schema, generated types on all three sides, **times as
timestamps** (epoch ms plus the local date key they belong to) and
formatting done where the text is drawn, with the user's 12/24-hour
choice passed as a flag. A `schemaVersion` on every payload.

**1.1 Inventory.** Every value that crosses TS → native (widget payload,
widget blocks, Live Activity payload, the widget refresh path) and native →
TS (`WidgetLogQueue`, `WidgetTasbihQueue`): who writes it, who reads it, and
whether it is data or pre-formatted text. *Exit:* a table in this file.

**1.2 Schema and generation.** One schema (JSON Schema, or TypeScript types
the generator reads) → Swift `Codable` and Kotlin data classes, generated
by a script and checked in; a test fails when the checked-in code is stale.
Choose the generator (quicktype or similar) by trying it on the real
payload. *Exit:* generated types compile in both native targets.

**1.3 Contract tests across languages.** Today there are no native unit
tests at all. Add a Kotlin JVM test target and a Swift package test for the
decoders; the TypeScript tests write golden payload fixtures that the
native tests decode. *Exit:* a payload change that one side misreads fails
CI.

**1.4 Widget payload v2, written beside v1.** The app writes both; natives
read v2 when present and fall back to v1, so an app update and a widget
reading an old payload never disagree. Formatting moves into the natives.
*Exit:* all widgets on both platforms draw from v2, verified in en/sv/ar,
12- and 24-hour, light/dark.

**1.5 Live Activity payload v2** (iOS ActivityKit attributes, Android
service). *Exit:* Live Activity correct on both clocks, both platforms.

**1.6 The queues back to the app** (log, tasbih) on the same schema.

**1.7 Remove v1** one release after 1.4–1.6 have shipped.
*Phase exit:* no native code parses a formatted time; one schema; contract
tests in CI.

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
