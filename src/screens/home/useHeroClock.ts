/**
 * The hero's clock: the `now` its countdown is reckoned from.
 *
 * Runs only while the hero is in front of someone (`running`: the screen
 * focused, the app in the foreground, not the posed twin). It ticks on the
 * clock's own seconds — or, under Minimal outside the last minutes, when
 * the minute shown changes (heroTick.ts) — tells the clock-jump watch of
 * each tick (utils/clockJumps), and on a return after time away starts the
 * run from what the hero last showed (launchWarp.ts, `startResumeRun`).
 *
 * Was the middle of TodayCard's hero; taken out whole, so the hero reads
 * `now` and this file is the one place that decides when it changes.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { RESUME_RUN_MIN_MS, startResumeRun, type WarpStart } from '../../boot/launchWarp';
import { forgetClockTicks, noteClockTick } from '../../utils/clockJumps';
import { heroTickDelay } from './heroTick';

export function useHeroClock({
  running,
  targetMs,
  secondsUnder,
  shown,
  resumeWanted,
}: {
  /** The hero is in front of someone, and live. */
  running: boolean;
  /** What the countdown counts to. */
  targetMs: number;
  /** Minimal: the time left (s) under which the seconds show; null on the full page. */
  secondsUnder: number | null;
  /** What the hero last showed, written by the hero on every render. */
  shown: MutableRefObject<WarpStart | null>;
  /** Whether a return after time away should run (the setting, reduced motion). */
  resumeWanted: MutableRefObject<boolean>;
}): Date {
  const [liveNow, setNow] = useState(() => new Date());
  // Read by the ticks, which set themselves by the figures on show: Minimal
  // ticks when its minute changes, not every second (heroTick.ts).
  const tickBy = useRef({ targetMs, secondsUnder });
  tickBy.current = { targetMs, secondsUnder };
  const retick = useRef<(() => void) | null>(null);
  /** When the clock below last stopped — the hero left the screen. */
  const leftAt = useRef(0);
  useEffect(() => {
    if (!running) return undefined;
    // Coming back after time away — from the background, from another
    // tab, from a screen over this one — the displayed countdown is as
    // stale as the time spent away. After a while away it RUNS to now
    // from what it showed, as a launch runs from the prayer; after a few
    // seconds it simply picks up. Either way the clock is set now, not on
    // the first interval.
    const resumeFrom = (nowMs: number) => {
      const left = shown.current;
      if (!resumeWanted.current || !left || nowMs - Math.max(left.at, leftAt.current) < RESUME_RUN_MIN_MS) return;
      startResumeRun(left);
    };
    resumeFrom(Date.now());
    setNow(new Date());
    // Then on the clock's own seconds, so the countdown turns when the
    // status bar's clock does — and a picture of it taken at any instant
    // shows exactly the second that instant reads (launchWarp). Under
    // Minimal, outside the last five minutes, on its minute instead: the
    // figures show no seconds there (heroTick.ts).
    let id: ReturnType<typeof setTimeout> | null = null;
    let due = 0;
    let gap = 1000;
    const schedule = (from: number) => {
      const by = tickBy.current;
      gap = heroTickDelay(from, by.targetMs, by.secondsUnder);
      due = from + gap;
      id = setTimeout(tick, gap);
    };
    const tick = () => {
      const t = Date.now();
      // A tick far from where it was set for is the clock jumping (set by
      // hand, corrected): the day may be another, and the watchdog that
      // decides it looks now rather than in half a minute.
      noteClockTick(t, gap);
      // A tick that lands long after it was due — the JS thread held for a
      // while with the screen in front — is a return like any other. (Not
      // the time since the last: under Minimal that is a minute anyway.)
      if (t - due >= RESUME_RUN_MIN_MS) resumeFrom(t);
      setNow(new Date(t));
      schedule(t);
    };
    schedule(Date.now());
    // The target or the face changed between ticks — the next prayer
    // chosen, Minimal turned on or off: the figures are read now and the
    // next tick is set by them.
    retick.current = () => {
      if (id) clearTimeout(id);
      const t = Date.now();
      forgetClockTicks();
      setNow(new Date(t));
      schedule(t);
    };
    return () => {
      if (id) clearTimeout(id);
      retick.current = null;
      forgetClockTicks();
      // What was on show stayed true up to now — under Minimal the last
      // tick can be most of a minute ago — so a return reckons its time
      // away from here, not from that tick: a few seconds in another app
      // must not count as a minute and start a run.
      leftAt.current = Date.now();
    };
  // `shown` and `resumeWanted` are refs: the same objects every render.
  }, [running, shown, resumeWanted]);
  const firstTickBy = useRef(true);
  useEffect(() => {
    // Not on mount: the clock above has just been set.
    if (firstTickBy.current) {
      firstTickBy.current = false;
      return;
    }
    retick.current?.();
  }, [targetMs, secondsUnder]);
  return liveNow;
}
