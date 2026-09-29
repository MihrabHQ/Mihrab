/**
 * Four khatmah bugs found in the rewrite's review (2026-09-29), each held
 * here by the case that showed it.
 */
import {
  __resetQuranStateForTests,
  adoptQuranState,
  coerceQuranState,
  getQuranState,
  primeQuranState,
} from '../src/quran/quranState';
import {
  activeKhatmah,
  ayahsThroughHafsPage,
  khatmahReachAyah,
  oneLivePlan,
} from '../src/quran/khatmahProgress';
import {
  finishKhatmahPortion,
  recordKhatmahPageTurn,
  startKhatmah,
  stepKhatmahBack,
} from '../src/quran/khatmahActions';
import { mergeKhatmah, mergeQuran } from '../src/sync/merge';
import type { KhatmahPlan, QuranState } from '../src/quran/quranTypes';

const DAY = 24 * 60 * 60 * 1000;
const START = new Date(2026, 8, 20, 10, 0, 0, 0).getTime();
const wire = (s: QuranState) => coerceQuranState(JSON.parse(JSON.stringify(s)));

const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
};

function turnPages(from: number, to: number) {
  for (let p = from; p < to; p++) {
    jest.setSystemTime(Date.now() + 30_000);
    recordKhatmahPageTurn(p, p + 1);
  }
}

beforeEach(() => {
  jest.useFakeTimers({ now: START, doNotFake: ['performance'] });
  __resetQuranStateForTests();
});
afterEach(() => jest.useRealTimers());

describe('an ending outlives the tombstone TTL', () => {
  it('keeps the current khatmah when an offline copy of an old one returns', () => {
    startKhatmah(30);
    turnPages(1, 101);
    const old = activeKhatmah(getQuranState())!;
    const offline = wire(getQuranState()); // a device leaves, holding it live
    jest.setSystemTime(Date.now() + DAY);
    startKhatmah(60); // abandons the old plan
    turnPages(1, 21);
    const current = activeKhatmah(getQuranState())!;
    jest.setSystemTime(Date.now() + 91 * DAY);
    primeQuranState(JSON.parse(JSON.stringify(getQuranState()))); // a restart re-reads the blob
    adoptQuranState(mergeQuran(getQuranState(), offline));
    // Dropped, the old plan came back open and — 100 pages to 20 — took over.
    expect(activeKhatmah(getQuranState())!.id).toBe(current.id);
    expect(
      getQuranState().khatmah.find(k => k.id === old.id)?.abandonedAt,
    ).toBeDefined();
  });
});

describe('"previous day" on a plan by date', () => {
  it('goes back one day, in pages, from a day read part-way', () => {
    startKhatmah(10, undefined, ymd(START + 10 * DAY));
    finishKhatmahPortion();
    const endOfDay1 = khatmahReachAyah(activeKhatmah(getQuranState())!);
    jest.setSystemTime(START + DAY);
    finishKhatmahPortion();
    jest.setSystemTime(START + 2 * DAY);
    turnPages(130, 140);
    stepKhatmahBack();
    // Counted in ayahs it went back to 288, fifty ayahs into day one.
    expect(khatmahReachAyah(activeKhatmah(getQuranState())!)).toBe(endOfDay1);
  });
});

describe('"most progress" between two live plans', () => {
  const plan = (
    id: string,
    startedAt: number,
    fromPage: number,
    toPage: number,
  ): KhatmahPlan => ({
    id,
    startedAt,
    targetDays: 30,
    pagesRead: toPage - fromPage + 1,
    completedAt: null,
    done: [
      [ayahsThroughHafsPage(fromPage - 1) + 1, ayahsThroughHafsPage(toPage)],
    ],
  });

  it('is counted in pages: ten of al-Baqarah beat five of Juzʾ ʿAmma', () => {
    const front = plan('front', START, 1, 10); // ~76 ayahs
    const back = plan('back', START - DAY, 585, 589); // ~150 ayahs, and older
    const kept = oneLivePlan([front, back]).find(k => k.supersededBy == null)!;
    expect(kept.id).toBe('front');
  });

  it('ranks the same whichever side a merge is given first', () => {
    const a = plan('a', START, 1, 10);
    const b = plan('b', START, 585, 589);
    expect(mergeKhatmah([a], [b])).toEqual(mergeKhatmah([b], [a]));
  });
});

describe('the merged list', () => {
  it('is ordered the same on both devices when two plans share a start', () => {
    const a: KhatmahPlan = {
      id: 'a',
      startedAt: 5,
      targetDays: 30,
      pagesRead: 0,
      completedAt: 1,
    };
    const b: KhatmahPlan = {
      id: 'b',
      startedAt: 5,
      targetDays: 30,
      pagesRead: 0,
      completedAt: 2,
    };
    expect(mergeKhatmah([a], [b])).toEqual(mergeKhatmah([b], [a]));
  });
});
