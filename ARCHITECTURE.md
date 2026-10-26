# Mihrab — Architecture

The technical reference for contributors: what the app is, the stack, where
things live, how to build and run it, the native modules, and the patterns
that keep prayer data correct. Read this after **[CONTRIBUTING.md](CONTRIBUTING.md)**
(the rules) and before non-trivial work. The five design principles have their
own home in **[docs/design/principles.md](docs/design/principles.md)**; the
release pipeline is in **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)**.

## 1. What is Mihrab

A prayer-times + Islamic-life companion app. Bundles:

- **Prayer times** for the 5 daily prayers + Sunrise, fetched from one of 4 providers (or computed on-device offline).
- **Home-screen widgets** on both platforms (small / medium / large + iOS Lock-Screen accessories).
- **Notifications** — adhan alerts, pre-prayer reminders, fasting reminders, journal log actions.
- **Live Activity** — pinned countdown to next prayer (Android ongoing notification with progress bar + iOS ActivityKit Lock Screen / Dynamic Island).
- **Companion content** — Quran reader (Arabic + 14 translations), Tilāwah (continuous recitation with lock-screen controls), duas (Hisnul Muslim), Tasbih, Qibla compass, monthly calendar, prayer journal, fasting tracker.
- **13 locales** in full parity: `en sv ar bn de es fr hi id ru tr ur zh`. Arabic and Urdu are RTL.

Bundle ids:

| Channel | Android applicationId | iOS bundle id |
|---|---|---|
| Stable | `com.prayer_times` | `com.hassan.prayerapp` |
| Beta | `com.prayer_times.beta` | — (TestFlight uses the same `com.hassan.prayerapp`) |

## 2. Stack

| Layer | Detail |
|---|---|
| Runtime | React Native 0.87 (new architecture), Hermes, TypeScript strict |
| State | `PrayerSettingsContext` (AsyncStorage-backed) in `src/context/`, sliced into domain contexts (Appearance, Location, Notifications, DataSource, Widget, LiveActivity) |
| Styling | `useAppPalette()` hook — never hardcode colours. Design tokens live in `src/theme/tokens.ts`; the palettes (light, dark, pure black, the six colour themes, Material You / Liquid Glass, and Sky — see §6) in `src/theme/` |
| i18n | `src/i18n/` — 13 locales loaded statically; runtime switch via `i18n.changeLanguage(lang)` |
| Tests | Jest — `npx jest` or `npx jest --testPathPattern=<name>` (run with `NODE_ENV` unset or `test`) |
| Native | Kotlin (Android: widgets, Live Activity, the alarm screen, Do Not Disturb, the launch picture, fonts, …) + Swift (iOS: widgets, ActivityKit, AlarmKit, compass, the launch picture, …) — the table in §5 |

## 3. Source layout

```
src/
├── backup/, sync/            Export/import, and the device-to-device sync (docs/design/sync-p2p.md)
├── boot/                     The launch: launchWarp.ts — the run from the kept picture to now (§6)
├── components/               Shared UI (Group, Row, SkyMoodStrip, …)
├── context/                  PrayerSettingsContext + domain slices
├── dhikr/, duas/, tasbih/    Adhkār, duas and the counter
├── fasting/, ramadan/,       Fasting days, Ramadan, Jumuʿah/Eid treatment
│   seasonal/
├── home/                     The home screen's one-time offers (alerts, the Sky theme)
├── hijri/                    Gregorian↔Hijri conversion — standard tabular, Indonesia
│                             (Government & NU, Muhammadiyah), published overrides
├── hooks/                    usePrayerDay, usePrefetchSavedLocations, useAppPalette …
├── i18n/                     i18next bootstrap + 13 locale JSONs
├── journal/                  The prayer log (windows, late marking, timing)
├── liveActivity/             Cross-platform Live Activity orchestrator (syncLiveActivity.ts)
├── native/                   Typed wrappers for Android+iOS native modules (§5)
├── navigation/               Tabs, stacks, deep links
├── notifications/            notifee schedulers: prayer alerts, the full-screen alarm,
│                             Do Not Disturb, fasting and dua reminders, Live Activity
├── onboarding/               The first-run walkthrough
├── polish/                   What's new sheet + generated release notes, haptics, rate
├── practice/                 Sunnah prayers (rawātib)
├── prayer/                   prayerStorage.ts — AsyncStorage cache with write-mutex;
│                             daruriTimes.ts — the Mālikī second times
├── providers/                Prayer-time sources: aladhan, prayertimes_dev, localAdhan
│                             (on device), Sweden's own calculation (congressMethod.ts
│                             + swedenCorrections.ts), the bundled regional datasets —
│                             Morocco (Habous), Algeria (MARW) — plus validateTimings.ts
│                             and providerHealth.ts
├── quran/                    Quran data + readers (muṣḥaf, sūrah, word reader, tajwīd),
│                             the khatmah, downloads, and audio/ — the shared playback store
├── responsive/               Breakpoints, the Mac/iPad dashboard, ResponsiveModal
├── screens/                  Top-level screens
│   ├── home/                 HomeScreen sub-components (TodayCard — the hero and its sky)
│   └── settings/             Settings cards extracted from SettingsScreen
├── settings/                 Settings types + storage glue
├── share/, sound/            Month-sheet sharing; adhan sounds
├── theme/                    Tokens, palettes, the Sky theme (skyMoods.ts, skyTheme.ts)
├── utils/                    Shared utils — prayerTimes math, coords helpers, …
└── widget/                   buildWidgetPayload.ts + syncPrayerWidget.ts (cross-platform)

android/                      Native Android sources + Gradle
ios/                          iOS Xcode project + Pods
contrib/fdroid/               F-Droid submission kit (yml, MR notes, checklist)
data/                         Bundled datasets (regional timetables, Hijri overrides)
docs/                         The website (index.html + 12 generated languages) and the
                              design docs (data-sources.md, design/, release/, release-log.md)
release-notes/                The in-app "What's new", one file per versionCode and language
scripts/                      release.sh + scripts/release/ (the cut), build-site.js,
                              build-release-notes.js, the audits (.claude/commands wrap them)
tools/                        Dataset builders (habous, MARW, hijri-calendars, qiraat)
.claude/                      Slash commands + subagents (designer, reviewer, …)
fastlane/metadata/            Play / App Store listing copy and the Play changelogs
```

