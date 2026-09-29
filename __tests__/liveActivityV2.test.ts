/**
 * One Live Activity payload for both platforms (docs/rewrite-plan.md, 1.5).
 *
 * The app builds the contract's `LiveActivity` once; each native turns it
 * into its own content for the minute it draws at. These pin the reference
 * adapters the natives are held to (contract-tests), and that the app hands
 * each native module the one payload.
 */
import { Platform } from 'react-native';

jest.mock('../src/native/PrayerLiveActivity', () => ({
  getPrayerLiveActivityModule: jest.fn(),
}));
jest.mock('../src/native/MihrabLiveActivity', () => ({
  getMihrabLiveActivityModule: jest.fn(() => null),
}));

import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';
import {
  buildLiveActivityV2,
  deviceEpochOf,
  liveActivityAndroidPayload,
  liveActivityIosContent,
} from '../src/liveActivity/liveActivityV2';
import { readWidgetContractLiveActivity } from '../src/widget/contract.generated';
import { syncLiveActivity } from '../src/liveActivity/syncLiveActivity';
import { getPrayerLiveActivityModule } from '../src/native/PrayerLiveActivity';
import { getMihrabLiveActivityModule } from '../src/native/MihrabLiveActivity';
import type { TimingsMap } from '../src/types/prayer';

const TODAY: TimingsMap = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};
const TOMORROW: TimingsMap = { ...TODAY, Fajr: '05:02', Isha: '19:58' };

const at = (d: number, h: number, m: number) => new Date(2026, 5, d, h, m, 0, 0);
const nowOf = (date: Date) => ({
  todayKey: `2026-06-${String(date.getDate()).padStart(2, '0')}`,
  nowMinutes: date.getHours() * 60 + date.getMinutes(),
});

function build(now: Date) {
  const payload = buildWidgetPayload(TODAY, TOMORROW, now, 'Stockholm', undefined, undefined, [
    TODAY,
    TOMORROW,
  ]);
  return buildLiveActivityV2({
    payload,
    clock: { hour12: false },
    now,
    language: 'en',
    nameOf: key => `Full ${key}`,
    hijriOf: dateKey => `hijri of ${dateKey}`,
    modeOf: key => (key === 'Fajr' ? 'adhan' : key === 'Sunrise' ? 'silent' : 'notification'),
    appearance: { accentHex: '#2563eb', tinted: true, design: 'markers' },
    android: { alertActionEnabled: true, adhanChannelId: 'adhan-channel' },
    words: { nowWord: 'Now', atPrayerBody: 'Prayer time' },
  });
}

describe('the shared payload', () => {
  it('is the widget days with full names, one mode per key, a Hijri line per day', () => {
    const la = build(at(14, 14, 0));
    expect(la.schemaVersion).toBe(2);
    expect(la.days[0].dateKey).toBe('2026-06-14');
    expect(la.days[0].prayers.map(r => r.name)).toEqual([
      'Full Fajr',
      'Full Dhuhr',
      'Full Asr',
      'Full Maghrib',
      'Full Isha',
    ]);
    expect(la.days[0].prayers[0].minutes).toBe(300);
    expect(la.alertModes).toContainEqual({ key: 'Fajr', mode: 'adhan' });
    expect(la.alertModes).toContainEqual({ key: 'Sunrise', mode: 'silent' });
    expect(new Set(la.alertModes!.map(a => a.key)).size).toBe(la.alertModes!.length);
    expect(la.hijri![0]).toEqual({ dateKey: '2026-06-14', text: 'hijri of 2026-06-14' });
    // It reads back through the contract's own reader: its days unchanged,
    // and what the builder left out filled with the documented defaults.
    const read = readWidgetContractLiveActivity(JSON.parse(JSON.stringify(la)))!;
    expect(read.days.map(d => d.prayers)).toEqual(
      JSON.parse(JSON.stringify(la.days.map(d => d.prayers))),
    );
    expect(read.android?.aodActionEnabled).toBe(true);
    expect(read.words?.alertOnceWord).toBe('');
  });
});

