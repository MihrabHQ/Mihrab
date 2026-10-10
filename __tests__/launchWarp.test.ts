/**
 * The hero's run from the kept launch picture's numbers to the live ones —
 * see src/boot/launchWarp.ts.
 */
import fs from 'fs';
import path from 'path';

const mockState = { value: '' };
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    MihrabLaunchSnapshot: {
      hide: jest.fn(),
      setEligible: jest.fn(),
      setLookKey: jest.fn(),
      setHeroState: jest.fn(),
      getShownState: () => mockState.value,
    },
  },
}));

// eslint-disable-next-line import/first
import {
  _resetLaunchWarpForTests,
  claimLaunchWarp,
  easeOutCubic,
  warpDurationMs,
  warpPct,
  warpRemaining,
  warpSkyAt,
  WARP_MAX_MS,
} from '../src/boot/launchWarp';
// eslint-disable-next-line import/first
import { _resetLaunchSnapshotForTests } from '../src/native/LaunchSnapshot';

const HOUR = 3600_000;

beforeEach(() => {
  _resetLaunchWarpForTests();
  _resetLaunchSnapshotForTests();
});

describe('the picture\'s numbers', () => {
  it('are read once, from what native kept beside the picture', () => {
    const at = 1_000 * HOUR;
    mockState.value = `${at},${at + 2 * HOUR},${at - 2 * HOUR}`;
    const start = claimLaunchWarp();
    // A moment past the picture's second, as the hero ticks: 1 s under.
    expect(start).toEqual({ remaining: 7199, pct: 0.5, at });
    expect(claimLaunchWarp()).toBeNull();
  });

  it('are nothing when the launch drew no picture', () => {
    mockState.value = '';
    expect(claimLaunchWarp()).toBeNull();
  });
});

describe('the run', () => {
  const start = { remaining: 3 * 3600, pct: 0.25, at: 10 * HOUR };

  it('starts on the picture and ends on the live numbers — either way', () => {
    // Same prayer, later: counts down.
    expect(warpRemaining(start, 600, 0)).toBe(10800);
    expect(warpRemaining(start, 600, 1)).toBe(600);
    // A prayer has come since: the next one is further off, so it counts up.
    expect(warpRemaining({ ...start, remaining: 60 }, 5 * 3600, 1)).toBe(18000);
    // A new interval began: the rail slides back.
    expect(warpPct(start, 0.1, 0)).toBe(0.25);
    expect(warpPct(start, 0.1, 1)).toBeCloseTo(0.1);
  });

  it('runs the sky back an hour, not forward a day, when the clock went back', () => {
    const s = { ...start, at: 10 * HOUR };
    expect(warpSkyAt(s, 9 * HOUR, 0)).toBe(10 * HOUR);
    expect(warpSkyAt(s, 9 * HOUR, 1)).toBe(9 * HOUR);
  });

  it('turns the sky forward through the clock, never back', () => {
    // Left at 22:00, back at 06:00 the next day: through the night.
    const left = new Date(2026, 9, 7, 22, 0).getTime();
    const back = new Date(2026, 9, 8, 6, 0).getTime();
    const s = { ...start, at: left };
    expect(warpSkyAt(s, back, 0)).toBe(back - 8 * HOUR);
    expect(warpSkyAt(s, back, 0.5)).toBe(back - 4 * HOUR);
    expect(warpSkyAt(s, back, 1)).toBe(back);
  });

  it('is fast first and settles exactly on now, in under a second', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.5);
    expect(warpDurationMs(5_000)).toBeLessThan(500);
    expect(warpDurationMs(30 * HOUR)).toBeLessThanOrEqual(WARP_MAX_MS);
  });
});

describe('keeping the screen while the app is open', () => {
  it('keeps it once it has stayed worth keeping, at most every few seconds', () => {
    jest.useFakeTimers();
    const rn = require('react-native');
    const capture = jest.fn();
    rn.NativeModules.MihrabLaunchSnapshot.captureNow = capture;
    const m = require('../src/native/LaunchSnapshot');
    m.setLaunchSnapshotEligible(true);
    jest.advanceTimersByTime(m.KEEP_AFTER_MS);
    expect(capture).toHaveBeenCalledTimes(1);
    // The chip opens: not worth keeping, then worth it again soon after.
    m.holdLaunchSnapshot('help-chip', true);
    m.holdLaunchSnapshot('help-chip', false);
    jest.advanceTimersByTime(m.KEEP_AFTER_MS);
    expect(capture).toHaveBeenCalledTimes(1);
    // A scroll away and straight back is not kept either.
    m.setLaunchSnapshotEligible(false);
    jest.advanceTimersByTime(m.KEEP_EVERY_MS);
    m.setLaunchSnapshotEligible(true);
    jest.advanceTimersByTime(m.KEEP_AFTER_MS - 1);
    expect(capture).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(capture).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});

describe('wiring', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
  const card = read('src/screens/home/TodayCard.tsx');

  it('draws the countdown, the rail and the sky from the run', () => {
    expect(card).toMatch(/warp \? warpRemaining\(warp, remainingSeconds, warpE\) : remainingSeconds/);
    expect(card).toMatch(/warp \? warpPct\(warp, rail\.pct, warpE\) : rail\.pct/);
    expect(card).toMatch(/warp \? warpSkyAt\(warp, now\.getTime\(\), warpE\) : now\.getTime\(\)/);
  });

  it('runs every time but under Reduce Motion, and holds the picture back meanwhile', () => {
    const warp = read('src/boot/launchWarp.ts');
    expect(warp).toMatch(/if \(!start \|\| reduceMotion\) \{\s*run = null;/);
    expect(warp).toMatch(/holdLaunchSnapshot\(HOLD, true\)/);
    expect(warp).toMatch(/holdLaunchSnapshot\(HOLD, false\)/);
    expect(card).toMatch(/useLaunchWarp\(reduceMotion\)/);
  });

  it('keeps what the hero is aimed at beside the next picture', () => {
    expect(card).toMatch(/setLaunchHeroState\(target\.at\.getTime\(\), railFromAt\)/);
  });

  it('never keeps the Help Mihrab chip open in the picture', () => {
    const chip = read('src/screens/home/HelpMihrabChip.tsx');
    expect(chip).toMatch(/holdLaunchSnapshot\('help-chip', value > 0\.001\)/);
  });
});
