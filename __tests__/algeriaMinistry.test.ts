/**
 * Algeria — the Ministry of Religious Affairs and Wakfs (issue #70).
 *
 * The reporter prays by the Ministry's timetable. The app now serves that
 * timetable itself, read from the Ministry's own app (see
 * `tools/algeria-ministry/`), the way it serves Morocco's and Sweden's:
 *
 *   - the 'marw' provider, chosen automatically in Algeria — including the
 *     strip of it Morocco's rectangle takes in;
 *   - the Ministry's times for the nearest listed city, exactly;
 *   - past the published year, the Algeria method (18° / 17°, Maghrib +3)
 *     computed on the device.
 *
 * The expected times below were read off the Ministry's own app by hand,
 * not derived from the dataset they check.
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
import {
  getMarwDatasetTimes,
  seedTuple,
  _resetMarwDatasetMemoForTests,
} from '../src/providers/marwDataset';
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
import seed from '../src/providers/data/marwSeed.json';

const ALGIERS = { latitude: 36.7538, longitude: 3.0588 };
const TLEMCEN = { latitude: 34.878, longitude: -1.315 };
const ORAN = { latitude: 35.6911, longitude: -0.6417 };
const IN_GUEZZAM = { latitude: 19.5667, longitude: 5.7667 };
const OUJDA = { latitude: 34.6867, longitude: -1.9114 };

const six = (t: Record<string, string | undefined>) =>
  ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);

beforeEach(async () => {
  _resetMarwDatasetMemoForTests();
  await AsyncStorage.clear();
});

describe('the Ministry’s times, as published', () => {
  it.each([
    ['Algiers, 8 Oct 2026', ALGIERS, new Date(2026, 9, 8), ['05:23', '06:49', '12:36', '15:51', '18:25', '19:43']],
    ['Oran, 8 Oct 2026', ORAN, new Date(2026, 9, 8), ['05:39', '07:03', '12:51', '16:07', '18:40', '19:57']],
    ['Tlemcen, 8 Oct 2026', TLEMCEN, new Date(2026, 9, 8), ['05:42', '07:06', '12:53', '16:10', '18:43', '19:59']],
    ['Algiers, last day of 1448', ALGIERS, new Date(2027, 5, 5), ['03:40', '05:30', '12:47', '16:38', '20:07', '21:46']],
  ])('%s', async (_label, at, date, expected) => {
    const r = await getMarwDatasetTimes({ ...(at as typeof ALGIERS), date: date as Date });
    expect(six(r.timings)).toEqual(expected);
    expect(r.timings.Imsak).toBeDefined();
    expect(r.timezone).toBe('Africa/Algiers');
    expect(r.source).toBe('seed');
  });

  it('keeps the Ministry’s Asr where the sun passes the zenith (In Guezzam)', async () => {
    // The textbook formula says 15:55; the Ministry publishes 15:42, and the
    // mosques there pray by the Ministry.
    const r = await getMarwDatasetTimes({ ...IN_GUEZZAM, date: new Date(2027, 5, 5) });
    expect(r.timings.Asr).toBe('15:42');
  });

  it('misses past the published year, so the caller can compute', async () => {
    await expect(
      getMarwDatasetTimes({ ...ALGIERS, date: new Date(2027, 5, 6) }),
    ).rejects.toThrow(/published/);
  });

  it('prefers a downloaded table over the seed', async () => {
    const city = nearestAlgeriaCity(ALGIERS.latitude, ALGIERS.longitude)!;
    await AsyncStorage.setItem(
      `marw.dataset.v1.city.${city.id}`,
      JSON.stringify({
        id: city.id,
        city: city.name,
        timezone: 'Africa/Algiers',
        builtAt: '2027-06-01T00:00:00Z',
        days: { '2027-06-20': ['03:28', '03:38', '05:29', '12:51', '16:43', '20:14', '21:55'] },
      }),
    );
    const r = await getMarwDatasetTimes({ ...ALGIERS, date: new Date(2027, 5, 20) });
    expect(r.source).toBe('cdn');
    expect(r.timings.Maghrib).toBe('20:14');
  });
});

describe('the bundled seed', () => {
  it('agrees with the published per-city files, every city and day', () => {
    const dir = path.join(__dirname, '..', 'data', 'prayer-times', 'algeria', 'v1', 'cities');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(files.length).toBe(ALGERIA_CITIES.length);
    for (const f of files) {
      const file = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const days = Object.keys(file.days);
      expect(days.length).toBe(seed.days);
      for (const d of days) expect(seedTuple(file.id, d)).toEqual(file.days[d]);
    }
  });

  it('covers every listed city', () => {
    const cities = seed.cities as Record<string, number[]>;
    for (const c of ALGERIA_CITIES) expect(cities[String(c.id)]).toBeDefined();
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

  it('takes Tlemcen and Tindouf back from Morocco’s rectangle', () => {
    expect(isCoordinateInMorocco(TLEMCEN.latitude, TLEMCEN.longitude)).toBe(true);
    expect(regionalProviderForCoords(TLEMCEN)).toBe('marw');
    expect(regionalProviderForCoords({ latitude: 27.6711, longitude: -8.1474 })).toBe('marw');
  });

  it('leaves Morocco and Tunisia alone', () => {
    expect(regionalProviderForCoords(OUJDA)).toBe('habous');
    expect(regionalProviderForCoords({ latitude: 33.5731, longitude: -7.5898 })).toBe('habous');
    expect(regionalProviderForCoords({ latitude: 36.8065, longitude: 10.1815 })).toBeNull();
  });

  it('hides the method and madhab pickers, as for the other published tables', () => {
    expect(providerHidesCalculationMethod('marw')).toBe(true);
    expect(providerHidesHanafiAsr('marw')).toBe(true);
  });
});

describe('the fetch chain', () => {
  it('serves the Ministry’s table', async () => {
    const r = await fetchPrayerTimesUnified({
      provider: 'marw',
      ...ALGIERS,
      date: new Date(2026, 9, 8),
      calculationMethod: 'auto',
      school: 1, // a Hanafi setting left over from elsewhere does not apply
    });
    expect(r.source).toBe('seed');
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
    const inAlgiers = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return new Date(2027, 5, 6, h, m).toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Algiers',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    };
    const last = ['03:40', '05:30', '12:47', '16:38', '20:07', '21:46'].map(toMin);
    six(r.timings).forEach((t, i) =>
      expect(Math.abs(toMin(inAlgiers(t!)) - last[i])).toBeLessThanOrEqual(2),
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