### Key files

**Prayer data**
- `src/prayer/prayerStorage.ts` — AsyncStorage cache with `_writeMutex` (prevents concurrent-write data loss).
- `src/providers/fetchPrayerTimes.ts` — fan-out to all providers; calls `validateTimings()` on every response.
- `src/providers/validateTimings.ts` — asserts all 6 keys present and `HH:MM` formatted; throws on failure.
- `src/providers/localAdhan.ts` — on-device fallback (adhan.js); used when network fails.
- `src/providers/congressMethod.ts` — Sweden's times, calculated on the phone: the International Prayer Times Congress method as Diyanet computes the tables Islamiska Förbundet publishes, with the yearly correction list in `swedenCorrections.ts`. Source: [MihrabHQ/mihrab-methods](https://github.com/MihrabHQ/mihrab-methods).

**GPS & location**
- `src/hooks/usePrayerDay.ts` — instant-load pattern (shows cached coords, GPS in background, refetches only if device moved >~1 km via `coordsChangedSignificantly`).
- `src/context/PrayerSettingsContext.tsx` — persists `lastFetchedLatitude/Longitude`; clears them on location-mode switch.

**Home-screen widget**
- `src/widget/buildWidgetPayload.ts` — JSON pushed to both platform widgets; rolls to tomorrow after Isha.
- `src/widget/syncPrayerWidget.ts` — called from HomeScreen on every focus.
- `src/native/PrayerWidget.ts` — typed wrapper for the `PrayerWidget` native module (Android + iOS).
- `android/app/src/main/java/com/prayer_times/PrayerWidget*.kt` — Android widget providers + module.
- `ios/PrayerWidgetExtension/PrayerWidgetExtension.swift` — WidgetKit timeline provider; handles day-rollover.

**Live Activity (v2.1.0+)**
- `src/liveActivity/syncLiveActivity.ts` — platform-dispatch orchestrator.
- `src/notifications/liveActivity.ts` — JS-side Android renderer (channel + notifee fallback).
- `src/native/MihrabLiveActivity.ts` — typed wrapper for the Android Kotlin module.
- `android/app/src/main/java/com/prayer_times/MihrabLiveActivityModule.kt` — Kotlin module with platform `Notification.Builder` + `setShortCriticalText` + `setRequestPromotedOngoing` for Android 16 status-bar chip.
- `src/native/PrayerLiveActivity.ts` — iOS ActivityKit wrapper.
- `ios/PrayerApp/PrayerLiveActivity.swift` + `.m` — ActivityKit bridge.
- `ios/PrayerWidgetExtension/PrayerLiveActivityWidget.swift` — SwiftUI Lock Screen + Dynamic Island views.
- `ios/PrayerWidgetExtension/PrayerLiveActivityAttributes.swift` — shared `ActivityAttributes` (member of BOTH targets via pbxproj entry).

