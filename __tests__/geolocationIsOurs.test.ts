/**
 * The location code is in the app's own tree (it was a patched
 * @react-native-community/geolocation). These hold the join between its
 * three parts, and the properties the patch existed for.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const ANDROID = 'android/app/src/main/java/com/prayer_times/geolocation';

describe('the geolocation module', () => {
  const js = read('src/native/Geolocation.ts');
  const java = read(`${ANDROID}/GeolocationModule.java`);
  const mm = read('ios/PrayerApp/MihrabGeolocation.mm');

  it('has one name on all three sides', () => {
    expect(js).toContain('NativeModules.MihrabGeolocation');
    expect(java).toContain('public static final String NAME = "MihrabGeolocation";');
    expect(mm).toMatch(/@implementation MihrabGeolocation\b[\s\S]*?RCT_EXPORT_MODULE\(\)/);
  });

  it('exports to JavaScript the two calls the app makes, on both platforms', () => {
    for (const method of ['setConfiguration', 'getCurrentPosition']) {
      expect(java).toMatch(new RegExp(`@ReactMethod\\s+public void ${method}\\(`));
      expect(mm).toMatch(new RegExp(`RCT_REMAP_METHOD\\(${method},`));
      expect(js).toContain(`native().${method}(`);
    }
  });

  it('is registered on Android and compiled on iOS', () => {
    expect(read('android/app/src/main/java/com/prayer_times/MainApplication.kt')).toContain(
      'add(com.prayer_times.geolocation.GeolocationPackage())',
    );
    expect(read('ios/PrayerApp.xcodeproj/project.pbxproj').match(/MihrabGeolocation\.mm in Sources \*\/,/g)).toHaveLength(1);
  });

  it('does not lean on the library’s generated spec', () => {
    expect(mm).not.toContain('RCT_NEW_ARCH_ENABLED');
    expect(mm).not.toContain('RNCGeolocation');
  });

  it('uses the platform’s LocationManager only: no Google Play services', () => {
    for (const f of readdirSync(path.join(ROOT, ANDROID))) {
      const src = read(`${ANDROID}/${f}`);
      expect([f, /com\.google\.android\.gms|FusedLocationProviderClient|PlayServices/.test(src)]).toEqual([f, false]);
    }
    expect(java).toContain('new AndroidLocationManager(reactContext)');
  });

  it('sends native what the library’s JavaScript sent', () => {
    expect(js).toContain('enableBackgroundLocationUpdates: config.enableBackgroundLocationUpdates ?? true');
    expect(js).toContain("config.locationProvider === 'auto' ? undefined : config.locationProvider");
  });

  it('replaced the library and its patch', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('@react-native-community/geolocation');
    expect(existsSync(path.join(ROOT, 'patches/@react-native-community+geolocation+3.4.0.patch'))).toBe(false);
    expect(read('desktop/webpack.config.js')).toMatch(/NormalModuleReplacementPlugin\(\/\\\/native\\\/Geolocation\(\\\.ts\)\?\$\/, shim\('geolocation\.js'\)\)/);
  });
});
