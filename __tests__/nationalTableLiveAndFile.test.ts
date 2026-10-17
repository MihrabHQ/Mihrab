/**
 * A national table's backup request and its downloaded city file.
 *
 * - The source's own API answers a whole year per request, and the cache
 *   fill asks four days at once: each missed the repo's copy in the same
 *   instant and fired its own full-year download. One request now serves
 *   every day asking for it at once.
 * - A downloaded city file with `"days": null` passed `typeof === 'object'`,
 *   was stored, and every read of the table then threw on it. A file whose
 *   days are not a plain object is not stored, and one stored before is
 *   not read.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createNationalTable,
  isCityFile,
} from '../src/providers/nationalTable';
import type { DatasetDayTuple } from '../src/providers/datasetTuple';

const PLACE = { id: 1, name: 'Singapore', lat: 1.29, lon: 103.85 };
const AT = { latitude: 1.29, longitude: 103.85 };
const TUPLE: DatasetDayTuple = [
  '05:23',
  '05:33',
  '06:50',
  '12:54',
  '16:05',
  '18:56',
  '20:05',
];
const base = {
  id: 'testtable',
  dataset: 'muis' as const,
  timezone: 'Asia/Singapore',
  places: [PLACE],
  maxPlaceKm: 50,
  refreshTtlMs: 7 * 86400000,
  indexPollIntervalMs: 86400000,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('the backup request', () => {
  it('four days asked at once that the repo copy lacks: one request', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const live = jest.fn(async () => {
      await gate;
      const days: Record<string, DatasetDayTuple> = {};
      for (let d = 1; d <= 31; d++)
        days[`2026-10-${String(d).padStart(2, '0')}`] = TUPLE;
      return days;
    });
    const table = createNationalTable({ ...base, live });
    const asks = [17, 18, 19, 20].map(d =>
      table.getTimes({ ...AT, date: new Date(2026, 9, d) }),
    );
    await new Promise(r => setTimeout(r, 0));
    release();
    const answers = await Promise.all(asks);
    expect(live).toHaveBeenCalledTimes(1);
    for (const a of answers) {
      expect(a.source).toBe('live');
      expect(a.timings.Fajr).toBe('05:33');
    }
    // Kept on the phone once, for the next session.
    expect(await AsyncStorage.getItem('testtable.live.v1.1')).not.toBeNull();
  });

  it('asks again once the request has settled', async () => {
    const live = jest.fn(async () => ({ '2026-10-17': TUPLE }));
    const table = createNationalTable({ ...base, live });
    await table.getTimes({ ...AT, date: new Date(2026, 9, 17) });
    table._resetForTests();
    await table.getTimes({ ...AT, date: new Date(2026, 9, 17) });
    // Read back from the phone's copy, not asked again.
    expect(live).toHaveBeenCalledTimes(1);
    await AsyncStorage.clear();
    table._resetForTests();
    await table.getTimes({ ...AT, date: new Date(2026, 9, 17) });
    expect(live).toHaveBeenCalledTimes(2);
  });
});

describe('a downloaded city file', () => {
  it('is kept only when its days are a plain object', () => {
    expect(
      isCityFile({ id: 1, builtAt: 'x', days: { '2026-10-17': TUPLE } }),
    ).toBe(true);
    expect(isCityFile({ id: 1, builtAt: 'x', days: {} })).toBe(true);
    expect(isCityFile({ id: 1, builtAt: 'x', days: null })).toBe(false);
    expect(isCityFile({ id: 1, builtAt: 'x', days: [] })).toBe(false);
    expect(isCityFile({ id: 1, builtAt: 'x', days: 'nope' })).toBe(false);
    expect(isCityFile({ id: 1, builtAt: 'x' })).toBe(false);
    expect(isCityFile(null)).toBe(false);
    expect(isCityFile([])).toBe(false);
  });

  const resp = (body: unknown) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  for (const days of [null, [], 'nope']) {
    it(`with "days": ${JSON.stringify(
      days,
    )} is not stored, and the table still answers`, async () => {
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        if (url.endsWith('/index.json'))
          return resp({ builtAt: '2099-01-01T00:00:00Z' });
        if (url.endsWith('/cities/1.json')) {
          return resp({
            id: 1,
            city: 'Singapore',
            builtAt: '2099-01-01T00:00:00Z',
            days,
          });
        }
        throw new TypeError('Network request failed');
      });
      const calculate = jest.fn(() => ({
        timings: {
          Fajr: '05:30',
          Sunrise: '06:50',
          Dhuhr: '12:54',
          Asr: '16:05',
          Maghrib: '18:56',
          Isha: '20:05',
        },
        source: 'local' as const,
      }));
      const table = createNationalTable({
        ...base,
        baseUrl: 'https://example.test/t',
        calculate,
      });
      await table.getTimes({ ...AT, date: new Date(2026, 9, 17) });
      // Let the background refresh land.
      for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
      expect(
        await AsyncStorage.getItem('testtable.dataset.v1.city.1'),
      ).toBeNull();
      table._resetForTests();
      const again = await table.getTimes({
        ...AT,
        date: new Date(2026, 9, 17),
      });
      expect(again.timings.Fajr).toBe('05:30');
    });
  }

  it('stored by an earlier version with "days": null is not read', async () => {
    await AsyncStorage.setItem(
      'testtable.dataset.v1.city.1',
      JSON.stringify({
        id: 1,
        city: 'Singapore',
        builtAt: '2099-01-01T00:00:00Z',
        days: null,
      }),
    );
    (global.fetch as jest.Mock).mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });
    const calculate = jest.fn(() => ({
      timings: {
        Fajr: '05:30',
        Sunrise: '06:50',
        Dhuhr: '12:54',
        Asr: '16:05',
        Maghrib: '18:56',
        Isha: '20:05',
      },
      source: 'local' as const,
    }));
    const table = createNationalTable({
      ...base,
      baseUrl: 'https://example.test/t',
      calculate,
    });
    const day = await table.getTimes({ ...AT, date: new Date(2026, 9, 17) });
    expect(day.timings.Fajr).toBe('05:30');
  });
});
