/**
 * SCENARIO 3 — changing settings while Today is open.
 *
 * A reader on a pinned AlAdhan place changes, one at a time, the things
 * that decide their times and the things that only decide how they are
 * drawn. The first kind must reach the screen (a fresh answer, from the
 * cache under its own key or from the server); the second must reach it
 * without a single request. Keys for different answers must not collide,
 * or one setting's year would be served under another's.
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import {
  loadSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { _resetCalculationPreferencesForTests } from '../../src/prayer/calculationPreferences';
import { formatClock } from '../../src/utils/clockFormat';
import type { PrayerAppSettings } from '../../src/settings/types';
import {
  aladhanServer,
  changeSettings,
  expectDrawableDay,
  goOnline,
  mountPrayerDay,
  readCacheBlob,
  setZone,
  toMin,
  until,
  type HookProbe,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.setTimeout(30_000);
const NOW = new Date('2026-10-17T10:00:00Z');
const BERLIN = { latitude: 52.52, longitude: 13.405 };
/** The cache key's place part, as `prayerStorage` rounds it. */
const AT = `${BERLIN.latitude.toFixed(2)}|${BERLIN.longitude.toFixed(2)}`;

let server: ReturnType<typeof aladhanServer>;
let fetchMock: jest.Mock;

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
  setZone('Europe/Berlin');
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
  server = aladhanServer('Europe/Berlin');
  fetchMock = goOnline(server.handler);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function berlinReader(): Promise<PrayerAppSettings> {
  const first = await loadSettings();
  return changeSettings(first, {
    locationMode: 'manual',
    manualLatitude: BERLIN.latitude,
    manualLongitude: BERLIN.longitude,
    manualLocationLabel: 'Berlin',
    locationOnboardingComplete: true,
    onboardingComplete: true,
    dataProvider: 'aladhan',
    dataProviderAuto: false,
    calculationMethod: 3,
    school: 0,
  });
}

/** The settled (non-provisional) state after `since` states were seen. */
async function nextSettled(probe: HookProbe, since: number, what: string) {
  await until(
    () =>
      probe.states
        .slice(since)
        .some(
          s => s.phase === 'ready' && !s.provisional && !s.backgroundRefreshing,
        ),
    what,
  );
  const s = probe.states
    .slice(since)
    .reverse()
    .find(x => x.phase === 'ready' && !x.provisional)!;
  if (s.phase !== 'ready') throw new Error('not ready');
  return s;
}

const timingsQueries = () =>
  fetchMock.mock.calls.filter(c => String(c[0]).includes('/timings/')).length;

describe('a change that decides the times reaches the screen', () => {
  it('method: fetched under its own key, the other kept', async () => {
    let s = await berlinReader();
    const probe = await mountPrayerDay(s);
    const before = await nextSettled(probe, 0, 'first week');
    expect(before.today.Isha).toBe('19:13'); // method 3

    const seen = probe.states.length;
    s = await changeSettings(s, { calculationMethod: 2 });
    await probe.rerender(s);
    const after = await nextSettled(probe, seen, 'week under method 2');
    expect(after.today.Isha).toBe('19:12'); // method 2

    const keys = Object.keys((await readCacheBlob())!.caches);
    expect(keys.some(k => k.startsWith(`aladhan|${AT}|3|0|`))).toBe(true);
    expect(keys.some(k => k.startsWith(`aladhan|${AT}|2|0|`))).toBe(true);
    probe.unmount();
  });

  it('school: Asr moves', async () => {
    let s = await berlinReader();
    const probe = await mountPrayerDay(s);
    const before = await nextSettled(probe, 0, 'first week');
    expect(before.today.Asr).toBe('15:00');
    const seen = probe.states.length;
    s = await changeSettings(s, { school: 1 });
    await probe.rerender(s);
    const after = await nextSettled(probe, seen, 'Hanafi week');
    expect(after.today.Asr).toBe('15:40');
    probe.unmount();
  });

  it('high-latitude rule: asked again under the new rule, under its own key', async () => {
    let s = await berlinReader();
    const probe = await mountPrayerDay(s);
    await nextSettled(probe, 0, 'first week');
    const asked = server.seen.length;

    const seen = probe.states.length;
    s = await changeSettings(s, { highLatitudeRule: 'seventh_of_night' });
    await probe.rerender(s);
    await until(
      () =>
        server.seen
          .slice(asked)
          .some(u => u.searchParams.get('latitudeAdjustmentMethod') === '2'),
      'a request under the seventh-of-the-night rule',
    );
    await nextSettled(probe, seen, 'week under the new rule');
    const keys = Object.keys((await readCacheBlob())!.caches);
    expect(keys.some(k => k.includes('hl=seventh_of_night'))).toBe(true);
    probe.unmount();
  });

  it('custom angles under method 99: asked again with the new angles', async () => {
    let s = await berlinReader();
    s = await changeSettings(s, {
      calculationMethod: 99,
      customFajrAngle: 18,
      customIshaAngle: 17,
    });
    const probe = await mountPrayerDay(s);
    await nextSettled(probe, 0, 'first week');
    expect(
      server.seen.some(
        u => u.searchParams.get('methodSettings') === '18,null,17',
      ),
    ).toBe(true);
    const asked = server.seen.length;

    const seen = probe.states.length;
    s = await changeSettings(s, { customFajrAngle: 15 });
    await probe.rerender(s);
    await until(
      () =>
        server.seen
          .slice(asked)
          .some(u => u.searchParams.get('methodSettings') === '15,null,17'),
      'a request with the new Fajr angle',
    );
    await nextSettled(probe, seen, 'week under the new angles');
    const keys = Object.keys((await readCacheBlob())!.caches);
    expect(keys.some(k => k.includes('ca=18/17'))).toBe(true);
    expect(keys.some(k => k.includes('ca=15/17'))).toBe(true);
    probe.unmount();
  });
});

