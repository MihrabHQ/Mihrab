/**
 * Fields that came back from disk unchecked: a hand-edited blob, a backup,
 * or a peer's settings brought in by sync could hand the app a custom
 * angle of null (read as 0, clamped to 10°), a method id nobody can
 * compute, a truthy string for "automatic", or offsets of any shape.
 * Garbage loads as the default; a valid value is kept as it was.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings } from '../src/settings/storage';
import { coerceCustomAngle } from '../src/prayer/calculationPreferences';
import { CALCULATION_METHODS } from '../src/settings/methods';
import { DEFAULT_SETTINGS } from '../src/settings/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

const KEY = 'prayerapp.settings.v1';

const BASE = {
  dataProvider: 'aladhan',
  dataProviderAuto: true,
  calculationMethod: 'auto',
  school: 0,
  locationMode: 'automatic',
  onboardingComplete: true,
};

async function loadWith(fields: Record<string, unknown>) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...BASE, ...fields }));
  return loadSettings();
}

beforeEach(async () => {
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
});

describe('custom Fajr/Isha angles', () => {
  test.each([null, '', '   ', false, true, [], {}, 'abc', NaN])(
    '%p loads as the default angle, not 10°',
    async garbage => {
      const s = await loadWith({
        customFajrAngle: garbage,
        customIshaAngle: garbage,
      });
      expect(s.customFajrAngle).toBe(DEFAULT_SETTINGS.customFajrAngle);
      expect(s.customIshaAngle).toBe(DEFAULT_SETTINGS.customIshaAngle);
    },
  );

  test('a number, or a string that spells one, is kept (and still clamped)', async () => {
    const s = await loadWith({ customFajrAngle: 15.5, customIshaAngle: '16' });
    expect(s.customFajrAngle).toBe(15.5);
    expect(s.customIshaAngle).toBe(16);
    expect(coerceCustomAngle(40, 18)).toBe(24);
    expect(coerceCustomAngle(' 12.34 ', 18)).toBe(12.3);
  });
});

describe('calculationMethod', () => {
  test.each(['3', 'mwl', 6, 25, 3.5, -1, null, true, {}, []])(
    '%p loads as the default method',
    async garbage => {
      const s = await loadWith({ calculationMethod: garbage });
      expect(s.calculationMethod).toBe(DEFAULT_SETTINGS.calculationMethod);
    },
  );

  test("'auto', Custom (99) and every listed method are kept", async () => {
    for (const { id } of CALCULATION_METHODS) {
      const s = await loadWith({ calculationMethod: id });
      expect(s.calculationMethod).toBe(id);
    }
    expect((await loadWith({ calculationMethod: 99 })).calculationMethod).toBe(
      99,
    );
  });
});

describe('dataProviderAuto', () => {
  test.each(['yes', 1, 0, null, {}])(
    '%p loads as the default',
    async garbage => {
      const s = await loadWith({ dataProviderAuto: garbage });
      expect(s.dataProviderAuto).toBe(DEFAULT_SETTINGS.dataProviderAuto);
    },
  );

  test('a boolean is kept, and an absent one is still the pre-auto pin', async () => {
    expect((await loadWith({ dataProviderAuto: false })).dataProviderAuto).toBe(
      false,
    );
    expect((await loadWith({ dataProviderAuto: true })).dataProviderAuto).toBe(
      true,
    );
    const old = { ...BASE } as Record<string, unknown>;
    delete old.dataProviderAuto;
    await AsyncStorage.setItem(KEY, JSON.stringify(old));
    expect((await loadSettings()).dataProviderAuto).toBe(false);
  });

  test('the removed PrayTimes.dev still migrates to the on-device source', async () => {
    const s = await loadWith({
      dataProvider: 'prayertimes_dev',
      dataProviderAuto: false,
    });
    expect(s.dataProvider).toBe('local_adhan');
    expect(s.dataProviderAuto).toBe(false);
  });
});

describe('prayerOffsets', () => {
  test.each([null, 'x', 5, [], true])(
    '%p loads as no offsets',
    async garbage => {
      const s = await loadWith({ prayerOffsets: garbage });
      expect(s.prayerOffsets).toEqual({});
    },
  );

  test('valid offsets are kept; bad entries are dropped and big ones clamped', async () => {
    const s = await loadWith({
      prayerOffsets: {
        Fajr: 2,
        Maghrib: -5,
        Isha: 90,
        Asr: 'x',
        Dhuhr: null,
        Bogus: 3,
      },
    });
    expect(s.prayerOffsets).toEqual({ Fajr: 2, Maghrib: -5, Isha: 30 });
  });

  test('absent offsets load as none', async () => {
    expect((await loadWith({})).prayerOffsets).toEqual({});
  });
});
