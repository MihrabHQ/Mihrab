/**
 * A computed day for a place in another zone, on the place's clock.
 *
 * The on-device sources wrote a saved place's day on the phone's clock: on a
 * phone on UTC, Stockholm's midsummer Fajr (01:54 there) was 23:54 — the
 * evening before — and was read on the wrong day; namazvakti.com's Istanbul,
 * printed on Istanbul's clock, was read on the phone's, three hours out. Each
 * now carries the place's clock (`placeZone.ts`): AlAdhan's zone for the
 * coordinates where it has named one, the country's where the app knows its
 * borders, the longitude's hour otherwise — and the phone's own wherever the
 * place's clock is the phone's, so the place the phone is in reads as ever.
 */
jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn((url: string) =>
    require('./fixtures/providerMatrixHarness').fakeFetch(url),
  ),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { clockFor, formatInZone } from '../src/providers/locationClock';
import { _resetNamazvaktiForTests } from '../src/providers/namazvakti';
import {
  _resetPlaceZonesForTests,
  longitudeZone,
  notePlaceZone,
  placeZoneFor,
} from '../src/providers/placeZone';
import type { PrayerTimesResult } from '../src/providers/types';
import { DEVICE_CLOCK, eventAt } from '../src/utils/prayerTimes';
import {
  civilInZone,
  fixedOffsetMinutes,
  zoneOffsetMinutes,
} from '../src/utils/zoneClock';
import { net } from './fixtures/providerMatrixHarness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const realProcess = require('vm').runInThisContext('process') as NodeJS.Process;
const ZONE_BEFORE = realProcess.env.TZ;
function setZone(zone: string): void {
  realProcess.env.TZ = zone;
}
afterAll(() => {
  if (ZONE_BEFORE === undefined) delete realProcess.env.TZ;
  else realProcess.env.TZ = ZONE_BEFORE;
});

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(async () => {
  await AsyncStorage.clear();
  net.mode = 'online';
  net.calls.length = 0;
  _resetPlaceZonesForTests();
  _resetNamazvaktiForTests();
});

const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
const ISTANBUL = { latitude: 41.01, longitude: 28.98 };
const NEW_YORK = { latitude: 40.71, longitude: -74.01 };

/** A row's instant as the place's own wall clock reads it: date and time. */
function onPlaceClock(
  r: PrayerTimesResult,
  key: string,
  day: Date,
  zone: string,
) {
  const at = eventAt(key, r.timings, day, r.clock);
  const c = civilInZone(at, zone, true)!;
  return {
    date: `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(
      2,
      '0',
    )}`,
    time: `${String(c.h).padStart(2, '0')}:${String(c.min).padStart(2, '0')}`,
    at,
  };
}

describe('the longitude’s hour, by arithmetic', () => {
  it('names the fixed-offset zone with POSIX’s inverted sign', () => {
    expect(longitudeZone(18.07)).toBe('Etc/GMT-1');
    expect(longitudeZone(-74.01)).toBe('Etc/GMT+5');
    expect(longitudeZone(3)).toBe('Etc/GMT');
    expect(longitudeZone(172.5)).toBe('Etc/GMT-12');
    expect(fixedOffsetMinutes('Etc/GMT-3')).toBe(180);
    expect(fixedOffsetMinutes('Etc/GMT+5')).toBe(-300);
    expect(fixedOffsetMinutes('Europe/Istanbul')).toBeNull();
  });

  it('writes and reads such a zone without Intl', () => {
    const at = new Date('2026-06-20T23:54:00Z');
    expect(formatInZone(at, 'Etc/GMT-2')).toBe('01:54');
    expect(civilInZone(at, 'Etc/GMT-2', true)).toEqual({
      y: 2026,
      m: 6,
      d: 21,
      h: 1,
      min: 54,
    });
    expect(zoneOffsetMinutes('Etc/GMT+5', at)).toBe(-300);
  });
});

