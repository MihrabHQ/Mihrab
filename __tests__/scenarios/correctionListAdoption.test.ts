/**
 * SCENARIO 6 — a newer correction list arrives.
 *
 * A reader in Skåne whose times are Sweden's method computed on the phone
 * (AlAdhan as the source, method 24: the cache holds the days) has a week
 * stored. The certification names a newer Swedish list; the list is
 * downloaded and put in force. From then on the cache key is the new list's,
 * the days are computed again offline with the new entry in them, and the
 * next launch sweeps the slot stored under the old one. A list certified for
 * another revision of the method is refused, and so is a file that is not
 * the list the certification names, or not a list at all — and a corrupt
 * copy on disk of one authority's list does not cost the others theirs.
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import {
  _resetMethodCurrencyForTests,
  loadCachedMethodCurrency,
  methodCurrency,
  refreshMethodCurrency,
} from '../../src/providers/methodCurrency';
import {
  _resetCorrectionsForTests,
  correctionFor,
  correctionsInForce,
  correctionsKey,
  type Corrections,
} from '../../src/providers/swedenCorrections';
import { METHOD_REVISION } from '../../src/providers/methodRevisions';
import { SWEDEN_METHOD_ID } from '../../src/providers/swedenMethodId';
import { _resetClockSkewForTests } from '../../src/providers/clockSkew';
import {
  goOffline,
  goOnline,
  readCacheBlob,
  response,
  setZone,
  settle,
  toMin,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bundledSweden =
  require('../../src/providers/data/swedenCorrections.json') as Corrections;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bundledMorocco =
  require('../../src/providers/data/moroccoCorrections.json') as Corrections;

jest.setTimeout(30_000);
const NOW = new Date('2026-10-17T10:00:00Z');
/** A listed Swedish point (the bundled list's first). */
const POINT = '55.376,13.159';
const [LAT, LNG] = POINT.split(',').map(Number);
const PARAMS = {
  provider: 'aladhan' as const,
  latitude: LAT,
  longitude: LNG,
  calculationMethod: SWEDEN_METHOD_ID,
  school: 0,
};
const DAY = new Date(2026, 9, 18, 12); // the day the newer list moves

/** The bundled list, a year longer, with one more entry: Fajr +1 on the 18th. */
const NEWER: Corrections = {
  ...bundledSweden,
  to: '2028-12-31',
  points: {
    ...bundledSweden.points,
    [POINT]: [...(bundledSweden.points[POINT] ?? []), '2026-10-18 fajr +1'],
  },
};
const summary = (l: Corrections) => ({
  from: l.from,
  to: l.to,
  entries: Object.values(l.points).reduce((n, e) => n + e.length, 0),
});

const CERT_URL = 'mihrab-methods/main/certification.json';
const LIST_URL = 'data/corrections/sweden.json';

function methodsServer(
  cert: unknown,
  list: unknown,
  date = 'Sat, 17 Oct 2026 10:00:00 GMT',
) {
  return goOnline(url => {
    if (url.includes(CERT_URL)) return response(200, cert, { Date: date });
    if (url.includes(LIST_URL)) return response(200, list);
    return undefined;
  });
}

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
  _resetMethodCurrencyForTests();
  _resetCorrectionsForTests();
  _resetClockSkewForTests();
  prayerStorage._resetCacheSweepForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function storedWeek() {
  goOffline();
  const out = [];
  for (let i = 0; i < 3; i++) {
    out.push(
      await prayerStorage.getOrFetchPrayerDay({
        ...PARAMS,
        date: new Date(2026, 9, 17 + i, 12),
      }),
    );
  }
  await settle(5);
  return out;
}

