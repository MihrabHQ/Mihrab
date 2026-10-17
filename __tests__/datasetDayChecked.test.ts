/**
 * A day from a downloaded table is checked before it reaches a screen.
 *
 * Every other source's answer is validated; a national table's day went to
 * the Today card, the widget and the alarms unexamined. An empty time
 * there throws where the card parses it (the crash class of issue #61),
 * and an impossible one ("25:99") or a day out of order sets alarms at
 * nonsense. Such a day is a miss: the chain below it answers instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');

import { getOrFetchPrayerTimes } from '../src/prayer/prayerStorage';
import {
  _resetNationalTablesForTests,
  muisTable,
} from '../src/providers/nationalTables';

type R = { status: number; body?: string };
const resp = ({ status, body = '' }: R) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => body,
  json: async () => JSON.parse(body),
});
let routes: Array<[RegExp, () => R]> = [];
beforeAll(() => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    for (const [re, a] of routes)
      if (re.test(String(url))) return Promise.resolve(resp(a()));
    return Promise.reject(new TypeError('Network request failed'));
  });
});
async function settle<T>(p: Promise<T>) {
  let done = false;
  let out: { v?: T; e?: unknown } = {};
  p.then(
    v => {
      done = true;
      out = { v };
    },
    e => {
      done = true;
      out = { e };
    },
  );
  let ms = 0;
  while (!done && ms < 10 * 60 * 1000) {
    await jest.advanceTimersByTimeAsync(250);
    ms += 250;
  }
  return out;
}

const SG = {
  provider: 'muis' as const,
  latitude: 1.29,
  longitude: 103.85,
  calculationMethod: 'auto' as const,
  school: 0,
};
const day = new Date(2026, 9, 20);
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

async function primeWith(times: string[]) {
  const body = JSON.stringify({
    id: 1,
    city: 'Singapore',
    builtAt: '2099-01-01T00:00:00Z',
    days: { '2026-10-20': times },
  });
  routes = [
    [
      /singapore\/v1\/index\.json/,
      () => ({
        status: 200,
        body: JSON.stringify({
          builtAt: '2099-01-01T00:00:00Z',
          serverStatus: 'ok',
        }),
      }),
    ],
    [/singapore\/v1\/cities\/1\.json/, () => ({ status: 200, body })],
  ];
  await settle(
    muisTable.getTimes({
      latitude: SG.latitude,
      longitude: SG.longitude,
      date: day,
    }),
  );
  await jest.advanceTimersByTimeAsync(5000);
  _resetNationalTablesForTests(); // a new process: memory gone, disk kept
  routes = [];
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 17, 12));
  await AsyncStorage.clear();
  _resetNationalTablesForTests();
});
afterEach(() => jest.useRealTimers());

it('answers a day with an empty or impossible time from the chain below', async () => {
  await primeWith(['05:23', '05:33', '', '12:54', '16:05', '18:56', '25:99']);
  const r = await settle(getOrFetchPrayerTimes({ ...SG, date: day }));
  expect(r.e).toBeUndefined();
  const t = r.v as Record<string, string>;
  for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'])
    expect(t[k]).toMatch(CLOCK);
});

it('answers a day out of order from the chain below', async () => {
  await primeWith([
    '05:23',
    '05:33',
    '06:50',
    '12:54',
    '18:56',
    '16:05',
    '20:05',
  ]);
  const r = await settle(getOrFetchPrayerTimes({ ...SG, date: day }));
  const t = r.v as Record<string, string>;
  expect(t.Asr < t.Maghrib).toBe(true);
});

it('serves a good day as published', async () => {
  await primeWith([
    '05:23',
    '05:33',
    '06:50',
    '12:54',
    '16:05',
    '18:56',
    '20:05',
  ]);
  const r = await settle(getOrFetchPrayerTimes({ ...SG, date: day }));
  expect((r.v as Record<string, string>).Maghrib).toBe('18:56');
});
