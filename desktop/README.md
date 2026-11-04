# Mihrab for Windows and Linux

The same app as the phones — the same `src/`, the same screens — rendered
with [react-native-web](https://necolas.github.io/react-native-web/) inside
[Electron](https://www.electronjs.org/). Electron rather than a system web
view because the mushaf has to draw identically everywhere, and a bundled
Chromium is the only way to know it does.

## Install the preview

The installers from the newest **Actions → Desktop → Run workflow** are on the
[desktop-preview](https://github.com/MihrabHQ/Mihrab/releases/tag/desktop-preview)
pre-release. On Windows one line installs them and one removes them — app,
start-at-login entry and settings; on Linux the package manager does.

| | Install | Remove |
|---|---|---|
| Windows (`cmd`) | `curl -fsSLo "%TEMP%\mihrab.cmd" https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/install-windows.cmd && "%TEMP%\mihrab.cmd"` | `curl -fsSLo "%TEMP%\mihrab-remove.cmd" https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-windows.cmd && "%TEMP%\mihrab-remove.cmd"` |
| Linux (terminal) | your package manager — [below](#linux-package-managers) | `sudo apt purge mihrab`, `dnf remove`, `zypper remove`, `pacman -R` |

Windows installs for the user into `%LOCALAPPDATA%\Programs\Mihrab`. Linux
installs from Mihrab's repositories with the system's package manager (below).
`scripts/install-linux.sh` does the same in one line — it adds the repository
for apt, dnf, zypper or pacman and installs, and with `uninstall` takes the
app, the repository and its key away — and unpacks the AppImage on a system
with none of them (`MIHRAB_FORMAT=appimage` forces it).

## Linux package managers

Each release's `.deb` and `.rpm` (the repository variable `DESKTOP_RELEASE`
is `true`) are published where Linux's package managers install, update and
remove them. Until a release carries them, the repositories hold the latest
desktop-preview build instead; the first such release takes over by itself.

| | Install | Updates with | Remove |
|---|---|---|---|
| Debian, Ubuntu (apt) | the two `curl` lines and `apt install mihrab` on [mihrabhq.github.io/packages](https://mihrabhq.github.io/packages) | `apt upgrade`, Software Updater | `apt purge mihrab` |
| Fedora (dnf), openSUSE (zypper) | the `.repo` file, then `dnf install mihrab` / `zypper install mihrab` | `dnf upgrade`, GNOME Software / Discover | `dnf remove mihrab` |
| Arch, Manjaro (pacman, yay) | trust the key and add `[mihrab]` to `/etc/pacman.conf` (on the site), then `pacman -S mihrab` | `pacman -Syu`, `yay -Syu` | `pacman -R mihrab` |
| Arch (AUR, once its registration reopens) | `yay -S mihrab-bin` | `yay -Syu` | `yay -R mihrab-bin` |

[MihrabHQ/packages](https://github.com/MihrabHQ/packages) does the publishing:
every hour it looks at the latest release and, when there is a new version,
builds the signed apt and dnf repositories with
[`packaging/build-repos.sh`](packaging/build-repos.sh) and the pacman one with
[`packaging/build-arch.sh`](packaging/build-arch.sh), deploys them to its
Pages site, and pushes the AUR recipe written by
[`packaging/aur/make-pkgbuild.sh`](packaging/aur/make-pkgbuild.sh). Its two
secrets — the repositories' signing key and the AUR account's SSH key — are
made by [`packaging/make-keys.sh`](packaging/make-keys.sh), run once by the
maintainer. Every tagged or hand-run Desktop build installs, finds and removes
the app from those repositories in clean Debian, Ubuntu, Fedora, openSUSE and
Arch containers (the `packages` job).

## Microsoft Store

Tagged and hand-run Desktop builds also make the Store's package — unsigned
`.appx` files for x64 and arm64 (the Store signs what it publishes), in the
`mihrab-microsoft-store` artifact — and prove a test-signed copy installs,
starts from the Start menu and uninstalls. Its identity is `build.appx` in
`package.json`: `identityName`, `publisher` and `publisherDisplayName` must be
copied exactly from Partner Center (Product identity) once the name is
reserved; until then they are placeholders. Tile images are in
`resources/appx/`. Packaged, the app gives Windows its own toast identity and
leaves start at login to the package's startup task, whose switch is in
Settings → Apps → Startup (the tray item opens it).

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

Both build on macOS, for trying an installer locally. Releases are not built
here: `.github/workflows/desktop.yml` builds on real Windows and Linux
runners, launches the packaged app, and attaches the installers to the
release (see `docs/DISTRIBUTION.md`).
