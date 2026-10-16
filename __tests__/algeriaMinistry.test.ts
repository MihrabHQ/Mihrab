/**
 * Algeria — the Ministry of Religious Affairs and Wakfs (issue #70).
 *
 * The reporter prays by the Ministry's timetable. The app computes it, the
 * way it computes Morocco's and Sweden's:
 *
 *   - the 'marw' provider, chosen automatically in Algeria — including the
 *     strip of it Morocco's rectangle takes in;
 *   - the Ministry's method at the point it computes the nearest listed
 *     city, with its correction list: the printed minute, exactly;
 *   - for any date, offline.
 *
 * The expected times below were read off the Ministry's own app by hand,
 * not derived from the method they check.
 */
jest.unmock('adhan');

jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn().mockRejectedValue(new Error('no network in test')),
}));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for Algeria');
  }),
}));

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getMarwDatasetTimes } from '../src/providers/marwDataset';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';
import { algeriaTimes } from '../src/providers/algeriaMethod';
import methodPoints from '../src/providers/data/algeriaMethodPoints.json';
import {
  ALGERIA_CITIES,
  ALGERIA_METHOD_ID,
  nearestAlgeriaCity,
} from '../src/providers/algeriaCities';
import { autoMethodForCoords } from '../src/providers/autoMethod';
import { CALCULATION_METHODS } from '../src/settings/methods';
import { regionalProviderForCoords } from '../src/settings/regionalProviders';
import {
  providerHidesCalculationMethod,
  providerHidesHanafiAsr,
} from '../src/settings/providerUi';
import { isCoordinateInAlgeria } from '../src/utils/algeriaRegion';
import { isCoordinateInMorocco } from '../src/utils/moroccoRegion';
import { referenceCities, withReferenceTables } from './fixtures/referenceTables';

const ALGIERS = { latitude: 36.7538, longitude: 3.0588 };
const TLEMCEN = { latitude: 34.878, longitude: -1.315 };
const ORAN = { latitude: 35.6911, longitude: -0.6417 };
const IN_GUEZZAM = { latitude: 19.5667, longitude: 5.7667 };
const OUJDA = { latitude: 34.6867, longitude: -1.9114 };

const six = (t: Record<string, string | undefined>) =>
  ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);

beforeEach(async () => {
  await AsyncStorage.clear();
});

/** Minutes past midnight on Algeria's clock (UTC+1 all year). */
const algiersMin = (d: Date) => (((Math.round(d.getTime() / 60000) + 60) % 1440) + 1440) % 1440;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

describe('the Ministry’s method, computed (algeriaMethod.ts)', () => {
  it('serves the calculation, at the nearest city’s point, for any date', async () => {
    const r = await getMarwDatasetTimes({ ...ALGIERS, date: new Date(2031, 2, 3) });
    expect(r.source).toBe('local');
    expect(r.timezone).toBe('Africa/Algiers');
    expect(r.timings.Fajr).toMatch(/^\d\d:\d\d$/);
  });

  it.each([
    ['Algiers, 8 Oct 2026', 27, [2026, 9, 8], ['05:23', '06:49', '12:36', '15:51', '18:25', '19:43']],
    ['Algiers, 5 Jun 2027', 27, [2027, 5, 5], ['03:40', '05:30', '12:47', '16:38', '20:07', '21:46']],
    // The signed noon shadow: the sun north of the zenith, Asr thirteen minutes before the textbook's.
    ['In Guezzam, 5 Jun 2027', 65, [2027, 5, 5], [undefined, undefined, undefined, '15:42', undefined, undefined]],
  ])('%s, as the Ministry prints it', (_l, id, [y, m, d], expected) => {
    const [lat, lon] = (methodPoints as Record<string, number[]>)[String(id)];
    const at = algeriaTimes(lat, lon, y as number, m as number, d as number)!;
    const got = [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].map(x => hhmm(algiersMin(x)));
    (expected as (string | undefined)[]).forEach((e, i) => e && expect(got[i]).toBe(e));
  });

});

