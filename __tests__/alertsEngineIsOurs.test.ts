/**
 * The alerts' engine is in our tree — and has the names it always had.
 *
 * Notifee (unmaintained) is no longer an npm dependency: its JavaScript is
 * src/native/notifee/, its Android core and bridge android/alerts/, its iOS
 * ones ios/Alerts/. It came over unchanged, and one thing about it must
 * stay unchanged for good: the NAMES. An installed app has alarms pending
 * that point at `app.notifee.core.NotificationAlarmReceiver`, WorkManager
 * rows that name `app.notifee.core.Worker`, and a database of scheduled
 * triggers. An update that renames one of them finds none of it — and a
 * scheduled adhan does not ring. (Building this engine from a DIFFERENT
 * source than the bridge it was paired with crashed 2.7.13 at launch;
 * here both halves are the same release, compiled together.)
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p: string[]) => fs.existsSync(path.join(ROOT, ...p));

describe('the npm package is gone', () => {
  it('is not a dependency, and is not in the lockfile', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['@notifee/react-native']).toBeUndefined();
    expect(read('package-lock.json')).not.toContain('@notifee/react-native');
  });

  it('nothing on Android asks for the prebuilt core', () => {
    const gradle = read('android', 'app', 'build.gradle');
    expect(gradle).not.toMatch(/group:\s*"app\.notifee"/);
    expect(gradle).toMatch(/implementation project\(':alerts'\)/);
    expect(read('android', 'settings.gradle')).toMatch(/include ':alerts'/);
  });
});

describe('Android: the names an installed app holds', () => {
  const manifest = read('android', 'alerts', 'src', 'main', 'AndroidManifest.xml');
  const java = (...p: string[]) => path.join('android', 'alerts', 'src', 'main', 'java', ...p);

  it.each([
    'app.notifee.core.NotificationAlarmReceiver', // every exact alarm's PendingIntent
    'app.notifee.core.RebootBroadcastReceiver', // re-arms them after a restart
    'app.notifee.core.AlarmPermissionBroadcastReceiver',
    'app.notifee.core.BlockStateBroadcastReceiver',
    'app.notifee.core.ReceiverService', // a press on a notification or its button
    'app.notifee.core.NotificationReceiverActivity',
    'app.notifee.core.ForegroundService', // the Qur'an download (MihrabComponentFactory)
    'io.invertase.notifee.NotifeeInitProvider',
  ])('%s is declared, under that name, and is there', name => {
    expect(manifest).toContain(`android:name="${name}"`);
    expect(exists(java(...name.split('.')) + '.java')).toBe(true);
  });

  it('the manifest names every component in full (the module has one namespace, the code two packages)', () => {
    expect(manifest).not.toMatch(/android:name="\./);
  });

  it('the worker WorkManager creates by name is where it was', () => {
    expect(exists(java('app', 'notifee', 'core', 'Worker.java'))).toBe(true);
    expect(read(java('app', 'notifee', 'core', 'Worker.java'))).toMatch(/^package app\.notifee\.core;/m);
  });

  it('the database of scheduled triggers keeps its name and its schema history', () => {
    const db = read(java('app', 'notifee', 'core', 'database', 'NotifeeCoreDatabase.java'));
    expect(db).toContain('"notifee_core_database"');
    for (const v of ['1.json', '2.json']) {
      expect(exists('android', 'alerts', 'schemas', 'app.notifee.core.database.NotifeeCoreDatabase', v)).toBe(true);
    }
  });

  it('R8 is told to leave all of it alone', () => {
    const rules = read('android', 'alerts', 'consumer-rules.pro');
    expect(rules).toMatch(/^-keep class app\.notifee\.core\.\*\* \{ \*; \}$/m);
    expect(rules).toMatch(/^-keep class io\.invertase\.notifee\.\*\* \{ \*; \}$/m);
    expect(read('android', 'alerts', 'build.gradle')).toMatch(/consumerProguardFiles 'consumer-rules\.pro'/);
  });

  it('the bridge is registered by hand (nothing autolinks it now)', () => {
    expect(read('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', 'MainApplication.kt')).toMatch(
      /add\(io\.invertase\.notifee\.NotifeePackage\(\)\)/,
    );
    expect(read(java('io', 'invertase', 'notifee', 'NotifeeApiModule.java'))).toMatch(/"NotifeeApiModule"/);
  });
});

describe('iOS and Mac', () => {
  it('the pod is ours, from our tree', () => {
    expect(read('ios', 'Podfile')).toMatch(/pod 'MihrabAlerts', :path => '\.\/Alerts'/);
    const spec = read('ios', 'Alerts', 'MihrabAlerts.podspec');
    expect(spec).toMatch(/'RNNotifee\/\*\.\{h,m\}', 'NotifeeCore\/\*\.\{h,m\}'/);
    const lock = read('ios', 'Podfile.lock');
    expect(lock).not.toContain('node_modules/@notifee');
    expect(lock).toContain('MihrabAlerts');
  });

  it('the module has the name JavaScript asks for', () => {
    expect(exists('ios', 'Alerts', 'NotifeeCore', 'NotifeeCore.m')).toBe(true);
    // RCT_EXPORT_MODULE() with no argument: the class name is the module name.
    expect(read('ios', 'Alerts', 'RNNotifee', 'NotifeeApiModule.m')).toMatch(/@implementation NotifeeApiModule\b/);
    expect(read('src', 'native', 'notifee', 'index.ts')).toMatch(/nativeModuleName: 'NotifeeApiModule'/);
  });
});

describe('the licence came with it', () => {
  it.each([
    ['android', 'alerts', 'LICENSE'],
    ['ios', 'Alerts', 'LICENSE'],
    ['src', 'native', 'notifee', 'LICENSE'],
  ])('%s/%s/%s', (...p) => {
    expect(read(...p)).toMatch(/Apache License\s+Version 2\.0/);
  });
});
