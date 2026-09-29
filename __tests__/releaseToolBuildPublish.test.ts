/**
 * The build and publish phases, ported (scripts/release/build.ts and
 * publish.ts), against a fake machine.
 *
 * The publish phase is the one release.sh can never rehearse — it only
 * runs for real, against a live tag. Here it runs against fakes, in both
 * modes: for real, where the order of the irreversible calls is the
 * safety mechanism, and in dry run, where none of them may happen at all.
 */
import {
  APK,
  REVERT,
  apkChecks,
  inspectZip,
  releaseNotesTable,
  sedFirstPerLine,
  stamp,
  stampGradle,
  stampPbxproj,
} from '../scripts/release/build.ts';
import {
  attemptsFor,
  bumpCask,
  ciOnRelease,
  cleanup,
  commitMessage,
  inReleaseCommit,
  journalEntry,
  publish,
  summary,
} from '../scripts/release/publish.ts';
import { GOOD_CASK, GRADLE, HOME, ROOT, TAP, World, lines, sha, stopOf } from './fixtures/releaseWorld';
import { generateKeyPairSync } from 'crypto';

const rel = { version: '2.28.0', tag: 'v2.28.0', oldVersion: '2.27.1', oldCode: 282, code: 283 };
const PBX = 'CURRENT_PROJECT_VERSION = 282;\nMARKETING_VERSION = 2.27.1;\nCURRENT_PROJECT_VERSION = 282;\nMARKETING_VERSION = 2.27.1;\n';

describe('B1 stamping', () => {
  it('moves both numbers in build.gradle, the first on each line, as sed did', () => {
    expect(stampGradle(GRADLE, rel)).toContain('versionCode 283');
    expect(stampGradle(GRADLE, rel)).toContain('versionName "2.28.0"');
    expect(sedFirstPerLine('a a\na', 'a', 'b')).toBe('b a\nb');
  });

  it('moves every configuration in the pbxproj', () => {
    expect(stampPbxproj(PBX, rel)).toBe(PBX.replace(/282/g, '283').replace(/2\.27\.1/g, '2.28.0'));
  });

  it('runs both halves of sync-version, then checks the site — 2.15.0 ran one', async () => {
    const w = new World()
      .file(`${ROOT}/android/app/build.gradle`, GRADLE)
      .file(`${ROOT}/ios/PrayerApp.xcodeproj/project.pbxproj`, PBX)
      .on('node', {});
    const ctx = w.ctx();
    await stamp(ctx, rel);
    expect(w.calls.map(c => c.args[0].replace(`${ROOT}/scripts/`, '') + (c.args[1] ? ` ${c.args[1]}` : ''))).toEqual([
      'sync-version.js',
      'build-site.js',
      'build-site.js --check',
    ]);
    expect(lines(ctx)).toEqual(['ok B1 build.gradle, pbxproj, site and F-Droid recipe all say 2.28.0 (283)']);
  });

  it('beside the shell writes nothing, and still checks what the shell wrote', async () => {
    const w = new World()
      .file(`${ROOT}/android/app/build.gradle`, stampGradle(GRADLE, rel))
      .file(`${ROOT}/ios/PrayerApp.xcodeproj/project.pbxproj`, stampPbxproj(PBX, rel))
      .on('node', {});
    await stamp(w.ctx({ shadow: true }), rel);
    expect(w.calls.map(c => c.args.join(' '))).toEqual([`${ROOT}/scripts/build-site.js --check`]);
  });

  it('stops when the site is still stale after rebuilding', async () => {
    const w = new World()
      .file(`${ROOT}/android/app/build.gradle`, GRADLE)
      .file(`${ROOT}/ios/PrayerApp.xcodeproj/project.pbxproj`, PBX)
      .on('node', c => ({ code: c.args[1] === '--check' ? 1 : 0 }));
    expect(await stopOf(() => stamp(w.ctx(), rel))).toBe('the generated site is still out of date after rebuilding it');
  });
});

