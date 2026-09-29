/**
 * SHADOW MODE TOUCHES NOTHING. docs/DISTRIBUTION.md promises it: the
 * TypeScript runs beside the shell on the machine cutting a real release,
 * and the only thing it may leave behind is its line in
 * .release-shadow.log. So every command each shadow phase runs is held
 * against an explicit list of read-only ones, every HTTP request must be
 * a GET or a HEAD, and no file outside the temp directory may change.
 *
 * An allow-list rather than a deny-list on purpose: a new command in a
 * shadow phase has to be added here, by someone who has asked whether it
 * writes anything. `git status` does (the index's stat cache), which is
 * why every git call beside the shell carries GIT_OPTIONAL_LOCKS=0; and
 * unpacking an .app registers it with LaunchServices, which is why B6 and
 * V6 take only the plist and the executable out of the zip.
 */
import { shadowBuild, shadowCtx, shadowPreflight, shadowPublish, shadowVerify } from '../scripts/release/shadow.ts';
import type { Call } from './fixtures/releaseWorld';
import { GOOD_CASK, GRADLE, HOME, ROOT, TAP, World, sha } from './fixtures/releaseWorld';
import { generateKeyPairSync } from 'crypto';

const rel = { version: '2.28.0', tag: 'v2.28.0', oldVersion: '2.27.1', oldCode: 282, code: 283 };
const SDK = `${HOME}/Library/Android/sdk/build-tools/35.0.0`;
const DL = 'https://github.com/MihrabHQ/Mihrab/releases/download/v2.28.0';
const BASE = 'https://api.appstoreconnect.apple.com';
const ZIP = `${ROOT}/ios/build/catalyst-dist/Mihrab-macOS-2.28.0.zip`;

/** Every command a shadow phase may run. Each one reads; none writes. */
const READ_ONLY: RegExp[] = [
  /^\/bin\/sh -c command -v (gh|git|node|python3)$/,
  /^xcodebuild -version$/,
  // git: looking only. No fetch, add, commit, tag -a, push.
  /^git rev-parse /,
  /^git status --(porcelain|short) --untracked-files=no$/,
  /^git ls-remote /,
  /^git rev-list /,
  /^git describe /,
  /^git log /,
  /^git diff /,
  /^git show /,
  /^git diff-tree /,
  /^git tag -l /,
  /^git -C \/repo log -1 --format=%ct /,
  // gh: listing and viewing. `gh api` without -X is a GET.
  /^gh run list /,
  /^gh release view /,
  /^gh api repos\/MihrabHQ\/Mihrab\/pages\/builds\/latest --jq \.status$/,
  // The generated files, checked and not written.
  /^node \/repo\/scripts\/(build-site|build-release-notes)\.js --check$/,
  // The APK and the zip: read, or unpacked into a temp directory only —
  // never an .app bundle (`-j` flattens the paths).
  new RegExp(`^${SDK}/aapt2 dump badging `),
  new RegExp(`^${SDK}/apksigner verify --print-certs `),
  /^unzip -Z1 \S+ ('lib\/\*'|lib\/\*|classes\*\.dex)$/,
  /^unzip -q -o \S+ classes\*\.dex -d \/tmp\/[^ ]+$/,
  /^unzip -j -o -q \S+ Mihrab\.app\/Contents\/(Info\.plist|MacOS\/[A-Za-z]+) -d \/tmp\/[^ ]+$/,
  /^plutil -extract (LSMinimumSystemVersion|CFBundleExecutable) raw -o - \/tmp\/[^ ]+$/,
  /^lipo -archs \/tmp\/[^ ]+$/,
];

function assertReadOnly(w: World, before: Map<string, string>) {
  const offList = w.calls.filter(c => !READ_ONLY.some(re => re.test(c.line))).map(c => c.line);
  expect(offList).toEqual([]);
  const unlocked = w.calls
    .filter((c: Call) => c.cmd === 'git' && c.opts.env?.GIT_OPTIONAL_LOCKS !== '0')
    .map(c => c.line);
  expect(unlocked).toEqual([]);
  expect(w.requests.filter(r => r.method !== 'GET' && r.method !== 'HEAD')).toEqual([]);
  const changed = [...w.files.entries()].filter(([p, t]) => before.get(p) !== t && !p.startsWith('/tmp/')).map(([p]) => p);
  expect(changed).toEqual([]);
  expect([...before.keys()].filter(p => !w.files.has(p))).toEqual([]);
  // And it did something: a phase that ran nothing would pass all of the above.
  expect(w.calls.length).toBeGreaterThan(3);
}

