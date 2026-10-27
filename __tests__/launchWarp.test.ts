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
    expect(start).toEqual({ remaining: 7199, pct: 0.5, at, targetAt: at + 2 * HOUR });
    expect(claimLaunchWarp()).toBeNull();
  });

  it('are nothing when the launch drew no picture', () => {
    mockState.value = '';
    expect(claimLaunchWarp()).toBeNull();
  });

  it('are read again for a new window of the same process', () => {
    // markFirstPaint schedules the picture's fade on animation frames —
    // real ones outlived the test and fired into a torn-down environment,
    // which turned CI red on 2.31.0's commit with every test passing.
    jest.useFakeTimers();
    const m = require('../src/native/LaunchSnapshot');
    const fp = require('../src/boot/firstPaint');
    const { beginLaunchWindow } = require('../src/boot/launchWarp');
    const hide = require('react-native').NativeModules.MihrabLaunchSnapshot.hide as jest.Mock;
    hide.mockClear();
    // The first window: a picture, claimed, painted, hidden.
    const at = 1_000 * HOUR;
    mockState.value = `${at},${at + 2 * HOUR},${at - 2 * HOUR},1`;
    expect(claimLaunchWarp()).not.toBeNull();
    fp.markFirstPaint();
    m.hideLaunchSnapshot();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(fp.firstPaintDone()).toBe(true);
    // The task is swiped away; the process stays; a new window opens on
    // a picture of its own — everything starts over.
    mockState.value = `${at + HOUR},${at + 5 * HOUR},${at + HOUR},1`;
    beginLaunchWindow();
    expect(fp.firstPaintDone()).toBe(false);
    expect(claimLaunchWarp()).toEqual({ remaining: 4 * 3600, pct: 0, at: at + HOUR, targetAt: at + 5 * HOUR });
    m.hideLaunchSnapshot();
    expect(hide).toHaveBeenCalledTimes(2);
    // …and a window that opened on no picture runs nothing, whatever the
    // first one opened on.
    mockState.value = '';
    beginLaunchWindow();
    expect(claimLaunchWarp()).toBeNull();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

describe('the run', () => {
  const start = { remaining: 3 * 3600, pct: 0.25, at: 10 * HOUR, targetAt: 13 * HOUR };

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

  it('once the picture is posed, native keeps its hands off until a new prayer', async () => {
    jest.useFakeTimers();
    jest.doMock('react-native-view-shot', () => ({ captureRef: async () => 'file:///tmp/hero.png' }));
    const rn = require('react-native');
    const capture = jest.fn();
    const eligible = jest.fn();
    rn.NativeModules.MihrabLaunchSnapshot.captureNow = capture;
    rn.NativeModules.MihrabLaunchSnapshot.setEligible = eligible;
    rn.NativeModules.MihrabLaunchSnapshot.setHeroState = jest.fn();
    const m = require('../src/native/LaunchSnapshot');
    const pose = require('../src/boot/poseHero');
    pose.registerPoseHero({
      ref: { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 40, 400, 300) } },
      fromAt: 1_000,
      targetAt: 5_000,
    });
    m.setLaunchSnapshotEligible(true);
    // With a twin on hand, native never keeps the screen itself.
    expect(eligible).not.toHaveBeenCalledWith(true);
    jest.advanceTimersByTime(m.KEEP_AFTER_MS);
    // The pose is drawn and measured in a few promise hops.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(capture).toHaveBeenCalledWith('file:///tmp/hero.png', 0, 40);
    // …and the chip opening and closing changes nothing: no second keep
    // of the same pose, and native still off.
    m.holdLaunchSnapshot('help-chip', true);
    m.holdLaunchSnapshot('help-chip', false);
    jest.advanceTimersByTime(m.KEEP_EVERY_MS + m.KEEP_AFTER_MS);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(eligible).not.toHaveBeenCalledWith(true);
    // A new interval is a new screen: JS poses it afresh.
    m.setLaunchHeroState(9_000, 5_000);
    jest.advanceTimersByTime(m.KEEP_EVERY_MS + m.KEEP_AFTER_MS);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(capture).toHaveBeenCalledTimes(2);
    // Without a twin (before Fajr with the rows hidden, say), and nothing
    // posed for the interval, native is in.
    pose.registerPoseHero(null);
    m.setLaunchHeroState(13_000, 9_000);
    expect(eligible).toHaveBeenLastCalledWith(true);
    pose._resetPoseHeroForTests();
    jest.useRealTimers();
  });
});