describe('B2 the in-app changelog carries the version being cut', () => {
  it('stops when the table does not name it', async () => {
    const w = new World().file(`${ROOT}/src/polish/releaseNotes.generated.ts`, "version: '2.27.1',").on('node', {});
    expect(await stopOf(() => releaseNotesTable(w.ctx(), rel))).toBe(
      'the in-app changelog does not carry 2.28.0 — is 283.txt in place?',
    );
  });
});

describe('B4 the APK is asked what it is', () => {
  const apkWorld = () => {
    const w = new World();
    w.file(`${HOME}/Library/Android/sdk/build-tools/34.0.0/aapt2`, '');
    w.file(`${HOME}/Library/Android/sdk/build-tools/35.0.0/aapt2`, '');
    w.on(`${HOME}/Library/Android/sdk/build-tools/35.0.0/aapt2 dump badging`, {
      stdout: "package: name='com.prayer_times' versionCode='283' versionName='2.28.0'\nsdkVersion:'24'\n",
    })
      .on('unzip -Z1', { stdout: 'lib/arm64-v8a/x.so\nlib/armeabi-v7a/x.so\n' })
      .on('unzip -q -o', {});
    return w;
  };

  it('uses the newest build-tools and passes a correct APK', async () => {
    const w = apkWorld();
    const ctx = w.ctx();
    await apkChecks(ctx, rel);
    expect(w.calls[0].cmd).toContain('35.0.0');
    expect(w.calls[0].args).toEqual(['dump', 'badging', `${ROOT}/${APK}`]);
    expect(lines(ctx)).toEqual([
      'ok B4 APK badging confirms 2.28.0 (283)',
      'ok B4 github APK is ARM only',
      'ok B4 github APK carries no Google Play Services',
    ]);
  });

  it('stops on the wrong versionCode', async () => {
    const w = apkWorld().on(`${HOME}/Library/Android/sdk/build-tools/35.0.0/aapt2`, {
      stdout: "package: name='x' versionCode='282' versionName='2.28.0'\n",
    });
    expect(await stopOf(() => apkChecks(w.ctx(), rel))).toMatch(/^APK reports the wrong versionCode/);
  });

  it('skips all three when there is no aapt2, as the shell did', async () => {
    const w = new World();
    const ctx = w.ctx();
    await apkChecks(ctx, rel);
    expect(lines(ctx)).toEqual([]);
  });
});

describe('B6 the zip about to be published (2.11.0)', () => {
  const zipWorld = (sig: string, ents: string, stapled = true) => {
    const w = new World()
      .on('ditto -x -k', {})
      .on('codesign -dv', { stderr: sig })
      .on('codesign -d --entitlements', { stdout: ents })
      .on('xcrun stapler validate', { code: stapled ? 0 : 65 })
      .on('/System/Library', {});
    w.executables.add('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister');
    return w;
  };

  it('passes a Developer ID signed, entitled, stapled app, and cleans up after itself', async () => {
    const w = zipWorld('TeamIdentifier=GAW23HT439', '<string>group.com.prayerapp</string>');
    const ctx = w.ctx();
    await inspectZip(ctx, '/z.zip');
    expect(lines(ctx)).toEqual([
      'ok B6 signed by team GAW23HT439',
      'ok B6 App Group sealed in',
      'ok B6 notarized, ticket stapled into the bundle',
    ]);
    expect(w.ran(/lsregister -u \/tmp\/mihrab-zip-\d+\/Mihrab\.app/)).toHaveLength(1);
  });

  it('stops an ad-hoc app, and still unregisters the temp copy (the shell left it behind)', async () => {
    const w = zipWorld('Signature=adhoc\nTeamIdentifier=not set', '');
    expect(await stopOf(() => inspectZip(w.ctx(), '/z.zip'))).toBe(
      'the app about to be published is not signed by the Developer ID — this is the 2.11.0 failure',
    );
    expect(w.ran(/lsregister -u/)).toHaveLength(1);
  });

  it('a zip that will not unpack still has its temp copy unregistered and removed', async () => {
    const w = zipWorld('TeamIdentifier=GAW23HT439', 'group.com.prayerapp').on('ditto -x -k', { code: 1 });
    expect(await stopOf(() => inspectZip(w.ctx(), '/z.zip'))).toBe('cannot unpack /z.zip');
    expect(w.ran(/lsregister -u \/tmp\/mihrab-zip-\d+\/Mihrab\.app/)).toHaveLength(1);
    expect([...w.dirs].some(d => d.startsWith('/tmp/mihrab-zip-'))).toBe(false);
  });

  it('stops an unstapled app — Gatekeeper would block its first launch', async () => {
    const w = zipWorld('TeamIdentifier=GAW23HT439', 'group.com.prayerapp', false);
    expect(await stopOf(() => inspectZip(w.ctx(), '/z.zip'))).toMatch(/carries no notarization ticket/);
    expect(w.ran('spctl')).toHaveLength(0);
  });
});

