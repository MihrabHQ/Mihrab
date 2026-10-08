/**
 * Fetching the announced Hijri corrections (src/hijri/overrides.ts): what a
 * phone adopts, what it refuses, and how often it asks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { hijriOverridesUpdated, setHijriOverrides } from '../src/hijri/calendar';
import { loadCachedHijriOverrides, refreshHijriOverrides } from '../src/hijri/overrides';
import bundledFile from '../data/hijri/v1/overrides.json';

const fetchMock = fetchWithRetry as jest.Mock;
const reply = (body: unknown, ok = true) => fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
const file = (updated: string, mabims: unknown[] = []) => ({ schema: 1, updated, mabims, khgt: [] });

beforeEach(async () => {
  fetchMock.mockReset();
  await AsyncStorage.clear();
  setHijriOverrides({ mabims: bundledFile.mabims, khgt: [] }, bundledFile.updated);
});

it('adopts a newer file and keeps a copy for the next launch', async () => {
  reply(file('2099-01-01T00:00:00Z'));
  await expect(refreshHijriOverrides(true)).resolves.toBe(true);
  expect(hijriOverridesUpdated()).toBe('2099-01-01T00:00:00Z');
  expect(JSON.parse((await AsyncStorage.getItem('hijri.overrides.v1'))!).updated).toBe('2099-01-01T00:00:00Z');
});

it('keeps what it has for a file no newer than it', async () => {
  reply(file(bundledFile.updated));
  await expect(refreshHijriOverrides(true)).resolves.toBe(false);
  reply(file('2000-01-01'));
  await expect(refreshHijriOverrides(true)).resolves.toBe(false);
  expect(hijriOverridesUpdated()).toBe(bundledFile.updated);
});

it('refuses a malformed file whole, however new it says it is', async () => {
  reply(file('2099-01-01', [{ year: 1448, month: 9, start: '2027-02-30' }]));
  await expect(refreshHijriOverrides(true)).resolves.toBe(false);
  expect(hijriOverridesUpdated()).toBe(bundledFile.updated);
});

it('survives the server being down', async () => {
  reply(null, false);
  await expect(refreshHijriOverrides(true)).resolves.toBe(false);
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await expect(refreshHijriOverrides(true)).resolves.toBe(false);
});

it('asks at most once per interval, but at once after the clock went back', async () => {
  reply(file('2000-01-01'));
  await refreshHijriOverrides(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await refreshHijriOverrides();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await AsyncStorage.setItem('hijri.overrides.v1.checkedAt', String(Date.now() + 86_400_000));
  reply(file('2000-01-01'));
  await refreshHijriOverrides();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('shares one request between overlapping calls', async () => {
  reply(file('2099-01-01'));
  const [a, b] = await Promise.all([refreshHijriOverrides(true), refreshHijriOverrides(true)]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(a).toBe(b);
});

it('takes the cached copy at launch only when it is newer than the bundled one', async () => {
  await AsyncStorage.setItem('hijri.overrides.v1', JSON.stringify(file('2000-01-01')));
  await loadCachedHijriOverrides();
  expect(hijriOverridesUpdated()).toBe(bundledFile.updated);
  await AsyncStorage.setItem('hijri.overrides.v1', JSON.stringify(file('2099-06-01')));
  await loadCachedHijriOverrides();
  expect(hijriOverridesUpdated()).toBe('2099-06-01');
});
