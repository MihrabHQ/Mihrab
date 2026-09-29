/**
 * build-ios-appstore.sh, ported (scripts/release/iosAppStore.ts), against
 * a fake Mac: the entitlement gate builds 520–522 needed, the iOS 27 scene
 * gate 2.22.0 to 2.27.1 needed — both before anything is exported — and
 * an upload that only ever happens after App Store Connect validated it.
 */
import {
  EXPORT_OPTIONS,
  appexVerdict,
  buildIosAppStore,
  claimFrom,
  swiftRuntimeName,
} from '../scripts/release/iosAppStore.ts';
import { HOME, ROOT, World, stopOf } from './fixtures/releaseWorld';

const ARCHIVE = 'ios/build/appstore/Mihrab-2.28.0.xcarchive';
const APP = `${ARCHIVE}/Products/Applications/Mihrab.app`;
const ENTS: Record<string, object> = {
  [APP]: { 'com.apple.security.application-groups': ['group.com.prayerapp'], 'keychain-access-groups': ['k'] },
  [`${APP}/PlugIns/PrayerWidgetExtension.appex`]: { 'com.apple.security.application-groups': ['group.com.prayerapp'] },
  [`${APP}/PlugIns/MihrabLiveActivity.appex`]: {},
};

function mac(ents = ENTS) {
  const w = new World();
  w.file(`${ROOT}/ios/PrayerApp.xcodeproj/project.pbxproj`, 'MARKETING_VERSION = 2.28.0;\nCURRENT_PROJECT_VERSION = 283;\n');
  w.file(`${HOME}/.config/mihrab/asc.json`, JSON.stringify({ keyId: 'KEY1', issuerId: 'ISS', keyPath: '~/keys/AuthKey.p8' }));
  w.file(`${HOME}/keys/AuthKey.p8`, 'secret');
  w.on(/./, {})
    .on('security find-identity', { stdout: '  1) X "Apple Distribution: Hassan (GAW23HT439)"\n' })
    .on('xcodebuild archive', () => {
      // The archive is made fresh: the old one was removed before this.
      w.file(`${ROOT}/${APP}/PrayerApp`, 'binary … _TtC9PrayerApp13SceneDelegate …');
      for (const p of Object.keys(ents)) w.dir(`${ROOT}/${p}`);
      return {};
    })
    .on('codesign -d --entitlements :-', c => ({ stdout: c.args[c.args.length - 1] }))
    .on('plutil -convert json', c => ({ stdout: JSON.stringify(ents[c.opts.input ?? ''] ?? {}) }))
    .on(/PlistBuddy -c Print :UIApplicationSceneManifest/, { stdout: 'PrayerApp.SceneDelegate\n' })
    .on(/PlistBuddy -c Print :CFBundleExecutable/, { stdout: 'PrayerApp\n' })
    .on('xcodebuild -exportArchive', () => {
      w.file(`${ROOT}/ios/build/appstore/export-2.28.0/Mihrab.ipa`, 'IPA');
      return {};
    });
  return w;
}

async function build(w: World, args: string[] = []) {
  const ctx = w.ctx();
  let code: number | undefined;
  const stopped = await stopOf(async () => {
    code = await buildIosAppStore(ctx, args);
  });
  return { code, stopped, err: w.err.join('\n'), out: w.out.join('\n') };
}

describe('a whole local App Store build', () => {
  it('archives, checks, exports, validates, then uploads', async () => {
    const w = mac();
    const { code, stopped } = await build(w);
    expect(stopped).toBeUndefined();
    expect(code).toBe(0);
    const order = ['xcodebuild archive', 'xcodebuild -exportArchive', 'xcrun altool --validate-app', 'xcrun altool --upload-app'].map(p => w.indexOf(p));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order.every(i => i >= 0)).toBe(true);
    // The same API key signs xcodebuild in, so it can mint the profiles.
    expect(w.ran('xcodebuild -exportArchive')[0].args).toEqual(
      expect.arrayContaining(['-authenticationKeyPath', `${HOME}/keys/AuthKey.p8`, '-authenticationKeyID', 'KEY1']),
    );
    // altool looks for the key only where it looks.
    expect(w.symlinks.get(`${HOME}/.appstoreconnect/private_keys/AuthKey_KEY1.p8`)).toBe(`${HOME}/keys/AuthKey.p8`);
    expect(w.files.get(`${ROOT}/ios/build/appstore/ExportOptions.plist`)).toBe(EXPORT_OPTIONS);
  });

  it('--no-upload stops after validation', async () => {
    const w = mac();
    expect((await build(w, ['--no-upload'])).code).toBe(0);
    expect(w.ran('xcrun altool --upload-app')).toEqual([]);
  });

  it('a validation refusal never uploads', async () => {
    const w = mac().on('xcrun altool --validate-app', { code: 1, stdout: 'ERROR ITMS-90062: bundle version' });
    expect((await build(w)).stopped).toBe('Not uploading a build App Store Connect has already refused.');
    expect(w.ran('xcrun altool --upload-app')).toEqual([]);
  });
});