describe('U1 the journal entry', () => {
  const r = { ...rel };

  it('says a clean run needed no lesson', () => {
    expect(journalEntry(r, '2026-09-29', [], '')).toBe(
      '\n## 2.28.0 (283) — 2026-09-29\n\nRan clean on the first attempt.\n\n**Lesson:** none needed — clean run, no change to the cycle.\n',
    );
  });

  it('counts the aborts by reason, and leaves the lesson unfilled', () => {
    const log = [
      '2026-09-29T10:00:00Z\t2.28.0\tcatalyst build failed — /tmp/release-catalyst.log',
      '2026-09-29T10:30:00Z\t2.27.1\tjest failed',
      '2026-09-29T11:00:00Z\t2.28.0\torigin/main has commits main does not — pull first',
      '2026-09-29T11:10:00Z\t2.28.0\torigin/main has commits main does not — pull first',
    ].join('\n');
    const attempts = attemptsFor(log, '2.28.0');
    expect(journalEntry(r, '2026-09-29', attempts, '')).toBe(
      '\n## 2.28.0 (283) — 2026-09-29\n\nTook 3 aborted attempt(s) before it ran clean:\n\n' +
        '  - 1 catalyst build failed — /tmp/release-catalyst.log\n' +
        '  - 2 origin/main has commits main does not — pull first\n\n' +
        '**Lesson:** _(unfilled)_\n',
    );
  });

  it('lists the cycle files it changed', () => {
    expect(journalEntry(r, '2026-09-29', [], 'scripts/release.sh\ndocs/DISTRIBUTION.md')).toContain(
      'Changed the release cycle itself:\n\n  - `scripts/release.sh`\n  - `docs/DISTRIBUTION.md`\n\n**Lesson:** _(unfilled)_\n',
    );
  });
});

describe('U7 the cask bump', () => {
  it('moves the version and the sha, and nothing else', () => {
    const { text, oldSha } = bumpCask(GOOD_CASK, '2.27.1', '2.28.0', 'b'.repeat(64));
    expect(oldSha).toBe('a'.repeat(64));
    expect(text).toBe(GOOD_CASK.replace('version "2.27.1"', 'version "2.28.0"').replace('a'.repeat(64), 'b'.repeat(64)));
  });

  it('matches nothing when the cask is not on the previous version — and the gate catches that', () => {
    const { text } = bumpCask(GOOD_CASK.replace('2.27.1', '2.26.0'), '2.27.1', '2.28.0', 'b'.repeat(64));
    expect(text).not.toContain('version "2.28.0"');
  });
});

