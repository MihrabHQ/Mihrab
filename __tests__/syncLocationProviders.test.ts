/**
 * Sync and restore merge each location's prayer-time source key by key.
 *
 * `locationProviders` is keyed by saved-location ids, and saved locations
 * travel in the location category, which is off by default. Taken
 * wholesale, a settings-only sync from a phone with different saved places
 * replaced this phone's map with one naming none of them, and every saved
 * location fell back to Automatic. Sync and restore both go through
 * `mergeData` (`snapshotStore.applySnapshot`), so it is tested here, and
 * once through `loadSettings` to see what the screens would show.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeData, mergeSettings } from '../src/sync/merge';
import {
  buildSnapshot,
  emptyData,
  everything,
  nothing,
  type SnapshotData,
} from '../src/sync/snapshot';
import { loadSettings } from '../src/settings/storage';
import { providerChoiceForPreset } from '../src/settings/locationProviders';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

const NOW = '2026-10-17T12:00:00.000Z';
const IF = { auto: false, provider: 'islamiska_forbundet' };
const AUTO = { auto: true, provider: 'aladhan' };
const DIYANET = { auto: false, provider: 'diyanet' };

const HOME = { id: 'p-home', name: 'Home', latitude: 59.33, longitude: 18.07 };
const MALMO = { id: 'p-malmo', name: 'Malmö', latitude: 55.6, longitude: 13.0 };
const ISTANBUL = {
  id: 'peer-ist',
  name: 'Istanbul',
  latitude: 41.01,
  longitude: 28.98,
};

function localData(): SnapshotData {
  return {
    ...emptyData(),
    settings: {
      dataProvider: 'aladhan',
      dataProviderAuto: true,
      calculationMethod: 'auto',
      school: 0,
      locationMode: 'automatic',
      onboardingComplete: true,
      locationProviders: {
        my: AUTO,
        manual: AUTO,
        'p-home': IF,
        'p-malmo': IF,
      },
    },
    location: {
      manualLatitude: 59.33,
      manualLongitude: 18.07,
      lastFetchedLatitude: 59.33,
      lastFetchedLongitude: 18.07,
      locationPresets: [HOME, MALMO],
    },
  };
}

function peerData(): SnapshotData {
  return {
    ...emptyData(),
    settings: {
      dataProvider: 'diyanet',
      dataProviderAuto: false,
      calculationMethod: 13,
      school: 0,
      locationMode: 'manual',
      activeLocationPresetId: 'peer-ist',
      onboardingComplete: true,
      appearance: 'dark',
      locationProviders: {
        my: AUTO,
        manual: AUTO,
        'peer-ist': DIYANET,
        'p-malmo': AUTO,
      },
    },
    location: {
      manualLatitude: 41.01,
      manualLongitude: 28.98,
      locationPresets: [ISTANBUL, MALMO],
    },
  };
}

async function loadMerged(merged: SnapshotData) {
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  await AsyncStorage.setItem(
    'prayerapp.settings.v1',
    JSON.stringify(merged.settings),
  );
  await EncryptedStorageMock.default.setItem(
    'prayerapp.location.v1',
    JSON.stringify(merged.location),
  );
  return loadSettings();
}

describe('settings-only sync (location off, the default)', () => {
  test("keeps a pinned local saved location when the peer's ids differ", async () => {
    const snap = buildSnapshot(
      peerData(),
      { ...everything(), location: false },
      NOW,
    );
    const merged = mergeData(localData(), snap, everything());
    const map = merged.settings.locationProviders as Record<string, unknown>;
    expect(map['p-home']).toEqual(IF);
    // The peer's own saved place is not here, so neither is its choice.
    expect(map['peer-ist']).toBeUndefined();
    // The rest of the settings still come over.
    expect(merged.settings.appearance).toBe('dark');

    const s = await loadMerged(merged);
    expect(providerChoiceForPreset(s, HOME)).toEqual(IF);
  });

  test("takes the peer's choice for a location both phones have", () => {
    const snap = buildSnapshot(
      peerData(),
      { ...everything(), location: false },
      NOW,
    );
    const merged = mergeData(localData(), snap, everything());
    const map = merged.settings.locationProviders as Record<string, unknown>;
    // Same saved-location id on both phones: the incoming value wins, as
    // for every other setting.
    expect(map['p-malmo']).toEqual(AUTO);
    expect(map.my).toEqual(AUTO);
  });

  test('a peer offering location is still refused when this phone declines it', () => {
    const snap = buildSnapshot(peerData(), everything(), NOW);
    const merged = mergeData(localData(), snap, {
      ...everything(),
      location: false,
    });
    const map = merged.settings.locationProviders as Record<string, unknown>;
    expect(map['p-home']).toEqual(IF);
    expect(map['peer-ist']).toBeUndefined();
  });
});

describe('sync with locations', () => {
  test("brings the peer's saved places with their sources", async () => {
    const snap = buildSnapshot(peerData(), everything(), NOW);
    const merged = mergeData(localData(), snap, everything());
    const map = merged.settings.locationProviders as Record<string, unknown>;
    expect(map['peer-ist']).toEqual(DIYANET);
    expect(map['p-malmo']).toEqual(AUTO);
    // A local entry the peer does not mention is not thrown away.
    expect(map['p-home']).toEqual(IF);

    const s = await loadMerged(merged);
    // Istanbul is the active location: its source comes from the mirrored fields.
    expect(providerChoiceForPreset(s, ISTANBUL)).toEqual(DIYANET);
    expect(providerChoiceForPreset(s, MALMO)).toEqual(AUTO);
  });
});

describe('a peer from before per-location sources', () => {
  test('leaves the local map intact', async () => {
    const old = peerData();
    delete old.settings.locationProviders;
    old.settings.dataProvider = 'aladhan';
    old.settings.dataProviderAuto = false;
    old.settings.locationMode = 'automatic';
    delete old.settings.activeLocationPresetId;
    const local = localData();
    const snap = buildSnapshot(old, { ...everything(), location: false }, NOW);
    const merged = mergeData(local, snap, everything());
    expect(merged.settings.locationProviders).toEqual(
      local.settings.locationProviders,
    );

    const s = await loadMerged(merged);
    expect(providerChoiceForPreset(s, HOME)).toEqual(IF);
    expect(providerChoiceForPreset(s, MALMO)).toEqual(IF);
  });

  test('garbage in place of the map is ignored too', () => {
    const local = localData();
    for (const junk of [null, 'x', [], 5]) {
      const out = mergeSettings(
        local.settings,
        { locationProviders: junk },
        { localLocation: local.location, withLocation: true },
      );
      expect(out.locationProviders).toEqual(local.settings.locationProviders);
    }
  });
});

describe('a local install that never saved a map', () => {
  test("its saved places keep the one choice they shared, not the peer's", () => {
    const local = localData();
    delete local.settings.locationProviders;
    local.settings.dataProvider = 'islamiska_forbundet';
    local.settings.dataProviderAuto = false;
    const out = mergeSettings(local.settings, peerData().settings, {
      localLocation: local.location,
      withLocation: false,
    });
    const map = out.locationProviders as Record<string, unknown>;
    expect(map['p-home']).toEqual(IF);
    expect(map['p-malmo']).toEqual(AUTO); // same id on the peer: theirs
    expect(map['peer-ist']).toBeUndefined();
  });

  test('two blobs without a map merge to one without a map', () => {
    const out = mergeSettings(
      { dataProvider: 'aladhan', dataProviderAuto: true },
      { dataProvider: 'diyanet' },
      { localLocation: {}, withLocation: false },
    );
    expect(out).toEqual({ dataProvider: 'diyanet', dataProviderAuto: true });
  });
});

test('settings not accepted: the map is untouched', () => {
  const local = localData();
  const snap = buildSnapshot(peerData(), everything(), NOW);
  const merged = mergeData(local, snap, { ...nothing(), prayers: true });
  expect(merged.settings).toBe(local.settings);
});
