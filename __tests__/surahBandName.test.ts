/**
 * The surah band centres its name's INK, not the font's metric box (whose
 * middle is 0.59 em above the baseline in Amiri Quran, far above where a
 * name's letters sit).
 */
import { surahNameLift } from '../src/quran/mushafOrnaments';

const ink = require('../src/quran/data/surahNameInk.json') as Array<
  [number, number]
>;

describe('surahNameLift', () => {
  it('has a measurement for every surah', () => {
    expect(ink).toHaveLength(114);
    for (const [bottom, top] of ink) {
      expect(bottom).toBeLessThan(0);
      expect(top).toBeGreaterThan(0);
    }
  });

  it('puts the ink’s middle where the metric box’s was', () => {
    const boxMiddle = (1.815 - 0.634) / 2;
    for (let s = 1; s <= 114; s++) {
      const [bottom, top] = ink[s - 1];
      expect((bottom + top) / 2 + surahNameLift(s)).toBeCloseTo(boxMiddle, 6);
    }
  });

  it('lifts Nuh, whose ح runs below the line, by more than half an em', () => {
    expect(surahNameLift(71)).toBeGreaterThan(0.5);
  });

  it('every name fits the field at the size the band gives it', () => {
    // BAND_NAME_TALLEST_EM bounds every measured name.
    const tallest = Math.max(...ink.map(([b, t]) => t - b));
    expect(tallest).toBeLessThanOrEqual(1.52);
  });

  it('is zero for a surah it does not know', () => {
    expect(surahNameLift(0)).toBe(0);
    expect(surahNameLift(115)).toBe(0);
  });
});