/** A machine on which every publish command succeeds. */
function publishWorld() {
  const w = new World()
    .file(`${ROOT}/docs/release-log.md`, '# Release log\n')
    .file('/b/app-github-release.apk', 'APK')
    .file('/b/Mihrab-macOS-2.28.0.zip', 'ZIP')
    .file(TAP, GOOD_CASK)
    .file(`${HOME}/.config/mihrab/asc.json`, JSON.stringify({ keyPath: '/k.p8', keyId: 'K', issuerId: 'I' }))
    .file('/k.p8', generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string)
    .on('git', {})
    .on('git rev-parse HEAD', { stdout: 'feedbeef00\n' })
    .on('gh release create', {})
    .on('gh release view', { stdout: 'Mihrab-v2.28.0.apk\nMihrab-macOS-2.28.0.zip\n' });
  w.url('https://github.com/MihrabHQ/Mihrab/releases/download/v2.28.0/Mihrab-macOS-2.28.0.zip', { body: 'ZIP' });
  const BASE = 'https://api.appstoreconnect.apple.com';
  w.url(`${BASE}/v1/ciProducts?limit=10`, { text: JSON.stringify({ data: [{ id: 'P' }] }) });
  w.url(`${BASE}/v1/ciProducts/P/workflows?limit=20`, { text: JSON.stringify({ data: [{ id: 'WF', attributes: { name: 'Default' } }] }) });
  w.url(`${BASE}/v1/ciWorkflows/WF`, { text: JSON.stringify({ data: { attributes: { isEnabled: true } } }) });
  w.url(`${BASE}/v1/ciProducts/P/buildRuns?limit=10&sort=-number`, {
    text: JSON.stringify({ data: [{ attributes: { number: 742, executionProgress: 'RUNNING', sourceCommit: { commitSha: 'feedbeef00' } } }] }),
  });
  return w;
}
const built = { apk: '/b/app-github-release.apk', aab: '/b/app-play-release.aab', zip: '/b/Mihrab-macOS-2.28.0.zip' };

describe('publishing, for real', () => {
  it('main, then the tag, then the release, then the tap — each only after the one before', async () => {
    const w = publishWorld();
    const ctx = w.ctx();
    const pub = await publish(ctx, rel, built, '');
    const order = [
      w.indexOf('git commit'),
      w.indexOf('git push -q origin main'),
      w.indexOf('git tag -a v2.28.0'),
      w.indexOf('git push -q origin v2.28.0'),
      w.indexOf('gh release create'),
      w.indexOf('git push -q origin HEAD'),
    ];
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(pub).toEqual({ releaseSha: 'feedbeef00', ios: 'cloud' });
    expect(w.ran('git commit')[0].args).toEqual(['commit', '-q', '-m', commitMessage(rel)]);
  });

  it('uploads the assets under their published names, never gradle’s', async () => {
    const w = publishWorld();
    await publish(w.ctx(), rel, built, '');
    const create = w.ran('gh release create')[0].args;
    expect(create.filter(a => a.startsWith('/tmp/'))).toEqual([
      expect.stringMatching(/\/Mihrab-v2\.28\.0\.apk$/),
      expect.stringMatching(/\/Mihrab-macOS-2\.28\.0\.zip$/),
    ]);
    expect(create.some(a => a.includes('#'))).toBe(false);
    expect(create).toEqual(expect.arrayContaining(['--latest', '--generate-notes']));
  });

  it('bumps the cask against the zip as downloaded', async () => {
    const w = publishWorld();
    await publish(w.ctx(), rel, built, '');
    expect(w.files.get(TAP)).toContain('version "2.28.0"');
    expect(w.files.get(TAP)).toContain(`sha256 "${sha('ZIP')}"`);
  });

  it('writes the journal entry into the release commit, before the push', async () => {
    const w = publishWorld();
    await publish(w.ctx(), rel, built, '');
    expect(w.files.get(`${ROOT}/docs/release-log.md`)).toContain('## 2.28.0 (283)');
    expect(w.ran('git add')[0].args).toContain('docs/release-log.md');
    expect(w.ran('git add')[0].args).toContain('src/polish/releaseNotes.generated.ts');
  });

  it('a failed push to main stops with the mixed-reset recovery, and tags nothing (2.25.1)', async () => {
    const w = publishWorld().on('git push -q origin main', { code: 1 });
    const msg = await stopOf(() => publish(w.ctx(), rel, built, ''));
    expect(msg).toContain(`git reset -q HEAD~1 && ${REVERT} && git pull --rebase -q origin main`);
    expect(msg).not.toContain('--soft');
    expect(w.ran('git tag')).toHaveLength(0);
    expect(w.ran('gh release create')).toHaveLength(0);
  });

  it('a failed release names the draft it may have left (2.23.0)', async () => {
    const w = publishWorld().on('gh release create', { code: 1 });
    expect(await stopOf(() => publish(w.ctx(), rel, built, ''))).toMatch(/may now be a DRAFT with a partial asset/);
  });

  it('refuses a cask the seds could not move, before pushing the tap', async () => {
    const w = publishWorld().file(TAP, GOOD_CASK.replace('2.27.1', '2.26.0'));
    expect(await stopOf(() => publish(w.ctx(), rel, built, ''))).toMatch(/the cask still does not say 2\.28\.0/);
    expect(w.ran('git push -q origin HEAD')).toHaveLength(0);
  });

  it('SKIP_CATALYST leaves the cask alone and ships the APK only', async () => {
    const w = publishWorld().on('gh release view', { stdout: 'Mihrab-v2.28.0.apk\n' });
    w.env.SKIP_CATALYST = '1';
    const ctx = w.ctx();
    await publish(ctx, rel, { ...built, zip: '' }, '');
    expect(w.files.get(TAP)).toBe(GOOD_CASK);
    expect(lines(ctx)).toContain('ok U6 GitHub release published (APK only — SKIP_CATALYST=1)');
  });
});

