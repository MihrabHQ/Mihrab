# Desktop Release Roadmap

This roadmap tracks release readiness for the Windows and Linux apps. It is not
a second feature backlog: desktop renders the shared app from the repository
root's `src/`, with Electron-specific services and packaging under `desktop/`.

## Delivery model

Most features stay in the main codebase and reach desktop with the normal
shared build. Do not duplicate shared feature work under `desktop/`. A feature
may lag on web or desktop only when it needs platform-specific implementation,
packaging, certification, or validation; record the exact platform dependency
and the release gate that closes it.

The operating details live in [MAINTAINING.md](MAINTAINING.md),
[README.md](README.md), and [Distribution](../docs/DISTRIBUTION.md). Keep those
guides authoritative for commands, installer names, and channel behavior.
The current platform and channel inventory is in
[Desktop Platforms and Status](PLATFORMS.md); update it when a target is added,
changes status, or is retired.

## Roadmap

### 1. Keep the existing release path dependable — ongoing

- Keep the push-to-main Linux build and packaged-app smoke visible; investigate failures even though this workflow is not currently a required check.
- Keep manual preview builds available for Windows and Linux, x64 and arm64,
	so release candidates can be tried before tagging.
- For version tags, preserve the Windows and Linux build, launch, install, and
	uninstall checks. Keep installer attachments and Microsoft Store submission
	gated by `DESKTOP_RELEASE`; keep manual previews controlled by the workflow
	input.
- For shared UI or runtime changes, run both the browser build and Electron build as required by [MAINTAINING.md](MAINTAINING.md).

### 2. Prove upgrades preserve user data — next

The workflow exercises clean installs and removals, but an upgrade from an
installed release is a separate risk. Add a Windows and Linux upgrade check
that installs an earlier build, creates representative local data, upgrades
in place, and verifies the data and app identity survive. Never use a test
against a maintainer's real profile.

### 3. Improve Windows installer trust — next

The direct Windows installer is unsigned and can trigger SmartScreen warnings.
Evaluate signing it and verifying the signed installer in CI. Keep the
Microsoft Store package path distinct: the Store signs the package it
publishes.

### 4. Decide the main-branch gate — planned

The main-branch desktop workflow currently builds and smoke-tests Linux, but
is not a required check. After its reliability and failure ownership are
established, decide whether to require that job or add an equivalent desktop
signal to the protected-branch checks. Until then, keep failures visible and
resolve regressions before release.

### 5. Expand delivery channels deliberately — evaluate

Assess additional channels such as winget or Flathub only when there is an
owner for packaging, signing, updates, and support. Prefer improving the
existing Store, Linux repository, and preview paths before adding another
channel without a maintainer.

## Release principle

A shared feature remains part of the mainline release unless its
implementation depends on desktop-specific work. When that dependency exists,
state which platform is waiting, what needs to change, and how the release
will be verified; do not silently fork or permanently defer the shared feature.
