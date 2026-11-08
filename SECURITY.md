# Security

## Reporting a vulnerability

Please report security issues privately so we can address them before public disclosure. Open a **private security advisory** on GitHub for this repository, or email **mihrab@elghamri.se** if that is not available.

## Sync and local storage: what the design does and does not protect

Reported privately in November 2026 and changed in response; recorded here so the next reviewer does not have to rediscover it.

- **Folder sync trusts only devices you accept.** A device becomes a sync peer when you type its pairing code, or when it announces itself by writing to the shared folder and you accept it on the Sync screen after comparing fingerprints. A device's public key is public (it is in the clear in every file in the folder), so the ability to seal a file to it proves nothing about the sender; before this change an announced device was trusted on arrival, which made write access to the folder into read access to the record. Someone with write access can still delete or corrupt files and can make a device appear as waiting; they cannot read anything or be merged from.
- **The sync secret key and the peer lists are never stored in plaintext.** If the device's encrypted store (Keychain / Keystore) refuses them, sync is unavailable on that device, and Settings → Sync says so. The Homebrew macOS build, which cannot use the Keychain, therefore has no sync.
- **Records fall back to an unencrypted file rather than be lost** — journal, fasting, sunnah log, location — in the app's private folder, excluded from iCloud and Android backups, drained as soon as the encrypted store takes a write again. This is a deliberate availability trade for data whose loss is worse than its exposure on an already-compromised device.

## Thanks

People who reported a vulnerability responsibly, and what came of it:

- **Ahmad Al-Khasawneh** ([ahmadkhasawneh92](https://github.com/ahmadkhasawneh92)) — November 2026: sync trusted a device that merely announced itself in the shared folder, and a refused encrypted write fell back to a plaintext copy that Android backups could carry off. Both fixed in 2.37.0 (see "Sync and local storage" above).

## What must not be committed

Do **not** commit or paste into issues/PRs:

- Android release keystores (e.g. `*.keystore`, `*.jks`) or `android/keystore.properties` with real passwords
- iOS distribution certificates, provisioning profiles, or App Store Connect API keys
- API keys, OAuth client secrets, or service account JSON for any backend
- Personal access tokens, SSH private keys, or `.env` files with secrets
- `local.properties` with machine-specific SDK paths (already ignored for Android when applicable)

Use `android/keystore.properties.example` as a template; keep real values only on your machine.

## Forks

If you fork this repo, update `src/config/httpIdentity.ts` so HTTP `User-Agent` strings point to **your** public source URL instead of upstream.
