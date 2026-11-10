/**
 * WHEN THE HERO NEXT TICKS.
 *
 * The full page shows the seconds inside the last hour and ticks on the
 * clock's own seconds, so the countdown turns when the status bar's clock
 * does. Minimal shows them only inside the last five minutes
 * (`MINIMAL_SECONDS_UNDER`); before then its figures — "44m", "1h 15m" —
 * change once a minute, and a tick every second re-rendered the whole
 * hero sixty times for every change anyone could see. So under Minimal,
 * outside the last minutes, the hero ticks when its minute does: the
 * instant the time left crosses the next whole minute — a prayer's time
 * is on the minute, so that is on the clock's minute too — and from the
 * five minutes' mark on, on the seconds again.
 *
 * Measured on the emulator, Today standing still: under Minimal the JS
 * thread spent about 0.9 % of a core on the per-second tick.
 */

/** A hair past the boundary, so the tick reads the minute it was set for. */
const PAST_MS = 5;

/**
 * Milliseconds from `nowMs` to the next tick. `minimalSecondsUnder` is the
 * time left (s) under which Minimal shows the seconds; null for the full
 * page, which always ticks on the second.
 */
export function heroTickDelay(nowMs: number, targetMs: number, minimalSecondsUnder: number | null): number {
  const toSecond = 1000 - (((nowMs % 1000) + 1000) % 1000);
  if (minimalSecondsUnder == null) return toSecond;
  const left = targetMs - nowMs;
  // Inside the last minutes (and past the target, where the parent moves
  // on to the next prayer): on the seconds.
  if (left <= minimalSecondsUnder * 1000 + 1000) return toSecond;
  // The figures change when the time left crosses a whole minute.
  const toMinute = left % 60_000;
  return (toMinute === 0 ? 60_000 : toMinute) + PAST_MS;
}
