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
    // Only on a journey no position shows, or a phone that has known nothing for half a day.
    expect(kt).toMatch(/if \(!journey && !knowsNothing\) return\s+if \(now - p\.getLong\("activeAt", 0L\) < ACTIVE_GAP_MS\) return/);
    expect(kt).toMatch(/STALE_MS = 12 \* 3_600_000L/);
    // Location off in the phone's settings: nothing asked, nothing spent.
    expect(kt).toMatch(/if \(enabledProvider\(lm\) == null\) return\s+p\.edit\(\)\.putLong\("activeAt", now\)/);
    // A request that found nothing, on a journey: the next check may ask again.
    expect(kt).toMatch(/if \(journey\) p\.edit\(\)\.putLong\("activeAt", now - ACTIVE_GAP_MS \+ ACTIVE_RETRY_MS\)/);
  });

  it('the place the app repeats at every launch is not stamped "found now"', () => {
    // A reader who opened the app indoors after a journey — no position, the
    // old city still up — must not have the journey wiped from this side.
    const setPlace = kt.slice(kt.indexOf('fun setPlace(c: Context'), kt.indexOf('fun confirmPlace(c: Context'));
    expect(setPlace).toMatch(/== latitude &&[\s\S]{0,120}== longitude\s+\) \{\s+return/);
    expect(setPlace).not.toContain('rememberSurroundings');
    const confirm = kt.slice(kt.indexOf('fun confirmPlace(c: Context'), kt.indexOf('private fun meters'));
    expect(confirm).toContain('putLong("placeAt", now)');
    expect(confirm).toContain('rememberSurroundings(c, e, now)');
    expect(kt).toMatch(/override fun confirmPlace\(\)/);
  });

  it('a new time zone just after a move hands the move over again, to the new engine', () => {
    // On landing the position and the zone arrive together: the first
    // update ran on the old clock, or was ended by the reload.
    const fn = kt.slice(kt.indexOf('fun checkNow(c: Context)'), kt.indexOf('/** The passive provider'));
    expect(fn).toMatch(/System\.currentTimeMillis\(\) - handoffAt < REDO_MS && !movedOn\) \{[\s\S]{0,400}again = true,\s+delaySeconds = 15,/);
    // Not where the phone has moved on since.
    expect(fn).toMatch(/val movedOn = newer != null && newer\.time > handoffAt &&\s+meters\(handoffLat, handoffLng, newer\.latitude, newer\.longitude\) >= MOVE_METERS/);
    expect(kt).toMatch(/REDO_MS = 15 \* 60_000L/);
    expect(kt).toMatch(/putBoolean\("again", inputData\.getBoolean\("again", false\)\)/);
  });

  it('listens again at every check: the registration does not outlive a restart of the phone', () => {
    const check = kt.slice(kt.indexOf('fun travelCheck(c: Context)'), kt.indexOf('fun checkNow'));
    expect(check).toMatch(/try \{\s+listen\(c\)/);
  });

  it('starts the app only for twenty kilometres or more, newer than its own place', () => {
    expect(kt).toMatch(/MOVE_METERS = 20_000f/);
    expect(kt).toMatch(/if \(location\.time <= p\.getLong\("placeAt", 0L\)\) return false/);
    expect(kt).toMatch(/HANDOFF_GAP_MS = 30 \* 60_000L/);
    // The half hour holds only while the place is still that destination.
    expect(kt).toMatch(/if \(now - handoffAt < HANDOFF_GAP_MS && p\.getLong\("placeAt", 0L\) <= handoffAt\) \{/);
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
    expect(kt).toMatch(/reloadJavaScript\(context, "time zone changed"\)/);
    expect(kt).toMatch(/host\.reload\(reason\)/);
  });

  it('away from the screen: reloaded for the work done there, and again for the window when opened', () => {
    // Reloaded with its activity stopped (in the background, as on a
    // flight), the app opened onto a blank window (Android 17 emulator);
    // not reloaded, the background update wrote the alerts on the old clock.
    const fn = kt.slice(kt.indexOf('private fun reloadForNewTimeZone'), kt.indexOf('fun reloadJavaScript'));
    expect(fn).toMatch(/if \(!MainActivity\.resumed\) \{[\s\S]{0,200}MainActivity\.zoneReloadPending = true\s+\} else \{/);
    expect(fn).toMatch(/\}\s+reloadJavaScript\(context, "time zone changed"\)/);
    const main = read('android/app/src/main/java/com/prayer_times/MainActivity.kt');
    expect(main).toMatch(/override fun onResume\(\) \{[\s\S]{0,400}if \(zoneReloadPending\) \{\s+zoneReloadPending = false\s+reloadJavaScript\(this,/);
    const ios = read('ios/PrayerApp/AppDelegate.swift');
    expect(ios).toMatch(/if UIApplication\.shared\.applicationState != \.active \{\s+self\.zoneReloadPending = true\s+\}\s+RCTTriggerReloadCommandListeners\("time zone changed"\)/);
    expect(ios).toContain('name: UIApplication.didBecomeActiveNotification,');
    expect(read('android/app/src/main/AndroidManifest.xml')).toMatch(
      /android:name="\.BackgroundLocationReceiver"[\s\S]{0,200}android\.intent\.action\.TIMEZONE_CHANGED/,
    );
  });
});
