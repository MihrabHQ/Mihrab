import { heroTickDelay } from '../src/screens/home/heroTick';
import { _resetClockJumpsForTests, noteClockTick, onClockJump } from '../src/utils/clockJumps';

const UNDER = 5 * 60;
// A prayer on the minute, and a moment some way before it.
const target = Date.UTC(2026, 10, 10, 13, 15, 0);

describe('heroTickDelay', () => {
  it('ticks on the clock’s seconds on the full page', () => {
    expect(heroTickDelay(target - 3_600_000 + 250, target, null)).toBe(750);
    expect(heroTickDelay(target - 10_000, target, null)).toBe(1000);
  });

  it('ticks when Minimal’s minute changes, outside the last five minutes', () => {
    // 44m 30.25s left: the figures read 44m until 44m 0s left.
    const now = target - (44 * 60_000 + 30_250);
    const d = heroTickDelay(now, target, UNDER);
    expect(d).toBeGreaterThanOrEqual(30_250);
    expect(d).toBeLessThan(30_300);
    // Landed there, the minute shown is the next one…
    expect(Math.floor((target - (now + d)) / 60_000)).toBe(43);
    // …and the next tick is a whole minute on.
    expect(heroTickDelay(now + d, target, UNDER)).toBeGreaterThan(59_000);
  });

  it('lands on the five minutes’ mark and ticks on the seconds from there', () => {
    const now = target - (6 * 60_000 + 10_000);
    const d = heroTickDelay(now, target, UNDER);
    const at = now + d;
    expect(Math.floor((target - at) / 60_000)).toBe(5);
    const d2 = heroTickDelay(at, target, UNDER);
    const at2 = at + d2;
    // The mark itself: 5m 0s left, a hair past it — under five minutes.
    expect((target - at2) / 1000).toBeLessThan(UNDER);
    expect(heroTickDelay(at2, target, UNDER)).toBeLessThanOrEqual(1000);
    expect(heroTickDelay(target - 90_000, target, UNDER)).toBeLessThanOrEqual(1000);
  });

  it('ticks on the seconds past the target, while the next prayer is put up', () => {
    expect(heroTickDelay(target + 400, target, UNDER)).toBe(600);
  });
});

describe('noteClockTick with a minute between ticks', () => {
  afterEach(() => _resetClockJumpsForTests());

  it('hears a minute’s tick as a tick, and a jump as a jump', () => {
    let jumps = 0;
    const off = onClockJump(() => jumps++);
    let t = target;
    noteClockTick(t, 60_000);
    noteClockTick((t += 60_000), 60_000);
    expect(jumps).toBe(0);
    noteClockTick((t -= 24 * 3600_000), 60_000);
    expect(jumps).toBe(1);
    off();
  });
});
