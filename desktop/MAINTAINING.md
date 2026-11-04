# Maintaining the Windows and Linux app

The desktop app is not a port. It is the same `src/` the phones and the Mac
run — every screen, every prayer-time method, the muṣḥaf — rendered with
react-native-web inside Electron. A feature or fix merged into `main` reaches
Windows and Linux on the next build without anyone touching `desktop/`.

## Who owns what

| Comes from `main` (the app's maintainer) | The desktop maintainer's |
|---|---|
| Features, screens, copy, translations | `desktop/web/shims/` — stand-ins for native modules |
| Prayer-time methods and data | `desktop/web/native/` — the app's NativeModules on the desktop |
| The muṣḥaf, recitations, tafsir | `desktop/electron/` — window, tray, start at login, notifications |
| Release notes, versions (`sync-version.js` stamps `desktop/package.json`) | `desktop/webpack.config.js`, `desktop/package.json` (packaging) |
| | Bugs that happen only on Windows or Linux |
| | `.github/workflows/desktop.yml` going red |

`src/` is not where desktop fixes go. When the app needs to behave
differently on a desktop, the gate is `isDesktop` (Mac and Windows/Linux) or
`Platform.OS === 'web'` (Windows, Linux and the browser), and that change is a pull
request to `main` like any other.

## The browser, Windows and Linux together

Mihrab Web (mihrabhq.github.io) is the same webpack build with
`--env web`: `desktop/web/webapp/` swaps a browser bridge in for Electron's
preload, and `IS_WEB_APP` is true. Everything else is shared, so a patch for
one of the three is a patch for all of them:

- Gate on `Platform.OS === 'web'` — browser and Electron alike — by default.
  The muṣḥaf's page height, the fullscreen ✕, the iPad-style reader bar, the
  day pager settling on the day it stops on (`useWebScrollSettle`) and the
  later modal drawn over the earlier one (`shims/modal-portal.js`) are all
  this.
- Gate on `IS_WEB_APP` only for what Electron does not have or does
  natively: the place guessed from the IP, the bookmark nudge, the Web
  Notifications bridge, no sync folder (a browser cannot keep one), skipping
  the release mirror (CORS), and touch paging (`WEB_TOUCH_PAGING`, which
  would take the trackpad's scroll away on a desktop).
- Before pushing, run both: `npx webpack --mode production --env web` and
  `npm run build` + `node scripts/drive.js` against Electron.

## What breaks, and why

The app imports native modules — notifications, audio, storage, sensors —
that have no web build. Each has a stand-in in `web/shims/`, aliased by name
in `webpack.config.js`. When `main`:

- **adds a native module**, the build fails to resolve it → add a shim;
- **changes how it calls one**, the shim may no longer match → update it;
- **adds a native view** (like the muṣḥaf's line view), stand it in so the
  bundle resolves; the app keeps a `<Text>`/JS path for platforms without it;
- **asks for the native animation driver**, the shim already turns it off.

The `desktop.yml` run on every push to `main` builds and launches the Linux
app. It is deliberately not a required check: a change to the app that
breaks the desktop still merges, and the red run is the signal to fix it
here.

## Checking a change

```sh
cd desktop && npm run build
node scripts/drive.js scripts/steps-onboard.js --profile /tmp/p   # onboarding → Stockholm → Today
node scripts/drive.js scripts/steps-tour.js    --profile /tmp/p   # every tab; fails on any page error
node scripts/drive.js scripts/steps-mushaf.js  --profile /tmp/p   # download the muṣḥaf
MIHRAB_SWEEP_PAGES=40 node scripts/drive.js scripts/steps-sweep.js --profile /tmp/p   # no line overflows
node scripts/drive.js scripts/steps-adhan.js   --profile /tmp/p   # a prayer alert fires with its adhan
node scripts/drive.js scripts/steps-arabic.js                     # fresh profile: right-to-left
```

A muṣḥaf line must never lose a word: `steps-sweep.js` reports any line
whose text is wider than its box, and the answer is zero.

## Releases

Nothing to do per release. A `v*` tag builds Windows and Linux (x64 and
arm64), launches both, and — while the repository variable
`DESKTOP_RELEASE` is `true` — attaches the six installers to the release.
See `docs/DISTRIBUTION.md`.
