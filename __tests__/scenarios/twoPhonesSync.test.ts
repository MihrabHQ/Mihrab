/**
 * SCENARIO 7 — two phones with different settings and places exchange
 * snapshots; a backup goes out and comes back; snapshots from an older and
 * a newer build arrive.
 *
 * Phone A: "My location" by GPS in Stockholm on Automatic, a saved Home.
 * Phone B: on a saved Berlin pinned to Diyanet, a saved New York on the
 * phone's own calculation, Hanafi Asr and a dark theme.
 *
 * Each phone is its own pair of stores (plaintext and encrypted); a sync is
 * B's snapshot read through the same parser a file or the network goes
 * through, applied on A by the real store layer, and read back by the real
 * settings load — which is what Today and every alert are built from.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applySnapshot, collectData } from '../../src/sync/snapshotStore';
import {
  buildSnapshot,
  everything,
  nothing,
  readSnapshot,
  SnapshotError,
  type SyncSelection,
} from '../../src/sync/snapshot';
import {
  loadSettings,
  saveSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../../src/settings/effectiveProvider';
import {
  applyLocationProviders,
  locationKeyOf,
  providerChoiceForKey,
} from '../../src/settings/locationProviders';
import type { PrayerAppSettings } from '../../src/settings/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.mock('../../src/widget/republishWidgetPayload', () => ({
  republishWidgetPayload: jest.fn(async () => {}),
}));

const HOME = {
  id: 'a-home',
  name: 'Home',
  latitude: 59.3293,
  longitude: 18.0686,
};
const BERLIN = {
  id: 'b-berlin',
  name: 'Berlin',
  latitude: 52.52,
  longitude: 13.405,
};
const NYC = {
  id: 'b-nyc',
  name: 'New York',
  latitude: 40.7128,
  longitude: -74.006,
};

type Phone = { plain: Record<string, string>; secure: Record<string, string> };

async function capture(): Promise<Phone> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  return {
    plain: Object.fromEntries(pairs.map(([k, v]) => [k, v as string])),
    secure: { ...EncryptedStorageMock.__peek() },
  };
}

async function become(p: Phone): Promise<void> {
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  for (const [k, v] of Object.entries(p.plain))
    await AsyncStorage.setItem(k, v);
  for (const [k, v] of Object.entries(p.secure))
    await EncryptedStorageMock.default.setItem(k, v);
  _resetSettingsStorageForTests();
}

async function change(
  prev: PrayerAppSettings,
  patch: Partial<PrayerAppSettings>,
) {
  const next = applyLocationProviders(prev, patch);
  await saveSettings(next);
  return next;
}

async function phoneA(): Promise<Phone> {
  await become({ plain: {}, secure: {} });
  let s = await loadSettings();
  s = await change(s, {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationMode: 'automatic',
    lastFetchedLatitude: HOME.latitude,
    lastFetchedLongitude: HOME.longitude,
    locationPresets: [HOME],
  });
  s = await change(s, {
    dataProviderAuto: true,
    dataProvider: 'aladhan',
    appearance: 'light',
  });
  return capture();
}

async function phoneB(): Promise<Phone> {
  await become({ plain: {}, secure: {} });
  let s = await loadSettings();
  s = await change(s, {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationPresets: [BERLIN, NYC],
    school: 1,
    appearance: 'dark',
  });
  s = await change(s, {
    locationMode: 'manual',
    activeLocationPresetId: NYC.id,
    manualLatitude: NYC.latitude,
    manualLongitude: NYC.longitude,
  });
  s = await change(s, { dataProviderAuto: false, dataProvider: 'local_adhan' });
  s = await change(s, {
    activeLocationPresetId: BERLIN.id,
    manualLatitude: BERLIN.latitude,
    manualLongitude: BERLIN.longitude,
  });
  s = await change(s, { dataProviderAuto: false, dataProvider: 'diyanet' });
  return capture();
}

/** `from`'s snapshot, through text, as a file or the network carries it. */
async function snapshotOf(from: Phone, send: SyncSelection) {
  await become(from);
  const snap = buildSnapshot(
    await collectData(),
    send,
    '2026-10-17T10:00:00.000Z',
  );
  return readSnapshot(JSON.parse(JSON.stringify(snap)));
}

