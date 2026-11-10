/**
 * An error that is caught and deliberately not acted on — but not lost.
 *
 * The app is full of places that must not fall over: a setting that fails
 * to read is the default, a peer file that will not parse is skipped, a
 * sound that will not load is silence. Each was a bare `catch {}`, and
 * that is the right behaviour and the wrong record: when sync quietly
 * stopped syncing, or a download quietly never finished, there was
 * nothing anywhere to say which of three hundred places had swallowed
 * the reason.
 *
 * So the catch stays, and hands what it caught here. In development it
 * is a console warning naming the place. In a release nothing is printed
 * and nothing leaves the device: the last few are kept in memory only
 * (`recentQuiet`), for a diagnostics page or a debugger to read.
 *
 * It never throws, takes no time worth measuring, and changes nothing
 * about what the caller does next.
 */
export type QuietEntry = { where: string; message: string; at: number };

const KEEP = 50;
const recent: QuietEntry[] = [];

const underTest = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID;

function messageOf(error: unknown): string {
  try {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
  } catch {
    return 'unprintable error';
  }
}

/** Note an error the caller is about to ignore. `where` names the place: the module, as 'sync/folderSync'. */
export function quiet(where: string, error: unknown): void {
  try {
    recent.push({ where, message: messageOf(error).slice(0, 300), at: Date.now() });
    if (recent.length > KEEP) recent.shift();
    if (typeof __DEV__ !== 'undefined' && __DEV__ && !underTest) {
      console.warn(`[quiet] ${where}:`, error);
    }
  } catch {
    // The one place that really must not throw.
  }
}

/** The last few ignored errors, oldest first. In memory only; gone when the app is. */
export function recentQuiet(): readonly QuietEntry[] {
  return recent.slice();
}

/** Test seam. */
export function _resetQuietForTests(): void {
  recent.length = 0;
}
