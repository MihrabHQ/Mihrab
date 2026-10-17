/**
 * A Keychain read that fails must not let the next save erase the location.
 *
 * The load carries on with defaults for the encrypted fields (0, 0, no
 * saved locations) so the app runs; before this, the next unrelated save
 * wrote those defaults over the real entry, and wrote a provider map with
 * every saved location pruned and the active one dropped.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  _resetSettingsStorageForTests,
  loadSettings,
  saveSettings,
} from '../src/settings/storage';
import { applyLocationProviders } from '../src/settings/locationProviders';
import type { LocationPreset } from '../src/settings/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Enc = require('react-native-encrypted-storage');

const KEY = 'prayerapp.settings.v1';
const SECURE_KEY = 'prayerapp.location.v1';
const FALLBACK_KEY = 'prayerapp.location.fallback.v1';

const HOME: LocationPreset = {
  id: 'p-home',
  name: 'Home',
  latitude: 59.33,
  longitude: 18.07,
};
const WORK: LocationPreset = {
  id: 'p-work',
  name: 'Work',
  latitude: 59.35,
  longitude: 18.05,
};
const RIGA: LocationPreset = {
  id: 'p-riga',
  name: 'Riga',
  latitude: 56.95,
  longitude: 24.1,
};

const IF = { auto: false, provider: 'islamiska_forbundet' };
const AUTO = { auto: true, provider: 'aladhan' };

const PLAIN = {
  dataProvider: 'islamiska_forbundet',
  dataProviderAuto: false,
  calculationMethod: 'auto',
  school: 0,
  locationMode: 'manual',
  activeLocationPresetId: 'p-home',
  onboardingComplete: true,
  appearance: 'light',
  locationProviders: { my: AUTO, manual: AUTO, 'p-home': IF, 'p-work': IF },
};
const SECURE = {
  manualLatitude: 59.33,
  manualLongitude: 18.07,
  manualLocationLabel: 'Stockholm',
  locationPresets: [HOME, WORK],
};

let secureReadFails = false;
const realGetItem = Enc.default.getItem.getMockImplementation();

beforeEach(async () => {
  // The failed reads are logged on purpose; not noise for this file.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  _resetSettingsStorageForTests();
  await AsyncStorage.clear();
  Enc.__reset();
  secureReadFails = false;
  Enc.default.getItem.mockImplementation(async (k: string) => {
    if (secureReadFails) throw new Error('errSecInteractionNotAllowed');
    return realGetItem(k);
  });
  await AsyncStorage.setItem(KEY, JSON.stringify(PLAIN));
  await Enc.default.setItem(SECURE_KEY, JSON.stringify(SECURE));
  Enc.default.setItem.mockClear();
});

afterAll(() => {
  jest.restoreAllMocks();
  Enc.default.getItem.mockImplementation(realGetItem);
});

const secureOnDisk = () => JSON.parse(Enc.__peek()[SECURE_KEY]);
const plainOnDisk = async () =>
  JSON.parse((await AsyncStorage.getItem(KEY)) as string);

test('a failed read still loads, with defaults for the location', async () => {
  secureReadFails = true;
  const s = await loadSettings();
  expect(s.locationPresets).toEqual([]);
  expect(s.manualLatitude).toBe(0);
  expect(s.appearance).toBe('light');
});

test('a theme change after a failed read leaves the location stores untouched', async () => {
  secureReadFails = true;
  const s = await loadSettings();
  await saveSettings(applyLocationProviders(s, { appearance: 'dark' }));

  // The encrypted entry was never written, and no fallback was made.
  expect(Enc.default.setItem).not.toHaveBeenCalled();
  expect(secureOnDisk()).toEqual(SECURE);
  expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBeNull();

  const plain = await plainOnDisk();
  expect(plain.appearance).toBe('dark');
  // Not the pruned map, not Automatic, not the dropped active location.
  expect(plain.locationProviders).toEqual(PLAIN.locationProviders);
  expect(plain.activeLocationPresetId).toBe('p-home');
  expect(plain.dataProviderAuto).toBe(false);
  expect(plain.dataProvider).toBe('islamiska_forbundet');
  expect(plain.manualLatitude).toBeUndefined();

  // And once the Keychain answers again, everything is there.
  secureReadFails = false;
  const back = await loadSettings();
  expect(back.locationPresets).toEqual([HOME, WORK]);
  expect(back.activeLocationPresetId).toBe('p-home');
  expect(back.dataProviderAuto).toBe(false);
  expect(back.appearance).toBe('dark');
});

test('once the read succeeds again, a stale save still keeps what is stored', async () => {
  secureReadFails = true;
  const s = await loadSettings();
  secureReadFails = false;
  // The app's state is still the one from the failed load.
  await saveSettings(applyLocationProviders(s, { appearance: 'dark' }));
  expect(Enc.default.setItem).not.toHaveBeenCalled();
  expect(secureOnDisk()).toEqual(SECURE);
  expect((await plainOnDisk()).locationProviders).toEqual(
    PLAIN.locationProviders,
  );
});

test('after the read succeeds again, saves resume — joined onto what is stored', async () => {
  secureReadFails = true;
  const s = await loadSettings();
  secureReadFails = false;
  // The user adds a saved location on the state from the failed load.
  await saveSettings(
    applyLocationProviders(s, {
      locationPresets: [RIGA],
      activeLocationPresetId: 'p-riga',
      manualLatitude: RIGA.latitude,
      manualLongitude: RIGA.longitude,
      manualLocationLabel: 'Riga',
    }),
  );
  const secure = secureOnDisk();
  expect(secure.locationPresets).toEqual([RIGA, HOME, WORK]);
  expect(secure.manualLatitude).toBe(RIGA.latitude);
  expect(secure.manualLocationLabel).toBe('Riga');
  const plain = await plainOnDisk();
  expect(plain.activeLocationPresetId).toBe('p-riga');
  // Every other location's source is still there.
  expect(plain.locationProviders['p-home']).toEqual(IF);
  expect(plain.locationProviders['p-work']).toEqual(IF);

  // And a save from a state that matches what is stored is a plain save.
  const fresh = await loadSettings();
  Enc.default.setItem.mockClear();
  await saveSettings({ ...fresh, appearance: 'dark' });
  expect(Enc.default.setItem).toHaveBeenCalledTimes(1);
  expect(secureOnDisk().locationPresets).toEqual([RIGA, HOME, WORK]);
});

test('a location set while the store is still unreadable goes to the fallback only', async () => {
  secureReadFails = true;
  const s = await loadSettings();
  await saveSettings(
    applyLocationProviders(s, {
      locationMode: 'manual',
      manualLatitude: RIGA.latitude,
      manualLongitude: RIGA.longitude,
      manualLocationLabel: 'Riga',
    }),
  );
  expect(Enc.default.setItem).not.toHaveBeenCalled();
  expect(secureOnDisk()).toEqual(SECURE);
  const fallback = JSON.parse(
    (await AsyncStorage.getItem(FALLBACK_KEY)) as string,
  );
  expect(fallback.manualLatitude).toBe(RIGA.latitude);
  // The saved locations' sources on disk are kept beside the new place's.
  const plain = await plainOnDisk();
  expect(plain.locationProviders['p-home']).toEqual(IF);
  expect(plain.locationProviders['p-work']).toEqual(IF);

  // Relaunch with the Keychain still locked: the place the user set is there.
  _resetSettingsStorageForTests();
  const relaunched = await loadSettings();
  expect(relaunched.manualLatitude).toBe(RIGA.latitude);
});

test('with no failure, saves write the encrypted store as before', async () => {
  const s = await loadSettings();
  await saveSettings({ ...s, appearance: 'dark' });
  expect(Enc.default.setItem).toHaveBeenCalledTimes(1);
  expect(secureOnDisk().locationPresets).toEqual([HOME, WORK]);
});

test('a pre-encryption plaintext blob is not migrated over an unreadable entry', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ ...PLAIN, manualLatitude: 1, manualLongitude: 2 }),
  );
  secureReadFails = true;
  const s = await loadSettings();
  expect(Enc.default.setItem).not.toHaveBeenCalled();
  expect(secureOnDisk()).toEqual(SECURE);
  await saveSettings({ ...s, appearance: 'dark' });
  // Still waiting in the plaintext blob for a launch that can migrate it.
  const plain = await plainOnDisk();
  expect(plain.manualLatitude).toBe(1);
  expect(plain.appearance).toBe('dark');
});
