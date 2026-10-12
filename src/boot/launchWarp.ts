/**
 * From the kept launch screen to now, as motion.
 *
 * A cold start on Android opens on a picture of the Today screen as it was
 * left (native/LaunchSnapshot.ts) and fades it into the live one. Most of
 * the picture is still true — the day's times have hardly moved — but the
 * hero has: the countdown is minutes or hours behind (or aimed at a prayer
 * that has since come), the rail at another fill, the sky at another hour.
 * Faded, those jump.
 *
 * So the hero is first drawn with the picture's numbers, which makes the
 * fade invisible, and then runs its numbers to the live ones: the
 * countdown counts fast and slows into the present one, the rail slides to
 * its fill (back, if a new interval has begun), the sky turns forward to
 * the hour. One easing, fast first, settling on now. Every time — another
 * prayer, another day — with Reduce Motion the only exception. The words
 * that change with it ("Fajr in", the rail's names) are the live ones from
 * the first frame and change inside the fade.
 *
 * The picture's numbers come from the moment it was taken and what the
 * hero was aimed at then, which native keeps beside it (`setHeroState`).
 *
 * ── A PICTURE FROM THE SAME PRAYER ───────────────────────────────────
 *
 * Left at 13:00 and opened at 13:07, the picture is seven minutes behind
 * and the run is a twitch. So when the picture was taken after the current
 * prayer began — the app has been opened since the last prayer — the hero
 * first rewinds, quickly, to that prayer's own moment: the countdown to
 * the whole interval, the rail empty, the sky at the prayer's hour; and
 * then runs forward from there to now, the whole of the time since the
 * last prayer in one sweep. The fade still lands on the picture's numbers;
 * the rewind begins where the run would have.
 */
import { useEffect, useReducer } from 'react';
import { heroStateShown, hideRequestedAt, holdLaunchSnapshot } from '../native/LaunchSnapshot';

/**
 * From JS asking native to hide the picture to the fade having finished:
 * native waits MOUNT_GRACE_MS (80) and fades for FADE_MS (220); a frame
 * more so the run starts on the live screen alone. The hero stands still
 * at the picture's numbers for all of it, so it is as short as it can be.
 */
export const WARP_AFTER_HIDE_MS = 320;
/** The longest a gap of hours is allowed to take to run through. */
export const WARP_MAX_MS = 900;
/** The rewind to the current prayer's start, before the run forward. */
export const WARP_REWIND_MS = 220;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** What the picture's hero showed. */
export type WarpStart = {
  /** Seconds left on the countdown. */
  remaining: number;
  /** The rail's fill, 0…1, or null if it had none. */
  pct: number | null;
  /** When the picture was taken: the sky's hour. */
  at: number;
};

let claimed = false;

/**
 * The picture's hero, once per process, for the first hero that asks.
 * Null when no picture was shown (a launch that drew the app itself) or
 * native kept nothing to start from.
 */
export function claimLaunchWarp(): WarpStart | null {
  if (claimed) return null;
  claimed = true;
  const s = heroStateShown();
  if (!s || !(s.targetAt > s.at)) return null;
  const span = s.targetAt - s.fromAt;
  return {
    // The hero ticks just after each of the clock's whole seconds (see
    // HeroToday), so at the instant the picture was taken it showed the
    // count read a moment past that instant's second: one less than the
    // whole seconds from that second to the target.
    remaining: Math.max(0, Math.floor((s.targetAt - (s.at - (s.at % 1000)) - 1) / 1000)),
    pct: s.fromAt > 0 && span > 0 ? clamp01((s.at - s.fromAt) / span) : null,
    at: s.at,
  };
}

/** How long to wait, from now, before the run starts. */
export function warpDelayMs(now: number = Date.now()): number {
  const asked = hideRequestedAt();
  if (asked == null) return WARP_AFTER_HIDE_MS;
  return Math.max(0, asked + WARP_AFTER_HIDE_MS - now);
}

/** A few seconds behind run in under half a second; hours in under one. */
export function warpDurationMs(gapMs: number): number {
  const seconds = Math.max(0, gapMs / 1000);
  return Math.round(Math.min(WARP_MAX_MS, 350 + 150 * Math.log10(1 + seconds)));
}

/** Fast first, settling on the present. */
export function easeOutCubic(k: number): number {
  const c = clamp01(k);
  return 1 - Math.pow(1 - c, 3);
}

/** The countdown between the picture's and the live one, at eased `e`. */
export function warpRemaining(start: WarpStart, live: number, e: number): number {
  return Math.max(0, Math.round(start.remaining + (live - start.remaining) * e));
}

/** The rail between the picture's fill and the live one. */
export function warpPct(start: WarpStart, live: number, e: number): number {
  const from = start.pct ?? live;
  return clamp01(from + (live - from) * e);
}

/**
 * The sky's instant between the picture's hour and now — always forward,
 * through the clock: left at 22:00 and back at 06:00, the sky runs through
 * the night, not back through the day. Within the last day, so it is read
 * against today's times.
 */
export function warpSkyAt(start: WarpStart, now: number, e: number): number {
  // A clock that went back (a flight west, a corrected clock): no lap of
  // the day for an hour's difference, just back to the hour.
  if (now < start.at) return start.at + (now - start.at) * e;
  const ahead = (now - start.at) % DAY;
  return now - ahead * (1 - e);
}

