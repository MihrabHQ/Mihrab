/**
 * SCENARIO 4 — four saved places, four sources, one phone in Stockholm.
 *
 * Rabat pinned to the Moroccan ministry, Stockholm on Automatic, Berlin
 * pinned to Diyanet and New York pinned to the on-device calculation. Each
 * place keeps its own source across switches, saves and relaunches; each
 * shows its own times — real instants on the clock they are written on —
 * and the widget's longer window is the place's on screen, never the one
 * left behind. Offline throughout: every one of these is computed on the
 * phone.
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { getEffectiveDataProvider } from '../../src/settings/effectiveProvider';
import { providerChoiceForPreset } from '../../src/settings/locationProviders';
import {
  loadSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { _resetCalculationPreferencesForTests } from '../../src/prayer/calculationPreferences';
import { combineLocalDateAndTime } from '../../src/utils/prayerTimes';
import type {
  LocationPreset,
  PrayerAppSettings,
} from '../../src/settings/types';
import {
  changeSettings,
  expectDrawableDay,
  goOffline,
  mountPrayerDay,
  setZone,
  until,
  settle,
  type HookProbe,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.setTimeout(60_000);
const NOW = new Date('2026-10-17T10:00:00Z');

type Place = LocationPreset & {
  source: { auto: boolean; provider: PrayerDataProviderIdish };
  effective: string;
  /** Fajr in UTC hours that day, roughly: [from, to). */
  fajrUtc: [number, number];
  clock: string | undefined;
};
type PrayerDataProviderIdish = PrayerAppSettings['dataProvider'];

const PLACES: Place[] = [
  {
    id: 'p-rabat',
    name: 'Rabat',
    latitude: 34.0209,
    longitude: -6.8416,
    source: { auto: false, provider: 'habous' },
    effective: 'habous',
    fajrUtc: [5, 6.5],
    // The ministry prints GMT; a phone in Stockholm reads it on that clock.
    clock: 'Etc/GMT',
  },
  {
    id: 'p-sthlm',
    name: 'Stockholm',
    latitude: 59.3293,
    longitude: 18.0686,
    source: { auto: true, provider: 'aladhan' },
    effective: 'islamiska_forbundet',
    fajrUtc: [3, 4.5],
    clock: undefined,
  },
  {
    id: 'p-berlin',
    name: 'Berlin',
    latitude: 52.52,
    longitude: 13.405,
    source: { auto: false, provider: 'diyanet' },
    effective: 'diyanet',
    fajrUtc: [3, 4.5],
    clock: undefined,
  },
  {
    id: 'p-nyc',
    name: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
    source: { auto: false, provider: 'local_adhan' },
    effective: 'local_adhan',
    fajrUtc: [9.5, 11],
    clock: undefined,
  },
];

beforeEach(async () => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'performance',
      'setImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'nextTick',
      'queueMicrotask',
    ],
  });
  setZone('Europe/Stockholm');
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  _resetSettingsStorageForTests();
  _resetTimezoneShiftForTests();
  _resetMethodCurrencyForTests();
  _resetCalculationPreferencesForTests();
  prayerStorage._resetCacheSweepForTests();
  (NetInfo.addEventListener as jest.Mock).mockImplementation(() => () => {});
  jest.spyOn(prayerStorage, 'refreshPrayerDataCache').mockResolvedValue();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  goOffline();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** The four places saved, each given its source the way Settings gives it. */
async function savePlaces(): Promise<PrayerAppSettings> {
  let s = await loadSettings();
  s = await changeSettings(s, {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationPresets: PLACES.map(({ id, name, latitude, longitude }) => ({
      id,
      name,
      latitude,
      longitude,
    })),
  });
  for (const p of PLACES) {
    s = await changeSettings(s, {
      locationMode: 'manual',
      activeLocationPresetId: p.id,
      manualLatitude: p.latitude,
      manualLongitude: p.longitude,
      manualLocationLabel: p.name,
    });
    s = await changeSettings(s, {
      dataProviderAuto: p.source.auto,
      dataProvider: p.source.provider,
    });
  }
  return s;
}

