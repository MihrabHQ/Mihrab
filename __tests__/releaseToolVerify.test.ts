/**
 * Release verification, ported (scripts/release/verify.ts), against a
 * fake release: a healthy one first, then each thing that has gone wrong
 * live — a draft, a missing asset, the wrong APK, a stale cask, an ad-hoc
 * app, a cask asking for the wrong macOS, iOS mid-build or shipped by the
 * local route, CI still running.
 */
import { archVerdict, caskArch, caskMacos, ciVerdict, macosVerdict, verify } from '../scripts/release/verify.ts';
import { GOOD_CASK, GRADLE, HOME, ROOT, TAP, World, sha } from './fixtures/releaseWorld';
import { generateKeyPairSync } from 'crypto';

const TAG = 'v2.28.0';
const V = '2.28.0';
const DL = `https://github.com/MihrabHQ/Mihrab/releases/download/${TAG}`;
const BASE = 'https://api.appstoreconnect.apple.com';
const SDK = `${HOME}/Library/Android/sdk/build-tools`;
const PEM = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const CERT = 'e66c0dabc898856bd0f6057a8fe0aaa440fa1d04f0da5a213104f41f89e6f997';

/** A release that is fine on every channel. */
function published() {
  const w = new World();
  const zipBytes = 'ZIPBYTES';
  const cask = GOOD_CASK.replace('version "2.27.1"', `version "${V}"`).replace('a'.repeat(64), sha(zipBytes));
  w.file(TAP, cask);
  w.file(`${ROOT}/contrib/fdroid/com.prayer_times.yml`, `CurrentVersion: ${V}\n`);
  w.file(`${ROOT}/docs/index.html`, `<p>Version ${V} (283)</p><title>Mihrab ${V} (283)</title>`);
  w.file(`${ROOT}/android/app/build.gradle`, GRADLE.replace('282', '283'));
  for (const loc of ['en-US', 'sv-SE', 'ar']) w.file(`${ROOT}/fastlane/metadata/android/${loc}/changelogs/283.txt`, 'notes');
  w.file(`${SDK}/35.0.0/apksigner`, '');
  w.dir('/Applications/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex');
  w.on('git ls-remote', { stdout: `abc\trefs/tags/${TAG}\n` })
    .on('gh release view', {
      stdout: JSON.stringify({ isDraft: false, assets: [{ name: `Mihrab-v${V}.apk` }, { name: `Mihrab-macOS-${V}.zip` }] }),
    })
    .on('unzip -Z1', { stdout: 'lib/arm64-v8a/libhermes.so\nlib/armeabi-v7a/libhermes.so\n' })
    .on('unzip -q -o', {})
    .on(`${SDK}/35.0.0/apksigner verify`, { stdout: `Signer #1 certificate SHA-256 digest: ${CERT}\n` })
    .on('ditto -xk', c => {
      w.dir(`${c.args[2]}/Mihrab.app`);
      return {};
    })
    .on('codesign -dv', { stderr: 'Identifier=com.hassan.prayerapp\nTeamIdentifier=GAW23HT439\n' })
    .on('codesign -d --entitlements', { stdout: '<string>GAW23HT439.group.com.prayerapp</string>' })
    .on('xcrun stapler validate', {})
    .on(/plutil -extract LSMinimumSystemVersion/, { stdout: '12.1\n' })
    .on(/plutil -extract CFBundleExecutable/, { stdout: 'PrayerApp\n' })
    .on('lipo -archs', { stdout: 'arm64\n' })
    .on('pluginkit -a', {})
    .on('pluginkit -m', { stdout: '+ maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension(2.28.0)\n' })
    .on('git diff --quiet', {})
    .on('git log origin/main..main', {})
    .on('git rev-parse -q --verify', { stdout: 'feedbeefcafe\n' })
    .on('gh run list', { stdout: 'completed|success|https://ci/1\n' });
  w.url(`${DL}/Mihrab-macOS-${V}.zip`, { body: zipBytes });
  w.url(`${DL}/Mihrab-v${V}.apk`, { body: 'APK' });
  w.url('https://mihrab.elghamri.se/', { text: `<p>Version ${V} (283)</p>` });
  // App Store Connect: the build is there.
  w.file(`${HOME}/.config/mihrab/asc.json`, JSON.stringify({ keyPath: '/k.p8', keyId: 'K', issuerId: 'I' }));
  w.file('/k.p8', PEM);
  w.url(`${BASE}/v1/apps?limit=10`, { text: JSON.stringify({ data: [{ id: 'APP', attributes: { bundleId: 'com.hassan.prayerapp' } }] }) });
  asc(w, [{ version: '283', marketing: V }], []);
  return w;
}

