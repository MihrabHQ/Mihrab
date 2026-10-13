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
 * ── THE PICTURE IS POSED AT THE PRAYER ───────────────────────────────
 *
 * Left at 13:00 and opened at 13:07, a picture of the screen as it was
 * would be seven minutes behind and the run a twitch. So the picture's
 * hero is not the screen's: it is drawn posed at the start of the current
 * interval — the countdown at the whole of it, the rail empty, the sky at
 * the prayer's hour (boot/poseHero.ts) — and the run always sweeps the
 * whole way from that prayer to now, whether seven minutes or three days
 * have passed. A picture native kept on its own (unposed) runs from its
 * own moment, as before.
 */
import { useEffect, useReducer } from 'react';
import {
  heroStateShown,
  hideRequestedAt,
  holdLaunchSnapshot,
  newLaunchSnapshotWindow,
} from '../native/LaunchSnapshot';
import { holdSideWorkUntil, newFirstPaintWindow } from './firstPaint';

/**
 * From JS asking native to hide the picture to the fade having finished:
 * native waits MOUNT_GRACE_MS (80) and fades for FADE_MS (220); a frame
 * more so the run starts on the live screen alone. The hero stands still
 * at the picture's numbers for all of it, so it is as short as it can be.
 */
export const WARP_AFTER_HIDE_MS = 320;
/** The longest a gap of hours is allowed to take to run through. */
export const WARP_MAX_MS = 900;
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
 * The picture's hero, once per window, for the first hero that asks.
 * Null when no picture was shown (a launch that drew the app itself) or
 * native kept nothing to start from.
 */
export function claimLaunchWarp(): WarpStart | null {
  if (claimed) return null;
  claimed = true;
  const s = heroStateShown();
  if (!s) return null;
  if (s.posed) {
    if (!(s.targetAt > s.fromAt) || !(s.fromAt > 0)) return null;
    return {
      remaining: Math.max(0, Math.floor((s.targetAt - s.fromAt) / 1000)),
      pct: 0,
      at: s.fromAt,
    };
  }
  if (!(s.targetAt > s.at)) return null;
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
  /** The fade is over: the run may draw. */
  begun: boolean;
  /** When its first frame was drawn, pushed forward by every stall since. */
  t0: number | null;
  duration: number;
  /** When the run was last read — a frame drawn, or any render of the hero. */
  lastSeen: number | null;
  /** The fade's delay is over. */
  delayOver: boolean;
  /** The sky's native layers have taken a value (markLaunchRunReady). */
  ready: boolean;
};
/**
 * ── THE RUN WAITS FOR ITS SKY ────────────────────────────────────────
 *
 * The run's sky is drawn by native layers driven by one native value
 * (HeroSky, `SkyRunLayers`), and those layers come alive a beat after
 * they are mounted: nodes made, wired to their views, the first value
 * taken — on the UI thread, behind the launch's own drawing. A run that
 * began on the fade's clock alone began before that: its first frames
 * set a value no layer was yet listening to, the sky stood at the
 * picture's while the countdown ran, and when the layers caught up the
 * sky jumped to wherever the run had got to — a third of the way into a
 * morning, from the sunrise's peach straight to the midday's blue. So
 * the hero says when the value has reached native (the value's own
 * listener, which native calls once it has taken a value), and the run
 * begins at the later of that and the fade — or WARP_READY_MAX_MS after
 * the fade if the word never comes (no sky to draw, a size of zero).
 */
export const WARP_READY_MAX_MS = 700;
/**
 * ── TIMED BY THE FRAMES DRAWN, NOT THE CLOCK ─────────────────────────
 *
 * The run's clock only runs while frames are being drawn. The launch's
 * first second is the busiest the JS thread ever is — the day's times,
 * the cards below, the schedule — and measured on a Pixel 10 Pro it
 * stalls for 100–300 ms at a time right where the run draws; on a slow
 * day for longer. Timed by the wall clock, a stall of the run's length
 * meant the next frame drawn was its last: the hero froze at the
 * picture's numbers, then jumped to now — the one thing the run exists
 * to avoid. So a gap between two frames longer than a dropped frame or
 * two is a stall, and the run resumes where it was: it starts when its
 * first frame is drawn, not when the fade is over, and stalls push its
 * start forward. Counted at every read of the run, not only in the frame
 * loop: after a stall the hero's own second tick can render before the
 * next frame, and that render must not find the run over either. A
 * stall is still a freeze, but followed by the run, not by the jump.
 * Whatever happens, it is over WARP_STALL_MAX_MS after it could have
 * been, so the side work and the next keep are never held for a run
 * that cannot draw.
 */