async function switchTo(
  s: PrayerAppSettings,
  p: Place,
): Promise<PrayerAppSettings> {
  return changeSettings(s, {
    locationMode: 'manual',
    activeLocationPresetId: p.id,
    manualLatitude: p.latitude,
    manualLongitude: p.longitude,
    manualLocationLabel: p.name,
  });
}

async function settledFor(probe: HookProbe, since: number, p: Place) {
  await until(
    () =>
      probe.states
        .slice(since)
        .some(
          x =>
            x.phase === 'ready' && !x.provisional && x.latitude === p.latitude,
        ),
    `${p.name}: settled`,
    20_000,
  );
  // And the widget's window, which lands a moment later (after the first
  // paint): as long as the cache reaches, at least the week.
  await settle(10);
  const c = probe.current();
  if (c.phase !== 'ready') throw new Error('not ready');
  return c;
}

it('each place keeps its own source and shows its own times', async () => {
  let s = await savePlaces();
  // Saved and read back: every place's choice survived the writes.
  const reread = await loadSettings();
  for (const p of PLACES) {
    expect(providerChoiceForPreset(reread, p)).toEqual(p.source);
  }

  // Open on the last place saved, then round the four and back to the
  // first: each source comes back with its place.
  const probe = await mountPrayerDay(reread);
  await settledFor(probe, 0, PLACES[3]);
  s = reread;
  for (const p of [...PLACES, PLACES[0]]) {
    const since = probe.states.length;
    s = await switchTo(s, p);
    await probe.rerender(s);
    const st = await settledFor(probe, since, p);

    expect({ auto: s.dataProviderAuto, provider: s.dataProvider }).toEqual(
      p.source,
    );
    expect(
      getEffectiveDataProvider(
        s.dataProviderAuto,
        s.dataProvider,
        p,
        s.calculationMethod,
      ),
    ).toBe(p.effective);
    expect(st.longitude).toBe(p.longitude);
    expect(st.clock).toBe(p.clock);
    expectDrawableDay(st.today);
    const fajr = combineLocalDateAndTime(st.baseDate, st.today.Fajr, st.clock);
    const h = fajr.getUTCHours() + fajr.getUTCMinutes() / 60;
    expect(h).toBeGreaterThanOrEqual(p.fajrUtc[0]);
    expect(h).toBeLessThan(p.fajrUtc[1]);
    // The widget's window is this place's: it starts with the week on
    // screen (the week's last night times lean on the next day's Fajr,
    // which only the longer window has — so up to that day).
    const n = st.week.length - 1;
    expect(st.widgetWeek.slice(0, n)).toEqual(st.week.slice(0, n));
  }
  probe.unmount();

  // A relaunch on the last place opens on it, with its source.
  const after = await loadSettings();
  expect(after.activeLocationPresetId).toBe(PLACES[0].id);
  expect({
    auto: after.dataProviderAuto,
    provider: after.dataProvider,
  }).toEqual(PLACES[0].source);
  for (const p of PLACES) {
    expect(providerChoiceForPreset(after, p)).toEqual(p.source);
  }
});

it('a fast burst of switches lands on the last place, never a mix', async () => {
  let s = await savePlaces();
  s = await switchTo(s, PLACES[0]);
  const probe = await mountPrayerDay(s);
  await settledFor(probe, 0, PLACES[0]);
  const since = probe.states.length;
  for (const p of [PLACES[1], PLACES[2], PLACES[3]]) {
    s = await switchTo(s, p);
    await probe.rerender(s);
  }
  const last = PLACES[3];
  const st = await settledFor(probe, since, last);
  expect(st.longitude).toBe(last.longitude);
  // Give the stragglers of the burst every chance to land on top.
  await new Promise(r => setTimeout(r, 700));
  await settle(10);
  const end = probe.current();
  if (end.phase !== 'ready') throw new Error('not ready');
  expect(end.longitude).toBe(last.longitude);
  const n = end.week.length - 1;
  expect(end.widgetWeek.slice(0, n)).toEqual(end.week.slice(0, n));
  probe.unmount();
});
