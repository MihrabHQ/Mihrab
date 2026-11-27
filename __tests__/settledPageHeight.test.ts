/**
 * The pager's height and the page's measure feed each other; the held
 * height must not chase a fraction (the launch crash of 2026-11-27).
 */
jest.mock('../src/screens/home/HeroToday', () => ({}));
import { settledPageHeight } from '../src/screens/home/TodayCard';

/** Run the feedback: each measure is answered, and answers the next. */
function settle(measures: number[], start?: number): number[] {
  const held: number[] = [];
  let h = start;
  for (const m of measures) {
    h = settledPageHeight(h, m);
    held.push(h);
  }
  return held;
}

describe('settledPageHeight', () => {
  it('two measures either side of a half do not answer each other for ever', () => {
    // Math.round gave 331, 332, 331, 332 …
    const held = settle([331.45, 331.55, 331.45, 331.55, 331.45, 331.55]);
    expect(new Set(held).size).toBe(1);
    expect(held[0]).toBe(332);
  });

  it('the Pixel 10 Pro pair settles on one height', () => {
    expect(new Set(settle([331.4285583496094, 331.047607421875, 331.4285583496094, 331.047607421875])).size).toBe(1);
  });

  it('is never shorter than the page', () => {
    for (const m of [300, 300.01, 300.49, 300.5, 300.99]) expect(settledPageHeight(undefined, m)).toBeGreaterThanOrEqual(m - 0.01);
    expect(settledPageHeight(331, 331.4)).toBe(332);
  });

  it('follows a real change, both ways', () => {
    expect(settledPageHeight(332, 351)).toBe(351); // a line taller
    expect(settledPageHeight(351, 332)).toBe(332); // and back
    expect(settledPageHeight(332, 330.4)).toBe(331);
  });

  it('a whole number is itself', () => {
    expect(settledPageHeight(undefined, 331)).toBe(331);
    expect(settledPageHeight(331, 331)).toBe(331);
  });
});
