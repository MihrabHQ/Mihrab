/**
 * The blur behind GlassSurface is the app's own native view on iOS
 * (ios/PrayerApp/GlassBlur.m), not @react-native-community/blur, which is
 * no longer maintained. These hold the pieces together: the JS asks for the
 * view by the name the manager exports, with the props it declares; the
 * file is compiled into the app; and the library is gone, with the Android
 * autolinking exclusion that only existed for it.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');

describe('GlassBlur', () => {
  const native = read('ios/PrayerApp/GlassBlur.m');
  const surface = read('src/components/GlassSurface.tsx');

  it('is asked for by the name the manager exports, on iOS only', () => {
    expect(native).toMatch(/RCT_EXPORT_MODULE\(GlassBlur\)/);
    expect(surface).toMatch(/Platform\.OS === 'ios'\s*\? require\('react-native'\)\.requireNativeComponent\('GlassBlur'\)\s*: null/);
  });

  it('declares every prop the surface passes', () => {
    const declared = [...native.matchAll(/RCT_EXPORT_VIEW_PROPERTY\((\w+),/g)].map(m => m[1]).sort();
    expect(declared).toEqual(['blurAmount', 'blurType', 'reducedTransparencyFallbackColor']);
    const use = surface.slice(surface.indexOf('<BlurView'), surface.indexOf('/>', surface.indexOf('<BlurView')));
    for (const prop of declared) expect(use).toContain(`${prop}=`);
  });

  it('knows the three styles the surface asks for', () => {
    for (const style of ['xlight', 'light', 'dark']) expect(surface).toContain(`'${style}'`);
    expect(native).toContain('@"xlight"');
    expect(native).toContain('@"light"');
    expect(native).toContain('UIBlurEffectStyleDark');
  });

  it('survives a UIKit without the settings it reaches into', () => {
    expect(native).toMatch(/instancesRespondToSelector:@selector\(effectSettings\)/);
    expect(native).toMatch(/@try[\s\S]*?setValue:blurAmount forKey:@"blurRadius"[\s\S]*?@catch/);
  });

  it('is compiled into the app', () => {
    const project = read('ios/PrayerApp.xcodeproj/project.pbxproj');
    expect(project).toMatch(/GlassBlur\.m in Sources \*\/ = \{isa = PBXBuildFile/);
    expect(project.match(/GlassBlur\.m in Sources \*\/,/g)).toHaveLength(1);
  });

  it('replaced the library, and the exclusion that existed for it', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('@react-native-community/blur');
    expect(existsSync(path.join(ROOT, 'react-native.config.js'))).toBe(false);
  });
});
