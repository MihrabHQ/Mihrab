/**
 * "Show from": the Android Live Activity out of sight until shortly before
 * the next prayer.
 *
 * A setting is only real if it survives the whole chain — the stored value,
 * the row that changes it, the payload that carries it, and the Kotlin that
 * acts on it — so each link is held here, as liveActivityCardOptions.test.ts
 * does for the card's other settings.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  LIVE_ACTIVITY_SHOW_BEFORE_OPTIONS,
  coerceLiveActivityShowBeforeMinutes,
} from '../src/settings/prePrayerReminder';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import { readWidgetContractLiveActivityAndroid } from '../src/widget/contract.generated';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8');
const KT = ['android', 'app', 'src', 'main', 'java', 'com', 'prayer_times'];

describe('the stored setting', () => {
  it('is off by default: the card all day, as it has always been', () => {
    expect(DEFAULT_SETTINGS.liveActivityShowBeforeMinutes).toBe(0);
  });

  it('keeps only the offered values; anything else is all day', () => {
    for (const v of LIVE_ACTIVITY_SHOW_BEFORE_OPTIONS) {
      expect(coerceLiveActivityShowBeforeMinutes(v)).toBe(v);
    }
    for (const v of [7, -15, NaN, '30', null, undefined, 10_000]) {
      expect(coerceLiveActivityShowBeforeMinutes(v)).toBe(0);
    }
    expect(read('src', 'settings', 'storage.ts')).toMatch(
      /merged\.liveActivityShowBeforeMinutes = coerceLiveActivityShowBeforeMinutes\(/,
    );
  });
});

describe('the row in Settings', () => {
  const card = read('src', 'screens', 'settings', 'LiveActivityCard.tsx');
  const page = read('src', 'screens', 'settings', 'pages', 'NotificationSettingsScreen.tsx');

  it('is Android only, under the Live Activity, with its picker on the page', () => {
    expect(card).toMatch(/laShowFromLabel/);
    expect(card).toMatch(/Platform\.OS === 'android' && settings\.liveActivityEnabled \?[\s\S]*laShowFromLabel/);
    expect(page).toMatch(/<LiveActivityCard onOpenShowFromPicker=\{openShowFrom\} \/>/);
    expect(page).toMatch(/options=\{LIVE_ACTIVITY_SHOW_BEFORE_OPTIONS\}/);
    expect(page).toMatch(/updateSettings\(\{ liveActivityShowBeforeMinutes: minutes \}\)/);
  });

  it('re-pushes the card the moment it changes', () => {
    expect(read('src', 'screens', 'HomeScreen.tsx')).toMatch(/settings\.liveActivityShowBeforeMinutes,/);
  });
});

describe('the payload carries it', () => {
  it('from settings into the shared payload', () => {
    expect(read('src', 'notifications', 'liveActivity.ts')).toMatch(
      /showBeforeMinutes: Math\.max\(0, Math\.round\(s\.liveActivityShowBeforeMinutes \?\? 0\)\),/,
    );
    expect(read('src', 'liveActivity', 'liveActivityV2.ts')).toMatch(
      /showBeforeMinutes: android\?\.showBeforeMinutes \?\? 0,/,
    );
  });

  it('and a payload from before it reads as all day', () => {
    expect(readWidgetContractLiveActivityAndroid({})?.showBeforeMinutes).toBe(0);
    expect(readWidgetContractLiveActivityAndroid({ showBeforeMinutes: 45 })?.showBeforeMinutes).toBe(45);
  });

  it('into what the Android notification is built from', () => {
    expect(read(...KT, 'contract', 'LiveActivityV1.kt')).toMatch(
      /out\.put\("showBeforeMinutes", android\.showBeforeMinutes\)/,
    );
  });
});

describe('the Android service acts on it', () => {
  const module = read(...KT, 'MihrabLiveActivityModule.kt');
  const service = read(...KT, 'MihrabLiveActivityService.kt');

  it('works out when the window opens, and keeps the "Now" moment after a prayer', () => {
    expect(module).toMatch(/fun windowOpensAt\(p: JSONObject\): Long/);
    expect(module).toMatch(/return next - before \* 60_000L/);
    expect(module).toMatch(/now - prev in 0 until MihrabLiveActivityService\.ARRIVED_MS\) return false/);
  });

  it('does not come up before it — on start, on each tick, nor by the direct posts', () => {
    expect(service).toMatch(/if \(MihrabLiveActivityModule\.windowHides\(JSONObject\(payload\), System\.currentTimeMillis\(\)\)\) \{\s*sleepUntilWindow\(payload, startId\)/);
    expect(service).toMatch(/windowHides\(JSONObject\(currentPayload\), System\.currentTimeMillis\(\)\)\) \{\s*sleepUntilWindow\(currentPayload, null\)/);
    expect(module.match(/!windowHides\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('sleeps on an exact alarm for the window, which onDestroy leaves armed', () => {
    expect(service).toMatch(/am\.setExactAndAllowWhileIdle\(AlarmManager\.RTC_WAKEUP, opens, pi\)/);
    expect(service).toMatch(/if \(!sleepingUntilWindow\) cancelWakeAlarm\(this\)/);
  });
});