describe('the entitlement gate (builds 520–522)', () => {
  it('a Live Activity carrying the widget’s App Group stops before export', async () => {
    const w = mac({ ...ENTS, [`${APP}/PlugIns/MihrabLiveActivity.appex`]: { 'com.apple.security.application-groups': ['group.com.prayerapp'] } });
    const { stopped, err } = await build(w);
    expect(stopped).toBe('Entitlement check failed — not exporting. See above.');
    expect(err).toContain('This is the builds 520-522 failure, caught before export.');
    expect(w.ran('xcodebuild -exportArchive')).toEqual([]);
  });

  it('an app without its keychain group stops', async () => {
    const w = mac({ ...ENTS, [APP]: { 'com.apple.security.application-groups': ['g'] } });
    expect((await build(w)).stopped).toBe('The app has no keychain access group: it would generate a new sync identity on install.');
  });

  it('reads dotted keys whole — plutil -extract split them and found nothing', () => {
    const json = JSON.stringify({ 'com.apple.security.application-groups': ['g'], 'keychain-access-groups': [] });
    expect(claimFrom(json, 'com.apple.security.application-groups')).toBe('["g"]');
    expect(claimFrom(json, 'keychain-access-groups')).toBe('');
    expect(claimFrom('not json', 'x')).toBe('');
  });

  it('names what it does not know rather than passing it silently', () => {
    expect(appexVerdict('NewThing', '', '')).toEqual({ ok: true, lines: ['  NewThing: unrecognised extension, entitlements not asserted.'] });
    expect(appexVerdict('PrayerWidgetExtension', '', '').ok).toBe(false);
  });
});

describe('the iOS 27 scene gate (2.22.0 to 2.27.1)', () => {
  it('a bundle with no scene manifest stops before export', async () => {
    const w = mac().on(/PlistBuddy -c Print :UIApplicationSceneManifest/, { code: 1 });
    expect((await build(w)).stopped).toMatch(/^The app declares no scene/);
    expect(w.ran('xcodebuild -exportArchive')).toEqual([]);
  });

  it('an unsubstituted delegate name stops', async () => {
    const w = mac().on(/PlistBuddy -c Print :UIApplicationSceneManifest/, { stdout: '$(PRODUCT_MODULE_NAME).SceneDelegate' });
    expect((await build(w)).stopped).toMatch(/was not substituted/);
  });

  it('a delegate the binary does not contain stops', async () => {
    const w = mac().on(/PlistBuddy -c Print :UIApplicationSceneManifest/, { stdout: 'PrayerApp.OtherDelegate' });
    expect((await build(w)).stopped).toMatch(/_TtC9PrayerApp13OtherDelegate/);
  });

  it('computes the Swift runtime name as the shell did', () => {
    expect(swiftRuntimeName('PrayerApp.SceneDelegate')).toBe('_TtC9PrayerApp13SceneDelegate');
  });
});

describe('before any of it', () => {
  it('no Apple Distribution identity stops first', async () => {
    const w = mac().on('security find-identity', { stdout: '  1) X "Developer ID Application: Hassan (GAW23HT439)"\n' });
    expect((await build(w)).stopped).toMatch(/^No 'Apple Distribution' identity/);
    expect(w.ran('xcodebuild')).toEqual([]);
  });

  it('a version already live asks before rebuilding it, and a no stops', async () => {
    const w = mac();
    const BASE = 'https://api.appstoreconnect.apple.com';
    w.file(`${HOME}/keys/AuthKey.p8`, require('crypto').generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }));
    w.url(`${BASE}/v1/apps?limit=10`, { text: JSON.stringify({ data: [{ id: 'APP', attributes: { bundleId: 'com.hassan.prayerapp' } }] }) });
    w.url(
      `${BASE}/v1/builds?filter[app]=APP&limit=30&sort=-uploadedDate&include=preReleaseVersion&fields[builds]=version,processingState,uploadedDate,preReleaseVersion&fields[preReleaseVersions]=version`,
      { text: JSON.stringify({ data: [{ attributes: {}, relationships: { preReleaseVersion: { data: { id: 'p' } } } }], included: [{ id: 'p', attributes: { version: '2.28.0' } }] }) },
    );
    w.answers.push('n');
    const { stopped, err } = await build(w);
    expect(err).toContain('2.28.0 has already reached App Store Connect.');
    expect(stopped).toBe('not continuing');
    expect(w.ran('xcodebuild')).toEqual([]);
  });
});
