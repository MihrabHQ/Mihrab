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
  onHideRequested,
  newLaunchSnapshotWindow,
} from '../native/LaunchSnapshot';
import { holdSideWorkUntil, newFirstPaintWindow } from './firstPaint';
import { bootMark } from './bootTimeline';

/**
 * From JS asking native to hide the picture to the fade having finished:
 * native waits MOUNT_GRACE_MS (80) and fades for FADE_MS (220); a frame
 * more so the run starts on the live screen alone. The hero stands still
 * at the picture's numbers for all of it, so it is as short as it can be.
 */
export const WARP_AFTER_HIDE_MS = 320;
/**
 * ── TIMED FROM THE FADE'S ASK ────────────────────────────────────────
 *
 * The run is WARP_AFTER_HIDE_MS after the fade is asked for. The hero
 * decides its run in its first render, and the ask is HomeScreen's
 * layout effect of the same commit — a few milliseconds later — so a
 * run timed from the render was timed from the ask, near enough, as
 * long as that order held. It is not left to the order any more: the
 * run waits for the ask itself (`onHideRequested`, at once when it has
 * been made) and begins WARP_AFTER_HIDE_MS after it, so the fade ends on
 * the posed hero and the hero then sets off, whatever commits the
 * screen. Measured on a Pixel 10 Pro, 2.33: `commit=237 … run=613`, the
 * ask at the commit. A window that never asks (one that never commits a
 * screen worth fading into) is capped at WARP_HIDE_WAIT_MAX_MS from the
 * hero's mount, so a run is never left waiting for a fade that never comes.
 */
export const WARP_HIDE_WAIT_MAX_MS = 1500;
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
  /** What the picture's hero counted down to. */
  targetAt: number;
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
      targetAt: s.targetAt,
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
    targetAt: s.targetAt,
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
  /** The picture's hero, or null when the launch drew no picture (see `decide`). */
  start: WarpStart | null;
  /** The hour the run starts from — the picture's, or the interval's start. */
  at: number;
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
  /** Which return this is, for the `[run]` line. */
  kind: 'launch' | 'return';
  /** Frames drawn, stalls met and the longest, for the `[run]` line. */
  frames: number;
  stalls: number;
  longestStall: number;
  decidedAt: number;
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
  const r = run;
  run = null;
  if (r) {
    // One line a run, as `[boot]` is one a launch: how many frames it
    // drew, how often the JS thread held it up and for how long at most,
    // and how long it was from being decided to being over. Read from
    // logcat on a release build; nothing leaves the phone.
    // eslint-disable-next-line no-console
    console.log(
      `[run] ${r.kind} frames=${r.frames} stalls=${r.stalls} longest=${Math.round(r.longestStall)} duration=${r.duration} total=${Math.round(Date.now() - r.decidedAt)}`,
    );
  }
  for (const fn of afterRunWaiters) fn();
  afterRunWaiters.clear();
  holdLaunchSnapshot(HOLD, false);
  onEnd?.();
  onEnd = null;
}

const HOLD = 'hero-run';

/**
 * `ownAt`: the start of the interval the hero is in, when it knows it.
 * A launch that drew no picture — the first ever, or one whose picture
 * was of another look (the Sky theme's dark hour after a light one:
 * native/LaunchSnapshot.ts, the look key) — used to draw the live hero
 * at once. It runs now all the same, from the interval's start to now
 * (TodayCard, `ownStart`): the run is the hero's, not the picture's; the
 * picture only hides the first paint when there is one to show.
 */
function decide(reduceMotion: boolean, ownAt: number | null | undefined): void {
  if (run !== undefined) return;
  const start = claimLaunchWarp();
  const at = start?.at ?? ownAt;
  if (at == null || reduceMotion) {
    run = null;
    return;
  }
  const r: Run = {
    start,
    at,
    begun: false,
    t0: null,
    duration: 0,
    lastSeen: null,
    delayOver: false,
    ready: false,
    kind: 'launch',
    frames: 0,
    stalls: 0,
    longestStall: 0,
    decidedAt: Date.now(),
  };
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
  const arm = () =>
    setTimeout(() => {
      // A window that closed while its run waited for the fade.
      if (run !== r) return;
      r.delayOver = true;
      if (r.ready) begin(r);
      else setTimeout(() => begin(r), WARP_READY_MAX_MS);
    }, warpDelayMs());
  if (hideRequestedAt() != null) {
    arm();
    return;
  }
  let armed = false;
  let off: () => void = () => {};
  const cap = setTimeout(() => once(), WARP_HIDE_WAIT_MAX_MS);
  const once = () => {
    if (armed || run !== r) return;
    armed = true;
    clearTimeout(cap);
    off();
    arm();
  };
  off = onHideRequested(once);
}