describe('a change that only decides the drawing costs no request', () => {
  it('per-prayer offsets and the Imsak offset move the rows, not the cache', async () => {
    let s = await berlinReader();
    const probe = await mountPrayerDay(s);
    const before = await nextSettled(probe, 0, 'first week');
    const queries = timingsQueries();
    const blobBefore = JSON.stringify(await readCacheBlob());

    const seen = probe.states.length;
    s = await changeSettings(s, {
      prayerOffsets: { Maghrib: 5, Fajr: -3, Imsak: -10 },
    });
    await probe.rerender(s);
    const after = await nextSettled(probe, seen, 'week with offsets');
    expect(toMin(after.today.Maghrib)).toBe(toMin(before.today.Maghrib) + 5);
    expect(toMin(after.today.Fajr)).toBe(toMin(before.today.Fajr) - 3);
    expect(toMin(after.today.Imsak!)).toBe(toMin(before.today.Imsak!) - 10);
    // Every day of the week, not just today.
    after.week.forEach((d, i) =>
      expect(toMin(d.Maghrib)).toBe(toMin(before.week[i].Maghrib) + 5),
    );
    // The cache stays raw, and nothing was asked of the server.
    expect(timingsQueries()).toBe(queries);
    const blobAfter = await readCacheBlob();
    for (const e of Object.values(blobAfter!.caches)) {
      for (const day of Object.values(e.months['2026-10'] ?? {})) {
        expect((day as Record<string, string>).Maghrib).toBe('18:00');
      }
    }
    expect(Object.keys(blobAfter!.caches)).toEqual(
      Object.keys(JSON.parse(blobBefore).caches),
    );

    // And a later launch reads the offsets back as they were set.
    const reread = await loadSettings();
    expect(reread.prayerOffsets).toEqual({ Maghrib: 5, Fajr: -3, Imsak: -10 });
    probe.unmount();
  });

  it.each(['ar', 'ur', 'bn'] as const)(
    'language %s and the 12/24-hour clock: no reload, Latin digits a parser can read',
    async language => {
      let s = await berlinReader();
      const probe = await mountPrayerDay(s);
      const before = await nextSettled(probe, 0, 'first week');
      const states = probe.states.length;
      const queries = timingsQueries();
      s = await changeSettings(s, {
        language,
        languagePicked: true,
        clockFormat: '12',
      });
      await probe.rerender(s);
      // Nothing the hook holds depends on either: no new state at all.
      expect(probe.states.length).toBe(states);
      expect(timingsQueries()).toBe(queries);
      for (const key of ['Fajr', 'Dhuhr', 'Maghrib', 'Isha'] as const) {
        const shown = formatClock(before.today[key], true, language);
        // The digits of the clock stay Latin (the design: `clockParts`),
        // so the hour and minute read back are the stored ones.
        const m = /(\d{1,2}):(\d{2})/.exec(shown);
        expect(m).not.toBeNull();
        const h24 = toMin(before.today[key]);
        expect(Number(m![2])).toBe(h24 % 60);
        expect(Number(m![1])).toBe(((Math.floor(h24 / 60) + 11) % 12) + 1);
      }
      const reread = await loadSettings();
      expect(reread.language).toBe(language);
      expect(reread.clockFormat).toBe('12');
      expectDrawableDay(before.today);
      probe.unmount();
    },
  );
});
