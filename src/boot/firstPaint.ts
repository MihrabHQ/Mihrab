/**
 * "The first real frame is on screen" — as a latch anything can wait on.
 *
 * ── WHY ──────────────────────────────────────────────────────────────
 *
 * The moment the Today card first has its times, the same effect flush
 * that draws them also rebuilds the whole prayer-alert schedule, the
 * end-of-day and adhkār reminders, the home-screen widget's payload (a
 * storage read, a build, a native write) and the Live Activity's, and
 * `AppNavigationRoot` is draining the widget's tap queue and republishing
 * on top. None of it is on screen. All of it ran on the JS thread in the
 * same breath as the first paint, and a cold start measured 87 ms
 * between the ready render's commit and the next animation frame — the
 * frame the reader was waiting for, queued behind bookkeeping.
 *
 * So that work waits for this. It is not cancelled and not made rarer;
 * it starts one frame later than it did, after the card is drawn.
 *
 * ── WHO MARKS IT ──────────────────────────────────────────────────────
 *
 * `HomeScreen`, once its first `ready` render has been committed and a
 * frame has gone by. Not every launch reaches that — onboarding, a
 * location error, the Mac with no location yet — so a timer marks it
 * anyway a few seconds in, and the side work runs as it always did.
 * Marking is idempotent; the promise resolves once and stays resolved.
 */
import { useEffect, useState } from 'react';
import { bootMark, reportBoot } from './bootTimeline';
import { hideLaunchSnapshot } from '../native/LaunchSnapshot';

let done = false;
/** The side work may go: the paint has happened AND nothing is holding it. */
let released = false;
let markDone: () => void = () => {};
/**
 * Something on screen that the side work must not run under: the hero's
 * launch run (src/boot/launchWarp.ts). The alert schedule, the widget
 * payload and the rest took the JS thread for a few hundred milliseconds
 * right after the first paint — which is exactly when the run draws its
 * frames, and it stuttered. They wait until the run is over, or this long
 * at most — long enough for a run that stalled and resumed
 * (launchWarp.ts, WARP_STALL_MAX_MS) to finish first.
 */
let hold: Promise<void> | null = null;
export const SIDE_WORK_HOLD_MAX_MS = 3500;

export function holdSideWorkUntil(until: Promise<void>): void {
  if (released) return;
  hold = until;
}
let gate: Promise<void> = new Promise<void>(resolve => {
  markDone = resolve;
});

/**
 * How long a launch may go without a first paint before the side work
 * stops waiting. Long enough that a real first paint always wins; short
 * enough that a launch straight into onboarding still schedules its
 * alerts before the person has finished reading the greeting.
 */
export const FIRST_PAINT_FALLBACK_MS = 4000;
let fallback: ReturnType<typeof setTimeout> | null = null;

/**
 * The timer starts when somebody first WAITS, not when the module loads:
 * a launch that never asks (a headless task, a test) never owns a timer.
 */
function armFallback(): void {
  if (done || fallback) return;
  fallback = setTimeout(() => markFirstPaint(true), FIRST_PAINT_FALLBACK_MS);
}

/** The first real frame has been handed to the screen. Idempotent. */
export function markFirstPaint(viaFallback: boolean = false): void {
  if (done) return;
  done = true;
  bootMark(viaFallback === true ? 'paint-fallback' : 'paint');
  reportBoot();
  // The kept screen (Android) has covered the launch so far. Two frames
  // and a beat more, so what arrives just after the first paint — the sky,
  // the cards below — is drawn before the picture fades into it.
  settleThenHideSnapshot();
  if (fallback) {
    clearTimeout(fallback);
    fallback = null;
  }
  const release = () => {
    released = true;
    markDone();
  };
  if (!hold) {
    release();
    return;
  }
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    release();
  }, SIDE_WORK_HOLD_MAX_MS);
  void hold.then(() => {
    if (timer) clearTimeout(timer);
    timer = null;
    release();
  });
}

/** How long after the first paint the kept launch screen starts to fade. */
export const SNAPSHOT_SETTLE_MS = 120;

function settleThenHideSnapshot(): void {
  if (typeof requestAnimationFrame !== 'function') {
    hideLaunchSnapshot();
    return;
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      setTimeout(hideLaunchSnapshot, SNAPSHOT_SETTLE_MS);
    }),
  );
}

/** Resolves after the first paint; already resolved if it has happened. */
export function afterFirstPaint(): Promise<void> {
  armFallback();
  return gate;
}

export function firstPaintDone(): boolean {
  return done;
}

/**
 * `true` once the first paint has happened. A component that renders
 * before it re-renders once when it does; one that mounts after it gets
 * `true` immediately and never re-renders on its account.
 */
export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(released);
  useEffect(() => {
    if (ready) return undefined;
    let live = true;
    void afterFirstPaint().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

/**
 * A new window of this process is opening (src/boot/launchWarp.ts,
 * `beginLaunchWindow`): its first frame is yet to come, and the side work
 * of that launch waits for it as a cold start's does. Whoever was still
 * waiting on the old window's gate is let go — nothing of that window is
 * worth holding for.
 */
export function newFirstPaintWindow(): void {
  markDone();
  done = false;
  released = false;
  hold = null;
  if (fallback) clearTimeout(fallback);
  fallback = null;
  gate = new Promise<void>(resolve => {
    markDone = resolve;
  });
}

/** Test seam: back to "not yet painted", with a fresh gate and timer. */
export function _resetFirstPaintForTests(): void {
  newFirstPaintWindow();
}