describe('U3/U8 the App Store route', () => {
  it('SKIP_APP_STORE pauses the workflow BEFORE the push, and sends nothing after', async () => {
    const w = publishWorld();
    w.env.SKIP_APP_STORE = '1';
    const pub = await publish(w.ctx(), rel, built, '');
    const patch = w.requests.findIndex(r => r.method === 'PATCH');
    expect(patch).toBeGreaterThan(-1);
    expect(JSON.parse(w.requests[patch].body ?? '').data.attributes).toEqual({ isEnabled: false });
    // Every request up to the pause, and the push after it.
    expect(w.indexOf('git push -q origin main')).toBeGreaterThan(-1);
    expect(pub.ios).toBe('skipped');
    expect(w.requests.some(r => r.method === 'POST')).toBe(false);
  });

  it('falls back to the local build when Xcode Cloud has no run, and tells the verifier', async () => {
    const w = publishWorld();
    const BASE = 'https://api.appstoreconnect.apple.com';
    w.url(`${BASE}/v1/ciProducts/P/buildRuns?limit=10&sort=-number`, { text: JSON.stringify({ data: [] }) });
    w.url(`${BASE}/v1/ciProducts/P/buildRuns?limit=5&sort=-number`, { text: JSON.stringify({ data: [] }) });
    w.url(`${BASE}/v1/ciBuildRuns`, { status: 500, text: 'UNEXPECTED_ERROR' });
    w.on(/main\.ts ios-appstore$/, {});
    const ctx = w.ctx();
    const pub = await publish(ctx, rel, built, '');
    expect(pub.ios).toBe('local');
    expect(w.env.IOS_LOCAL_UPLOAD).toBe('1');
    expect(lines(ctx)).toContain('warn U8 Xcode Cloud has no run for this release');
    expect(ctx.report.outcomes.some(o => o.kind === 'stop')).toBe(false);
  });

  it('NO_IOS_LOCAL=1 does not fall back, and it is still not a stop', async () => {
    const w = publishWorld();
    const BASE = 'https://api.appstoreconnect.apple.com';
    w.url(`${BASE}/v1/ciProducts/P/buildRuns?limit=10&sort=-number`, { text: JSON.stringify({ data: [] }) });
    w.url(`${BASE}/v1/ciProducts/P/buildRuns?limit=5&sort=-number`, { text: JSON.stringify({ data: [] }) });
    w.url(`${BASE}/v1/ciBuildRuns`, { status: 500, text: 'x' });
    w.env.NO_IOS_LOCAL = '1';
    const pub = await publish(w.ctx(), rel, built, '');
    expect(pub.ios).toBe('none');
    expect(w.ran(/ios-appstore/)).toHaveLength(0);
  });
});

