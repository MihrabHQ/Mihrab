# Desktop Platforms and Status

This register tracks the distribution targets and desktop integrations owned by `desktop/`. Mihrab Web shares the app code but has its own browser build; macOS Catalyst is released through the mobile-app process in [Distribution](../docs/DISTRIBUTION.md).

Status means:

- **Available** — users can install or use it now.
- **Release-gated** — the build exists, but publication depends on the configured release workflow or credentials.
- **Planned** — accepted as future work, not implemented yet.

## Available platforms and channels

| Platform or channel | Status | Current delivery and notes |
|---|---|---|
| Windows NSIS installer | Available, release-gated | The x64 and arm64 NSIS installers use the classic wizard: per-user installation, optional install-directory selection, and a finish action that launches Mihrab. Tagged installer publication is controlled by `DESKTOP_RELEASE`; manual preview builds are available through the Desktop workflow. The installers are currently unsigned. |
| Windows Microsoft Store | Available, release-gated | The workflow builds and validates the Store package. A tagged release submits it for Store certification when `DESKTOP_RELEASE` and the Store credentials are configured; otherwise the package remains available for manual submission. |
| Linux AppImage | Available, release-gated | x86_64 and arm64 packages are built for tagged and manual preview runs. |
| Debian and Ubuntu (`.deb`) | Available, release-gated | x86_64 and arm64 packages are built for tagged and manual preview runs. The release package repository publishes updates when enabled. |
| Fedora and openSUSE (`.rpm`) | Available, release-gated | x86_64 and aarch64 packages are built for tagged and manual preview runs. The release package repository publishes updates when enabled. |
| Arch and Manjaro (Mihrab pacman repository) | Available, release-gated | The `mihrab` package is distributed through Mihrab's pacman repository and updated by the package publishing workflow. |
| Arch AUR `mihrab-bin` | Available | Release-backed binary package, generated from the release `.deb` by `desktop/packaging/aur/make-pkgbuild.sh`. |
| Mihrab Web | Available, separate build | Shares `src/` with desktop and uses the web build; it is not an Electron installer. Browser-only behavior is gated with `IS_WEB_APP`. |

## Planned platforms and integrations

| Platform or channel | Status | Work to reach release |
|---|---|---|
| Arch AUR `mihrab-git` | Planned | Add a separate VCS package following AUR conventions, with a Git source and generated `pkgver()`. Keep it distinct from the stable, release-backed `mihrab-bin`; document its update cadence and dependencies. |
| Flatpak | Planned | Add and validate a Flatpak manifest, including sandbox permissions and desktop integrations. Decide whether publication is through Flathub or another maintained remote and assign ownership for updates. |
| KDE Plasma widgets | Planned | Define the widget scope, supported Plasma versions, data interface to Mihrab, packaging, and release channel. This is a desktop integration, not part of the current Electron package. |

## Scope and updates

This file covers Windows and Linux desktop delivery, plus the shared browser build for context. Android, iOS, and macOS Catalyst release status remains in the main [Distribution](../docs/DISTRIBUTION.md) guide.

Update this matrix when a channel is added, changes status, or is retired. For each new target, record its owner, source of packages, supported architectures, publication trigger, and install or upgrade validation in this file and the relevant maintenance guide.