/** The source a phone's active location is on, as Today resolves it. */
function activeSource(s: PrayerAppSettings) {
  return {
    key: locationKeyOf(s),
    mirrored: { auto: s.dataProviderAuto, provider: s.dataProvider },
    mapped: s.locationProviders?.[locationKeyOf(s)],
    effective: getEffectiveDataProvider(
      s.dataProviderAuto,
      s.dataProvider,
      resolveCoordsFromSettings(s),
      s.calculationMethod,
    ),
  };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const SETTINGS_ONLY: SyncSelection = { ...nothing(), settings: true };
const WITH_LOCATION: SyncSelection = {
  ...nothing(),
  settings: true,
  location: true,
};

describe('settings without location (the sync default when settings are on)', () => {
  it.each([
    ['B → A', 'a'],
    ['A → B', 'b'],
  ] as const)(
    '%s: the receiving phone stays where it is, on its own source',
    async (_l, receiver) => {
      const A = await phoneA();
      const B = await phoneB();
      const [to, from] = receiver === 'a' ? [A, B] : [B, A];
      await become(to);
      const before = await loadSettings();
      const snap = await snapshotOf(from, SETTINGS_ONLY);
      await become(to);
      const res = await applySnapshot(snap, SETTINGS_ONLY);
      expect(res.applied.settings).toBe(true);
      expect(res.applied.location).toBe(false);
      const after = await loadSettings();

      // The preferences came over…
      expect(after.appearance).toBe(receiver === 'a' ? 'dark' : 'light');
      // …but not the other phone's place: same mode, same active place, same
      // coordinates — nothing that would put this phone on a city it does not
      // know, or on (0, 0).
      expect(after.locationMode).toBe(before.locationMode);
      expect(after.activeLocationPresetId).toBe(before.activeLocationPresetId);
      expect(resolveCoordsFromSettings(after)).toEqual(
        resolveCoordsFromSettings(before),
      );
      // The source the active place is on is the one its own entry says.
      const src = activeSource(after);
      expect(src.mirrored).toEqual(src.mapped);
      // Every saved place still has its source.
      for (const p of after.locationPresets) {
        expect(providerChoiceForKey(after, p.id)).toEqual(
          providerChoiceForKey(before, p.id),
        );
      }
    },
  );
});

describe('settings with location', () => {
  it('B → A: A takes B’s places and B’s active place, on B’s source, coherently', async () => {
    const A = await phoneA();
    const B = await phoneB();
    const snap = await snapshotOf(B, WITH_LOCATION);
    await become(A);
    await applySnapshot(snap, WITH_LOCATION);
    const after = await loadSettings();
    expect(after.locationMode).toBe('manual');
    expect(after.activeLocationPresetId).toBe(BERLIN.id);
    expect(resolveCoordsFromSettings(after)).toEqual({
      latitude: BERLIN.latitude,
      longitude: BERLIN.longitude,
    });
    const src = activeSource(after);
    expect(src.mirrored).toEqual({ auto: false, provider: 'diyanet' });
    expect(src.effective).toBe('diyanet');
    expect(providerChoiceForKey(after, NYC.id)).toEqual({
      auto: false,
      provider: 'local_adhan',
    });
  });

  it('settings declined on the receiving side: nothing about the place moves', async () => {
    const A = await phoneA();
    const B = await phoneB();
    const snap = await snapshotOf(B, everything());
    await become(A);
    const before = await loadSettings();
    await applySnapshot(snap, {
      ...everything(),
      settings: false,
      location: false,
    });
    const after = await loadSettings();
    expect(after).toEqual(before);
  });
});

describe('a backup out and back in', () => {
  it('restores onto an empty phone exactly what was exported', async () => {
    const B = await phoneB();
    await become(B);
    const original = await loadSettings();
    const file = JSON.stringify(
      buildSnapshot(
        await collectData(),
        everything(),
        '2026-10-17T10:00:00.000Z',
      ),
    );
    await become({ plain: {}, secure: {} });
    await applySnapshot(readSnapshot(JSON.parse(file)), everything());
    const restored = await loadSettings();
    expect(restored).toEqual(original);
  });
});

describe('snapshots from other builds', () => {
  it('an older build’s (version 0, fields it never had) is taken without a crash', async () => {
    const A = await phoneA();
    await become(A);
    const before = await loadSettings();
    const old = readSnapshot({
      format: 'mihrab.snapshot',
      // no version, no createdAt
      data: {
        settings: {
          appearance: 'dark',
          dataProvider: 'prayertimes_dev',
          dataProviderAuto: false,
          school: 1,
        },
      },
    });
    expect(old.version).toBe(0);
    await applySnapshot(old, SETTINGS_ONLY);
    const after = await loadSettings();
    expect(after.appearance).toBe('dark');
    expect(after.school).toBe(1);
    expect(after.locationMode).toBe(before.locationMode);
    // Whatever the old build called its source, this build can compute it.
    expect(['aladhan', 'local_adhan', 'islamiska_forbundet']).toContain(
      activeSource(after).effective,
    );
  });

  it('a newer build’s unknown source and unknown fields degrade to Automatic, nothing thrown', async () => {
    const A = await phoneA();
    await become(A);
    const newer = readSnapshot({
      format: 'mihrab.snapshot',
      version: 1,
      createdAt: '2027-01-01T00:00:00.000Z',
      data: {
        settings: {
          dataProvider: 'umm_al_qura_live',
          dataProviderAuto: false,
          locationProviders: {
            my: { auto: false, provider: 'umm_al_qura_live' },
            [HOME.id]: { auto: false, provider: 'umm_al_qura_live' },
          },
          futureFeature: { enabled: true },
          calculationMethod: 77,
        },
      },
    });
    await applySnapshot(newer, SETTINGS_ONLY);
    const after = await loadSettings();
    expect(after.dataProviderAuto).toBe(true);
    expect(after.calculationMethod).toBe('auto');
    expect(providerChoiceForKey(after, HOME.id)).toEqual({
      auto: true,
      provider: 'aladhan',
    });
    expect(activeSource(after).effective).toBe('islamiska_forbundet');
  });

  it('a newer snapshot FORMAT is refused rather than half-read', () => {
    expect(() =>
      readSnapshot({ format: 'mihrab.snapshot', version: 2, data: {} }),
    ).toThrow(SnapshotError);
  });
});
