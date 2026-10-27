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
  if (seen.has(label)) return;
  seen.add(label);
  const ms = Math.round(now() - start);
  // A step after the first paint — the launch run's — is printed on its
  // own, on the same clock, so it lines up with the line already printed.
  if (reported) {
    // eslint-disable-next-line no-console
    console.log(`[boot] ${label}=${ms}`);
    return;
  }
  marks.push({ label, ms });
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
  // The JS heap, once the boot has settled and again a minute on: what the
  // app holds when it is standing still, in the log beside the timeline,
  // so a build can be checked against the last without a profiler.
  logHeap('boot');
  setTimeout(() => logHeap('settled'), 20_000);
  setTimeout(() => logHeap('minute'), 60_000);
}

/** The Hermes heap, as the engine reports it: live bytes, heap size, external bytes. */
export function logHeap(label: string): void {
  const stats = (global as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } })
    .HermesInternal?.getInstrumentedStats?.();
  if (!stats) return;
  const mb = (n: number | undefined) => (n == null ? '?' : (n / 1048576).toFixed(1));
  // eslint-disable-next-line no-console
  console.log(
    `[heap] ${label} live=${mb(stats.js_allocatedBytes)}MB heap=${mb(stats.js_heapSize)}MB external=${mb(stats.js_externalBytes)}MB malloc=${mb(stats.js_mallocSizeEstimate)}MB va=${mb(stats.js_vaSize)}MB gcs=${stats.js_numGCs ?? '?'}`,
  );
}

/** Test seam. */
export function _bootMarksForTests(): readonly Mark[] {
  return marks;
}
