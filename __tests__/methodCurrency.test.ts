/**
 * The app says when a computed authority's calculation is not current, and
 * takes a newer correction list for the method it computes by itself.
 */
const mockFetch = jest.fn();
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: (...a: unknown[]) => mockFetch(...a) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  _resetMethodCurrencyForTests,
  loadCachedMethodCurrency,
  methodAuthorityFor,
  methodCurrency,
  refreshMethodCurrency,
} from '../src/providers/methodCurrency';
import { _resetCorrectionsForTests, correctionFor, correctionsInForce, correctionsKey } from '../src/providers/swedenCorrections';
import { METHOD_REVISION } from '../src/providers/methodRevisions';

const ok = (body: unknown) => ({ ok: true, json: async () => body });
const certification = (over: Record<string, unknown> = {}) => ({
  morocco: { certified: true, revision: METHOD_REVISION.morocco, corrections: correctionsInForce('morocco'), ...over },
});
const newer = {
  from: '2026-08-27',
  to: '2027-01-10',
  points: { '34.022,-6.844': ['2027-01-05 fajr +1'] },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockFetch.mockReset();
  _resetMethodCurrencyForTests();
  _resetCorrectionsForTests();
});

describe('whose calculation it is', () => {
  it('follows the source, and a ministry’s method by hand only inside its country', () => {
    expect(methodAuthorityFor('habous', 'auto', 34.02, -6.84)).toBe('morocco');
    expect(methodAuthorityFor('habous', 'auto', 34.88, -1.31)).toBe('algeria'); // Tlemcen
    expect(methodAuthorityFor('marw', 'auto', 36.75, 3.06)).toBe('algeria');
    expect(methodAuthorityFor('kemenag', 'auto', -6.2, 106.85)).toBe('indonesia');
    expect(methodAuthorityFor('islamiska_forbundet', 'auto', 59.33, 18.07)).toBe('sweden');
    expect(methodAuthorityFor('diyanet', 'auto', 41.01, 28.98)).toBe('diyanet');
    expect(methodAuthorityFor('aladhan', 21, 34.02, -6.84)).toBe('morocco');
    expect(methodAuthorityFor('aladhan', 'auto', -6.2, 106.85)).toBe('indonesia');
    expect(methodAuthorityFor('aladhan', 21, 51.5, -0.12)).toBeNull();
    expect(methodAuthorityFor('aladhan', 3, 34.02, -6.84)).toBeNull();
    expect(methodAuthorityFor('muis', 'auto', 1.35, 103.82)).toBeNull();
  });
});

describe('is it current', () => {
  it('is, inside the correction list', () => {
    const { from } = correctionsInForce('morocco');
    const [y, m, d] = from.split('-').map(Number);
    expect(methodCurrency('morocco', new Date(y, m - 1, d + 1))).toEqual({ state: 'current' });
  });

  it('says when the day is past the list, and until when it ran', () => {
    const { to } = correctionsInForce('morocco');
    expect(methodCurrency('morocco', new Date(2031, 0, 1))).toEqual({ state: 'beyond', to });
  });

  it('says when the authority’s newest tables are not yet certified', async () => {
    mockFetch.mockResolvedValueOnce(ok(certification({ certified: false })));
    await refreshMethodCurrency(true);
    expect(methodCurrency('morocco').state).toBe('checking');
  });

  it('asks for an app update when the method has moved on, and takes no list for it', async () => {
    mockFetch.mockResolvedValueOnce(
      ok(certification({ revision: METHOD_REVISION.morocco + 1, corrections: { from: newer.from, to: newer.to, entries: 1 } })),
    );
    expect(await refreshMethodCurrency(true)).toBe(false);
    expect(methodCurrency('morocco').state).toBe('update');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('a newer list for this build’s method', () => {
  it('is downloaded, put in force, kept, and changes what is stored under it', async () => {
    const keyBefore = correctionsKey('morocco');
    mockFetch
      .mockResolvedValueOnce(ok(certification({ corrections: { from: newer.from, to: newer.to, entries: 1 } })))
      .mockResolvedValueOnce(ok(newer));
    expect(await refreshMethodCurrency(true)).toBe(true);
    expect(correctionsInForce('morocco')).toEqual({ from: newer.from, to: newer.to, entries: 1 });
    expect(correctionFor('morocco', 34.022, -6.844, 2027, 0, 5)).toEqual({ fajr: 1 });
    expect(correctionsKey('morocco')).not.toBe(keyBefore);
    expect(methodCurrency('morocco', new Date(2027, 0, 8)).state).toBe('current');

    // The next launch starts from the bundled list and takes the stored one back.
    _resetCorrectionsForTests();
    await loadCachedMethodCurrency();
    expect(correctionsInForce('morocco').to).toBe(newer.to);
  });

  it('is refused when the file is not the list the certification names', async () => {
    mockFetch
      .mockResolvedValueOnce(ok(certification({ corrections: { from: newer.from, to: newer.to, entries: 2 } })))
      .mockResolvedValueOnce(ok(newer));
    expect(await refreshMethodCurrency(true)).toBe(false);
    expect(correctionsInForce('morocco').to).not.toBe(newer.to);
  });

  it('is refused when it is not the shape of a list', async () => {
    mockFetch
      .mockResolvedValueOnce(ok(certification({ corrections: { from: newer.from, to: newer.to, entries: 1 } })))
      .mockResolvedValueOnce(ok({ ...newer, points: { '34.022,-6.844': ['2027-01-05 fajr +5'] } }));
    expect(await refreshMethodCurrency(true)).toBe(false);
  });

  it('is asked for at most twice a day', async () => {
    mockFetch.mockResolvedValue(ok(certification()));
    await refreshMethodCurrency(true);
    await refreshMethodCurrency();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
