/**
 * SCENARIO 8 — the phone's clock against the server's (#82).
 *
 * Node's zone data here is from before Morocco left GMT+1, which is exactly
 * the stale phone in the issue: Africa/Casablanca at +1 in October 2026.
 * The skew is learnt the way the app learns it — from the `Date` header of
 * the certification the app polls anyway — and the times are the Moroccan
 * ministry's, read through the real provider chain:
 *
 *   • clock set back by hand to the wall clocks (the server is an hour
 *     ahead of the phone): the ministry's GMT strings;
 *   • network time (no skew): the phone's own (+1) strings, an hour later;
 *   • a measurement more than three days old is not trusted: the phone's.
 *
 * Either way the instant the phone's clock reaches the string is the
 * ministry's instant as the phone measures time — which is what an alert
 * scheduled on it does.
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import {
  _resetClockSkewForTests,
  CLOCK_SKEW_MAX_AGE_MS,
  deviceClockSkewSeconds,
} from '../../src/providers/clockSkew';
import {
  _resetMethodCurrencyForTests,
  methodCurrencyReady,
  refreshMethodCurrency,
} from '../../src/providers/methodCurrency';
import { _resetZoneDataMemoForTests } from '../../src/providers/locationClock';
import { _resetCorrectionsForTests } from '../../src/providers/swedenCorrections';
import {
  goOnline,
  response,
  setZone,
  toMin,
} from '../fixtures/scenarioHarness';

const RABAT = { latitude: 34.0209, longitude: -6.8416 };
const PHONE_NOW = new Date('2026-10-17T09:00:00Z');
const params = (date: Date) => ({
  provider: 'habous' as const,
  ...RABAT,
  calculationMethod: 'auto' as const,
  school: 0,
  date,
});

function serverAt(serverMs: number) {
  return goOnline(url =>
    url.includes('certification.json')
      ? response(200, {}, { Date: new Date(serverMs).toUTCString() })
      : undefined,
  );
}

async function freshLaunch(at: Date) {
  jest.setSystemTime(at);
  _resetClockSkewForTests();
  _resetMethodCurrencyForTests();
  _resetZoneDataMemoForTests();
  _resetCorrectionsForTests();
  prayerStorage._resetCacheSweepForTests();
}

beforeAll(() => setZone('Africa/Casablanca'));
beforeEach(async () => {
  jest.useFakeTimers({
    now: PHONE_NOW,
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
  await AsyncStorage.clear();
  await freshLaunch(PHONE_NOW);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('this process is the stale phone the scenario needs', () => {
  expect(-new Date('2026-12-01T12:00:00Z').getTimezoneOffset()).toBe(60);
});

it('clock by hand: GMT strings; network time: the phone’s; stale skew: the phone’s', async () => {
  // Network time first: the server agrees with the phone.
  serverAt(PHONE_NOW.getTime());
  await refreshMethodCurrency(true);
  expect(deviceClockSkewSeconds()).toBe(0);
  const day1 = new Date(2026, 9, 18, 12);
  const network = await prayerStorage.getOrFetchPrayerDay(params(day1));

  // A phone set back by hand: the server is an hour ahead of it.
  await freshLaunch(PHONE_NOW);
  serverAt(PHONE_NOW.getTime() + 3600_000);
  await refreshMethodCurrency(true);
  expect(deviceClockSkewSeconds()).toBe(3600);
  const byHand = await prayerStorage.getOrFetchPrayerDay(params(day1));

  for (const k of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const) {
    expect(toMin(network.timings[k]) - toMin(byHand.timings[k])).toBe(60);
  }
  // Both are read on the phone's clock: that is the clock the strings were
  // written for (the by-hand ones in GMT precisely so they read right on it).
  expect(network.clock).toBe('device');
  expect(byHand.clock).toBe('device');

  // The measurement survives a relaunch (read back before the first cache
  // read)…
  await freshLaunch(new Date(PHONE_NOW.getTime() + 3600_000));
  goOnline(() => undefined);
  await methodCurrencyReady();
  expect(deviceClockSkewSeconds()).toBe(3600);
  const relaunched = await prayerStorage.getOrFetchPrayerDay(
    params(new Date(2026, 9, 19, 12)),
  );
  const networkNext = network.timings.Fajr; // a day later moves Fajr by a minute at most
  expect(
    Math.abs(toMin(networkNext) - 60 - toMin(relaunched.timings.Fajr)),
  ).toBeLessThanOrEqual(1);

  // …but not past three days: then nothing is known, and the phone's clock
  // is taken as right.
  await freshLaunch(
    new Date(PHONE_NOW.getTime() + CLOCK_SKEW_MAX_AGE_MS + 60_000),
  );
  await methodCurrencyReady();
  expect(deviceClockSkewSeconds()).toBe(0);
  const expired = await prayerStorage.getOrFetchPrayerDay(
    params(new Date(2026, 9, 21, 12)),
  );
  expect(
    Math.abs(toMin(expired.timings.Fajr) - toMin(network.timings.Fajr)),
  ).toBeLessThanOrEqual(3);
});

it('a response with no Date header, or a garbled one, leaves the skew as it was', async () => {
  serverAt(PHONE_NOW.getTime() + 3600_000);
  await refreshMethodCurrency(true);
  expect(deviceClockSkewSeconds()).toBe(3600);
  goOnline(url =>
    url.includes('certification.json')
      ? response(200, {}, { Date: 'yesterday-ish' })
      : undefined,
  );
  await refreshMethodCurrency(true);
  expect(deviceClockSkewSeconds()).toBe(3600);
  goOnline(url =>
    url.includes('certification.json') ? response(200, {}) : undefined,
  );
  await refreshMethodCurrency(true);
  expect(deviceClockSkewSeconds()).toBe(3600);
});
