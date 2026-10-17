/**
 * Türkiye Takvimi on a network that takes requests and never answers.
 *
 * With the city's tile on the phone and the mirror and the site both
 * black-holed, the first answer used to come after about 72 s: the mirror
 * twice at 20 s, the site twice at 15 s, with the waits between. The first
 * answer of a session now spends one short attempt on each, the year is
 * fetched again in the background with the long timeouts, and the next
 * read does not wait for that. And while the week loads, what is painted
 * is the calendar's own method, not the settings' one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');

import {
  _resetNamazvaktiForTests,
  _settleNamazvaktiRefillsForTests,
  computeNamazvaktiMethodTimes,
} from '../src/providers/namazvakti';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { buildProvisionalWeek } from '../src/hooks/usePrayerDay';
import { addDays } from '../src/utils/prayerTimes';

const TILE = JSON.stringify({
  v: 1,
  tile: '50_5',
  cities: [[5887, 50.9333, 6.95, 'Köln']],
});
const AT = { latitude: 50.94, longitude: 6.96 };

const HANG = 'hang';
type Route = [RegExp, () => { status: number; body: string } | typeof HANG];
let routes: Route[] = [];
const calls: string[] = [];

function resp(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

beforeAll(() => {
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, init?: RequestInit) => {
      calls.push(String(url));
      for (const [re, answer] of routes) {
        if (!re.test(String(url))) continue;
        const out = answer();
        if (out === HANG) {
          return new Promise((_, reject) =>
            init?.signal?.addEventListener('abort', () => {
              const e = new Error('Aborted');
              e.name = 'AbortError';
              reject(e);
            }),
          );
        }
        return Promise.resolve(resp(out.status, out.body));
      }
      return Promise.resolve(resp(404, 'Not Found'));
    },
  );
});

/** Run a promise under fake timers; how long (ms of fake time) it took. */
async function timed<T>(
  p: Promise<T>,
): Promise<{ value?: T; error?: unknown; ms: number }> {
  let done = false;
  let out: { value?: T; error?: unknown } = {};
  p.then(
    value => {
      done = true;
      out = { value };
    },
    error => {
      done = true;
      out = { error };
    },
  );
  let ms = 0;
  while (!done && ms < 10 * 60 * 1000) {
    await jest.advanceTimersByTimeAsync(250);
    ms += 250;
  }
  return { ...out, ms };
}

const ask = () =>
  fetchPrayerTimesUnified({
    provider: 'namazvakti',
    ...AT,
    date: new Date(2026, 9, 17),
    calculationMethod: 'auto',
    school: 0,
  });

describe('namazvakti on a black-holed network', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 17, 12));
    await AsyncStorage.clear();
    _resetNamazvaktiForTests();
    calls.length = 0;
  });
  afterEach(() => jest.useRealTimers());

  it('tile held, mirror and site hang: the first answer comes within 15 s', async () => {
    await AsyncStorage.setItem(
      'namazvakti.tile.v1.50_5',
      JSON.stringify({
        fetchedAt: Date.now(),
        cities: JSON.parse(TILE).cities,
      }),
    );
    routes = [[/./, () => HANG]];
    const r = await timed(ask());
    expect(r.error).toBeUndefined();
    expect(r.value!.source).toBe('local');
    expect(r.ms).toBeLessThan(15_000);
  });

  it('then the year is asked again in the background, and the next read does not wait for it', async () => {
    routes = [
      [/tiles\/50_5/, () => ({ status: 200, body: TILE })],
      [/./, () => HANG],
    ];
    const first = await timed(ask());
    expect(first.ms).toBeLessThan(15_000);
    const mirrorAsks = () =>
      calls.filter(u => /data-namazvakti-2026/.test(u)).length;
    // The quick attempt, and the background refill's first on the long timeouts.
    expect(mirrorAsks()).toBe(2);
    // A read meanwhile is answered at once, computed.
    const second = await timed(ask());
    expect(second.value!.source).toBe('local');
    expect(second.ms).toBeLessThanOrEqual(250);
    // The refill runs its full course and gives up quietly.
    const settled = await timed(_settleNamazvaktiRefillsForTests());
    expect(settled.ms).toBeGreaterThan(20_000);
    expect(mirrorAsks()).toBe(3);
  });

  it('nothing held and every host hangs: the first answer comes within 15 s', async () => {
    routes = [[/./, () => HANG]];
    const r = await timed(ask());
    expect(r.value!.source).toBe('local');
    expect(r.ms).toBeLessThan(15_000);
  });
});

describe('the week painted while the times load', () => {
  const now = new Date(2026, 9, 17);
  const KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

  it("is the calendar's method for Türkiye Takvimi", () => {
    const week = buildProvisionalWeek({
      ...AT,
      calculationMethod: 'auto',
      school: 0,
      prayerOffsets: undefined,
      now,
      provider: 'namazvakti',
    })!;
    expect(week).toHaveLength(7);
    week.forEach((day, i) => {
      const method = computeNamazvaktiMethodTimes({
        ...AT,
        date: addDays(now, i),
        school: 0,
      }).timings;
      for (const k of KEYS) expect(day[k]).toBe(method[k]);
    });
  });

  it("and the settings' method for the rest", () => {
    const calendar = buildProvisionalWeek({
      ...AT,
      calculationMethod: 3,
      school: 0,
      prayerOffsets: undefined,
      now,
      provider: 'namazvakti',
    })!;
    const aladhan = buildProvisionalWeek({
      ...AT,
      calculationMethod: 3,
      school: 0,
      prayerOffsets: undefined,
      now,
      provider: 'aladhan',
    })!;
    // The same Fajr angle (18°), but the temkin moves the rest.
    expect(calendar[0].Maghrib).not.toBe(aladhan[0].Maghrib);
    expect(calendar[0].Isha).not.toBe(aladhan[0].Isha);
  });
});