it('a newer list: new key, recomputed offline, the old slot swept next launch', async () => {
  const oldKey = correctionsKey('sweden');
  const before = await storedWeek();
  let keys = Object.keys((await readCacheBlob())!.caches);
  expect(keys).toHaveLength(1);
  expect(keys[0]).toContain(`cl=${oldKey}`);

  const fetchMock = methodsServer(
    {
      sweden: {
        certified: true,
        revision: METHOD_REVISION.sweden,
        corrections: summary(NEWER),
      },
    },
    NEWER,
  );
  expect(await refreshMethodCurrency(true)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(correctionsInForce('sweden').to).toBe('2028-12-31');
  expect(correctionFor('sweden', LAT, LNG, 2026, 9, 18)).toEqual({ fajr: 1 });
  expect(methodCurrency('sweden', new Date(2028, 5, 1))).toEqual({
    state: 'current',
  });

  // Offline again: the 18th is computed afresh under the new list.
  goOffline();
  const again = await prayerStorage.getOrFetchPrayerDay({
    ...PARAMS,
    date: DAY,
  });
  expect(toMin(again.timings.Fajr)).toBe(toMin(before[1].timings.Fajr) + 1);
  expect(again.timings.Dhuhr).toBe(before[1].timings.Dhuhr);
  await settle(5);
  keys = Object.keys((await readCacheBlob())!.caches);
  expect(keys.some(k => k.includes(`cl=${correctionsKey('sweden')}`))).toBe(
    true,
  );
  expect(correctionsKey('sweden')).not.toBe(oldKey);

  // Next launch: the list is read back from disk before the first cache
  // read, and the slot under the old list goes.
  _resetMethodCurrencyForTests();
  _resetCorrectionsForTests();
  prayerStorage._resetCacheSweepForTests();
  void loadCachedMethodCurrency();
  const [fromCache] = await prayerStorage.getCachedPrayerTimesMany(PARAMS, [
    DAY,
  ]);
  expect(fromCache?.Fajr).toBe(again.timings.Fajr);
  keys = Object.keys((await readCacheBlob())!.caches);
  expect(keys.some(k => k.includes(`cl=${oldKey}`))).toBe(false);
  expect(keys).toHaveLength(1);
});

it('a list for another revision of the method is refused, and says the app needs an update', async () => {
  const before = correctionsKey('sweden');
  const fetchMock = methodsServer(
    {
      sweden: {
        certified: true,
        revision: METHOD_REVISION.sweden + 1,
        corrections: summary(NEWER),
      },
    },
    NEWER,
  );
  expect(await refreshMethodCurrency(true)).toBe(false);
  // The list itself is not even asked for.
  expect(fetchMock.mock.calls.some(c => String(c[0]).includes(LIST_URL))).toBe(
    false,
  );
  expect(correctionsKey('sweden')).toBe(before);
  expect(methodCurrency('sweden', NOW)).toEqual({ state: 'update' });
});

it.each([
  ['not the list the certification names', { ...NEWER, to: '2028-06-30' }],
  [
    'not a list at all',
    {
      from: '2026-01-01',
      to: '2028-12-31',
      points: { Stockholm: ['tomorrow fajr +5'] },
    },
  ],
  ['a truncated download', '{"from":"2024-01-01","to":"2028-'],
])('a corrupt file (%s) is refused whole', async (_label, file) => {
  const before = correctionsKey('sweden');
  methodsServer(
    {
      sweden: {
        certified: true,
        revision: METHOD_REVISION.sweden,
        corrections: summary(NEWER),
      },
    },
    file,
  );
  expect(await refreshMethodCurrency(true)).toBe(false);
  expect(correctionsKey('sweden')).toBe(before);
  // Nothing was stored for the next launch to pick up either.
  expect(
    await AsyncStorage.getItem('methods.corrections.v1.sweden'),
  ).toBeNull();
});

it("a corrupt copy on disk of one authority's list does not cost another its own", async () => {
  const newerMorocco: Corrections = {
    ...bundledMorocco,
    to: '2027-03-01',
    points: {
      ...bundledMorocco.points,
      '34.022,-6.844': ['2027-02-01 fajr +1'],
    },
  };
  await AsyncStorage.setItem(
    'methods.corrections.v1.sweden',
    '{"revision":1,"list":{',
  );
  await AsyncStorage.setItem(
    'methods.corrections.v1.morocco',
    JSON.stringify({ revision: METHOD_REVISION.morocco, list: newerMorocco }),
  );
  await loadCachedMethodCurrency();
  expect(correctionsInForce('morocco').to).toBe('2027-03-01');
  expect(correctionsInForce('sweden').to).toBe(bundledSweden.to);
});

it('a download cut short for one authority does not cost another its list in the same round', async () => {
  const newerMorocco: Corrections = {
    ...bundledMorocco,
    to: '2027-03-01',
    points: {
      ...bundledMorocco.points,
      '34.022,-6.844': ['2027-02-01 fajr +1'],
    },
  };
  goOnline(url => {
    if (url.includes(CERT_URL)) {
      return response(200, {
        sweden: {
          certified: true,
          revision: METHOD_REVISION.sweden,
          corrections: summary(NEWER),
        },
        morocco: {
          certified: true,
          revision: METHOD_REVISION.morocco,
          corrections: summary(newerMorocco),
        },
      });
    }
    if (url.includes(LIST_URL))
      return response(200, '{"from":"2024-01-01","to":"2028-');
    if (url.includes('data/corrections/morocco.json'))
      return response(200, newerMorocco);
    return undefined;
  });
  expect(await refreshMethodCurrency(true)).toBe(true);
  expect(correctionsInForce('sweden').to).toBe(bundledSweden.to);
  expect(correctionsInForce('morocco').to).toBe('2027-03-01');
});
