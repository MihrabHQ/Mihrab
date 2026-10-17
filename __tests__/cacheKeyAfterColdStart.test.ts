/**
 * The correction list in force is part of the prayer cache's key, and a
 * downloaded list replaces the bundled one only once its read from storage
 * has finished — a read settings start without waiting for. The first
 * cache read after a cold start used to ask under the BUNDLED list's key
 * and miss the year stored under the downloaded one.
 */
jest.unmock('adhan');

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  // Every read takes a moment, as the storage bridge does on a device.
  getItem: jest.fn(
    (k: string) =>
      new Promise(r => setTimeout(() => r(mockStore[k] ?? null), 5)),
  ),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStore[k];
  }),
}));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('offline');
  }),
}));

const BERLIN = {
  provider: 'diyanet' as const,
  latitude: 52.52,
  longitude: 13.4,
  calculationMethod: 'auto' as const,
  school: 0,
};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.resetModules();
});

test('the first read after a cold start finds the days stored under the downloaded list', async () => {
  // Session 1: a newer Diyanet list was downloaded, and days were stored under it.
  const bundled = require('../src/providers/data/diyanetCorrections.json');
  const newer = { ...bundled, to: '2099-12-31' };
  mockStore['methods.corrections.v1.diyanet'] = JSON.stringify({
    revision: 1,
    list: newer,
  });
  const today = new Date();
  {
    const mc = require('../src/providers/methodCurrency');
    await mc.loadCachedMethodCurrency();
    const ps = require('../src/prayer/prayerStorage');
    await ps.refreshPrayerDataCache(BERLIN, 1);
    const [day] = await ps.getCachedPrayerTimesMany(BERLIN, [today]);
    expect(day).not.toBeNull();
  }

  // Session 2: a cold start. Nothing has read the downloaded list yet —
  // settings start that read without waiting, or have not started it.
  jest.resetModules();
  const ps = require('../src/prayer/prayerStorage');
  const mc = require('../src/providers/methodCurrency');
  const pending = mc.loadCachedMethodCurrency(); // not awaited, as settings do
  const [first] = await ps.getCachedPrayerTimesMany(BERLIN, [today]);
  await pending;
  expect(first).not.toBeNull();
});

test('a read with no one having started the list read still waits for it', async () => {
  const bundled = require('../src/providers/data/diyanetCorrections.json');
  mockStore['methods.corrections.v1.diyanet'] = JSON.stringify({
    revision: 1,
    list: { ...bundled, to: '2099-12-31' },
  });
  const today = new Date();
  {
    const mc = require('../src/providers/methodCurrency');
    await mc.loadCachedMethodCurrency();
    const ps = require('../src/prayer/prayerStorage');
    await ps.refreshPrayerDataCache(BERLIN, 1);
  }
  jest.resetModules();
  const ps = require('../src/prayer/prayerStorage');
  const [first] = await ps.getCachedPrayerTimesMany(BERLIN, [today]);
  expect(first).not.toBeNull();
});