// ── The run, for the whole process ───────────────────────────────────────
//
// Held here and not in the hero: Today can mount the hero more than once
// during a launch (a provisional week, then the stored one), and a run kept
// in component state would start over — or never start — on the second.
// Read from here, every hero sees the same moment of the same run.

type Run = {
  start: WarpStart;
  /** Where the run begins after a rewind from `start`; null for none. */
  via: WarpStart | null;
  t0: number | null;
  duration: number;
};
/** undefined: not decided yet; null: no run this launch (or it is over). */
let run: Run | null | undefined;
/** Told when the run begins (its t0 is set), so a hero can start drawing it. */
const onBegin = new Set<() => void>();

const HOLD = 'hero-run';

/** The live hero's current interval: the last prayer and the next. */
export type Interval = { fromAt: number; targetAt: number };

/**
 * The current prayer's own moment, when the picture was taken after it:
 * the run rewinds to this and sweeps forward. Null when the picture is
 * from before the prayer (the sweep crosses it anyway), from after the
 * next one (a clock that went back), or the hero has no interval to
 * speak of.
 */
export function rewindTarget(start: WarpStart, interval: Interval | null | undefined): WarpStart | null {
  if (!interval || !(interval.fromAt > 0) || !(interval.targetAt > interval.fromAt)) return null;
  if (start.at < interval.fromAt || start.at >= interval.targetAt) return null;
  return {
    remaining: Math.max(0, Math.floor((interval.targetAt - interval.fromAt) / 1000)),
    pct: 0,
    at: interval.fromAt,
  };
}

function lerpStart(a: WarpStart, b: WarpStart, k: number): WarpStart {
  return {
    remaining: Math.round(a.remaining + (b.remaining - a.remaining) * k),
    pct: a.pct == null || b.pct == null ? b.pct : a.pct + (b.pct - a.pct) * k,
    at: a.at + (b.at - a.at) * k,
  };
}

/** Quick out, quick in: a rewind is a flick, not a journey. */
function easeInOutQuad(k: number): number {
  const c = clamp01(k);
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function decide(reduceMotion: boolean, interval?: Interval | null): void {
  if (run !== undefined) return;
  const start = claimLaunchWarp();
  if (!start || reduceMotion) {
    run = null;
    return;
  }
  const via = rewindTarget(start, interval);
  const r: Run = { start, via, t0: null, duration: 0 };
  run = r;
  // A hero mid-run is not a screen to keep for the next launch.
  holdLaunchSnapshot(HOLD, true);
  setTimeout(() => {
    r.t0 = Date.now();
    r.duration = warpDurationMs(Math.abs(r.t0 - (via ?? start).at));
    onBegin.forEach(fn => fn());
  }, warpDelayMs());
}

/**
 * Where the run is: its start, and the eased progress 0…1 (0 until it
 * begins, while the picture fades). Null when there is no run, or it is over.
 */
export function warpProgress(now: number = Date.now()): { start: WarpStart; e: number } | null {
  if (!run) return null;
  if (run.t0 == null) return { start: run.start, e: 0 };
  let since = now - run.t0;
  if (run.via) {
    // The rewind: the START itself moves, from the picture's numbers back
    // to the prayer's, with the run not yet begun (e = 0) — so the hero
    // draws it with no change to how it draws the run.
    if (since < WARP_REWIND_MS) {
      return { start: lerpStart(run.start, run.via, easeInOutQuad(since / WARP_REWIND_MS)), e: 0 };
    }
    since -= WARP_REWIND_MS;
  }
  const from = run.via ?? run.start;
  const k = since / run.duration;
  if (k >= 1) {
    run = null;
    holdLaunchSnapshot(HOLD, false);
    return null;
  }
  return { start: from, e: easeOutCubic(k) };
}

/**
 * The run as a hero sees it, re-rendering the hero every frame while it
 * lasts and once more as it ends. Decides the run on the first call.
 *
 * Nothing is redrawn while the run waits for the fade: the hero holds the
 * picture's numbers, still, and the JS thread is left to the launch's own
 * work. The frames start when the run does.
 */
export function useLaunchWarp(
  reduceMotion: boolean,
  interval?: Interval | null,
): { start: WarpStart; e: number } | null {
  decide(reduceMotion, interval);
  // The setting is read asynchronously and can arrive after the run was
  // decided: Reduce Motion stops it where it is.
  if (reduceMotion && run) {
    run = null;
    holdLaunchSnapshot(HOLD, false);
  }
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const progress = warpProgress();
  const live = progress != null;
  useEffect(() => {
    if (!live) return undefined;
    let frame: number | null = null;
    const loop = () => {
      bump();
      frame = warpProgress() != null ? requestAnimationFrame(loop) : null;
    };
    const begin = () => {
      if (frame == null) frame = requestAnimationFrame(loop);
    };
    if (run?.t0 != null) begin();
    else onBegin.add(begin);
    return () => {
      onBegin.delete(begin);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [live]);
  return progress;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Test seam. */
export function _resetLaunchWarpForTests(): void {
  claimed = false;
  run = undefined;
  onBegin.clear();
}
