/**
 * A cold start's timeline, in one logcat line.
 *
 * `bootMark` notes how long after the bundle started running a step of the
 * launch happened; `reportBoot` prints them once, after the first real
 * frame, as
 *
 *   [boot] js0=1728… settings=212 home=240 ready=389 paint=405
 *
 * where `js0` is the wall clock when the bundle started (to line it up with
 * the ActivityManager lines around it in logcat) and every other number is
 * milliseconds since then. Nothing else is recorded and nothing leaves the
 * phone: it is there so a slow launch can be measured on a release build,
 * which is the only build whose launch is worth measuring.
 *
 * Imported FIRST in index.js, so "since the bundle started" means it. This
 * module must stay free of imports for the same reason.
 */

type Mark = { label: string; ms: number };

declare const global: {
  nativePerformanceNow?: () => number;
  __mihrabTraceDump?: () => void;
};

const now: () => number =
  typeof global.nativePerformanceNow === 'function'
    ? () => (global.nativePerformanceNow as () => number)()
    : () => Date.now();

const start = now();
const wallStart = Date.now();
const marks: Mark[] = [];
const seen = new Set<string>();
let reported = false;

/** Note a step of the launch. Only the first mark of each label counts. */
export function bootMark(label: string): void {
  if (reported || seen.has(label)) return;
  seen.add(label);
  marks.push({ label, ms: Math.round(now() - start) });
}

/** Milliseconds since the bundle started running. */
export function sinceBoot(): number {
  return Math.round(now() - start);
}

/** Print the timeline once. Later calls do nothing. */
export function reportBoot(): void {
  if (reported) return;
  reported = true;
  const parts = marks.map(m => `${m.label}=${m.ms}`);
  // eslint-disable-next-line no-console
  console.log(`[boot] js0=${wallStart} ${parts.join(' ')}`);
  // The module-level trace, when a build was made with
  // tools/startup-trace (never in a shipped build).
  global.__mihrabTraceDump?.();
}

/** Test seam. */
export function _bootMarksForTests(): readonly Mark[] {
  return marks;
}