describe('publishing in dry run', () => {
  it('pushes nothing, tags nothing, creates no release, touches no tap', async () => {
    const w = publishWorld();
    const ctx = w.ctx({ dryRun: true });
    await publish(ctx, rel, built, '');
    expect(w.ran(/^git (push|tag)/)).toEqual([]);
    expect(w.ran('gh release create')).toEqual([]);
    expect(w.files.get(TAP)).toBe(GOOD_CASK);
    expect(w.requests.filter(r => r.method !== 'GET')).toEqual([]);
    expect(ctx.wouldDo).toEqual([
      'push main to origin',
      'tag v2.28.0 "Mihrab 2.28.0 (283)"',
      'push v2.28.0 to origin',
      'create the GitHub release v2.28.0 with Mihrab-v2.28.0.apk, Mihrab-macOS-2.28.0.zip',
      'commit "mihrab 2.28.0" in the tap and push it',
      'wait for the Xcode Cloud run on feedbeef',
    ]);
  });
});

describe('C the release commit’s own CI', () => {
  it('waits for a completed run and reads red as a warning, not a stop', async () => {
    let asked = 0;
    const w = new World().on('gh run list', () => ({ stdout: ++asked < 3 ? 'in_progress||u' : 'completed|failure|https://ci/9' }));
    const ctx = w.ctx();
    expect(await ciOnRelease(ctx, 'feedbeef')).toEqual({ state: 'red', url: 'https://ci/9' });
    expect(w.slept).toBe(30_000);
    expect(lines(ctx)).toEqual(["warn C CI concluded 'failure' on the release commit feedbeef"]);
  });

  it('gives up after forty looks, fifteen seconds apart', async () => {
    const w = new World().on('gh run list', { stdout: '' });
    expect((await ciOnRelease(w.ctx(), 'x')).state).toBe('unknown');
    expect(w.ran('gh run list')).toHaveLength(40);
    expect(w.slept).toBe(600_000);
  });
});

describe('the summary', () => {
  it('names the red commit and what a person still has to do', () => {
    const text = summary(rel, built, 'skipped', { state: 'red', url: 'https://ci/9' }).join('\n');
    expect(text).toContain('is live — and its own commit fails CI');
    expect(text).toContain('Still yours to do');
    expect(text).toContain('git checkout v2.28.0');
    expect(text).toContain('upload /b/app-play-release.aab');
  });
});

describe('cleanup reaches only into this repo', () => {
  it('reaps by patterns under the root and stops the Gradle daemon', async () => {
    // Newest registration wins: the general answer first, the one match after.
    const w = new World()
      .on('pgrep', { code: 1 })
      .on('pgrep -f /repo/node_modules/jest-worker', { stdout: '11\n12\n' })
      .on('kill', {})
      .on('/repo/android/gradlew --stop', { stdout: 'Stopping Daemon(s)\n1 Daemon stopped\n' });
    w.executables.add('/repo/android/gradlew');
    const ctx = w.ctx();
    await cleanup(ctx);
    for (const c of w.ran('pgrep')) expect(c.args[1].startsWith('/repo/')).toBe(true);
    expect(lines(ctx)).toEqual([
      'ok cleanup stopped orphaned jest workers (11 12)',
      'ok cleanup stopped the Gradle daemon',
      "ok cleanup nothing of this release's is still running",
    ]);
  });
});

describe('the release commit', () => {
  it('may touch the stamped files and nothing else', () => {
    expect(inReleaseCommit('docs/sv/index.html')).toBe(true);
    expect(inReleaseCommit('fastlane/metadata/android/en-US/changelogs/283.txt')).toBe(true);
    expect(inReleaseCommit('src/App.tsx')).toBe(false);
  });
});
