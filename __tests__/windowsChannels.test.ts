/**
 * Windows besides the Store: what the website and the README tell someone
 * to type is what the packaging does. The winget manifests come from
 * desktop/packaging/winget/make-manifests.js (checked here on stand-in
 * installers: the hashes are the files', the URLs the release's); the Scoop
 * commands name MihrabHQ/scoop-bucket, whose own CI installs them for real.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');

describe('winget manifests', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'winget-'));
  const dir = path.join(work, 'exe');
  mkdirSync(dir);
  const files = { x64: 'Mihrab-9.8.7-win-x64.exe', arm64: 'Mihrab-9.8.7-win-arm64.exe' };
  for (const f of Object.values(files)) writeFileSync(path.join(dir, f), `stand-in ${f}`);
  execFileSync('node', [
    path.join(ROOT, 'desktop/packaging/winget/make-manifests.js'),
    '--version', 'v9.8.7', '--date', '2030-01-02', '--dir', dir, '--out', path.join(work, 'out'),
  ]);
  const at = path.join(work, 'out/manifests/m/MihrabHQ/Mihrab/9.8.7');
  const m = (name: string) => readFileSync(path.join(at, name), 'utf-8');

  it('writes the three files winget-pkgs expects, for the version given', () => {
    for (const n of ['MihrabHQ.Mihrab.yaml', 'MihrabHQ.Mihrab.installer.yaml', 'MihrabHQ.Mihrab.locale.en-US.yaml']) {
      expect(m(n)).toMatch(/^PackageIdentifier: MihrabHQ\.Mihrab$/m);
      expect(m(n)).toMatch(/^PackageVersion: 9\.8\.7$/m);
    }
    expect(m('MihrabHQ.Mihrab.yaml')).toMatch(/^DefaultLocale: en-US$/m);
  });

  it('points at the release’s installers, with their own hashes', () => {
    const inst = m('MihrabHQ.Mihrab.installer.yaml');
    expect(inst).toMatch(/^InstallerType: nullsoft$/m);
    expect(inst).toMatch(/^Scope: user$/m);
    expect(inst).toMatch(/^ReleaseDate: 2030-01-02$/m);
    for (const [arch, f] of Object.entries(files)) {
      const sha = createHash('sha256').update(`stand-in ${f}`).digest('hex').toUpperCase();
      expect(inst).toContain(
        `- Architecture: ${arch}\n  InstallerUrl: https://github.com/MihrabHQ/Mihrab/releases/download/v9.8.7/${f}\n  InstallerSha256: ${sha}\n`,
      );
    }
  });

  it('makes no accuracy claim (those are generated for the site and stores only)', () => {
    const loc = m('MihrabHQ.Mihrab.locale.en-US.yaml');
    expect(loc).not.toMatch(/official|the only|the first|minute|timetable/i);
    expect(loc).toMatch(/^License: AGPL-3\.0-or-later$/m);
  });
});

describe('the Windows card says what the channels do', () => {
  const site = read('docs/index.html');
  const card = site.slice(site.indexOf('<div class="platform windows">'), site.indexOf('<div class="platform linux">'));

  it('lists the Store, winget, Scoop and the installer', () => {
    expect(card).toContain('apps.microsoft.com/detail/9N43KNMJHBWV');
    expect(card).toContain('winget install 9N43KNMJHBWV');
    expect(card).toContain('scoop bucket add mihrab https://github.com/MihrabHQ/scoop-bucket\nscoop install mihrab/mihrab');
    expect(card).toContain('releases/latest');
  });

  it('says the installer is unsigned and does not update itself, in every language', () => {
    const strings = JSON.parse(read('scripts/site/strings.json'));
    for (const [code, t] of Object.entries<any>(strings)) {
      expect([code, t.install.desktop.exeNote]).toEqual([code, expect.any(String)]);
      if (code !== 'en') expect([code, t.install.desktop.exeReview]).toEqual([code, 'native']);
    }
    expect(strings.en.install.desktop.exeNote).toMatch(/not code-signed/);
    expect(strings.en.install.desktop.exeNote).toMatch(/does not update itself/);
  });

  it('does not offer MihrabHQ.Mihrab until winget carries it', () => {
    // Microsoft merges the first pull request; until then the id installs nothing.
    expect(card).not.toContain('MihrabHQ.Mihrab');
  });
});