describe('Stockholm on a phone on UTC, at midsummer', () => {
  const day = () => new Date(2026, 5, 21);

  it.each([
    ['local_adhan', 24],
    ['diyanet', 13],
  ] as const)(
    '%s: Fajr at 01:54-ish on Stockholm’s 21 June, not the evening before',
    async (provider, method) => {
      setZone('UTC');
      const r = await fetchPrayerTimesUnified({
        provider,
        ...STOCKHOLM,
        date: day(),
        calculationMethod: method,
        school: 0,
      });
      expect(r.clock).toBe('Europe/Stockholm');
      const fajr = onPlaceClock(r, 'Fajr', day(), 'Europe/Stockholm');
      // On Stockholm's 21 June, at the printed minute.
      expect(fajr.date).toBe('2026-06-21');
      expect(fajr.time).toBe(r.timings.Fajr);
      expect(r.timings.Fajr < '02:30').toBe(true);
      for (const key of ['Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
        expect(onPlaceClock(r, key, day(), 'Europe/Stockholm').time).toBe(
          r.timings[key],
        );
      }
    },
  );

  it('on a phone in São Paulo, Fajr is the phone’s evening before — and read as Stockholm’s 21st', async () => {
    setZone('America/Sao_Paulo');
    const r = await fetchPrayerTimesUnified({
      provider: 'local_adhan',
      ...STOCKHOLM,
      date: day(),
      calculationMethod: 24,
      school: 0,
    });
    expect(r.clock).toBe('Europe/Stockholm');
    const fajr = onPlaceClock(r, 'Fajr', day(), 'Europe/Stockholm');
    expect(fajr.date).toBe('2026-06-21');
    // 21:xx on the phone's 20 June: written on the phone's clock it was
    // "21:xx" on the 21st's card, a day late.
    expect(fajr.at.getDate()).toBe(20);
    expect(fajr.at.getHours()).toBeGreaterThanOrEqual(20);
  });

  it('the same instants as on a phone in Stockholm', async () => {
    setZone('Europe/Stockholm');
    const home = await fetchPrayerTimesUnified({
      provider: 'local_adhan',
      ...STOCKHOLM,
      date: day(),
      calculationMethod: 24,
      school: 0,
    });
    expect(home.clock).toBe(DEVICE_CLOCK);
    const homeFajr = eventAt('Fajr', home.timings, day(), home.clock).getTime();
    setZone('UTC');
    const away = await fetchPrayerTimesUnified({
      provider: 'local_adhan',
      ...STOCKHOLM,
      date: day(),
      calculationMethod: 24,
      school: 0,
    });
    expect(eventAt('Fajr', away.timings, day(), away.clock).getTime()).toBe(
      homeFajr,
    );
    expect(away.timings).toEqual(home.timings);
  });
});

describe('Istanbul from namazvakti.com on a phone on UTC', () => {
  it('reads the published day on Istanbul’s clock, three hours from the phone’s', async () => {
    setZone('UTC');
    const day = new Date(2026, 9, 17);
    const r = await fetchPrayerTimesUnified({
      provider: 'namazvakti',
      ...ISTANBUL,
      date: day,
      calculationMethod: 13,
      school: 0,
    });
    // Türkiye keeps UTC+3 all year (#117): written on that fixed offset,
    // which a phone with zone data from before 2016 cannot get wrong.
    expect(r.clock).toBe('Etc/GMT-3');
    for (const key of ['Fajr', 'Dhuhr', 'Maghrib', 'Isha']) {
      const at = eventAt(key, r.timings, day, r.clock);
      // The printed strings, unchanged, three hours ahead of UTC.
      expect(formatInZone(at, 'Europe/Istanbul')).toBe(r.timings[key]);
      const [h, m] = r.timings[key].split(':').map(Number);
      expect(at.getUTCHours() * 60 + at.getUTCMinutes()).toBe(
        (h * 60 + m - 180 + 1440) % 1440,
      );
    }
  });

  it('in Istanbul, the phone’s own clock, as before', async () => {
    setZone('Europe/Istanbul');
    const r = await fetchPrayerTimesUnified({
      provider: 'namazvakti',
      ...ISTANBUL,
      date: new Date(2026, 9, 17),
      calculationMethod: 13,
      school: 0,
    });
    expect(r.clock).toBe(DEVICE_CLOCK);
  });
});

describe('which clock, for a place', () => {
  it('the phone’s own, wherever the place’s clock is the phone’s', () => {
    const own = (lat: number, lon: number, date: Date) =>
      clockFor(placeZoneFor(lat, lon, date)).zone;
    setZone('Europe/Stockholm');
    const june = new Date(2026, 5, 21);
    expect(own(STOCKHOLM.latitude, STOCKHOLM.longitude, june)).toBe(
      DEVICE_CLOCK,
    );
    // Copenhagen keeps Stockholm's offset: the phone's clock is its clock.
    expect(own(55.68, 12.57, june)).toBe(DEVICE_CLOCK);
    // Galicia (Spain's zone, far west of its longitude's hour) and Kashgar
    // (Beijing time, far east of its) read on the phone that is there.
    setZone('Europe/Madrid');
    expect(own(42.88, -8.54, june)).toBe(DEVICE_CLOCK);
    setZone('Asia/Shanghai');
    expect(own(39.47, 75.99, june)).toBe(DEVICE_CLOCK);
    // Rabat on a phone in Morocco: Morocco's own rules (`clockFor`).
    setZone('Africa/Casablanca');
    expect(own(34.02, -6.84, june)).toBe(DEVICE_CLOCK);
  });

  it('the country’s, or the longitude’s hour, for a place elsewhere', () => {
    setZone('UTC');
    const june = new Date(2026, 5, 21);
    expect(
      placeZoneFor(STOCKHOLM.latitude, STOCKHOLM.longitude, june)?.zone,
    ).toBe('Europe/Stockholm');
    expect(
      placeZoneFor(ISTANBUL.latitude, ISTANBUL.longitude, june)?.zone,
    ).toBe('Europe/Istanbul');
    // Morocco on the ministry's GMT, as its table prints it.
    setZone('Europe/Stockholm');
    expect(placeZoneFor(34.02, -6.84, june)?.away).toBe('Etc/GMT');
    // Jakarta's regency's zone.
    expect(placeZoneFor(-6.21, 106.85, june)?.zone).toBe('Asia/Jakarta');
    // New York: no border the app knows — the longitude's hour.
    expect(
      placeZoneFor(NEW_YORK.latitude, NEW_YORK.longitude, june)?.zone,
    ).toBe('Etc/GMT+5');
  });

  it('AlAdhan’s zone for the coordinates first, once it has named one', async () => {
    setZone('Europe/Stockholm');
    const june = new Date(2026, 5, 21);
    notePlaceZone(NEW_YORK.latitude, NEW_YORK.longitude, 'America/New_York');
    expect(
      placeZoneFor(NEW_YORK.latitude, NEW_YORK.longitude, june)?.zone,
    ).toBe('America/New_York');
    const r = await fetchPrayerTimesUnified({
      provider: 'local_adhan',
      ...NEW_YORK,
      date: june,
      calculationMethod: 2,
      school: 0,
    });
    expect(r.clock).toBe('America/New_York');
    // On New York's summer clock: Dhuhr just before one in the afternoon.
    expect(r.timings.Dhuhr >= '12:50' && r.timings.Dhuhr <= '13:05').toBe(true);
  });
});
