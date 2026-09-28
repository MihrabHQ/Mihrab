/**
 * The edits the khatmah's writers make, asked directly.
 *
 * Every one of these is also exercised through a writer (the khatmah
 * suites reach them via `khatmahActions`), but only in the combinations
 * the writers happen to produce. Since the store was split
 * (docs/rewrite-plan.md, Phase 2) they are a module of their own, and the
 * promises their comments make are pinned here where they are made.
 */
import {
  doneFilled,
  doneRewound,
  pacingStamp,
  pinned,
  planStart,
  repaced,
  settled,
  unpaced,
  withDaySnapshot,
  withMarks,
  withPaceOfDay,
} from '../src/quran/khatmahEdits';
import {
  ayahsThroughPage,
  pagesThroughAyahs,
} from '../src/quran/khatmahProgress';
import type { KhatmahPlan } from '../src/quran/quranTypes';
import { DEFAULT_RIWAYAH } from '../src/quran/riwayat';

const NOW = new Date(2026, 8, 10, 12, 0, 0, 0).getTime();
const plan = (over: Partial<KhatmahPlan> = {}): KhatmahPlan => ({
  id: 'k',
  startedAt: NOW - 5 * 24 * 60 * 60 * 1000,
  targetDays: 30,
  pagesRead: 0,
  completedAt: null,
  ...over,
});

beforeEach(() => jest.useFakeTimers({ now: NOW, doNotFake: ['performance'] }));
afterEach(() => jest.useRealTimers());

describe('the pin and its date', () => {
  const here = { surah: 2, ayah: 5, page: 3 };

  it('an unchanged pin keeps the date it had', () => {
    const p = plan({ position: here, positionAt: NOW - 1000 });
    expect(pinned(p, { ...here })).toEqual({
      position: here,
      positionAt: NOW - 1000,
    });
  });

  it('a moved pin is dated after the last one, even with the clock behind', () => {
    const p = plan({ position: here, positionAt: NOW + 5000 });
    const next = pinned(p, { surah: 3, ayah: 1, page: 50 });
    expect(next.position).toEqual({ surah: 3, ayah: 1, page: 50 });
    expect(next.positionAt).toBe(NOW + 5001);
  });

  it('clearing a pin is a change and is dated; clearing none is not', () => {
    expect(pinned(plan({ position: here }), null)).toEqual({
      position: null,
      positionAt: NOW,
    });
    expect(pinned(plan(), null)).toEqual({ position: null });
  });
});

describe('the claim log', () => {
  it('dates claims made together a millisecond apart, in the order made', () => {
    const marks = withMarks(plan(), [
      [1, 10, 1],
      [5, 6, 0],
    ])!;
    // The read is kept as the parts the denial did not take back.
    expect(marks.filter(m => m[3] === 1).every(m => m[2] === NOW)).toBe(true);
    expect(marks.filter(m => m[3] === 0)).toEqual([[5, 6, NOW + 1, 0]]);
  });

  it('dates a new claim past the newest it already holds', () => {
    const p = plan({ marks: [[1, 10, NOW + 50, 1]] });
    const marks = withMarks(p, [[20, 30, 1]])!;
    expect(marks[marks.length - 1][2]).toBe(NOW + 51);
  });

  it('a turn over ground the log already calls read changes nothing, not even the array', () => {
    const p = plan({ marks: [[1, 10, NOW - 10, 1]] });
    expect(withMarks(p, [[3, 4, 1]], true)).toBe(p.marks);
  });

  it('a claim that runs backwards is not a claim', () => {
    const p = plan({ marks: [[1, 10, NOW - 10, 1]] });
    expect(withMarks(p, [[9, 3, 1]])).toBe(p.marks);
  });
});

describe('what every writer stores', () => {
  it('the mirror is the unbroken run from the start, never past a hole', () => {
    const s = settled(
      plan(),
      [
        [1, 100],
        [200, 300],
      ],
      undefined,
    );
    expect(s.ayahsRead).toBe(100);
    expect(s.pagesRead).toBe(pagesThroughAyahs(100));
    expect(s).not.toHaveProperty('marks');
  });

  it('the set is stored with the claims already replayed', () => {
    const s = settled(plan(), [[1, 100]], [[50, 60, NOW, 0]]);
    expect(s.done).toEqual([
      [1, 49],
      [61, 100],
    ]);
    expect(s.ayahsRead).toBe(49);
  });

  it('a rewind takes back everything past the point, a fill claims up to it', () => {
    const p = plan({
      done: [
        [1, 100],
        [200, 300],
      ],
    });
    expect(doneRewound(p, 50)).toEqual([[1, 50]]);
    expect(doneFilled(p, 250)).toEqual([[1, 300]]);
  });

  it('a fill that ends before the plan begins claims nothing', () => {
    const p = plan({
      fromPage: 143,
      ayahsRead: ayahsThroughPage(142, DEFAULT_RIWAYAH),
    });
    expect(doneFilled(p, 10)).toEqual(p.done ?? []);
  });
});

describe('a new plan, and its pacing', () => {
  it('starts on the reader’s page: what is before it is read, the days are cut in Ḥafṣ pages', () => {
    expect(planStart({ page: 1 })).toEqual({ from: 0, ayahs: 0 });
    expect(planStart({ page: 143 })).toEqual({
      from: 142,
      ayahs: ayahsThroughPage(142, DEFAULT_RIWAYAH),
    });
  });

  it('dates a re-pace never before the last one', () => {
    expect(pacingStamp(plan())).toBe(NOW);
    expect(pacingStamp(plan({ pacedAt: NOW + 10 }))).toBe(NOW + 11);
  });

  it('measures a re-pace from the plan’s own start when nothing is read yet', () => {
    const p = plan({
      fromPage: 143,
      ayahsRead: ayahsThroughPage(142, DEFAULT_RIWAYAH),
    });
    expect(repaced(p, NOW).pacedFrom).toBe(143);
  });

  it('keeps today’s cut only on a dated plan', () => {
    const cut = { day: '2026-09-10', from: 1, to: 300, at: NOW };
    expect(withPaceOfDay(plan({ pace: cut }), NOW).pace).toBeUndefined();
    expect(unpaced(plan({ pace: cut }))).not.toHaveProperty('pace');
    const dated = withPaceOfDay(plan({ deadline: '2026-09-20' }), NOW);
    expect(dated.pace?.day).toBe('2026-09-10');
    // Pinned once: the next write the same day keeps the same cut.
    expect(withPaceOfDay(dated, NOW + 60_000)).toBe(dated);
  });

  it('snapshots the reach at the first write of the day, and only then', () => {
    const first = withDaySnapshot(plan({ pagesRead: 20, ayahsRead: 150 }), NOW);
    expect(first.dayStartDate).toBe('2026-09-10');
    expect(first.dayStartPagesRead).toBe(20);
    const again = withDaySnapshot({ ...first, pagesRead: 40 }, NOW + 60_000);
    expect(again.dayStartPagesRead).toBe(20);
  });
});
