/**
 * The Mac's minimum is read off the iOS one, and iOS 15.1 cannot be read.
 *
 * A Mac Catalyst build has no macOS deployment target of its own: Xcode
 * derives it from IPHONEOS_DEPLOYMENT_TARGET through the SDK's
 * iOS-to-Catalyst version map, which has 15.0 and 15.2 and no 15.1. A
 * target at 15.1 therefore fell back to iOS 13.1 = macOS 10.15, which
 * Xcode 27 refuses — the break that kept the Mac on Xcode 26 from 2.22.0
 * to 2.27 (docs/rewrite-plan.md, step 5.1). Catalyst builds say 15.2
 * instead, through `[sdk=macosx*]`, so iOS keeps 15.1.
 *
 * No Xcode runs here, so this holds the configuration rather than the
 * build: every configuration of the app at 15.1 carries the Catalyst
 * value, the value is above the iOS one and is not 15.1, and the Podfile
 * gives the pods the same.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const pbxproj = readFileSync(
  join(ROOT, 'ios', 'PrayerApp.xcodeproj', 'project.pbxproj'),
  'utf8',
);
const podfile = readFileSync(join(ROOT, 'ios', 'Podfile'), 'utf8');

const version = (v: string) => v.split('.').map(Number);
const above = (a: string, b: string) => {
  const [x, y] = [version(a), version(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
};

const configs = [
  ...pbxproj.matchAll(
    /isa = XCBuildConfiguration;[\s\S]*?buildSettings = \{([\s\S]*?)\n\t\t\t\};/g,
  ),
].map(m => m[1]);
const setting = (block: string, key: string) =>
  block.match(new RegExp(`\\n\\s*${key} = ([0-9.]+);`))?.[1];
const IOS = 'IPHONEOS_DEPLOYMENT_TARGET';
const CATALYST = '"IPHONEOS_DEPLOYMENT_TARGET\\[sdk=macosx\\*\\]"';

const catalystMin = podfile.match(/^catalyst_min_ios = '([0-9.]+)'/m)?.[1];

describe('the Mac Catalyst deployment target', () => {
  it('is set in the Podfile, above the app’s iOS minimum and not 15.1', () => {
    const appMin = podfile.match(/^app_min_ios = '([0-9.]+)'/m)?.[1];
    expect(catalystMin).toBeDefined();
    expect(catalystMin).not.toBe('15.1');
    expect(above(catalystMin!, appMin!)).toBe(true);
  });

  it('is given to every pod and to the pods project', () => {
    expect(podfile).toMatch(
      /cfg\.build_settings\['IPHONEOS_DEPLOYMENT_TARGET\[sdk=macosx\*\]'\] = catalyst_min_ios/,
    );
    expect(podfile).toMatch(
      /installer\.pods_project\.build_configurations\.each do \|cfg\|\s*\n\s*cfg\.build_settings\['IPHONEOS_DEPLOYMENT_TARGET\[sdk=macosx\*\]'\] = catalyst_min_ios/,
    );
  });

  it('is on every configuration of the app that says iOS 15.1, and says the same', () => {
    const at151 = configs.filter(c => setting(c, IOS) === '15.1');
    // The app target's Debug and Release, and the project's.
    expect(at151).toHaveLength(4);
    for (const c of at151) expect(setting(c, CATALYST)).toBe(catalystMin);
  });

  it('is one the version map can read, on every target the Mac builds', () => {
    // Not only the app: any target that builds for Catalyst (today the
    // widget extension, at 17.0 = macOS 14) derives its Mac minimum the
    // same way, and a minor release missing from the map falls back just
    // as 15.1 did. Major releases (x.0) are always in it; so is the value
    // this file was written against. Anything else must be checked in
    // SDKSettings.json first — then add it here.
    const projectIos = configs
      .filter(c => !/\n\s*SUPPORTS_MACCATALYST = /.test(c))
      .map(c => setting(c, IOS))
      .find(Boolean);
    const onMac = configs.filter(c =>
      /\n\s*SUPPORTS_MACCATALYST = YES;/.test(c),
    );
    expect(onMac.length).toBeGreaterThanOrEqual(4);
    for (const c of onMac) {
      const effective = setting(c, CATALYST) ?? setting(c, IOS) ?? projectIos!;
      expect(effective === catalystMin || /^\d+\.0$/.test(effective)).toBe(true);
      expect(above(effective, catalystMin!) || effective === catalystMin).toBe(true);
    }
  });

  it('never lowers a configuration below its own iOS minimum', () => {
    for (const c of configs) {
      const cat = setting(c, CATALYST);
      if (cat) expect(above(cat, setting(c, IOS) ?? '0')).toBe(true);
    }
  });
});
