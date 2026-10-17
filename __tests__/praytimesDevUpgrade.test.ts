/**
 * A PrayTimes.dev user upgrading keeps the times they had.
 *
 * PrayTimes.dev was removed in 2.32.0, and had been answering 404 before
 * that, so its users were getting their own method and Asr computed on the
 * phone. Moving them to Automatic handed a Stockholm user Islamiska
 * Förbundet's method and set their Hanafi Asr aside. They move to the
 * on-device source, with their method and school, instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings } from '../src/settings/storage';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../src/settings/effectiveProvider';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Enc = require('react-native-encrypted-storage');

const KEY = 'prayerapp.settings.v1';
const SKEY = 'prayerapp.location.v1';
const STOCKHOLM = {
  manualLatitude: 59.33,
  manualLongitude: 18.07,
  lastFetchedLatitude: 59.33,
  lastFetchedLongitude: 18.07,
};

async function load(plain: Record<string, unknown>) {
  await AsyncStorage.clear();
  Enc.__reset();
  await AsyncStorage.setItem(KEY, JSON.stringify(plain));
  await Enc.default.setItem(SKEY, JSON.stringify(STOCKHOLM));
  return loadSettings();
}

it('keeps a pinned PrayTimes.dev user on their own method and Asr, on the phone', async () => {
  const s = await load({
    dataProvider: 'prayertimes_dev',
    dataProviderAuto: false,
    calculationMethod: 3,
    school: 1,
    locationMode: 'automatic',
    onboardingComplete: true,
  });
  expect(s.dataProvider).toBe('local_adhan');
  expect(s.dataProviderAuto).toBe(false);
  expect(s.calculationMethod).toBe(3);
  expect(s.school).toBe(1);
  const coords = resolveCoordsFromSettings(s);
  expect(
    getEffectiveDataProvider(
      s.dataProviderAuto,
      s.dataProvider,
      coords,
      s.calculationMethod,
    ),
  ).toBe('local_adhan');
});

it('leaves one who had Automatic on Automatic', async () => {
  const s = await load({
    dataProvider: 'prayertimes_dev',
    dataProviderAuto: true,
    calculationMethod: 'auto',
    school: 0,
    locationMode: 'automatic',
    onboardingComplete: true,
  });
  expect(s.dataProviderAuto).toBe(true);
});

it('renames it in a saved location’s own choice too', async () => {
  const s = await load({
    dataProvider: 'aladhan',
    dataProviderAuto: false,
    calculationMethod: 3,
    school: 0,
    locationMode: 'automatic',
    onboardingComplete: true,
    locationProviders: { 'p-x': { auto: false, provider: 'prayertimes_dev' } },
  });
  expect(s.locationProviders?.['p-x']).toEqual({
    auto: false,
    provider: 'local_adhan',
  });
});
