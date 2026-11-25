/**
 * The time as of this render — as a value React can see change.
 *
 * WHY NOT `Date.now()` IN THE COMPONENT. The React Compiler takes
 * rendering to be pure and keeps what a render worked out until a prop or
 * state it was worked out from changes. The clock is neither: compiled,
 * `const today = dayKey()` is asked once and kept for the component's
 * life. The Today screen's "logged today" (practiceStore.ts) was reading
 * yesterday's date from the first midnight the app stayed open through.
 *
 * A hook's result is something the compiler does not keep, so the time is
 * taken here and handed on: `dayKey(new Date(clock))`, `khatmahDay(plan,
 * clock)`. `tools/compiler-impure.js` finds a component that reads the
 * clock any other way, and `__tests__/reactCompilerScope.test.ts` fails on
 * one.
 *
 * AND THE DAY TURNING IS A RENDER. Before the compiler, a component that
 * read the date was right as of its last render, and something or other
 * re-rendered it often enough. A compiled parent hands its children the
 * same elements until something of theirs changes — nothing re-renders
 * by accident any more. So this also renders its component again when the
 * local day changes: at midnight if the app is open, and on the return to
 * the foreground if the day turned while it was away.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appState: { remove(): void } | null = null;
let seenDay = '';

const dayOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function untilMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  // A second past it, so the timer never fires a hair before the date turns.
  return Math.max(1000, next.getTime() - now.getTime() + 1000);
}

function check(): void {
  const now = new Date();
  const day = dayOf(now);
  if (day !== seenDay) {
    seenDay = day;
    for (const listener of [...listeners]) listener();
  }
  if (timer) clearTimeout(timer);
  timer = listeners.size > 0 ? setTimeout(check, untilMidnight(now)) : null;
}

/** `listener` is called when the local day has changed. Returns the unsubscribe. */
export function onDayChange(listener: () => void): () => void {
  if (listeners.size === 0) {
    seenDay = dayOf(new Date());
    // A timer does not run while the app is suspended: the return to the
    // foreground asks again.
    appState = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
  }
  listeners.add(listener);
  if (!timer) timer = setTimeout(check, untilMidnight(new Date()));
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      appState?.remove();
      appState = null;
    }
  };
}

/** Epoch milliseconds, read at this render; the component renders again when the day turns. */
export function useRenderClock(): number {
  'use no memo';
  const [, renderAgain] = useState(0);
  useEffect(() => onDayChange(() => renderAgain(n => n + 1)), []);
  return Date.now();
}