export const STALL_MS = 50;
const FRAME_MS = 16;
export const WARP_STALL_MAX_MS = 2500;
/** undefined: not decided yet; null: no run this launch (or it is over). */
let run: Run | null | undefined;
/** Told when the run begins (the fade is over), so a hero can start drawing it. */
const onBegin = new Set<() => void>();
/** Told when the run is over, however it ended. */
let onEnd: (() => void) | null = null;

function endRun(): void {
  run = null;
  holdLaunchSnapshot(HOLD, false);
  onEnd?.();
  onEnd = null;
}

const HOLD = 'hero-run';

function decide(reduceMotion: boolean): void {
  if (run !== undefined) return;
  const start = claimLaunchWarp();
  if (!start || reduceMotion) {
    run = null;
    return;
  }
  const r: Run = { start, begun: false, t0: null, duration: 0, lastSeen: null, delayOver: false, ready: false };
  run = r;
  // A hero mid-run is not a screen to keep for the next launch.
  holdLaunchSnapshot(HOLD, true);
  // And the launch's side work (alerts, widgets…) keeps off the JS thread
  // until the run has drawn its last frame.
  holdSideWorkUntil(
    new Promise<void>(resolve => {
      onEnd = resolve;
    }),
  );
  setTimeout(() => {
    // A window that closed while its run waited for the fade.
    if (run !== r) return;
    r.delayOver = true;
    if (r.ready) begin(r);
    else setTimeout(() => begin(r), WARP_READY_MAX_MS);
  }, warpDelayMs());
}

/** The run's first frame may be drawn: the fade is over and the sky is live. */
function begin(r: Run): void {
  if (run !== r || r.begun) return;
  r.begun = true;
  r.duration = warpDurationMs(Math.abs(Date.now() - r.start.at));
  onBegin.forEach(fn => fn());
  setTimeout(() => {
    if (run === r) endRun();
  }, r.duration + WARP_STALL_MAX_MS);
}

/** The run's length, once begun — the sky's native animation is this long. */
export function launchRunDurationMs(): number | null {
  const r = run;
  return r && r.begun ? r.duration : null;
}

/** The hero's word that the run's native value has been taken by native. */
export function markLaunchRunReady(): void {
  const r = run;
  if (!r || r.ready) return;
  r.ready = true;
  if (r.delayOver) begin(r);
}

/**
 * Where the run is: its start, and the eased progress 0…1 (0 until its
 * first frame, while the picture fades). Null when there is no run, or it
 * is over.
 */
export function warpProgress(now: number = Date.now()): { start: WarpStart; e: number } | null {
  const r = run;
  if (!r) return null;
  if (!r.begun) return { start: r.start, e: 0 };
  if (r.t0 == null) r.t0 = now;
  else if (r.lastSeen != null) {
    const gap = now - r.lastSeen;
    if (gap > STALL_MS) r.t0 += gap - FRAME_MS;
  }
  r.lastSeen = now;
  const k = (now - r.t0) / r.duration;
  if (k >= 1) {
    endRun();
    return null;
  }
  return { start: r.start, e: easeOutCubic(k) };
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
  enabled: boolean = true,
): { start: WarpStart; e: number } | null {
  if (enabled) decide(reduceMotion);
  // The setting is read asynchronously and can arrive after the run was
  // decided: Reduce Motion stops it where it is.
  if (enabled && reduceMotion && run) endRun();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const progress = enabled ? warpProgress() : null;
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
    if (run?.begun) begin();
    else onBegin.add(begin);
    return () => {
      onBegin.delete(begin);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [live]);
  return progress;
}

/** Whether a launch run is drawing (or about to): re-renders as it ends. */
export function useLaunchRunActive(): boolean {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const active = !!run;
  useEffect(() => {
    if (!active) return undefined;
    const prev = onEnd;
    onEnd = () => {
      prev?.();
      bump();
    };
    return undefined;
  }, [active]);
  return active;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// ── A window, not a process ──────────────────────────────────────────────
//
// Everything above is "once per launch" — and a launch is a window, not a
// process. On Android a task swiped away in Recents leaves the process
// behind, warm; the next tap on the icon makes a new window in it, on
// which native lays the kept picture as on any launch (LaunchSnapshot.kt).
// Without this, that window inherited the first one's "already claimed",
// "already painted" and "already hidden": no run, and the picture came
// down on native's safety timer, seconds late.

/**
 * The root of the app is mounting — once per window (App.tsx): the
 * state of the launch starts over. A run the old window was in the
 * middle of is over.
 */
export function beginLaunchWindow(): void {
  if (run) endRun();
  claimed = false;
  run = undefined;
  onBegin.clear();
  onEnd = null;
  newLaunchSnapshotWindow();
  newFirstPaintWindow();
}

/** Test seam. */
export function _resetLaunchWarpForTests(): void {
  claimed = false;
  run = undefined;
  onBegin.clear();
  onEnd = null;
}
