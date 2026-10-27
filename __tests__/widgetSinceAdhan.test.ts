/**
 * Issue #111 — the prayer-times widgets count up from a prayer that has just
 * come in ("12:34 since Dhuhr") for a while, then go back to counting down.
 *
 * The drawing is native (PrayerGlanceWidget.kt, PrayerWidgetExtension.swift)
 * and the window's rule is held across the three platforms by the contract
 * fixtures (`since`). These pin the app's side: the setting, off by
 * default, and the payload carrying it to the widgets.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { DEFAULT_SETTINGS, WIDGET_SINCE_ADHAN_CHOICES } from '../src/settings/types';
import { coerceWidgetSinceAdhan } from '../src/settings/storage';
import {
  sinceAdhanEnd,
  widgetPayloadV1FromV2,
  widgetPayloadV2FromV1,
} from '../src/widget/widgetPayloadV2';
import type { WidgetPrayerPayload } from '../src/widget/buildWidgetPayload';
import {
  setWidgetSinceAdhanMinutes,
  widgetSinceAdhanMinutes,
} from '../src/widget/sinceAdhanSetting';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const V1: WidgetPrayerPayload = {
  dayLabel: 'Tue, Oct 27',
  rows: [
    { key: 'Fajr', time: '05:40' },
    { key: 'Dhuhr', time: '11:50' },
    { key: 'Asr', time: '13:55' },
    { key: 'Maghrib', time: '16:05' },
    { key: 'Isha', time: '17:55' },
  ] as WidgetPrayerPayload['rows'],
  nextKey: 'Asr',
  days: [],
};
const NOW = new Date(2026, 9, 27, 12, 0);
const CLOCK = { hour12: false };

describe('the setting', () => {
  it('is off unless chosen, so no one’s widget starts counting the other way', () => {
    expect(DEFAULT_SETTINGS.widgetSinceAdhanMinutes).toBe(0);
    expect([...WIDGET_SINCE_ADHAN_CHOICES]).toEqual([0, 10, 20, 30]);
  });

  it('keeps only a choice it offers', () => {
    expect(coerceWidgetSinceAdhan(20)).toBe(20);
    expect(coerceWidgetSinceAdhan(45)).toBe(0);
    expect(coerceWidgetSinceAdhan('20')).toBe(0);
    expect(coerceWidgetSinceAdhan(undefined)).toBe(0);
  });

  it('is on the Widgets page on both platforms', () => {
    const subpages = read('src/screens/settings/subpages.tsx');
    const widgets = subpages.slice(subpages.indexOf("route: 'SettingsWidgets'"));
    expect(widgets.slice(0, widgets.indexOf('},'))).not.toMatch(/platforms:/);
    expect(read('src/screens/settings/pages/WidgetsSettingsScreen.tsx')).toMatch(/<WidgetSinceAdhanCard \/>/);
  });
});

describe('the payload', () => {
  it('carries the window only when it is on', () => {
    const off = widgetPayloadV2FromV1(V1, { clock: CLOCK, now: NOW });
    expect('sinceAdhanMinutes' in off).toBe(false);
    const on = widgetPayloadV2FromV1(V1, { clock: CLOCK, now: NOW, sinceAdhanMinutes: 20 });
    expect(on.sinceAdhanMinutes).toBe(20);
    // …and the adapter the widgets draw through hands it on.
    expect(widgetPayloadV1FromV2(on, { todayKey: '2026-10-27', nowMinutes: 720 })?.sinceAdhanMinutes).toBe(20);
  });

  it('is built with what Settings chose', () => {
    setWidgetSinceAdhanMinutes(30);
    expect(widgetSinceAdhanMinutes()).toBe(30);
    setWidgetSinceAdhanMinutes(0);
    expect(read('src/widget/syncPrayerWidget.ts')).toMatch(/sinceAdhanMinutes: widgetSinceAdhanMinutes\(\)/);
    // Headless too: the stored setting, not the provider's mirror alone.
    expect(read('src/widget/republishWidgetPayload.ts')).toMatch(
      /setWidgetSinceAdhanMinutes\(settings\.widgetSinceAdhanMinutes\)/,
    );
  });
});

describe('the window', () => {
  it('runs its length, or to halfway to what is next if that is sooner', () => {
    expect(sinceAdhanEnd(710, 835, 20)).toBe(730); // Dhuhr → Asr: the full 20
    expect(sinceAdhanEnd(965, 990, 30)).toBe(977); // a 25-minute evening: halfway
    expect(sinceAdhanEnd(965, 990, 0)).toBeNull(); // off
    expect(sinceAdhanEnd(965, null, 20)).toBeNull(); // nothing follows
  });

  it('starts only from the five, never Sunrise or a night mark — on every platform', () => {
    for (const file of [
      'src/widget/widgetPayloadV2.ts',
      'android/app/src/main/java/com/prayer_times/contract/WidgetPayloadV1.kt',
      'ios/Contract/WidgetPayloadV1.swift',
    ]) {
      const src = read(file);
      expect(src).toMatch(/"?'?Fajr'?"?, "?'?Dhuhr'?"?, "?'?Asr'?"?, "?'?Maghrib'?"?, "?'?Isha'?"?/);
      expect(src).not.toMatch(/SINCE_ADHAN_KEYS[^\n]*Sunrise|sinceAdhanKeys[^\n]*Sunrise/);
    }
  });

  it('wakes the Android card where each count-up ends, so it does not count on', () => {
    expect(read('android/app/src/main/java/com/prayer_times/PrayerWidgetProvider.kt')).toMatch(
      /WidgetInstants\.sinceEnds\(/,
    );
    expect(read('ios/PrayerWidgetExtension/PrayerWidgetExtension.swift')).toMatch(
      /for s in spans where s\.end > now \{ boundarySet\.insert\(s\.end\) \}/,
    );
  });
});