/**
 * ── THE RETURN RUN ───────────────────────────────────────────────────
 *
 * A launch is not the only way to come back to the hero. The app is
 * brought back from the background, the Today tab is tapped after a
 * chapter in the Qur'an, Settings is closed — and the hero, whose clock
 * stops while it is out of sight (`useIsActive`), came back by JUMPING
 * from the numbers it was left at to now: "Asr in 2h 14m" to "Asr in
 * 1h 51m" in one frame, the rail a step along, the sky another hour
 * (2.33). The same return through a cold start is the launch run, from
 * the prayer. So a return after RESUME_RUN_MIN_MS away is a run too, by
 * the same machinery, from the numbers the hero was left at — the
 * picture in the reader's memory — to now; across a prayer, from the new
 * interval's start, as a launch does (TodayCard, `ownStart`). Under that
 * many seconds away the countdown simply picks up: a twitch of a few
 * seconds would be motion for its own sake. No picture, no fade: it
 * begins once the sky's layers have taken the value, as a launch's does.
 * Never over a run already under way.
 */
export const RESUME_RUN_MIN_MS = 15_000;
export function startResumeRun(start: WarpStart): boolean {
  if (run) return false;
  const r: Run = {
    start,
    at: start.at,
    begun: false,
    t0: null,
    duration: 0,
    lastSeen: null,
    delayOver: true,
    ready: false,
    kind: 'return',
    frames: 0,
    stalls: 0,
    longestStall: 0,
    decidedAt: Date.now(),
  };
  run = r;
  holdLaunchSnapshot(HOLD, true);
  setTimeout(() => begin(r), WARP_READY_MAX_MS);
  return true;
}

/**
 * ── WHAT WAITS FOR THE RUN ───────────────────────────────────────────
 *
 * A launch's side work waits for the launch run (firstPaint.ts). A
 * return's did not: the app's foreground listeners — the day's resync,
 * the widget's republish, the auto-sync — all fire on the same 'active'
 * event the hero returns on, and the return run then drew every other
 * frame (a Pixel 10 Pro, 2.33: pairs of identical frames through its
 * first half). They wait here now. The run is decided by the hero's
 * effect a frame or two after the event, so the wait looks after two
 * frames before deciding there is nothing to wait for; a run in progress
 * is waited out, however it ends.
 */
const afterRunWaiters = new Set<() => void>();
export function afterRun(): Promise<void> {
  return new Promise<void>(resolve => {
    const look = () => {
      if (run) afterRunWaiters.add(resolve);
      else resolve();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(look, 0)));
    } else {
      setTimeout(look, 2 * FRAME_MS);
    }
  });
}

/** The run's first frame may be drawn: the fade is over and the sky is live. */
function begin(r: Run): void {
  if (run !== r || r.begun) return;
  r.begun = true;
  bootMark('run');
  r.duration = warpDurationMs(Math.abs(Date.now() - r.at));
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
  bootMark('sky-ready');
  if (r.delayOver) begin(r);
}

/**
 * Where the run is: its start, and the eased progress 0…1 (0 until its
 * first frame, while the picture fades). Null when there is no run, or it
 * is over.
 */
export function warpProgress(now: number = Date.now()): { start: WarpStart | null; e: number } | null {
  const r = run;
  if (!r) return null;
  if (!r.begun) return { start: r.start, e: 0 };
  if (r.t0 == null) r.t0 = now;
  else if (r.lastSeen != null) {
    const gap = now - r.lastSeen;
    if (gap > STALL_MS) {
      r.t0 += gap - FRAME_MS;
      r.stalls += 1;
      if (gap > r.longestStall) r.longestStall = gap;
    }
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
  ownAt?: number | null,
): { start: WarpStart | null; e: number } | null {
  if (enabled) decide(reduceMotion, ownAt);
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
      if (run) run.frames += 1;
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
