/**
 * The Quran download's foreground service and Android 15's time limit.
 *
 * Play, 2.37.0: ForegroundServiceDidNotStopInTimeException from notifee's
 * foreground service on Android 17. A dataSync service may run six hours a
 * day in the background; at the limit Android calls Service.onTimeout and
 * kills an app whose service does not stop. Notifee 9 does not override
 * it, so the app hands Android a subclass that does, through the component
 * factory. Checked on an API 37 emulator with the limit shortened
 * (`device_config put activity_manager data_sync_fgs_timeout_duration`).
 */
import { readFileSync } from 'fs';
import path from 'path';

const repo = (...parts: string[]) => readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const kt = (name: string) => repo('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', `${name}.kt`);
const manifest = repo('android', 'app', 'src', 'main', 'AndroidManifest.xml');

describe('the download service stops when Android says so', () => {
  it('the manifest names our component factory, replacing androidx’s', () => {
    expect(manifest).toMatch(/android:appComponentFactory="\.MihrabComponentFactory"/);
    expect(manifest).toMatch(/tools:replace="[^"]*android:appComponentFactory/);
  });

  it('the factory swaps in the subclass for notifee’s service, and only that', () => {
    const factory = kt('MihrabComponentFactory');
    expect(factory).toContain('"app.notifee.core.ForegroundService"');
    expect(factory).toMatch(/DownloadForegroundService\(\)/);
    expect(factory).toMatch(/super\.instantiateService\(cl, className, intent\)/);
  });

  it('the subclass stops on timeout and on a refused start, and clears notifee’s state', () => {
    const service = kt('DownloadForegroundService');
    expect(service).toMatch(/class DownloadForegroundService : ForegroundService\(\)/);
    expect(service).toMatch(/override fun onTimeout\(startId: Int, fgsType: Int\)[\s\S]*?stopNow\(\)/);
    expect(service).toMatch(/ForegroundServiceStartNotAllowedException[\s\S]*?stopNow\(\)/);
    expect(service).toMatch(/ForegroundService\.a = null/);
    expect(service).toMatch(/ForegroundService\.b = -1/);
    expect(service).toMatch(/stopSelf\(\)/);
  });

  it('notifee’s service keeps the dataSync type the download declares', () => {
    expect(manifest).toMatch(
      /android:name="app\.notifee\.core\.ForegroundService"\s+android:foregroundServiceType="dataSync"/,
    );
  });
});
