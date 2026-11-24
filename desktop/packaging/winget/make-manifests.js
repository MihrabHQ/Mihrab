#!/usr/bin/env node
/**
 * The winget manifests for one release of Mihrab's Windows installer
 * (MihrabHQ.Mihrab in microsoft/winget-pkgs): the version, installer and
 * en-US locale files, laid out as that repository lays them out.
 *
 *   node make-manifests.js --version 2.39.0 [--date 2026-11-23] [--out dir]
 *
 * The installers are the release's own (Mihrab-<v>-win-{x64,arm64}.exe);
 * their hashes are taken from the files themselves — downloaded from the
 * release, or read from --dir when the files are at hand (the Desktop run
 * that built them). Writes <out>/manifests/m/MihrabHQ/Mihrab/<v>/.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const version = (arg('version') || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: make-manifests.js --version X.Y.Z [--date YYYY-MM-DD] [--dir installers] [--out dir]');
  process.exit(1);
}
const out = path.resolve(arg('out') || 'winget');
const local = arg('dir');
const date = arg('date') || new Date().toISOString().slice(0, 10);

const ID = 'MihrabHQ.Mihrab';
const SCHEMA = '1.10.0';
const RELEASE = `https://github.com/MihrabHQ/Mihrab/releases/download/v${version}`;
const ARCHES = [
  ['x64', `Mihrab-${version}-win-x64.exe`],
  ['arm64', `Mihrab-${version}-win-arm64.exe`],
];

async function sha256(file) {
  let bytes;
  if (local) {
    bytes = fs.readFileSync(path.join(local, file));
  } else {
    const r = await fetch(`${RELEASE}/${file}`, { redirect: 'follow' });
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status} — is it attached to v${version} yet?`);
    bytes = Buffer.from(await r.arrayBuffer());
  }
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

const head = type =>
  `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${SCHEMA}.schema.json\n\n` +
  `PackageIdentifier: ${ID}\nPackageVersion: ${version}\n`;
const tail = type => `ManifestType: ${type}\nManifestVersion: ${SCHEMA}\n`;

(async () => {
  const installers = [];
  for (const [arch, file] of ARCHES) {
    installers.push(
      `- Architecture: ${arch}\n  InstallerUrl: ${RELEASE}/${file}\n  InstallerSha256: ${await sha256(file)}\n`,
    );
  }

  const files = {
    [`${ID}.yaml`]: `${head('version')}DefaultLocale: en-US\n${tail('version')}`,

    // electron-builder's assisted NSIS installer: per user, into
    // %LOCALAPPDATA%\Programs\Mihrab, silent with /S (the Desktop run
    // installs and removes it that way on every release).
    [`${ID}.installer.yaml`]:
      `${head('installer')}InstallerType: nullsoft\nScope: user\n` +
      `InstallModes:\n- interactive\n- silent\nUpgradeBehavior: install\n` +
      `ReleaseDate: ${date}\nInstallers:\n${installers.join('')}${tail('installer')}`,

    // No accuracy figures here: those are generated for the site and the
    // store listings only (scripts/copy/README.md).
    [`${ID}.locale.en-US.yaml`]:
      `${head('defaultLocale')}PackageLocale: en-US\n` +
      `Publisher: Hassan El Ghamri\n` +
      `PublisherUrl: https://mihrab.elghamri.se\n` +
      `PublisherSupportUrl: https://github.com/MihrabHQ/Mihrab/issues\n` +
      `PrivacyUrl: https://github.com/MihrabHQ/Mihrab/blob/main/PRIVACY_POLICY.md\n` +
      `Author: Hassan El Ghamri\n` +
      `PackageName: Mihrab\n` +
      `PackageUrl: https://mihrab.elghamri.se\n` +
      `License: AGPL-3.0-or-later\n` +
      `LicenseUrl: https://github.com/MihrabHQ/Mihrab/blob/main/LICENSE\n` +
      `ShortDescription: Prayer times with the adhan, the Madinah mushaf, duas and a prayer journal.\n` +
      `Description: |-\n` +
      `  Mihrab shows the day's prayer times for where you are and calls the adhan at each\n` +
      `  prayer. It carries the Madinah mushaf with recitation and tajweed colours, duas,\n` +
      `  the Qibla and a prayer journal. Open source, with no ads, no account and no tracking.\n` +
      `Moniker: mihrab\n` +
      `Tags:\n- adhan\n- islam\n- muslim\n- prayer-times\n- qibla\n- quran\n- salah\n` +
      `ReleaseNotesUrl: https://github.com/MihrabHQ/Mihrab/releases/tag/v${version}\n` +
      tail('defaultLocale'),
  };

  const dir = path.join(out, 'manifests', 'm', 'MihrabHQ', 'Mihrab', version);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  console.log(dir);
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
