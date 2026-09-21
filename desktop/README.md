# Mihrab for Windows and Linux

The same app as the phones — the same `src/`, the same screens — rendered
with [react-native-web](https://necolas.github.io/react-native-web/) inside
[Electron](https://www.electronjs.org/). Electron rather than a system web
view because the mushaf has to draw identically everywhere, and a bundled
Chromium is the only way to know it does.

## Run it

```sh
cd desktop
npm run setup        # desktop deps + the Electron binary (NODE_ENV=production on
                     # this Mac hides devDependencies, hence --include=dev)
npm run dev          # bundle assets, build the page (development), open the app
```

The app's own dependencies come from the repo root (`npm ci` there). The
desktop keeps its own `node_modules` so the React Native project — and
F-Droid's `npm ci` of it — never downloads an Electron binary.

## How it fits together

| Where | What |
|---|---|
| `webpack.config.js` | Builds `../index.js` + `../src` for the browser. `react-native` → `web/shims/react-native.js` (react-native-web plus what it lacks). |
| `web/shims/` | Stand-ins for native libraries with no web build: notifee, track-player, blob-util, encrypted-storage, share, view-shot, geolocation, blur, keep-awake, sensors. |
| `web/native/` | Desktop implementations of the app's own native modules, installed onto `NativeModules` before the app loads. Absent modules (widgets, Live Activities, compass, QR) stay absent — every wrapper already handles "this device cannot". |
| `electron/main.js` | The window, the `mihrab://` scheme (the page and its files), CORS for the app's own requests, IPC. |
| `electron/notifications.js` | notifee's trigger notifications, kept on disk and checked by a clock tick (timers stop while a laptop sleeps). |
| `electron/background.js` | The tray, close-to-tray and start-at-login — the adhan only sounds from a running app. |
| `electron/services.js` | Encrypted storage (safeStorage), share → Save as, view capture, keep-awake, sync folders. |
| `electron/fsIpc.js`, `paths.js` | File access, confined to the app's data folder (writes) and its bundle (reads). |

Things worth knowing before changing anything:

- **The page fonts need a `post` table.** Chromium's font sanitizer (OTS)
  rejects the QPC v2 page fonts without one; CoreText and Android never
  cared. `web/native/sfnt.js` adds it in memory. The files on disk stay as
  published — the store checks their size.
- **Back is BackHandler.** Esc, Alt+← and the mouse's back button feed it,
  and React Navigation's native back hook is used, so the app's Android
  back rules apply.
- **`isDesktop`** (`src/responsive/breakpoints.ts`) is the Mac *and* this
  build: keyboard and mouse, no compass, no Live Activity, no pull to
  refresh. Catalyst's window chrome stays on `isMacCatalyst`.

## Check it without looking

```sh
node scripts/drive.js scripts/steps-onboard.js --profile /tmp/p   # onboarding → Stockholm → Home
node scripts/drive.js scripts/steps-mushaf.js  --profile /tmp/p   # download the mushaf, shoot a page
node scripts/drive.js scripts/steps-keys.js    --profile /tmp/p   # page with ← A H / → D L
node scripts/drive.js scripts/steps-back.js    --profile /tmp/p   # Esc / mouse back / reload
node scripts/drive.js scripts/steps-adhan.js   --profile /tmp/p   # a trigger fires with its sound
```

Screenshots land in `build/shots/`. `MIHRAB_USER_DATA` gives a run its own
profile (and no tray, so it can close).

## Build installers

```sh
npm run dist:linux   # AppImage + deb, x64 + arm64
npm run dist:win     # NSIS installer, x64 + arm64 (unsigned)
```

Both build on macOS. `release.sh` does this with `DESKTOP=1`;
`.github/workflows/desktop.yml` builds on real Windows and Linux runners and
launches the packaged app as a smoke test (run it from the Actions tab).
