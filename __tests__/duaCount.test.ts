/**
 * The dua counter (src/duas/duaCount.ts) — issue #120: the bedtime
 * Muʿawwidhāt counted on past 3 (9 / 3), never moved through the surahs
 * and were never marked done.
 */
import { DUAS, type Dua } from '../src/duas/duas';
import { countKeyOf, partsDone, tapCount } from '../src/duas/duaCount';

const dua = (id: string) => DUAS.find(d => d.id === id)!;

/** Taps n times from nothing, as the screen does: the count and the part carried from tap to tap. */
function tap(d: Dua, n: number) {
  let counts: Record<string, number> = {};
  let part = 0;
  const steps: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = tapCount(d, part, counts);
    steps.push(t.step);
    counts = { ...counts, [t.key]: t.count };
    part = t.part;
  }
  return { counts, part, steps };
}

describe('the bedtime Muʿawwidhāt: the set, three times', () => {
  const sleep = dua('sleep_three_quls');

  it('a tap reads one surah and moves to the next; the last of the three counts a round', () => {
    const r = tap(sleep, 3);
    expect(r.steps).toEqual(['part', 'part', 'count']);
    expect(r.counts[sleep.id]).toBe(1);
    expect(r.part).toBe(0); // the next round starts at al-Ikhlas
  });

  it('three rounds complete it, every surah ticked, and it stops there', () => {
    const r = tap(sleep, 9);
    expect(r.steps.at(-1)).toBe('done');
    expect(r.counts[sleep.id]).toBe(3);
    expect(r.part).toBe(2); // left on an-Nas, where it ended
    expect(partsDone(sleep, r.counts)).toEqual([true, true, true]);
    // The tenth tap — and the hundredth — does nothing: no 9 / 3.
    const more = tap(sleep, 100);
    expect(more.counts[sleep.id]).toBe(3);
    expect(more.steps.slice(9).every(s => s === 'none')).toBe(true);
  });

  it('is not ticked part-way', () => {
    expect(partsDone(sleep, tap(sleep, 8).counts)).toEqual([false, false, false]);
  });
});

describe('the three Quls morning and evening: three times each', () => {
  for (const id of ['morning_02_three_quls', 'evening_02_three_quls']) {
    const d = dua(id);

    it(`${id}: each surah counted to 3 hands on to the next, and each stops at 3`, () => {
      const r = tap(d, 9);
      expect(r.steps).toEqual(['count', 'count', 'done', 'count', 'count', 'done', 'count', 'count', 'done']);
      expect(d.parts!.map(p => r.counts[`${d.id}|${p.surah}`])).toEqual([3, 3, 3]);
      expect(partsDone(d, r.counts)).toEqual([true, true, true]);
      expect(r.part).toBe(2);
      const more = tap(d, 12);
      expect(more.counts[`${d.id}|114`]).toBe(3);
    });
  }
});

describe('a plain dua with a count', () => {
  it('counts to its number and stops', () => {
    const d = DUAS.find(x => !x.parts && (x.repeat ?? 0) > 1)!;
    const r = tap(d, (d.repeat ?? 0) + 5);
    expect(r.counts[countKeyOf(d, 0)]).toBe(d.repeat);
    expect(r.steps[(d.repeat ?? 0) - 1]).toBe('done');
    expect(r.steps.slice(d.repeat).every(s => s === 'none')).toBe(true);
  });
});
