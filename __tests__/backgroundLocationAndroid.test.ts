/**
 * The Android side of the optional background location
 * (android/…/BackgroundLocation.kt), held by its text: what makes it cheap,
 * and that only the builds meant to offer it declare the permission.
 */
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(root, ...p), 'utf8');
const kt = read('android/app/src/main/java/com/prayer_times/BackgroundLocation.kt');

describe('background location on Android', () => {
  it('listens to the passive provider — positions the phone already has', () => {
    expect(kt).toMatch(/requestLocationUpdates\(\s*LocationManager\.PASSIVE_PROVIDER,/);
    // The only other registration for updates is the one-off request before Android 11.
    expect(kt.match(/requestLocationUpdates\(/g)).toHaveLength(1);
  });

  it('asks for a position itself at most once in six hours, for thirty seconds', () => {
    expect(kt).toMatch(/ACTIVE_GAP_MS = 6 \* 3_600_000L/);
    expect(kt).toMatch(/ACTIVE_WAIT_MS = 30_000L/);
    expect(kt).toMatch(/if \(!journey\) return\s+if \(now - p\.getLong\("activeAt", 0L\) < ACTIVE_GAP_MS\) return/);
  });

  it('starts the app only for twenty kilometres or more, newer than its own place', () => {
    expect(kt).toMatch(/MOVE_METERS = 20_000f/);
    expect(kt).toMatch(/if \(location\.time <= p\.getLong\("placeAt", 0L\)\) return false/);
    expect(kt).toMatch(/HANDOFF_GAP_MS = 30 \* 60_000L/);
  });

  it('does nothing unless the setting is on and Android allows it', () => {
    expect(kt).toMatch(/fun consider\(c: Context, location: Location\): Boolean \{\s+if \(!enabled\(c\)\) return false/);
    expect(kt).toMatch(/fun register\(c: Context\) \{\s+if \(!enabled\(c\) \|\| !permitted\(c\)\) \{/);
  });

  it('the permission is declared by each store build, not in the shared manifest', () => {
    const perm = 'android.permission.ACCESS_BACKGROUND_LOCATION';
    expect(read('android/app/src/main/AndroidManifest.xml')).not.toContain(perm);
    for (const flavor of ['github', 'fdroid', 'play']) {
      expect(read(`android/app/src/${flavor}/AndroidManifest.xml`)).toContain(perm);
    }
    // Play rejects an upload with this permission until its declaration
    // is filed in the Play Console: the manifest says so where it is read.
    expect(read('android/app/src/play/AndroidManifest.xml')).toMatch(/declaration\s+must be filed/);
  });

  it('the task name is the one index.js registers', () => {
    expect(kt).toContain('HeadlessJsTaskConfig("LocationMoved"');
    expect(read('index.js')).toContain("registerHeadlessTask('LocationMoved'");
  });

  it('a change of time zone reloads a running app, whether or not the setting is on', () => {
    // The JavaScript engine keeps the zone's offset it started with: left
    // in memory across a change, the app read every time on the old clock
    // (2.38.3, an Android 17 emulator: Berlin's Fajr an hour early).
    expect(kt).toMatch(/Intent\.ACTION_TIMEZONE_CHANGED -> \{\s+reloadForNewTimeZone\(context\)\s+BackgroundLocation\.checkNow\(context\)/);
    expect(kt).toMatch(/if \(host\.currentReactContext == null\) return/);
    expect(kt).toMatch(/host\.reload\("time zone changed"\)/);
    expect(read('android/app/src/main/AndroidManifest.xml')).toMatch(
      /android:name="\.BackgroundLocationReceiver"[\s\S]{0,200}android\.intent\.action\.TIMEZONE_CHANGED/,
    );
  });
});
