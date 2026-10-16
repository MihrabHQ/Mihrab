/**
 * Diyanet as a source: where Automatic picks it (Türkiye, its own country),
 * that a pinned Diyanet is never redirected (it answers everywhere), where
 * its row says it is not on Diyanet's minute, and that a stored source this
 * build does not know — from a newer build, by sync or a backup — lands on
 * Automatic instead of a name nothing can show.
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');
import { loadSettings } from '../src/settings/storage';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { isRegionalProvider } from '../src/settings/regionalProviders';
import { diyanetCoverage, nearestDiyanetPlace } from '../src/providers/diyanetMethod';
import { isCoordinateInTurkey } from '../src/utils/turkeyRegion';
import { autoMethodForCoords } from '../src/providers/autoMethod';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';
import { diyanetInstants, diyanetPlaces } from '../src/providers/diyanetMethod';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'android',
  select: (obj: Record<string, unknown>) => obj.android ?? obj.default,
}));
jest.mock('react-native', () => ({
  NativeModules: { I18nManager: { localeIdentifier: 'en_GB' } },
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const at = (latitude: number, longitude: number) => ({ latitude, longitude });
const ISTANBUL = at(41.01, 28.98);
const VAN = at(38.5, 43.38);
const ATHENS = at(37.98, 23.73);
const CAIRO = at(30.04, 31.24);
const STOCKHOLM = at(59.33, 18.07);

describe('where Diyanet is recommended', () => {
  it('is what Automatic picks in Türkiye', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', ISTANBUL, 'auto')).toBe('diyanet');
    expect(getEffectiveDataProvider(true, 'aladhan', VAN, 'auto')).toBe('diyanet');
  });

  it('is picked near a place it lists, further away not — and the national sources keep their countries', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', ATHENS, 'auto')).toBe('diyanet');
    expect(getEffectiveDataProvider(true, 'aladhan', CAIRO, 'auto')).toBe('diyanet');
    expect(getEffectiveDataProvider(true, 'aladhan', at(-23.7, 133.88), 'auto')).toBe('aladhan'); // Alice Springs
    expect(getEffectiveDataProvider(true, 'aladhan', at(7.0, 100.47), 'auto')).toBe('aladhan'); // Hat Yai
    expect(getEffectiveDataProvider(true, 'aladhan', STOCKHOLM, 'auto')).toBe('islamiska_forbundet');
    expect(getEffectiveDataProvider(true, 'aladhan', at(33.5731, -7.5898), 'auto')).toBe('habous'); // Casablanca
    expect(getEffectiveDataProvider(true, 'aladhan', at(-6.2088, 106.8456), 'auto')).toBe('kemenag'); // Jakarta
  });

  it('is not picked near a place it lists when the reader chose a calculation method of their own', () => {
    // Diyanet's method is fixed; picking it would set the reader's choice aside without a word.
    expect(getEffectiveDataProvider(true, 'aladhan', ATHENS, 2)).toBe('aladhan');
    expect(getEffectiveDataProvider(true, 'aladhan', CAIRO, 5)).toBe('aladhan');
    // Türkiye is Diyanet's own country: Automatic picks it there whatever the method, as before.
    expect(getEffectiveDataProvider(true, 'aladhan', at(41.01, 28.98), 2)).toBe('diyanet');
    // A national source still comes first.
    expect(getEffectiveDataProvider(true, 'aladhan', STOCKHOLM, 2)).toBe('islamiska_forbundet');
  });

  it('is never redirected when pinned, since it answers everywhere', () => {
    expect(isRegionalProvider('diyanet')).toBe(false);
    expect(getEffectiveDataProvider(false, 'diyanet', CAIRO, 'auto')).toBe('diyanet');
    expect(getEffectiveDataProvider(false, 'diyanet', at(-54.8, -68.3), 'auto')).toBe('diyanet');
  });

  it('keeps the Greek islands off the Turkish coast out of Türkiye', () => {
    expect(isCoordinateInTurkey(39.1, 26.55)).toBe(false); // Mytilene
    expect(isCoordinateInTurkey(36.89, 27.29)).toBe(false); // Kos
    expect(isCoordinateInTurkey(37.03, 27.43)).toBe(true); // Bodrum
    expect(isCoordinateInTurkey(39.32, 26.69)).toBe(true); // Ayvalık
  });

  it('takes the table of the listed place nearest, and says when there is none', () => {
    // Stockholm is on a Diyanet point; Tromsø and the open sea are not near one
    expect(diyanetCoverage(STOCKHOLM.latitude, STOCKHOLM.longitude)).toBe('place');
    expect(nearestDiyanetPlace(STOCKHOLM.latitude, STOCKHOLM.longitude)?.list).toBe('sweden');
    expect(diyanetCoverage(69.65, 18.96)).toBe('own');
    expect(diyanetCoverage(0, -30)).toBe('own');
  });
});

describe('a stored source this build does not know', () => {
  beforeEach(async () => {
    if ((AsyncStorage as { clear?: () => Promise<void> }).clear) await AsyncStorage.clear();
    EncryptedStorageMock.__reset();
  });
  const storedAs = async (blob: Record<string, unknown>) => {
    await AsyncStorage.setItem('prayerapp.settings.v1', JSON.stringify(blob));
    return loadSettings();
  };

  it('lands on Automatic', async () => {
    const s = await storedAs({ dataProvider: 'some_future_source', dataProviderAuto: false });
    expect(s.dataProviderAuto).toBe(true);
    expect(s.dataProvider).toBe('aladhan');
  });

  it('moves PrayTimes.dev, which is gone, to Automatic — for every location', async () => {
    const s = await storedAs({
      dataProvider: 'prayertimes_dev',
      dataProviderAuto: false,
      locationProviders: { home: { auto: false, provider: 'prayertimes_dev' }, work: { auto: false, provider: 'diyanet' } },
    });
    expect(s.dataProviderAuto).toBe(true);
    expect(s.dataProvider).toBe('aladhan');
    expect(s.locationProviders?.home).toEqual({ auto: true, provider: 'aladhan' });
    expect(s.locationProviders?.work).toEqual({ auto: false, provider: 'diyanet' });
  });

  it('keeps a known one, Diyanet included', async () => {
    const s = await storedAs({ dataProvider: 'diyanet', dataProviderAuto: false });
    expect(s.dataProvider).toBe('diyanet');
    expect(s.dataProviderAuto).toBe(false);
  });
});

describe('Türkiye’s method (13) is Diyanet’s, on the phone', () => {
  const day = new Date(2026, 9, 15);

  it('computes method 13 as Diyanet’s tables do, not as adhan.js’s preset', () => {
    const ours = computeLocalAdhanInstants({ latitude: 41.01, longitude: 28.98, date: day, calculationMethod: 13, school: 0 });
    expect(ours).toEqual(diyanetInstants(41.01, 28.98, day, 0));
  });

  it('is what the Automatic method computes in Türkiye', () => {
    expect(autoMethodForCoords(ISTANBUL.latitude, ISTANBUL.longitude)).toBe(13);
    expect(autoMethodForCoords(ATHENS.latitude, ATHENS.longitude)).not.toBe(13);
  });

  it('never asks AlAdhan for it', async () => {
    const fetchSpy = jest.fn(() => Promise.reject(new Error('no network in this test')));
    const real = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const r = await fetchPrayerTimesUnified({ provider: 'aladhan', latitude: 41.01, longitude: 28.98, date: day, calculationMethod: 13, school: 0 });
      expect(r.source).toBe('local');
      const auto = await fetchPrayerTimesUnified({ provider: 'aladhan', latitude: 41.01, longitude: 28.98, date: day, calculationMethod: 'auto', school: 0 });
      expect(auto.source).toBe('local');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = real;
    }
  });
});

describe('a listed place gets its own table', () => {
  const clock = (d: Date, zone: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

  it('gives Istanbul’s district Diyanet’s printed day, each prayer at its own point', () => {
    const ist = diyanetPlaces().find(p => p.id === '9541')!;
    expect(ist.years).toBeDefined();
    const at = diyanetInstants(ist.lat, ist.lon, new Date(2026, 9, 15), 0);
    expect([at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].map(d => clock(d, 'Europe/Istanbul'))).toEqual([
      '05:44', '07:08', '12:55', '16:00', '18:32', '19:51',
    ]);
  });

  it('snaps to Türkiye’s districts', () => {
    expect(diyanetCoverage(ISTANBUL.latitude, ISTANBUL.longitude)).toBe('place');
    expect(diyanetCoverage(VAN.latitude, VAN.longitude)).toBe('place');
  });
});
