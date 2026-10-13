/**
 * The clock jumped — set by hand, corrected by the network, or the phone
 * came back from a long sleep: told by whoever ticks every second (the
 * hero), heard by whoever decides the day (HomeScreen's watchdog).
 *
 * The watchdog looks every thirty seconds, only while Today is on screen;
 * a clock set back a day put a countdown of thirty-odd hours on the hero
 * for up to half a minute. A tick that lands far from a second after the
 * last one is the jump itself, and the watchdog can look at once.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let lastTick: number | null = null;

/** A tick that is this far from a second after the last one is a jump. */
export const CLOCK_JUMP_MS = 60_000;

/** Called on the clock's seconds. */
export function noteClockTick(now: number = Date.now()): void {
  const prev = lastTick;
  lastTick = now;
  if (prev == null) return;
  if (Math.abs(now - prev - 1000) < CLOCK_JUMP_MS) return;
  listeners.forEach(fn => fn());
}

/** The ticks stopped (the hero left the screen): the next tick is a first one. */
export function forgetClockTicks(): void {
  lastTick = null;
}

export function onClockJump(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test seam. */
export function _resetClockJumpsForTests(): void {
  listeners.clear();
  lastTick = null;
}