function asc(w: World, builds: Array<{ version: string; marketing: string }>, runs: Array<{ number: number; progress: string; sha: string }>) {
  w.url(
    `${BASE}/v1/builds?filter[app]=APP&limit=30&sort=-uploadedDate&include=preReleaseVersion&fields[builds]=version,processingState,uploadedDate,preReleaseVersion&fields[preReleaseVersions]=version`,
    {
      text: JSON.stringify({
        data: builds.map((b, i) => ({ attributes: { version: b.version, processingState: 'VALID', uploadedDate: 'today' }, relationships: { preReleaseVersion: { data: { id: `p${i}` } } } })),
        included: builds.map((b, i) => ({ id: `p${i}`, attributes: { version: b.marketing } })),
      }),
    },
  );
  w.url(`${BASE}/v1/ciProducts?limit=10`, { text: JSON.stringify({ data: [{ id: 'PROD' }] }) });
  w.url(`${BASE}/v1/ciProducts/PROD/buildRuns?limit=10&sort=-number`, {
    text: JSON.stringify({ data: runs.map(r => ({ attributes: { number: r.number, executionProgress: r.progress, sourceCommit: { commitSha: r.sha } } })) }),
  });
}

async function run(w: World) {
  const ctx = w.ctx({ style: 'verify' });
  const code = await verify(ctx, TAG);
  const byKind = (k: string) => ctx.report.outcomes.filter(o => o.kind === k).map(o => o.text);
  return { code, ctx, fails: byKind('fail'), pends: byKind('pend'), oks: byKind('ok') };
}

describe('a healthy release', () => {
  it('passes every check and says it is live on every channel', async () => {
    const w = published();
    const { code, fails, pends, oks } = await run(w);
    expect({ fails, pends }).toEqual({ fails: [], pends: [] });
    expect(code).toBe(0);
    expect(w.out[w.out.length - 1]).toBe(`── ALL CHECKS PASSED — release ${TAG} is live on every channel ──`);
    expect(oks).toEqual(
      expect.arrayContaining([
        `tag ${TAG} exists on origin`,
        'release is published (not draft)',
        'published APK is signed with the release key',
        'cask sha256 matches the published zip',
        'published app signed by team GAW23HT439',
        'cask requires macOS 12 (:monterey), as the app does (12.1)',
        'cask requires Apple silicon, as the app (arm64) does',
        `iOS: ${V} is in App Store Connect: build 283, VALID, uploaded today`,
        'CI: green on feedbee',
      ]),
    );
    expect(w.unhandled).toEqual([]);
  });

  it('unregisters the unpacked copy and puts the installed widget back', async () => {
    const w = published();
    w.executables.add('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister');
    w.on('/System/Library', {});
    await run(w);
    expect(w.indexOf(/lsregister -u \/tmp\/mihrab-verifyapp-\d+\/Mihrab\.app$/)).toBeGreaterThan(-1);
    expect(w.indexOf('pluginkit -a')).toBeGreaterThan(w.indexOf(/lsregister -u/));
  });
});