withReferenceTables('algeria')('the Ministry’s published year', () => {
  const compare = (corrected: boolean) => {
    const points = methodPoints as Record<string, number[]>;
    const dir = referenceCities('algeria')!;
    let same = 0;
    let total = 0;
    let worst = 0;
    for (const c of ALGERIA_CITIES) {
      const [lat, lon] = points[String(c.id)];
      const days = JSON.parse(fs.readFileSync(path.join(dir, `${c.id}.json`), 'utf8')).days as Record<string, string[]>;
      for (const [key, row] of Object.entries(days)) {
        const [y, m, d] = key.split('-').map(Number);
        const at = corrected
          ? computeLocalAdhanInstants({ latitude: lat, longitude: lon, date: new Date(y, m - 1, d), calculationMethod: ALGERIA_METHOD_ID, school: 0 })
          : algeriaTimes(lat, lon, y, m - 1, d)!;
        [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].map(algiersMin).forEach((v, k) => {
          const theirs = Number(row[k + 1].slice(0, 2)) * 60 + Number(row[k + 1].slice(3));
          const diff = Math.abs(((v - theirs + 720) % 1440 + 1440) % 1440 - 720);
          total++;
          if (diff === 0) same++;
          worst = Math.max(worst, diff);
        });
      }
    }
    return { same, total, worst };
  };

  it('is matched to the minute 99.3% of the time by the method alone, never by more than a minute', () => {
    const { same, total, worst } = compare(false);
    expect(total).toBeGreaterThan(100000);
    expect(same / total).toBeGreaterThanOrEqual(0.993);
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('is matched every time with the correction list', () => {
    const { same, total } = compare(true);
    expect(same).toBe(total);
  });
});

describe('the Ministry’s times, as it prints them', () => {
  it.each([
    ['Algiers, 8 Oct 2026', ALGIERS, new Date(2026, 9, 8), ['05:23', '06:49', '12:36', '15:51', '18:25', '19:43']],
    ['Oran, 8 Oct 2026', ORAN, new Date(2026, 9, 8), ['05:39', '07:03', '12:51', '16:07', '18:40', '19:57']],
    ['Tlemcen, 8 Oct 2026', TLEMCEN, new Date(2026, 9, 8), ['05:42', '07:06', '12:53', '16:10', '18:43', '19:59']],
    ['Algiers, last day of 1448', ALGIERS, new Date(2027, 5, 5), ['03:40', '05:30', '12:47', '16:38', '20:07', '21:46']],
  ])('%s', async (_label, at, date, expected) => {
    const r = await getMarwDatasetTimes({ ...(at as typeof ALGIERS), date: date as Date });
    // on Algeria's clock, as the Ministry prints it, whatever the phone's
    expect(six(r.timings)).toEqual(expected);
    expect(r.timezone).toBe('Africa/Algiers');
    expect(r.source).toBe('local');
  });

  it('keeps the Ministry’s Asr where the sun passes the zenith (In Guezzam)', async () => {
    // The textbook formula says 15:55; the Ministry publishes 15:42, and the
    // mosques there pray by the Ministry.
    const r = await getMarwDatasetTimes({ ...IN_GUEZZAM, date: new Date(2027, 5, 5) });
    expect(r.timings.Asr).toBe('15:42');
  });

  it('computes the Ministry’s method for the city past the published year', async () => {
    const r = await getMarwDatasetTimes({ ...ALGIERS, date: new Date(2027, 5, 6) });
    expect(r.source).toBe('local');
    expect(r.timezone).toBe('Africa/Algiers');
  });
});

describe('who gets it', () => {
  it('is the regional source everywhere in Algeria', () => {
    for (const c of ALGERIA_CITIES) {
      expect(isCoordinateInAlgeria(c.lat, c.lon)).toBe(true);
      expect(regionalProviderForCoords({ latitude: c.lat, longitude: c.lon })).toBe('marw');
      expect(nearestAlgeriaCity(c.lat, c.lon)!.id).toBe(c.id);
    }
  });

  it('gives Tlemcen and Tindouf to Algeria, by the border', () => {
    expect(isCoordinateInMorocco(TLEMCEN.latitude, TLEMCEN.longitude)).toBe(false);
    expect(regionalProviderForCoords(TLEMCEN)).toBe('marw');
    expect(regionalProviderForCoords({ latitude: 27.6711, longitude: -8.1474 })).toBe('marw');
  });

  it('leaves Morocco and Tunisia alone', () => {
    expect(regionalProviderForCoords(OUJDA)).toBe('habous');
    expect(regionalProviderForCoords({ latitude: 33.5731, longitude: -7.5898 })).toBe('habous');
    // Tunis has no national table here; Diyanet lists it.
    expect(regionalProviderForCoords({ latitude: 36.8065, longitude: 10.1815 })).toBe('diyanet');
  });

  it('hides the method and madhab pickers, as for the other published tables', () => {
    expect(providerHidesCalculationMethod('marw')).toBe(true);
    expect(providerHidesHanafiAsr('marw')).toBe(true);
  });
});

describe('the fetch chain', () => {
  it('serves the Ministry’s times', async () => {
    const r = await fetchPrayerTimesUnified({
      provider: 'marw',
      ...ALGIERS,
      date: new Date(2026, 9, 8),
      calculationMethod: 'auto',
      school: 1, // a Hanafi setting left over from elsewhere does not apply
    });
    expect(r.source).toBe('local');
    expect(r.timings.Asr).toBe('15:51');
  });

  it('computes the Algeria method past the published year, without AlAdhan', async () => {
    const r = await fetchPrayerTimesUnified({
      provider: 'marw',
      ...ALGIERS,
      date: new Date(2027, 5, 6),
      calculationMethod: 'auto',
      school: 0,
    });
    expect(r.source).toBe('local');
    // Within two minutes of the Ministry's last published day.
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const last = ['03:40', '05:30', '12:47', '16:38', '20:07', '21:46'].map(toMin);
    six(r.timings).forEach((t, i) =>
      expect(Math.abs(toMin(t!) - last[i])).toBeLessThanOrEqual(2),
    );
  });

  it('gives a Tlemcen user who pinned Morocco the Algerian table, not Oujda’s', async () => {
    const r = await fetchPrayerTimesUnified({
      provider: 'habous',
      ...TLEMCEN,
      date: new Date(2026, 9, 8),
      calculationMethod: 'auto',
      school: 0,
    });
    expect(six(r.timings)).toEqual(['05:42', '07:06', '12:53', '16:10', '18:43', '19:59']);
  });

  it('computes the method on the device for AlAdhan users in Algeria', async () => {
    const r = await fetchPrayerTimesUnified({
      provider: 'aladhan',
      ...ALGIERS,
      date: new Date(2026, 9, 8),
      calculationMethod: 'auto',
      school: 0,
    });
    expect(r.source).toBe('local');
  });
});

describe('the method stays available by hand', () => {
  it('is picked automatically in Algeria and nowhere near it', () => {
    expect(autoMethodForCoords(ALGIERS.latitude, ALGIERS.longitude)).toBe(ALGERIA_METHOD_ID);
    expect(autoMethodForCoords(TLEMCEN.latitude, TLEMCEN.longitude)).toBe(ALGERIA_METHOD_ID);
    expect(autoMethodForCoords(OUJDA.latitude, OUJDA.longitude)).toBe(21);
    expect(autoMethodForCoords(36.8065, 10.1815)).toBe(3); // Tunis
  });

  it('is listed and named in every language the app speaks', () => {
    expect(CALCULATION_METHODS.find(x => x.id === 19)?.nameKey).toBe('methods.19');
    const dir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(j.methods['19'].length).toBeGreaterThan(0);
      expect(j.providers.marw.name.length).toBeGreaterThan(0);
      expect(j.providers.marw.desc.length).toBeGreaterThan(0);
      expect(j.dataStats.marwWindow.length).toBeGreaterThan(0);
    }
  });
});