**Notifications**
- `src/notifications/prayerNotifications.ts` — schedules notifee notifications; resyncs on TZ change and AppState active.
- `src/notifications/adhanSafetyControls.ts` — dedupe + stale notifications guards.
- `src/notifications/fastingReminders.ts` — day-before reminders for Monday/Thursday/Ashura/Arafah/etc.
- `src/notifications/notificationActions.ts` — snooze + silent-next action handlers.

**Settings UI**
- `src/screens/settings/` — `*Card.tsx` files: Appearance, DataSource, Location, SavedLocations, Calculation, Notifications, LiveActivity, About + the matching modals.

## 4. Local dev — build & run

### Bootstrap

```sh
npm ci --no-audit
cd ios && pod install && cd ..
```

### Run on Android emulator/device

```sh
npm run android                       # iPhone-paired Pixel by default (scripts/run-android-phone.js)
./android/gradlew -p android installFdroidDebug
./android/gradlew -p android installPlayDebug
```

### Run on iOS simulator

```sh
cd ios
xcodebuild -workspace PrayerApp.xcworkspace -scheme PrayerApp \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build/sim -quiet build
xcrun simctl install booted build/sim/Build/Products/Debug-iphonesimulator/PrayerApp.app
xcrun simctl launch booted com.hassan.prayerapp
```

Or just open `ios/PrayerApp.xcworkspace` in Xcode and Run.

## 5. Native modules

All Android Kotlin modules live in `android/app/src/main/java/com/prayer_times/`. All iOS Swift / Obj-C live in `ios/PrayerApp/` (main app target) or `ios/PrayerWidgetExtension/` (widget extension target).