describe('what has gone wrong live', () => {
  it('a DRAFT fails, with the fix (v2.7.39)', async () => {
    const w = published().on('gh release view', { stdout: JSON.stringify({ isDraft: true, assets: [] }) });
    const { fails, code } = await run(w);
    expect(fails).toContain(`release is a DRAFT — assets 404 publicly. Fix: gh release edit ${TAG} -R MihrabHQ/Mihrab --draft=false --latest`);
    expect(fails).toContain(`asset MISSING from release: Mihrab-v${V}.apk`);
    expect(code).toBe(1);
  });

  it('two APKs fail — Obtainium needs exactly one', async () => {
    const w = published().on('gh release view', {
      stdout: JSON.stringify({ isDraft: false, assets: [{ name: `Mihrab-v${V}.apk` }, { name: 'app-fdroid-release.apk' }, { name: `Mihrab-macOS-${V}.zip` }] }),
    });
    expect((await run(w)).fails[0]).toMatch(/^2 APKs on the release/);
  });

  it('the F-Droid build on the release fails on its ABIs', async () => {
    const w = published().on('unzip -Z1', { stdout: 'lib/arm64-v8a/a.so\nlib/x86_64/a.so\n' });
    expect((await run(w)).fails).toContain(
      "published APK carries ABIs 'arm64-v8a x86_64 ' — expected arm64-v8a armeabi-v7a; is this the F-Droid build?",
    );
  });

  it('Google classes in the dex fail — read from the bytes, not a pipe that can report 141', async () => {
    const w = published().on('unzip -q -o', c => {
      w.file(`${c.args[c.args.length - 1]}/classes2.dex`, '\u0000\u0001Lcom/google/firebase/FirebaseApp;\u0000');
      return {};
    });
    expect((await run(w)).fails).toContain('published APK contains Google Play Services / Firebase / Play Core classes');
  });

  it('another signing key fails; no apksigner is pending, not passed', async () => {
    const w = published().on(`${SDK}/35.0.0/apksigner`, { stdout: 'Signer #1 certificate SHA-256 digest: 00ff\n' });
    expect((await run(w)).fails[0]).toMatch(/^published APK signer is '00ff', not the release key/);
    const w2 = published();
    w2.files.delete(`${SDK}/35.0.0/apksigner`);
    expect((await run(w2)).pends).toEqual(['apksigner not found — signing key of the published APK not checked']);
  });

  it('a cask whose sha is not the served zip’s fails', async () => {
    const w = published().url(`${DL}/Mihrab-macOS-${V}.zip`, { body: 'OTHER' });
    expect((await run(w)).fails[0]).toBe(
      `cask sha256 (${sha('ZIPBYTES')}) != published zip (${sha('OTHER')}) — re-upload the zip or update the cask`,
    );
  });

  it('an ad-hoc app fails before its team is even asked', async () => {
    const w = published().on('codesign -dv', { stderr: 'Signature=adhoc\nTeamIdentifier=not set\n' });
    expect((await run(w)).fails).toContain(
      'the published app is AD-HOC SIGNED — no entitlements, no App Group, no widgets. Rebuild with a Developer ID and re-upload.',
    );
  });

  it('a cask asking for Ventura while the app needs 12.1 fails', async () => {
    const w = published();
    w.file(TAP, w.files.get(TAP)!.replace(':monterey', ':ventura'));
    expect((await run(w)).fails).toContain(
      "cask requires macOS 13 (:ventura) but the app needs 12.1 — set depends_on macos in Casks/mihrab.rb to the app's own minimum",
    );
  });

  it('the live site serving the old version fails, and says whose side it is', async () => {
    const w = published()
      .url('https://mihrab.elghamri.se/', { text: '<p>Version 2.27.1 (282)</p>' })
      .url('https://www.githubstatus.com/api/v2/components.json', { text: JSON.stringify({ components: [{ name: 'Pages', status: 'major_outage' }] }) })
      .on('gh api', { stdout: 'built\n' });
    const { fails } = await run(w);
    expect(fails).toContain(`live site is NOT serving ${V}`);
    expect(w.out).toContain('    served: Version 2.27.1 (282)   last-modified: unknown');
    expect(w.out).toContain('    → Pages is not operational. The repo is right; the deploy is stuck on GitHub.');
  });
});