describe('wiring', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
  const card = read('src/screens/home/TodayCard.tsx');

  it('draws the countdown, the rail and the sky from the run', () => {
    expect(card).toMatch(/warp \? warpRemaining\(warp, remainingSeconds, warpE\) : remainingSeconds/);
    expect(card).toMatch(/warp \? warpPct\(warp, liveRailPct, warpE\) : liveRailPct/);
    expect(card).toMatch(/warp \? warpSkyAt\(warp, now\.getTime\(\), skyE\) : now\.getTime\(\)/);
  });

  it('captures the posed twin at the sky\'s box, bleed and all, not the hero\'s', () => {
    // view-shot draws the ref's own bounds, so a ref the size of the hero
    // cut the sky's bleed off and the kept picture framed a posed Fajr in
    // the live sky's edges — a square, under the Sky theme.
    expect(card).toMatch(
      /ref=\{poseRef\}[\s\S]*?left: heroBox\.x - skySide - twinBarLeft,\s*top: heroBox\.y - heroTop,\s*width: heroBox\.w \+ skySide \* 2 \+ twinBarLeft \+ twinBarRight,\s*height: heroBox\.h \+ heroTop \+ SPACING\.lg,/,
    );
    expect(card).toMatch(/left: skySide \+ twinBarLeft,\s*top: heroTop,\s*width: heroBox\.w,\s*height: heroBox\.h,/);
    // The sky's reach past the hero: the phone's own, plus a wide
    // screen's side inset (zero everywhere but an open foldable).
    expect(card).toMatch(/const skySide = SPACING\.xl \+ wideInset;/);
    // Beside an iPhone's vertical bar the sky runs on under the column, and
    // the box takes that side in; nothing anywhere else.
    expect(card).toMatch(/const twinBarLeft = columnPad && vbar && vbar\.side === 'left' \? vbar\.width : 0;/);
    expect(card).toMatch(/const twinBarRight = columnPad && vbar && vbar\.side === 'right' \? vbar\.width : 0;/);
  });

  it('poses the twin at the interval it is given now, not the one it mounted at', () => {
    // The twin lives all day; its frozen instant has to be the prop's at
    // every render, or the picture poses at the last prayer with the
    // next one's target.
    expect(card).toMatch(/const frozenNow = useMemo\(\(\) => \(frozenAt != null \? new Date\(frozenAt\) : null\), \[frozenAt\]\);\s*const now = frozenNow \?\? liveNow;/);
    expect(card).not.toMatch(/useState\(\(\) => new Date\(frozenAt/);
  });

  it('runs every time but under Reduce Motion, and holds the picture back meanwhile', () => {
    const warp = read('src/boot/launchWarp.ts');
    // No picture is no reason not to run: the interval's own start does.
    expect(warp).toMatch(/const at = start\?\.at \?\? ownAt;\s*if \(at == null \|\| reduceMotion\) \{\s*run = null;/);
    expect(warp).toMatch(/holdLaunchSnapshot\(HOLD, true\)/);
    expect(warp).toMatch(/holdLaunchSnapshot\(HOLD, false\)/);
    expect(card).toMatch(/useLaunchWarp\(reduceMotion \|\| !launchRunWanted, !posed, rail\?\.from\.at\.getTime\(\) \?\? null\)/);
  });

  it('is a setting, on by default: off, nothing is posed and nothing runs', () => {
    const types = read('src/settings/types.ts');
    expect(types).toMatch(/launchAnimation: true,/);
    expect(card).toMatch(/useLaunchWarp\(reduceMotion \|\| !launchRunWanted, !posed, rail\?\.from\.at\.getTime\(\) \?\? null\)/);
    expect(card).toMatch(/!fullBleedRunHeld && twinMayMount && runWanted/);
    expect(card).toMatch(/useEffect\(\(\) => setLaunchRunWanted\(runWanted\), \[runWanted\]\)/);
    const appearance = read('src/screens/settings/AppearanceCard.tsx');
    expect(appearance).toMatch(/updateSettings\(\{ launchAnimation: v \}\)/);
    // Turned off with a posed picture on disk: that picture is let go and
    // the screen kept again as it is.
    const m = require('../src/native/LaunchSnapshot');
    const eligible = require('react-native').NativeModules.MihrabLaunchSnapshot.setEligible as jest.Mock;
    m._setPosedKeptForTests(true);
    m.setLaunchSnapshotEligible(true);
    expect(eligible).not.toHaveBeenLastCalledWith(true);
    m.setLaunchRunWanted(false);
    expect(eligible).toHaveBeenLastCalledWith(true);
  });

  it('draws the run\'s sky off the JS thread: still layers driven by one native value', () => {
    const sky = read('src/screens/home/HeroSky.tsx');
    // The hero builds the keyframes once per run and owns the value…
    expect(card).toMatch(/new Animated\.Value\(0, \{ useNativeDriver: true \}\)/);
    expect(card).toMatch(/const K = Math\.max\(2, Math\.min\(SKY_RUN_KEYFRAMES_MAX, Math\.ceil\(hours\) \+ 1\)\);/);
    expect(card).toMatch(/skyRunRef\.current = \{ frames, progress: runProgress\.current \};/);
    // …and once the run begins, hands it to native to animate to its end
    // over the run's remaining length, with the run's own easing from
    // where it is — the per-frame values did not reach the layers in time
    // on the phone, and the sky stood and then jumped. Before it begins,
    // the value is set from here (it is 0), and the run waits for native
    // to have taken it (markLaunchRunReady).
    expect(card).toMatch(/const duration = launchRunDurationMs\(\);\s*if \(duration == null\) \{\s*v\.setValue\(warpE\);\s*return;\s*\}/);
    expect(card).toMatch(/skyAnim\.current = Animated\.timing\(v, \{\s*toValue: 1,\s*duration: left,[\s\S]*?useNativeDriver: true,\s*\}\);\s*skyAnim\.current\.start\(\);/);
    expect(card).toMatch(/const k0 = 1 - Math\.cbrt\(Math\.max\(0, 1 - e0\)\);/);
    expect(card).toMatch(/v\.addListener\(\(\) => markLaunchRunReady\(\)\)/);
    expect(card).toMatch(/run=\{skyRun \?\? undefined\}/);
    // …and the sky draws the layers, not the frame, while it runs.
    expect(sky).toMatch(/const running = run && size\.width > 0 && size\.height > 0;/);
    expect(sky).toMatch(/<SkyRunLayers run=\{run\}/);
    expect(sky).toMatch(/const SkyRunLayers = memo\(SkyRunLayersImpl\);/);
    // Every layer is an interpolation of the one value; a layer is dropped
    // once the next is in; the gradients and the halo are drawn small.
    expect(sky).toMatch(/outputRange: \[0, peak, peak, 0\]/);
    expect(sky).toMatch(/const LAYER_DOWNSCALE = 4;/);
    expect(sky).toMatch(/transform: \[\{ scale: LAYER_DOWNSCALE \}\]/);
    expect(sky).toMatch(/haloScaleUp: Animated\.multiply\(haloScale, LAYER_DOWNSCALE\)/);
  });

  it('re-reads the ink in steps over the run, and mounts the twin only after it', () => {
    expect(card).toMatch(/const skyE = launchRun \? Math\.floor\(warpE \* SKY_RUN_STEPS\) \/ SKY_RUN_STEPS : warpE;/);
    expect(card).toMatch(/warpSkyAt\(warp, now\.getTime\(\), skyE\)/);
    // And a second sky (the posed twin's) is not mounted under the run.
    expect(card).toMatch(/const twinMayMount = useAfterFirstPaint\(\);/);
    expect(card).toMatch(/!fullBleedRunHeld && twinMayMount && runWanted/);
    const sky = read('src/screens/home/HeroSky.tsx');
    expect(sky).toMatch(/const Stars = memo\(/);
    expect(sky).toMatch(/const Moon = memo\(/);
    expect(sky).toMatch(/useMemo\(\(\) => skyScene\(/);
  });

  it('keeps what the hero is aimed at beside the next picture', () => {
    expect(card).toMatch(/setLaunchHeroState\(target\.at\.getTime\(\), railFromAt\)/);
  });

  it('never keeps the Help Mihrab chip open in the picture', () => {
    const chip = read('src/screens/home/HelpMihrabChip.tsx');
    expect(chip).toMatch(/holdLaunchSnapshot\('help-chip', value > 0\.001\)/);
  });
});

describe('when the run begins', () => {
  /** A hero that decides its run on mount, and nothing else. */
  const mountHero = (w: typeof import('../src/boot/launchWarp')) => {
    const React = require('react');
    const { act, create } = require('react-test-renderer');
    const Probe = () => {
      w.useLaunchWarp(false, true);
      return null;
    };
    act(() => {
      create(React.createElement(Probe));
    });
  };

  it('waits for the fade to be asked, then WARP_AFTER_HIDE_MS — not the hero\'s mount (2.33)', () => {
    jest.useFakeTimers();
    const m = require('../src/native/LaunchSnapshot');
    const w = require('../src/boot/launchWarp');
    const at = 1_000 * HOUR;
    mockState.value = `${at},${at + 2 * HOUR},${at},1`;
    // The hero mounts and decides its run; the first paint — and the ask
    // for the fade — is 300 ms off.
    mountHero(w);
    w.markLaunchRunReady();
    jest.advanceTimersByTime(w.WARP_AFTER_HIDE_MS + 100);
    // Timed from the mount it would have begun by now, under the picture.
    expect(w.launchRunDurationMs()).toBeNull();
    m.hideLaunchSnapshot();
    jest.advanceTimersByTime(w.WARP_AFTER_HIDE_MS - 10);
    expect(w.launchRunDurationMs()).toBeNull();
    jest.advanceTimersByTime(20);
    expect(w.launchRunDurationMs()).not.toBeNull();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('begins anyway when the fade is never asked for', () => {
    jest.useFakeTimers();
    const w = require('../src/boot/launchWarp');
    const at = 1_000 * HOUR;
    mockState.value = `${at},${at + 2 * HOUR},${at},1`;
    mountHero(w);
    w.markLaunchRunReady();
    jest.advanceTimersByTime(w.WARP_HIDE_WAIT_MAX_MS + w.WARP_AFTER_HIDE_MS - 10);
    expect(w.launchRunDurationMs()).toBeNull();
    jest.advanceTimersByTime(20);
    expect(w.launchRunDurationMs()).not.toBeNull();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

describe('the return run (2.33)', () => {
  const HOUR_ = 3600_000;
  it('runs from the numbers the hero was left at, once the sky has taken the value', () => {
    jest.useFakeTimers();
    const w = require('../src/boot/launchWarp');
    const left = { remaining: 7200, pct: 0.25, at: 1_000 * HOUR_, targetAt: 1_002 * HOUR_ };
    expect(w.startResumeRun(left)).toBe(true);
    // Decided and waiting: progress is the start at e 0, nothing begun.
    expect(w.warpProgress(Date.now())).toEqual({ start: left, e: 0 });
    expect(w.launchRunDurationMs()).toBeNull();
    // Not a second one over it.
    expect(w.startResumeRun(left)).toBe(false);
    w.markLaunchRunReady();
    expect(w.launchRunDurationMs()).not.toBeNull();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('begins anyway when the sky never answers, after WARP_READY_MAX_MS', () => {
    jest.useFakeTimers();
    const w = require('../src/boot/launchWarp');
    w.startResumeRun({ remaining: 60, pct: null, at: 1_000 * HOUR_, targetAt: 1_001 * HOUR_ });
    jest.advanceTimersByTime(w.WARP_READY_MAX_MS - 10);
    expect(w.launchRunDurationMs()).toBeNull();
    jest.advanceTimersByTime(20);
    expect(w.launchRunDurationMs()).not.toBeNull();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('is not started by a launch that already has its run', () => {
    jest.useFakeTimers();
    const w = require('../src/boot/launchWarp');
    const at = 1_000 * HOUR_;
    mockState.value = `${at},${at + 2 * HOUR_},${at},1`;
    const React = require('react');
    const { act, create } = require('react-test-renderer');
    const Probe = () => {
      w.useLaunchWarp(false, true);
      return null;
    };
    act(() => {
      create(React.createElement(Probe));
    });
    expect(w.startResumeRun({ remaining: 1, pct: 0, at, targetAt: at + HOUR_ })).toBe(false);
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

describe('what waits for a run (2.33)', () => {
  it('resolves after two frames when there is no run, and at the end of one when there is', async () => {
    jest.useFakeTimers();
    const w = require('../src/boot/launchWarp');
    let done = false;
    void w.afterRun().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(100);
    expect(done).toBe(true);
    // A return run under way: waited out.
    w.startResumeRun({ remaining: 60, pct: null, at: 1_000 * 3600_000, targetAt: 1_001 * 3600_000 });
    done = false;
    void w.afterRun().then(() => {
      done = true;
    });
    await jest.advanceTimersByTimeAsync(100);
    expect(done).toBe(false);
    w.markLaunchRunReady();
    await jest.advanceTimersByTimeAsync(w.WARP_MAX_MS + w.WARP_STALL_MAX_MS + 100);
    expect(done).toBe(true);
    jest.useRealTimers();
  });
});