| Module | Android | iOS | JS wrapper | What it does |
|---|---|---|---|---|
| `PrayerWidget` | `PrayerWidgetModule.kt` | `PrayerWidget.m` + `WidgetTimelineReloader.swift` | `src/native/PrayerWidget.ts` | Push JSON payload to home-screen widget; reload widget timeline |
| `MihrabLiveActivity` | `MihrabLiveActivityModule.kt` | — | `src/native/MihrabLiveActivity.ts` | Post Android Live Activity ongoing notification with progress bar + chronometer + Android 16 chip metadata |
| `PrayerLiveActivity` | — | `PrayerLiveActivity.swift` + `.m` | `src/native/PrayerLiveActivity.ts` | Start/update/end iOS ActivityKit Live Activity (Lock Screen + Dynamic Island) |
| `Compass` | `CompassModule.kt` | `CompassModule.swift` + `.m` | `src/hooks/useQiblaCompass.ts` | Magnetometer stream for Qibla compass |
| `PrayerBuildInfo` | `PrayerBuildInfoModule.kt` | `PrayerBuildInfo.m` | `src/native/PrayerBuildInfo.ts` | Exposes the Android product flavor (`play` / `fdroid` / `github`) |
| `AppVersion` | `AppVersionModule.kt` | `AppVersion.m` | inline | Exposes versionName + versionCode |
| `SystemTheme` | `SystemThemePackage.kt` | — | inline | Material You dynamic-color current accent |
| `SystemClock` | `SystemClockModule.kt` | `SystemClock.m` | `src/native/SystemClock.ts` | Is the device clock set to 24-hour time? (issue #18 — neither platform exposes this to JS). Constant `is24Hour` + method `readIs24Hour()` — **different names on purpose**: a method and a constant sharing a name leaves one unreachable in every bridge mode. |
| `LaunchSnapshot` | `LaunchSnapshot.kt` + `LaunchSnapshotPackage.kt` | `MihrabLaunchSnapshot.swift` + `.m` | `src/native/LaunchSnapshot.ts` | The last Today screen kept as a picture and shown as a launch's first frame — see §6 |
| `FullScreenAlarm` | `FullScreenAlarmModule.kt` + `PrayerAlarmActivity.kt` | — | `src/native/FullScreenAlarm.ts` | The full-screen prayer alert over the lock screen (#63), painted in the Sky theme's hour when the app wears it |
| `PrayerAlarms` | — | `PrayerAlarms.swift` + `.m` | `src/native/PrayerAlarms.ts` | iOS 26 AlarmKit: ring like the Clock app, with Stop and Snooze (#63) |
| `PrayerSilence` | `PrayerSilenceModule.kt` | — | `src/native/PrayerSilence.ts` | Do Not Disturb around the prayers you pick, scheduled natively so it runs with the app closed (#60) |
| `AdhanPlayer` | — | `AdhanPlayer.swift` + `.m` | `src/native/AdhanPlayer.ts` | Plays the full adhan in the foreground; iOS caps notification sounds at 30 s |
| `CustomAdhan` | `CustomAdhanModule.kt` | `CustomAdhan.swift` + `.m` | `src/native/CustomAdhan.ts` | Import the user's own adhan recording through the system picker |
| `WordPlayer` | `WordPlayerModule.kt` | `WordPlayer.swift` + `.m` | `src/native/WordPlayer.ts` | One slice of an āyah recording — the word reader's player, beside the recitation's queue |
| `AudioRoute` / `NowPlayingState` | — | `AudioRouteWatcher.swift`, `NowPlayingState.swift` | `src/native/AudioRoute.ts`, `NowPlayingState.ts` | Headphones-out pauses playback; the Mac's required now-playing state |
| `VolumeKeys` | `VolumeKeysModule.kt` | — | `src/native/volumeKeys.ts` | The volume buttons as page-turn keys while the muṣḥaf captures them (#68) |
| `MushafFont` / `MushafLine` | `MushafFontModule.kt`, `MushafLineView.kt` | `MushafFont.swift`, `MushafLine.swift` | `src/native/MushafFont.ts` | Runtime registration of the 604 page fonts; the native line view that draws a page line |
| `DisplayCutout` / `RotationCover` | `DisplayCutoutModule.kt`, `RotationCover.kt` | — / `MihrabRotationCover.swift` | `src/native/DisplayCutout.ts`, `RotationCover.ts` | Where the camera is (the fullscreen muṣḥaf lays out beside it); a sheet of page colour the platform raises as the window turns |
| `SyncFolder` / `ScanQr` / `SecureRandom` / `MihrabClipboard` | `SyncFolderModule.kt`, `ScanQrModule.kt`, `SecureRandomModule.kt`, `MihrabClipboardModule.kt` | `SyncFolder.swift`, `ScanQr.swift`, `SecureRandom.swift`, `MihrabClipboard.swift` | `src/native/FilePicker.ts`, `src/sync/` | The device-to-device sync's folder, pairing QR, keys and clipboard |
| `WidgetQueueWatcher` | `WidgetQueueEvents.kt` | `WidgetQueueWatcher` (Darwin notification, Mac/iPad) | `src/native/WidgetQueueWatcher.ts` | The third drain trigger: a widget's log queue changed while the app was in front |
| `MihrabKeepAwake` / `Haptics` / `KeyCommands` / `RateApp` | — | `.swift` + `.m` | inline | Screen awake while reading; haptics; Mac keyboard shortcuts; the App Store review prompt |

All modules are registered in:
- Android — `MainApplication.kt` `packageList`.
- iOS — automatic via `RCT_EXPORT_MODULE` + Pods autolinking (no manual registration needed).

### iOS shared types across targets

`PrayerLiveActivityAttributes.swift` is a member of **both** the main app target AND `PrayerWidgetExtension`. ActivityKit requires the `ActivityAttributes` type identity to match across the requesting (app) and rendering (widget) modules. This dual membership is set up via direct `pbxproj` edits (see commit history).

## 6. Patterns & rules

### State management
`PrayerSettingsContext` is sliced into domain contexts (`useAppearanceSettings`, `useLocationSettings`, `useNotificationsSettings`, `useDataSourceSettings`, `useWidgetSettings`, `useLiveActivitySettings`). Consumers subscribe to the narrowest slice they need. The legacy `usePrayerSettings()` facade still exists for cross-cutting consumers.

Single storage blob under `prayerapp.settings.v1` in AsyncStorage. **Schema migrations are additive only** — adding fields is safe, removing or repurposing them breaks upgraders.

### Clock times are two different strings (issue #18)

`formatDisplayTime` / `formatLocalTime` produce **canonical 24-hour `HH:mm`**. That string is machine data and must never be localised: the iOS widget's progress ring splits it on `":"`, `logMinutesOfDay` turns it into minutes-of-day, Android's `epochForDayTime` matches it against `^(\d{1,2}):(\d{2})$`, and `lockScreenPayload` compares it lexicographically against `nowHHMM`.

What the user reads comes from `src/utils/clockFormat.ts`, and only ever through:

- **In React** — `useClockFormatter()` (`src/hooks/useClockFormatter.ts`). Every screen that prints a time uses it.
- **Outside React** — `activeClock()` (`src/utils/activeClock.ts`), a mirror of the preference kept beside `i18n`, set by `PrayerSettingsProvider`. The widget and Live Activity payload builders are plain functions and use this.

Payloads carry **both**: `time` for the parsers, `display` for the renderers — and `display` is **omitted when it equals `time`**, so a 24-hour payload is byte-identical to what it always was. Native falls back to `time`, which is exactly right when the two agree (`PrayerWidgetProvider.displayTime`, `Row.text` in Swift).

The digits are always Latin. Only the day-period marker ("PM", "م", "下午") and its position come from `Intl`, so a time never renders in Arabic-Indic digits beside a Latin-digit countdown on the same card.

`'auto'` follows the device's own 12/24-hour switch, via the `SystemClock` native module. When that module cannot be reached the fallback is **24-hour** — what this app has shown since its first release — never a guess from the locale.

Anything that builds a payload outside React — `republishWidgetPayload` from a headless task, a notification's background handler, or launch before the provider's effect — must call `setActiveClockFormat(settings.clockFormat)` and `await refreshSystemIs24Hour()` first, the way it already does for `language`. And anything in `HomeScreen` that re-syncs the widget, the Live Activity or alert copy keys on the **resolved** `useClockFormatter().hour12`, not on `settings.clockFormat`: on `auto` the answer moves when the device switch does, with no setting changing.

### Mālikī second times (issue #19)

`src/prayer/daruriTimes.ts` computes when each prayer's preferred (*ikhtiyārī*) window closes and its late (*ḍarūrī*) window opens. On-device, from coordinates and the date, beside whichever provider supplied the day — no provider publishes these.

Four rules it exists to hold:

- **Two of the five are rows the card already has.** The book defines Ẓuhr's boundary as ʿAṣr's beginning (fn. 656) and Maghrib's as Ishāʾ's (fn. 659). So `DhuhrDaruri` is `timings.Asr` and `MaghribDaruri` is `timings.Isha` — reused, not recomputed, because a second ʿAṣr a minute from the first reads as a bug. The one exception: on Ḥanafī ʿAṣr (`school === 1`, passed as `asrShadow: 2`) the row is the wrong madhhab's, and the 1:1 shadow is computed instead.
- **`confidence` is part of the answer.** Ẓuhr's, Maghrib's and Ishāʾ's (a third of the night) are `computed` — exact on the card's own terms. Fajr's *isfār* (−6°) and ʿAṣr's *iṣfirār* (+5°) are `modelled` — an angle standing in for something the eye judges — and the row says "approx." for them.
- **Every boundary is gated against the card's own rows** (`inside()` in `daruriTimes.ts`): strictly after its prayer, strictly before the event that closes the second time, wrap-aware for the night. The solar rise/set gate cannot do this alone because rows are not always angles — Stockholm's dataset puts midsummer Fajr at 02:11 while *isfār* is 01:59, and the offline engine's high-latitude rule puts Malmö's Ishāʾ *after* the first third of its own night. Both are dropped. The same gate drops boundaries that are hours off because the device zone is not the location's (a manual location abroad): blank, never wrong.
- **Where a modelled angle has a stated range, take the end that closes the window EARLIER.** The source gives −6° to −4° for *isfār*; morning twilight brightens toward sunrise, so −4° is the later clock time, and a boundary placed late tells someone they are still in the preferred window when they may already be in the ḍarūrī one. Begin late, end early — and the end of an ikhtiyārī window is an end. (*Iṣfirār* is a single number, not a range, so it is not shifted: that would be inventing a boundary rather than choosing conservatively within a stated one.)
- **Ḥanafī ʿAṣr is a real conflict and the card says so.** With `school === 1` the Ẓuhr boundary (1:1, because it is Mālikī) lands ~30 min before the 2:1 ʿAṣr on the row below. The toggle is not hidden — someone may want exactly that — but the help text turns into a warning in `palette.danger` before the switch is touched.
- **The shadow is always 1:1**, whatever `school` says. A Ḥanafī asr setting must not produce a Mālikī boundary from a Ḥanafī shadow.
- **A window needs both ends.** A boundary OPENS a window some other event CLOSES — Fajr's ḍarūrī runs to sunrise, Ẓuhr's and ʿAṣr's to sunset — and an angle can be reached on a day when that event never happens. Under the midnight sun in Tromsø the sun still descends through +5° and still casts the 1:1 shadow, so an implementation that only asked "was the angle reached?" prints an ʿAṣr boundary for a window ending at a sunset that never comes. So: no sunrise, no Fajr boundary; no sunset, no afternoon or evening one. That, plus the angle simply not being reached (above ~55° the sun misses 17° of depression in midsummer), is the whole polar fallback, and the answer is always the same one — nothing.
- **Ishāʾ's is not gated on the sun**, on purpose: it is a third of the interval between two times the card is already showing, not a claim about where the sun is. It is the **same instant as the `Firstthird` row**, and the two must appear and disappear together — `injectNightTimes` falls back to the day's own Fajr on the last day of a window, so `daruriTimesForDay` does too (`nightEnd`). Requiring a real tomorrow printed that one moment twice on the last row of every month: a time in the first-third column, a blank under Ishāʾ.
- **Refraction.** Sunrise/sunset come from adhan.js at −0.833° (refraction + solar radius), which is what "the appearance of the top of the sun" and every published table mean. The twilight angles are geometric, as the constants in the madhhab tables are quoted. Only *iṣfirār* at +5° is low enough for refraction to matter (~9′, under a minute of clock time at mid-latitudes) — well inside the uncertainty that makes it `modelled` in the first place.
- **Attributed.** *Al-Murshid al-Muʿīn* (Ibn ʿĀshir), as rendered in *The Guiding Helper*, Song 11 — named on the settings card where the toggle is.
- **The engine import is guarded.** `daruriImportOk()` exists so a version bump that changes adhan.js's internals fails the test suite instead of silently returning NaN for every boundary; `solarDaruriBoundaries` degrades to `{}` rather than throwing.

It reaches three surfaces, all off until the toggle is on:

- **Today card** — a small line under each of the five prayers, derived reactively in `HomeScreen`'s `view` memo so the toggle takes effect without a re-fetch.
- **Month table** — a second, smaller line under **Fajr, ʿAṣr and Ishāʾ only** (`DARURI_CELL` in `MonthTable.tsx`). Ẓuhr's and Maghrib's boundaries *are* the ʿAṣr and Ishāʾ columns, and printing them again would be the same number twice on one row; `month.daruriLegend` says so in words. Row height comes from `monthRowHeight(showDaruri)` — the stylesheet and `MonthTimesScreen`'s `getItemLayout` must both use it or the list scrolls to the wrong offsets.
- **Notifications** — opt-in **per boundary** (`malikiSecondTimeAlerts`, empty by default) with a shared lead time (`malikiSecondTimeAlertMinutes`, default 15, 0 = at the boundary). Five more alerts a day on top of the prayers and reminders is how an app teaches people to swipe its notifications away, so showing a boundary and announcing it are separate decisions. They never carry the adhan — same rule as Sunrise and the night marks — and get their own `pt-daruri-` id prefix so the existing cancel/keep diff manages them with everything else.

The boundaries ride in the `TimingsMap` under keys nothing else iterates (`FajrDaruri`, …), so the widget and Live Activity are still untouched.

`adhan` is mocked wholesale in `jest.setup.js`; this module reaches `adhan/lib/cjs/SolarTime` directly and is unaffected, but a test that wants the real library must `jest.unmock('adhan')` — and must pass a plain `{latitude, longitude}`, because adhan's ESM `Coordinates` does not survive being handed to the CJS `SolarTime`. **Tests must not hard-code provider rows**: rows are clock strings in the device's zone and the gate compares them against solar instants in the device's zone, so typed-in "05:30"s are only right in one zone. `rowsFor()` in `daruriTimes.test.ts` generates them from the engine in the runner's zone; the suite is run in seven zones including UTC+8:45.

### Provider validation
Every network provider response must pass through `validateTimings()` (asserts all 6 keys + `HH:MM` format). `localAdhan` is the only exempt path — it's deterministic on-device math.

### Widget payload rollover
After Isha, `buildWidgetPayload()` switches to tomorrow's data. iOS WidgetKit's `Provider.getTimeline()` mirrors this — when every `HH:MM` is in the past, it uses tomorrow's calendar date as the timeline base.

### Widget contract (payload v2)
`scripts/contract/widget-contract.js` describes what the app hands its widgets and what they hand back; `npm run gen-widget-contract` generates the TypeScript types and reference readers (`src/widget/contract.generated.ts`), Swift (`ios/Contract/`) and Kotlin (`android/…/contract/`). Never edit the generated files. The readers are lenient by construction: a missing or mistyped required field makes its object unreadable, anything else falls back to its default, and a list drops the elements it cannot read. Times travel as wall clock — minutes after local midnight of the day's `dateKey`, with the UTC offset they were built under — and only `WallClock` (one per platform) turns them into text or instants.

The app writes v2 beside v1 in one native call (`setDataV2`; plain `setData` removes v2). The widgets read v2 when it is there and reads, through an adapter (`WidgetPayloadV1` in Swift and Kotlin) that produces the v1 JSON their renderers already draw — so the renderers are unchanged, and v1 is still the fallback. `contract-tests/` holds the cases every platform is held to: `npm run contract-fixtures` records the app's answers, `scripts/contract-test-native.sh` runs them through Swift and Kotlin, and CI runs both.

### The Quran store and the khatmah
The reader's persistent state is one AsyncStorage blob, `mihrab.quran.v1`, held by `src/quran/quranState.ts` (state, hydrate, persist, subscribe, and the coerce that reads any stored blob back into shape). Everything else about it is split by what it does, and imports only downwards:

- **Pure, below the store:** `quranTypes.ts` (the blob's types) → `khatmahProgress.ts` (pages and ayahs, the done set, reach, holes, and `oneLivePlan`, which picks the one live plan when a sync brings two) → `khatmahSchedule.ts` (duration or deadline, days, portions, today's cut) → `khatmahStatus.ts` (today's state, days left, finish target, behind-by). `khatmahEdits.ts` (the plan edits the writers make) sits beside `khatmahStatus.ts` on `khatmahProgress.ts` and `khatmahSchedule.ts`, not on top of it. None of these imports the store.
- **Writers, above the store:** `readerMarks.ts` (the reading marker, bookmarks, stars) and `khatmahActions.ts` (start, pace, read, pin, reset, abandon), each a write through `updateQuranState`. The store imports neither.

Import a name from the module that holds it; the store re-exports nothing. `__tests__/khatmahModules.test.ts` holds the order.

### Concurrent cache writes
`prayerStorage.ts` serialises all `setItem` calls through `_writeMutex`. Do not bypass it — losing the mutex causes intermittent data loss when GPS and a manual refresh fire at the same time.

### Settings card pattern
Each `*Card.tsx` in `src/screens/settings/` consumes its narrow slice, owns its own UI state, and uses the shared `sharedSettingsStyles` for chrome. Modals are extracted (`MethodModal`, `PreReminderModal`, etc.) so the card stays under ~150 lines.

### Live Activity lifecycle (Android)
The Android implementation goes through the native Kotlin module, not notifee, because notifee 9.x doesn't expose Android 16's `setShortCriticalText` or `setRequestPromotedOngoing`. The orchestrator (`syncLiveActivity.ts`) routes through `MihrabLiveActivity.display()` on Android and `PrayerLiveActivity.start()` on iOS. The HomeScreen `useEffect` re-fires the sync on every state change + on focus.

**On hardened shells (GrapheneOS, some MIUI builds), custom `RemoteViews` are silently stripped** at notification post time. The current implementation uses standard `InboxStyle` + `setProgress` + `setUsesChronometer` so it renders on every shell.

**Held back while the app is in front.** `MihrabLiveActivityService` keeps the rich notification unposted while `MainActivity.resumed` is true — set from `onCreate`, so a launch's restart holds it too — and posts it on `onPause`. Otherwise a heads-up card slid over the hero on every open. The builder has `setOnlyAlertOnce`, and a "silent" line is NOT a fix: a promoted-ongoing notification strips the group trick that was tried first.

### The launch picture and the launch run

A cold start used to be a splash, a skeleton and then the page. Now it is the last Today screen, kept as a picture, shown as the first frame, with the hero then running from the prayer it counts from to now.

- **The picture** (`LaunchSnapshot.kt`, `MihrabLaunchSnapshot.swift`, `src/native/LaunchSnapshot.ts`). Native keeps a PNG of the Today screen on leaving, with a *look key* (`setLaunchSnapshotLook(key, nightMatters)` — language, clock format, palette, Material You accent, and the system night mode only when the theme follows it, `settings.appearance === 'system'`) and the interval it was posed for. It is shown only when the look still matches, the window fits, and it is not older than `MAX_AGE_MS` (`abs()`, because a clock set back makes the age negative). JS captures a **posed twin** of the hero — the hero drawn at the start of the current interval, under the real one, whole with its bleed into the status bar — so every launch opens on the prayer and sweeps the whole way.
- **The run** (`src/boot/launchWarp.ts`, used by `TodayCard`). A `WarpStart {remaining, pct, at, targetAt}` comes from the picture's pose, or from the current interval's start when there is no picture or it was posed for another interval. `decide()` → `begin()` → `markLaunchRunReady()`: the run begins `WARP_AFTER_HIDE_MS` after the picture's fade is asked for (`onHideRequested`, capped at `WARP_HIDE_WAIT_MAX_MS` from the hero's mount) and not until the native `Animated` value has a listener (within `WARP_READY_MAX_MS`), so the sky, the rail and the countdown all move from the first frame; it is timed by frames drawn, not the clock, so a JS stall pauses it. The sky is driven by one native `Animated.timing` with the ease continued from where the run already is. It is a setting (on by default); off, the picture fades into the live screen.
- **The return run** (`startResumeRun`, from `HeroToday`'s clock effect). The hero's clock stops while it is not active (`useIsActive`: background, another tab, a screen over Today). On coming back `RESUME_RUN_MIN_MS` or more later, the hero starts a run of the same kind from the numbers it last showed (`shown`, written every render: remaining, rail fill, the moment, the target) — or, when a prayer has come meanwhile, from the new interval's start, as a launch does. No picture, no fade: it begins when the sky's layers have taken the value. A tick that finds the clock jumped by as much (set forward, the JS thread held) is the same return. The app's foreground listeners that draw on the JS thread (the day's resync in `usePrayerDay`, `republishWidgetPayload('foreground')`, `maybeAutoSync('open')`) wait for it (`afterRun()`). Every run ends with one `[run]` logcat line: kind, frames drawn, stalls, the longest, its length.
- **Rules.** A window is a launch (an app swiped away and reopened gets both); a widget's `mihrab://today` tap is a plain launch; the launch's side work (widgets, Live Activity, notifications) waits for the sweep. `__tests__/launchWarp.test.ts` and `launchWarpSimulation.test.tsx` hold the semantics; `tools/startup-trace/` measures a real phone.

### The Sky theme

`appearance: 'sky'` paints the whole app from the sky over the countdown — one look through light and dark — rather than tinting a palette.

- **Moods, keyed to the sun** (`src/theme/skyMoods.ts`). A `SkyMood` is a set of tokens (hero stops, page, cards, controls, accent, ink, highlight …). The moment is a point on the sun's day (`SkyLight`: the sun's altitude, the day's progress sunrise 0 → Maghrib 1, the moon's illumination and height), which the hero computes from the reader's coordinates (`skyFrame(...).light`) and callers without them take from `nominalSkyLight(passage, t)`. Each track is a set of **stations** on that scale (`Track`: the morning and afternoon limbs by altitude, the evening and dawn limbs by depth under the horizon, the deep night's arc by its progress), and `skyMoodOf` mixes the stations the moment lies between — the two limbs blended around solar noon and around the night's middle, the deep night blended in past the astronomical twilight — in OKLab, with `mixHexRound` for the colours that carry the hour (chroma kept, hue round the wheel away from green). The polarity is the passage's: light from sunrise to Maghrib, dark from Maghrib to sunrise; `moonlit` lifts a dark mood under a bright moon that is up. **Vibrant**'s stations are the hand-picked `ANCHORS` (plus `zenith`, `zenithHigh`, `afterglow`); **Realistic**'s are generated by `physical()` from OKLCH specs of the sky overhead and at the horizon, the page's tint and the accent's hue — the page's ladder, the ink and the accent's lightness (found to clear AA on the page, the card, a control and the highlight) derived by one rule at every station. `skyMoodFor(passage, t, steps, variant, light)` quantises the moment (`PALETTE_STEPS` for the palette; finer for the hero) and memoises in `MOOD_CACHE`. The hero's own `top`/`bottom`/`glow` (`skyFrame`) are Realistic's, so there is one real sky and the full-screen alarm under the other themes wears it. `widgetSkyColors` gives the Android widgets theirs; `StatusBarBand` draws a sliver of the mood's sky under the status bar of the other tabs.
- **Publishing** (`src/theme/skyTheme.ts`). `TodayCard` is the one place that knows the sky; it calls `publishSkyTheme({top, bottom, passage, t, light}, day)` (the day carries the reader's coordinates, so a launch can place the sun and the moon for its own clock) and `useAppPalette()` reads it. A polarity flip (a light mood to a dark one) crossfades. The current colours are persisted WITH the day's times (`SkyThemeDay`), and `restoreSkyTheme()` is awaited alongside `loadSettings()` in `PrayerSettingsContext`, so a launch opens in the hour's colours once, not three palettes in a row.
- **Who else wears it.** The full-screen alarm (`fullScreenAlarm.ts` → `PrayerAlarmActivity.kt`, `PRAYER_MOOD` per prayer), the Android widgets, the muṣḥaf's chrome (which takes the theme rendered for the PAGE's mode — `railChrome.accent` — not the app's), the onboarding strip (`SkyMoodStrip`) and the one-time home-screen offer (`src/home/SkyThemeOffer.tsx`). The look key of the launch picture deliberately leaves the mood out, so a picture from an hour ago still fits.
- **Design notes**: `docs/design/sky-palette.md`, `docs/themes-plan.md`.

## 7. Tests

```sh
npx jest                                          # all tests
npx jest --testPathPattern=buildWidgetPayload     # widget rollover
npx jest --testPathPattern=prayerStorage.race     # concurrent write safety
npx jest --testPathPattern=validateTimings        # provider validation
npx jest --testPathPattern=prayerNotifications    # timezone/scheduling
```

All tests live in `__tests__/`. **No snapshot tests** — every assertion is explicit.

There are no E2E tests on iOS / Android yet. Live testing on the iPhone simulator and a physical Pixel is the current verification path; the iOS sim flow is documented in §4.

## 8. Tooling

Slash commands and subagents live under `.claude/` — `/locale-add`, `/locale-audit`, `/tokens-audit`, `/a11y-scan` and the `reviewer` / `designer` / `locale-translator` / `provider-doctor` subagents. **[CONTRIBUTING.md](CONTRIBUTING.md)** lists what each does and when to run it.