describe('iOS: shipped, still going, or never (2.13.0, 2.13.1, 2.24.0)', () => {
  it('a run still going is ⧗ and the summary holds back, exit 0', async () => {
    const w = published();
    asc(w, [], [{ number: 741, progress: 'RUNNING', sha: 'feedbeef' }]);
    const { pends, code } = await run(w);
    expect(pends).toEqual([`iOS: ${V} is not in App Store Connect yet — #741 feedbeef is still going. Ask again in a few minutes.`]);
    expect(code).toBe(0);
    expect(w.out[w.out.length - 1]).toMatch(/EVERY FINISHED CHECK PASSED — something above is still running/);
  });

  it('nothing building it fails', async () => {
    const w = published();
    asc(w, [], []);
    w.on('git -C /repo log -1', { stdout: `${Math.floor(w.now / 1000) - 3600}\n` });
    const { fails, code } = await run(w);
    expect(fails[0]).toMatch(/^iOS: 2\.28\.0: feedbeef is 60 min old and Xcode Cloud never started a run/);
    expect(code).toBe(1);
  });

  it('after a local upload the same answer is ⧗, naming the route', async () => {
    const w = published();
    asc(w, [], []);
    w.on('git -C /repo log -1', { stdout: `${Math.floor(w.now / 1000) - 3600}\n` });
    w.env.IOS_LOCAL_UPLOAD = '1';
    const { pends, fails } = await run(w);
    expect(fails).toEqual([]);
    expect(pends[0]).toMatch(/^iOS: uploaded from this Mac \(build 283\) and not listed by App Store Connect yet/);
  });

  it('missing credentials are a failure that says so', async () => {
    const w = published();
    w.files.delete(`${HOME}/.config/mihrab/asc.json`);
    expect((await run(w)).fails).toContain('iOS: missing credentials: keyPath, keyId, issuerId — see the header of scripts/release/asc.ts');
  });
});

describe('the small verdicts', () => {
  it.each([
    ['', 'x', ['pend', 'CI: no run on x yet — re-run once GitHub has picked the push up']],
    ['in_progress||u', 'x', ['pend', 'CI: in_progress on x — u']],
    ['completed|success|u', 'x', ['ok', 'CI: green on x']],
    ['completed|timed_out|u', 'x', ['fail', 'CI: timed_out on the released commit x — u']],
    ['completed|cancelled|u', 'x', ['pend', 'CI: cancelled on x — no verdict — u']],
  ])('CI %s', (row, short, expected) => {
    expect(ciVerdict(row, short)).toEqual(expected);
  });

  it('reads the cask’s macOS symbol in either spelling', () => {
    expect(caskMacos('  depends_on macos: ">= :monterey"')).toBe('monterey');
    expect(caskMacos('  depends_on macos: :sonoma')).toBe('sonoma');
    expect(caskArch('  depends_on arch: :arm64')).toBe('arm64');
  });

  it('compares majors only, and cannot compare without both', () => {
    expect(macosVerdict('tahoe', '26.0')[0]).toBe('ok');
    expect(macosVerdict('', '12.1')).toEqual(['fail', "cannot compare the cask's macOS (':none') with the app's LSMinimumSystemVersion ('12.1')"]);
  });

  it('an Intel slice with an arm64-only cask fails; a universal cask for arm64 fails', () => {
    expect(archVerdict('x86_64 arm64', 'arm64')[0]).toBe('fail');
    expect(archVerdict('arm64', '')[0]).toBe('fail');
    expect(archVerdict('', 'arm64')).toEqual(['fail', "cannot read the published app's architectures"]);
  });
});
