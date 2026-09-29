/**
 * What quranState.ts does today, pinned before it is split
 * (docs/rewrite-plan.md, Phase 2, step 2.1).
 *
 * The coverage run found the file 97.8% line-covered, but the gaps were not
 * random: they sat on deletions and on the tie-breaks of the sync merge —
 * the two kinds of behaviour a move between files can change without any
 * test noticing, because nothing asserts them. `abandonKhatmah` itself was
 * never called by a test. These pin what the code does now, so steps 2.2 to
 * 2.4 can move it and prove it moved unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetQuranStateForTests,
  coerceQuranState,
  DEFAULT_QURAN_STATE,
  getQuranState,
  hydrateQuranState,
  isQuranHydrated,
  subscribeQuranState,
  updateQuranState,
} from '../src/quran/quranState';
import type { KhatmahPlan, QuranBookmark } from '../src/quran/quranTypes';
import {
  activeKhatmah,
  KHATMAH_TOMBSTONE_TTL_DAYS,
} from '../src/quran/khatmahProgress';
import {
  khatmahPaceToday,
  khatmahPortionOf,
  planDays,
} from '../src/quran/khatmahSchedule';
import {
  abandonKhatmah,
  recordKhatmahProgress,
  resetKhatmahAll,
  startKhatmah,
} from '../src/quran/khatmahActions';
import { addBookmark, setLastRead } from '../src/quran/readerMarks';
import { mergeFasting, mergeKhatmah, mergeQuran } from '../src/sync/merge';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 10, 12, 0, 0, 0).getTime();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['performance'] });
  __resetQuranStateForTests();
});
afterEach(() => jest.useRealTimers());

// ── Deleting a khatmah ───────────────────────────────────────────────

describe('abandoning a khatmah', () => {
  it('dates the plan rather than dropping it, so the news can travel', () => {
    startKhatmah(30);
    const plan = activeKhatmah(getQuranState())!;
    jest.setSystemTime(NOW + 1000);
    abandonKhatmah(plan.id);
    const s = getQuranState();
    expect(activeKhatmah(s)).toBeUndefined();
    const row = s.khatmah.find(k => k.id === plan.id)!;
    expect(row.abandonedAt).toBe(NOW + 1000);
  });

  it('keeps the first date when asked twice', () => {
    startKhatmah(30);
    const id = activeKhatmah(getQuranState())!.id;
    abandonKhatmah(id);
    jest.setSystemTime(NOW + 5 * DAY);
    abandonKhatmah(id);
    expect(getQuranState().khatmah.find(k => k.id === id)!.abandonedAt).toBe(
      NOW,
    );
  });

  it('touches no other plan', () => {
    startKhatmah(30);
    const first = activeKhatmah(getQuranState())!.id;
    abandonKhatmah(first);
    jest.setSystemTime(NOW + DAY);
    startKhatmah(60);
    const second = activeKhatmah(getQuranState())!.id;
    abandonKhatmah('not-a-plan');
    const s = getQuranState();
    expect(activeKhatmah(s)!.id).toBe(second);
    // A new plan does not sweep the tombstone away: it still has to travel.
    expect(s.khatmah.find(k => k.id === first)!.abandonedAt).toBe(NOW);
  });

  it('keeps only a skeleton once no device could still be arguing about it', () => {
    const plan = (abandonedAt: number) => ({
      version: 1,
      khatmah: [
        {
          id: 'gone',
          startedAt: NOW - 200 * DAY,
          targetDays: 30,
          pagesRead: 10,
          completedAt: null,
          abandonedAt,
        },
      ],
    });
    const ttl = KHATMAH_TOMBSTONE_TTL_DAYS * DAY;
    expect(coerceQuranState(plan(NOW - ttl + DAY)).khatmah[0].pagesRead).toBe(10);
    // Dropped, an offline device's copy of the plan came back open and took
    // the khatmah over; kept as a skeleton, the ending still travels.
    expect(coerceQuranState(plan(NOW - ttl - DAY)).khatmah).toEqual([
      {
        id: 'gone',
        startedAt: NOW - 200 * DAY,
        targetDays: 30,
        pagesRead: 0,
        completedAt: null,
        abandonedAt: NOW - ttl - DAY,
      },
    ]);
  });
});

// ── One bookmark per ayah, after a sync ──────────────────────────────

describe('two bookmarks a sync left on one ayah', () => {
  const on255 = (id: string, createdAt: number): QuranBookmark => ({
    id,
    surah: 2,
    ayah: 255,
    page: 42,
    color: 'emerald',
    createdAt,
  });

  it('become one when the ayah is bookmarked again, and the other is recorded as removed', () => {
    updateQuranState(prev => ({
      ...prev,
      bookmarks: [on255('phone', NOW - 2 * DAY), on255('mac', NOW - DAY)],
    }));
    addBookmark(2, 255, 42, 'amber');
    const s = getQuranState();
    const left = s.bookmarks.filter(b => b.surah === 2 && b.ayah === 255);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe('phone');
    expect(left[0].color).toBe('amber');
    expect(s.bookmarksRemoved?.map(r => r.id)).toEqual(['mac']);
  });

  it('and the other device, which still has it, does not hand it back', () => {
    updateQuranState(prev => ({
      ...prev,
      bookmarks: [on255('phone', NOW - 2 * DAY), on255('mac', NOW - DAY)],
    }));
    addBookmark(2, 255, 42, 'amber');
    const here = getQuranState();
    const there = {
      ...here,
      bookmarks: [on255('phone', NOW - 2 * DAY), on255('mac', NOW - DAY)],
      bookmarksRemoved: [],
    };
    for (const merged of [mergeQuran(here, there), mergeQuran(there, here)]) {
      expect(merged.bookmarks.map(b => b.id)).toEqual(['phone']);
    }
  });
});

// ── The merge decides a tie the same way on both devices ─────────────

describe('merge ties are commutative', () => {
  const base = (over: Partial<KhatmahPlan>): KhatmahPlan => ({
    id: 'k',
    startedAt: NOW - 10 * DAY,
    targetDays: 30,
    pagesRead: 40,
    completedAt: null,
    ...over,
  });
  const both = (a: KhatmahPlan, b: KhatmahPlan) => {
    const ab = mergeKhatmah([a], [b]);
    const ba = mergeKhatmah([b], [a]);
    expect(ab).toEqual(ba);
    return ab[0];
  };

  it('paced in the same millisecond: a date and none — going back to a duration wins', () => {
    const merged = both(
      base({ pacedAt: NOW, deadline: '2026-10-10', pacedFrom: 40 }),
      base({ pacedAt: NOW, pacedFrom: 40 }),
    );
    expect(merged.deadline).toBeUndefined();
  });

  it('paced in the same millisecond: two dates — the later wins', () => {
    const merged = both(
      base({ pacedAt: NOW, deadline: '2026-10-10', pacedFrom: 40 }),
      base({ pacedAt: NOW, deadline: '2026-10-20', pacedFrom: 40 }),
    );
    expect(merged.deadline).toBe('2026-10-20');
  });

  it('paced in the same millisecond: two lengths — the longer wins', () => {
    const merged = both(
      base({ pacedAt: NOW, targetDays: 30, pacedFrom: 40 }),
      base({ pacedAt: NOW, targetDays: 45, pacedFrom: 40 }),
    );
    expect(merged.targetDays).toBe(45);
  });

  it('never paced on either side: the longer length and the later date are kept', () => {
    const merged = both(
      base({ targetDays: 30, deadline: '2026-10-10' }),
      base({ targetDays: 60, deadline: '2026-10-01' }),
    );
    expect(merged.targetDays).toBe(60);
    expect(merged.deadline).toBe('2026-10-10');
  });

  it('two pins placed in the same millisecond: the one further through the book', () => {
    const merged = both(
      base({ positionAt: NOW, position: { surah: 2, ayah: 1, page: 2 } }),
      base({ positionAt: NOW, position: { surah: 3, ayah: 1, page: 50 } }),
    );
    expect(merged.position?.page).toBe(50);
  });

  it('a pin and a cleared pin in the same millisecond: the clearing', () => {
    const merged = both(
      base({ positionAt: NOW, position: { surah: 2, ayah: 1, page: 2 } }),
      base({ positionAt: NOW }),
    );
    expect(merged.position ?? null).toBeNull();
  });
});

describe('a fast logged on two devices in the same instant', () => {
  const fast = (over: object) => ({
    date: '2026-09-10',
    type: 'ramadan',
    completed: false,
    loggedAt: '2026-09-10T18:00:00.000Z',
    ...over,
  });

  it('a clearing outranks a live entry, whichever side has it', () => {
    const a = [fast({ completed: true })];
    const b = [fast({ cleared: true })];
    for (const merged of [
      mergeFasting(a as never, b as never),
      mergeFasting(b as never, a as never),
    ]) {
      expect((merged[0] as { cleared?: boolean }).cleared).toBe(true);
    }
  });

  it('between two live entries, the completed one', () => {
    const a = [fast({ completed: false })];
    const b = [fast({ completed: true })];
    for (const merged of [
      mergeFasting(a as never, b as never),
      mergeFasting(b as never, a as never),
    ]) {
      expect(merged[0].completed).toBe(true);
    }
  });

  it('entries for different days come back in date order, then by type', () => {
    const a = [
      fast({ date: '2026-09-12' }),
      fast({ date: '2026-09-10', type: 'voluntary' }),
    ];
    const b = [fast({ date: '2026-09-10' })];
    for (const merged of [
      mergeFasting(a as never, b as never),
      mergeFasting(b as never, a as never),
    ]) {
      expect(merged.map(f => `${f.date} ${f.type}`)).toEqual([
        '2026-09-10 ramadan',
        '2026-09-10 voluntary',
        '2026-09-12 ramadan',
      ]);
    }
  });
});

// ── Today's cut: when it goes, and what it answers ───────────────────

describe("today's cut", () => {
  const live = () => activeKhatmah(getQuranState())!;

  it('is dropped from a duration plan by its first progress write', () => {
    // A cut left on a plan without a date — synced from a device that
    // still had one — is read by nothing and would travel forever.
    startKhatmah(30);
    updateQuranState(prev => ({
      ...prev,
      khatmah: prev.khatmah.map(k => ({
        ...k,
        pace: { day: '2026-09-10', from: 1, to: 300, at: NOW },
      })),
    }));
    expect(live().pace).toBeDefined();
    recordKhatmahProgress(3, undefined, 1);
    expect(live().pace).toBeUndefined();
    expect(live().pagesRead).toBe(3);
  });

  it('is dropped when a dated plan is started again, and cut afresh from its start', () => {
    startKhatmah(30, undefined, '2026-09-20');
    recordKhatmahProgress(20, undefined, 1);
    expect(live().pace).toBeDefined();
    resetKhatmahAll();
    expect(live().pace).toBeUndefined();
    expect(khatmahPaceToday(live())!.from).toBe(1);
  });

  it('measures portions past today in lengths of today, up to the last day', () => {
    startKhatmah(30, undefined, '2026-09-20');
    const plan = live();
    const pace = khatmahPaceToday(plan, NOW)!;
    const len = pace.to - pace.from + 1;
    const today = khatmahPortionOf(plan, pace.to, NOW);
    expect(today).toBe(1);
    expect(khatmahPortionOf(plan, pace.to + 1, NOW)).toBe(today + 1);
    expect(khatmahPortionOf(plan, pace.to + len, NOW)).toBe(today + 1);
    expect(khatmahPortionOf(plan, pace.to + len + 1, NOW)).toBe(today + 2);
    // Al-Baqarah's long ayahs make day one short in ayahs, so the last
    // ayah is more of them away than there are days: it is capped.
    expect(khatmahPortionOf(plan, 6236, NOW)).toBe(planDays(plan));
  });
});

// ── The disk failing ─────────────────────────────────────────────────

describe('when the disk fails', () => {
  /** Past the microtask the write is queued on, and the write itself. */
  const flush = () => new Promise<void>(r => setTimeout(r, 0));
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    jest.useRealTimers();
    await AsyncStorage.clear();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it.each([
    [
      'cannot be read',
      () =>
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
          new Error('io'),
        ),
    ],
    [
      'holds something that is not JSON',
      () =>
        (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('{not json'),
    ],
  ])(
    'the store that %s starts from the defaults, and says it is ready',
    async (_, fail) => {
      fail();
      const told = jest.fn();
      subscribeQuranState(told);
      await expect(hydrateQuranState()).resolves.toBeUndefined();
      expect(getQuranState()).toBe(DEFAULT_QURAN_STATE);
      expect(isQuranHydrated()).toBe(true);
      expect(told).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        'quranState: hydrate failed, using defaults',
        expect.anything(),
      );
      // Once is enough: it is not retried on the next call.
      await hydrateQuranState();
      expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
    },
  );

  it('a write that fails does not hold up the next one', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('full'),
    );
    setLastRead({ surah: 2, ayah: 5, page: 3, mode: 'mushaf' });
    await flush();
    expect(warn).toHaveBeenCalledWith(
      'quranState: persist failed',
      expect.anything(),
    );
    setLastRead({ surah: 2, ayah: 6, page: 3, mode: 'mushaf' });
    await flush();
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1][1] as string).lastRead.ayah).toBe(6);
  });
});
