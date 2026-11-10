/**
 * Encrypted-storage failure fallback — task #141.
 *
 * Verifies the data-loss safety net: when iOS Keychain or Android Keystore
 * rejects writes (e.g., errSecMissingEntitlement -34018, locked secure
 * enclave, simulator without entitlements), the app must still persist the
 * user's coordinates and saved location presets so they survive an app
 * relaunch. Memory: "user data must never go missing."
 *
 * The fallback is a plaintext file kept out of every backup
 * (`unprotectedStore.ts`, key `prayerapp.location.fallback.v1`) — not
 * AsyncStorage, which Android's cloud backup carries; a copy an older
 * build left there is read once and moved. Once the encrypted store
 * accepts writes again, the fallback is drained.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
const EncryptedStorageMock = require('react-native-encrypted-storage');
import {
  loadSecureSettings,
  saveSecureSettings,
} from '../src/settings/secureStorage';
import { loadSettings, saveSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS, type LocationPreset } from '../src/settings/types';

const SECURE_KEY = 'prayerapp.location.v1';
const FALLBACK_KEY = 'prayerapp.location.fallback.v1';
const FALLBACK_FILE = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/unprotected/${encodeURIComponent(FALLBACK_KEY)}`;
const fallbackFile = async (): Promise<string | null> =>
  (await ReactNativeBlobUtil.fs.exists(FALLBACK_FILE))
    ? ReactNativeBlobUtil.fs.readFile(FALLBACK_FILE, 'utf8')
    : null;
const clearFallbackFile = async (): Promise<void> => {
  if (await ReactNativeBlobUtil.fs.exists(FALLBACK_FILE)) {
    await ReactNativeBlobUtil.fs.unlink(FALLBACK_FILE);
  }
};

beforeEach(async () => {
  if ((AsyncStorage as { clear?: () => Promise<void> }).clear) {
    await AsyncStorage.clear();
  }
  EncryptedStorageMock.__reset();
  await clearFallbackFile();
  // Reset spies set by individual tests.
  jest.restoreAllMocks();
});

const stockholm: LocationPreset = {
  id: 'p1',
  name: 'Stockholm',
  latitude: 59.3293,
  longitude: 18.0686,
  label: 'Stockholm, Sweden',
};

describe('saveSecureSettings — fallback on Keychain failure', () => {
  function rejectEncryptedSetItem(reason = 'errSecMissingEntitlement') {
    EncryptedStorageMock.default.setItem.mockImplementationOnce(async () => {
      const e = new Error(`RNEncryptedStorageError: ${reason}`);
      // Match the real iOS error shape so a future caller could branch on
      // `code` if it wanted to.
      (e as Error & { code?: string }).code = '-34018';
      throw e;
    });
  }

  test('writes to the backup-excluded fallback file when encrypted save rejects', async () => {
    rejectEncryptedSetItem();
    await expect(
      saveSecureSettings({
        manualLatitude: 59.3293,
        manualLongitude: 18.0686,
        manualLocationLabel: 'Stockholm',
        locationPresets: [stockholm],
      }),
    ).rejects.toThrow(/RNEncryptedStorageError/);

    // Encrypted store remains empty.
    expect(EncryptedStorageMock.__peek()[SECURE_KEY]).toBeUndefined();

    // The fallback file carries the same payload; AsyncStorage nothing.
    const raw = await fallbackFile();
    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBeNull();
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.manualLatitude).toBe(59.3293);
    expect(parsed.manualLongitude).toBe(18.0686);
    expect(parsed.manualLocationLabel).toBe('Stockholm');
    expect(parsed.locationPresets).toEqual([stockholm]);
  });

  test('loadSecureSettings reads a copy an older build left in AsyncStorage, and moves it out', async () => {
    // Simulate a prior session on an older build that hit the fallback path.
    await AsyncStorage.setItem(
      FALLBACK_KEY,
      JSON.stringify({
        manualLatitude: 59.3293,
        manualLongitude: 18.0686,
        locationPresets: [stockholm],
      }),
    );

    const loaded = await loadSecureSettings();
    expect(loaded.manualLatitude).toBe(59.3293);
    expect(loaded.locationPresets).toEqual([stockholm]);
    // Out of the store the backups carry, into the file they do not.
    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBeNull();
    expect(JSON.parse((await fallbackFile()) as string).manualLatitude).toBe(59.3293);
  });

  test('successful encrypted save drains the plaintext fallback', async () => {
    // Pre-seed a stale fallback (left over from a prior failure).
    await AsyncStorage.setItem(
      FALLBACK_KEY,
      JSON.stringify({ manualLatitude: 1, manualLongitude: 2 }),
    );

    await saveSecureSettings({
      manualLatitude: 59.3293,
      manualLongitude: 18.0686,
    });

    // Encrypted store has the new payload.
    const enc = EncryptedStorageMock.__peek()[SECURE_KEY];
    expect(enc).toBeTruthy();
    expect(JSON.parse(enc).manualLatitude).toBe(59.3293);

    // Fallback was cleared so PII doesn't linger in plaintext.
    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBeNull();
  });
});

describe('saveSettings — keychain failure does not block plaintext settings', () => {
  test('plaintext settings still persist when encrypted save rejects', async () => {
    EncryptedStorageMock.default.setItem.mockImplementationOnce(async () => {
      throw new Error('keychain locked');
    });

    const settings = {
      ...DEFAULT_SETTINGS,
      language: 'sv' as const,
      manualLatitude: 59.3293,
      manualLongitude: 18.0686,
      locationPresets: [stockholm],
    };

    // saveSettings now swallows the secure-save failure (memory: data must
    // never go missing — non-secure fields like language shouldn't be
    // blocked by a keychain outage). Should resolve, not throw.
    await expect(saveSettings(settings)).resolves.toBeUndefined();

    // Plaintext blob persisted with the language change.
    const plain = await AsyncStorage.getItem('prayerapp.settings.v1');
    expect(plain).toBeTruthy();
    const parsed = JSON.parse(plain as string);
    expect(parsed.language).toBe('sv');

    // Coordinates landed in the fallback, not in plaintext settings.
    expect(parsed.manualLatitude).toBeUndefined();
    expect(parsed.manualLongitude).toBeUndefined();

    const fallback = await fallbackFile();
    expect(fallback).toBeTruthy();
    expect(JSON.parse(fallback as string).manualLatitude).toBe(59.3293);
  });

  test('persists current AND alternative saved locations across a keychain failure (#142)', async () => {
    // Two presets — the user's "current" Stockholm and an "alternative" Cairo.
    // Both must survive a keychain-rejected save.
    const cairo: LocationPreset = {
      id: 'p2',
      name: 'Cairo',
      latitude: 30.0444,
      longitude: 31.2357,
      label: 'Cairo, Egypt',
    };

    EncryptedStorageMock.default.setItem.mockImplementationOnce(async () => {
      throw new Error('keychain rejected');
    });

    const settings = {
      ...DEFAULT_SETTINGS,
      manualLatitude: stockholm.latitude,
      manualLongitude: stockholm.longitude,
      manualLocationLabel: stockholm.label,
      locationPresets: [stockholm, cairo],
      activeLocationPresetId: stockholm.id,
    };
    await saveSettings(settings);

    const reloaded = await loadSettings();
    expect(reloaded.locationPresets).toHaveLength(2);
    expect(reloaded.locationPresets.map(p => p.name).sort()).toEqual([
      'Cairo',
      'Stockholm',
    ]);
    expect(reloaded.activeLocationPresetId).toBe(stockholm.id);
    // Current coords preserved too — the screenshot bug was that adding an
    // alternative wiped the original. The reconciliation in storage.ts +
    // the fallback together must keep both alive.
    expect(reloaded.manualLatitude).toBe(stockholm.latitude);
    expect(reloaded.manualLocationLabel).toBe(stockholm.label);
  });

  test('full round-trip: keychain fails on save, loadSettings still returns coords', async () => {
    EncryptedStorageMock.default.setItem.mockImplementationOnce(async () => {
      throw new Error('keychain locked');
    });

    const settings = {
      ...DEFAULT_SETTINGS,
      manualLatitude: 59.3293,
      manualLongitude: 18.0686,
      manualLocationLabel: 'Stockholm',
      locationPresets: [stockholm],
      activeLocationPresetId: stockholm.id,
    };
    await saveSettings(settings);

    // Subsequent load should still see the coordinates via the fallback.
    const reloaded = await loadSettings();
    expect(reloaded.manualLatitude).toBe(59.3293);
    expect(reloaded.manualLongitude).toBe(18.0686);
    expect(reloaded.manualLocationLabel).toBe('Stockholm');
    expect(reloaded.locationPresets).toHaveLength(1);
    expect(reloaded.locationPresets[0].name).toBe('Stockholm');
  });
});