const snapshot = (w: World) => new Map(w.files);

function ascWorld(w: World) {
  w.file(`${HOME}/.config/mihrab/asc.json`, JSON.stringify({ keyPath: '/k.p8', keyId: 'K', issuerId: 'I' }));
  w.file('/k.p8', generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
  w.url(`${BASE}/v1/ciProducts?limit=10`, { text: JSON.stringify({ data: [{ id: 'P' }] }) });
  const runs = { text: JSON.stringify({ data: [{ id: 'r', attributes: { number: 741, executionProgress: 'COMPLETE', sourceCommit: { commitSha: 'feedbeef' } } }] }) };
  w.url(`${BASE}/v1/ciProducts/P/buildRuns?limit=1&sort=-number`, runs);
  w.url(`${BASE}/v1/ciProducts/P/buildRuns?limit=10&sort=-number`, runs);
  w.url(`${BASE}/v1/apps?limit=10`, { text: JSON.stringify({ data: [{ id: 'APP', attributes: { bundleId: 'com.hassan.prayerapp' } }] }) });
}

/** Answers for the APK and the zip, as a healthy release has them. */
function artifacts(w: World) {
  w.on(`${SDK}/aapt2 dump badging`, { stdout: "package: name='x' versionCode='283' versionName='2.28.0'\n" })
    .on('unzip -Z1', { stdout: 'lib/arm64-v8a/a.so\nlib/armeabi-v7a/a.so\n' })
    .on(/^unzip -Z1 \S+ classes\*\.dex$/, { stdout: 'classes.dex\n' })
    .on('unzip -q -o', c => {
      w.file(`${c.args[c.args.length - 1]}/classes.dex`, 'Lcom/hassan/prayerapp/Main;');
      return {};
    })
    .on('unzip -j', {})
    .on(/plutil -extract LSMinimumSystemVersion/, { stdout: '12.1\n' })
    .on(/plutil -extract CFBundleExecutable/, { stdout: 'PrayerApp\n' })
    .on('lipo -archs', { stdout: 'arm64\n' });
  w.file(`${SDK}/aapt2`, '');
  w.file(`${SDK}/apksigner`, '');
  w.dir('/Applications/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex');
}

describe('every shadow phase only reads', () => {
  it('preflight', async () => {
    const w = new World()
      .file(`${ROOT}/android/app/build.gradle`, GRADLE)
      .file(TAP, GOOD_CASK)
      .file(`${ROOT}/docs/release-log.md`, '## 2.27.1\n\n**Lesson:** none needed.\n')
      .on(/./, {})
      .on('xcodebuild -version', { stdout: 'Xcode 27.0' })
      .on('git rev-parse --abbrev-ref HEAD', { stdout: 'main' })
      .on('git rev-parse v2.28.0', { code: 128 })
      .on('gh run list', { stdout: 'success|Release 2.27.1 (282)|u' })
      .on('git describe', { stdout: 'v2.27.1' })
      .on('git rev-list --count', { stdout: '3' });
    for (const loc of ['en-US', 'sv-SE', 'ar']) w.file(`${ROOT}/fastlane/metadata/android/${loc}/changelogs/283.txt`, 'notes');
    ascWorld(w);
    const before = snapshot(w);
    const res = await shadowPreflight(shadowCtx(w.io(), ROOT, HOME, 'release'), rel, '');
    expect(res.notes.filter(n => n.includes('threw'))).toEqual([]);
    assertReadOnly(w, before);
    expect(w.ran('git fetch')).toEqual([]);
  });

  it('build', async () => {
    const stamped = GRADLE.replace('282', '283').replace('2.27.1', '2.28.0');
    const w = new World()
      .file(`${ROOT}/android/app/build.gradle`, stamped)
      .file(`${ROOT}/ios/PrayerApp.xcodeproj/project.pbxproj`, 'MARKETING_VERSION = 2.28.0;\n')
      .file(`${ROOT}/src/polish/releaseNotes.generated.ts`, "version: '2.28.0',")
      .file(ZIP, 'ZIP')
      .file(TAP, GOOD_CASK)
      .on('node', {});
    artifacts(w);
    const before = snapshot(w);
    const ctx = shadowCtx(w.io(), ROOT, HOME, 'release');
    const res = await shadowBuild(ctx, rel, '');
    expect(res.notes.filter(n => n.includes('threw'))).toEqual([]);
    // It got to the end: the zip's cask comparison is the last thing it says.
    expect(ctx.report.outcomes.map(o => o.id)).toContain('B6');
    assertReadOnly(w, before);
  });

  it('… and the list bites: the same build NOT beside the shell is refused by it', async () => {
    const w = new World()
      .file(`${ROOT}/android/app/build.gradle`, GRADLE)
      .file(`${ROOT}/ios/PrayerApp.xcodeproj/project.pbxproj`, 'MARKETING_VERSION = 2.27.1;\n')
      .file(`${ROOT}/src/polish/releaseNotes.generated.ts`, "version: '2.28.0',")
      .on(/./, {});
    const before = snapshot(w);
    await shadowBuild(w.ctx({ quiet: true }), rel, '');
    expect(() => assertReadOnly(w, before)).toThrow();
  });

  it('verify', async () => {
    const zipBytes = 'ZIPBYTES';
    const w = new World()
      .file(TAP, GOOD_CASK.replace('version "2.27.1"', 'version "2.28.0"').replace('a'.repeat(64), sha(zipBytes)))
      .file(`${ROOT}/contrib/fdroid/com.prayer_times.yml`, 'CurrentVersion: 2.28.0\n')
      .file(`${ROOT}/docs/index.html`, '<p>Version 2.28.0 (283)</p><title>Mihrab 2.28.0 (283)</title>')
      .file(`${ROOT}/android/app/build.gradle`, GRADLE.replace('282', '283'))
      .on(/./, {})
      .on('git ls-remote', { stdout: 'abc\trefs/tags/v2.28.0\n' })
      .on('gh release view', {
        stdout: JSON.stringify({ isDraft: false, assets: [{ name: 'Mihrab-v2.28.0.apk' }, { name: 'Mihrab-macOS-2.28.0.zip' }] }),
      })
      .on('git rev-parse -q --verify', { stdout: 'feedbeefcafe\n' })
      .on('gh run list', { stdout: 'completed|success|https://ci/1\n' });
    for (const loc of ['en-US', 'sv-SE', 'ar']) w.file(`${ROOT}/fastlane/metadata/android/${loc}/changelogs/283.txt`, 'notes');
    artifacts(w);
    w.on(`${SDK}/apksigner verify`, { stdout: 'certificate SHA-256 digest: x\n' });
    w.url(`${DL}/Mihrab-macOS-2.28.0.zip`, { body: zipBytes });
    w.url(`${DL}/Mihrab-v2.28.0.apk`, { body: 'APK' });
    // The live site is stale, so the Pages diagnosis runs too.
    w.url('https://mihrab.elghamri.se/', { text: '<p>Version 2.27.1 (282)</p>' });
    w.url('https://www.githubstatus.com/api/v2/components.json', { text: '{"components":[]}' });
    ascWorld(w);
    const before = snapshot(w);
    const res = await shadowVerify(shadowCtx(w.io(), ROOT, HOME, 'verify'), 'v2.28.0', '');
    expect(res.notes.filter(n => n.includes('threw'))).toEqual([]);
    assertReadOnly(w, before);
    expect(w.ran('gh api').length).toBe(1);
  });

  it('publish (what the shell published, read back)', async () => {
    const w = new World()
      .file(TAP, GOOD_CASK)
      .on(/./, {})
      .on('git describe', { stdout: 'v2.27.1' })
      .on('git log -1 --format=%cI', { stdout: '2026-09-29T11:00:00+02:00' });
    const before = snapshot(w);
    await shadowPublish(shadowCtx(w.io(), ROOT, HOME, 'release'), rel, { releaseSha: 'feedbeef', ios: '1', zip: true });
    assertReadOnly(w, before);
  });
});