describe('Android, at a moment', () => {
  it('counts down to the next prayer today, with today\'s rows', () => {
    const now = at(14, 14, 0);
    const p = liveActivityAndroidPayload(build(now), nowOf(now), deviceEpochOf)!;
    expect(p.nextKey).toBe('Asr');
    expect(p.nextLabel).toBe('Full Asr');
    expect(p.nextTime).toBe('15:00');
    expect(p.nextEpochMs).toBe(at(14, 15, 0).getTime());
    expect(p.prevEpochMs).toBe(at(14, 12, 0).getTime());
    expect(p.title).toBe('Full Asr · 15:00');
    expect(p.rows.map(r => r.key)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    expect(p.rows[0].mode).toBe('adhan');
    expect(p.sunriseRow?.mode).toBe('silent');
    expect(p.hijriLabel).toBe('hijri of 2026-06-14');
    expect(p.days.map(d => d.dateKey)).toEqual(['2026-06-14', '2026-06-15']);
    expect(p.days[1].hijriLabel).toBe('hijri of 2026-06-15');
    expect(p.design).toBe('markers');
    expect(p.tinted).toBe(true);
    expect(p.alertActionEnabled).toBe(true);
    expect(p.adhanChannelId).toBe('adhan-channel');
    expect(p.defaultChannelId).toBe('prayer-times-default');
    expect(p.nowWord).toBe('Now');
  });

  it('after ʿIshāʾ, points at tomorrow\'s Fajr, draws tomorrow, heads it with tomorrow\'s Hijri date', () => {
    const now = at(14, 21, 0);
    const p = liveActivityAndroidPayload(build(now), nowOf(now), deviceEpochOf)!;
    expect(p.nextKey).toBe('Fajr');
    expect(p.nextTime).toBe('05:02');
    expect(p.nextEpochMs).toBe(at(15, 5, 2).getTime());
    expect(p.prevEpochMs).toBe(at(14, 20, 0).getTime());
    expect(p.rows.find(r => r.key === 'Isha')?.time).toBe('19:58');
    expect(p.hijriLabel).toBe('hijri of 2026-06-15');
  });

  it('is null with nothing ahead, so the app posts its plain notification', () => {
    const now = at(14, 21, 0);
    const la = build(now);
    const onlyToday = { ...la, days: la.days.slice(0, 1) };
    expect(liveActivityAndroidPayload(onlyToday, nowOf(now), deviceEpochOf)).toBeNull();
  });
});

describe('iOS, at a moment', () => {
  it('writes seconds, every row with its display, and the accent', () => {
    const now = at(14, 14, 0);
    const c = liveActivityIosContent(build(now), nowOf(now), deviceEpochOf)!;
    expect(c.nextKey).toBe('Asr');
    expect(c.nextEpochSeconds).toBe(at(14, 15, 0).getTime() / 1000);
    expect(c.prevEpochSeconds).toBe(at(14, 12, 0).getTime() / 1000);
    expect(c.rows.every(r => r.display.length > 0)).toBe(true);
    expect(c.accentHex).toBe('#2563eb');
    expect(c.tinted).toBe(true);
  });

  it("before the day's first time, starts the bar at yesterday's", () => {
    // Only Fajr on the day, asked at 03:00: nothing has passed today, so
    // the prayer last passed is yesterday's Fajr, taken from today's.
    const now = at(14, 3, 0);
    const la = build(now);
    const noIsha = {
      ...la,
      days: la.days.map(d => ({
        ...d,
        prayers: d.prayers.filter(r => r.key === 'Fajr'),
        sunrise: undefined,
        extras: [],
      })),
    };
    const c = liveActivityIosContent(noIsha, nowOf(now), deviceEpochOf)!;
    expect(c.nextKey).toBe('Fajr');
    // Fajr 05:00 today is ahead; "yesterday's" Fajr (today's minus a day)
    // is the prayer last passed.
    expect(c.prevEpochSeconds).toBe(at(13, 5, 0).getTime() / 1000);
  });
});

describe('the app hands each native the one payload', () => {
  const ORIGINAL_OS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: ORIGINAL_OS });
    jest.useRealTimers();
  });

  it('iOS: startV2 with the LiveActivity JSON', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    const startV2 = jest.fn(() => Promise.resolve());
    const start = jest.fn(() => Promise.resolve());
    (getPrayerLiveActivityModule as jest.Mock).mockReturnValue({
      start,
      startV2,
      stop: jest.fn(),
    });
    jest.useFakeTimers();
    const done = syncLiveActivity({
      options: { enabled: true },
      today: TODAY,
      tomorrow: TOMORROW,
      now: at(14, 14, 0),
      accentHex: '#2563eb',
    });
    jest.advanceTimersByTime(900);
    await done;
    await Promise.resolve();
    jest.useRealTimers();
    await new Promise(r => setTimeout(r, 0));
    expect(start).not.toHaveBeenCalled();
    expect(startV2).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((startV2.mock.calls[0] as unknown as [string])[0]);
    expect(sent.schemaVersion).toBe(2);
    expect(sent.days[0].dateKey).toBe('2026-06-14');
    expect(sent.appearance.accentHex).toBe('#2563eb');
  });

  it('Android: displayV2 with the LiveActivity JSON', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const displayV2 = jest.fn(() => Promise.resolve());
    const display = jest.fn(() => Promise.resolve());
    (getMihrabLiveActivityModule as jest.Mock).mockReturnValue({
      display,
      displayV2,
      cancel: jest.fn(),
    });
    jest.useFakeTimers({ now: at(14, 14, 0) });
    const done = syncLiveActivity({
      options: { enabled: true },
      today: TODAY,
      tomorrow: TOMORROW,
      now: at(14, 14, 0),
    });
    jest.advanceTimersByTime(900);
    jest.useRealTimers();
    await done;
    await new Promise(r => setTimeout(r, 0));
    expect(display).not.toHaveBeenCalled();
    expect(displayV2).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((displayV2.mock.calls[0] as unknown as [string])[0]);
    expect(sent.days[0].prayers[0].key).toBe('Fajr');
    expect(sent.words.nowWord).toBeTruthy();
  });
});
