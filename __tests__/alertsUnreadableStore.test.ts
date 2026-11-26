/**
 * A scheduled alert whose kept bytes cannot be read does not end the app.
 *
 * Play Console, 2.39.0 (302), Android 16, 2026-11-25: `BadParcelableException`
 * under `Arguments.fromBundle` ← `NotifeeReactUtils.promiseResolver` ←
 * `getTriggerNotifications`, five times for one reader. The engine keeps a
 * scheduled alert as a Parcel's own bytes, which a system is not bound to
 * read back after it is updated, and a Bundle reads lazily: the failure
 * came out on a worker thread, in whoever first asked for a key. The app
 * asks for that list every time it writes the prayer alerts
 * (`cancelOwnedPrayerNotifications`), so it ended at every start and the
 * alerts were never written again.
 *
 * Held here as the source says it: the engine is Java, and this suite has
 * no Android to run it on. Not reproduced on a device by anyone.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const ENGINE = 'android/alerts/src/main/java';

describe('kept alerts the system cannot read', () => {
  it('are read all the way through where they are listed, and listed by their id alone', () => {
    const utils = read(`${ENGINE}/app/notifee/core/utility/ObjectUtils.java`);
    expect(utils).toMatch(/public static Bundle bytesToBundleOrNull\(@Nullable byte\[\] bytes\) \{[\s\S]{0,200}readThrough\(bundle\);[\s\S]{0,80}catch \(RuntimeException e\) \{\s+return null;/);
    // Nested Bundles are lazy too.
    expect(utils).toContain('if (value instanceof Bundle) {\n        readThrough((Bundle) value);');

    const manager = read(`${ENGINE}/app/notifee/core/NotificationManager.java`);
    const listing = manager.slice(manager.indexOf('static void getTriggerNotifications('), manager.indexOf('static void getTriggerNotificationIds('));
    expect(listing).not.toContain('ObjectUtils.bytesToBundle(');
    expect(listing).toContain('ObjectUtils.bytesToBundleOrNull(workDataEntity.getNotification())');
    expect(listing).toContain('ObjectUtils.bytesToBundleOrNull(workDataEntity.getTrigger())');
    expect(listing).toContain('notification.putString("id", workDataEntity.getId());');
  });

  it('are written again or cancelled by the app, which goes by the id', () => {
    const js = read('src/notifications/prayerNotifications.ts');
    const fn = js.slice(js.indexOf('async function cancelOwnedPrayerNotifications('), js.indexOf('/** Play a short preview'));
    expect(fn).toContain('const id = t.notification?.id;');
    expect(fn).toContain('if (keep.has(id)) continue;');
    expect(fn).toContain('await notifee.cancelTriggerNotification(id)');
    // And a list that cannot be had at all is a rejected promise it already answers.
    expect(fn).toContain('await notifee.cancelTriggerNotifications().catch(() => {});');
  });

  it('reject the promise, where a Bundle still cannot be made a map', () => {
    const bridge = read(`${ENGINE}/io/invertase/notifee/NotifeeReactUtils.java`);
    expect(bridge).toMatch(/writableArray\.pushMap\(Arguments\.fromBundle\(bundle\)\);\s+\}\s+\} catch \(RuntimeException unreadable\) \{\s+promise\.reject\(unreadable\);\s+return;/);
  });

  it('do not stop the other alarms being set again after a restart', () => {
    const alarms = read(`${ENGINE}/app/notifee/core/NotifeeAlarmManager.java`);
    expect(alarms).toMatch(/try \{\s+rescheduleNotification\(workDataEntity\);\s+\} catch \(RuntimeException e\) \{/);
  });
});
