/**
 * A move found in the background, told to the app when it is alive.
 *
 * The 'LocationMoved' task (`backgroundLocation.ts`) runs in whatever
 * JavaScript there is: a process started for it, or the app itself, left
 * in the background with Today still mounted. In the second case writing
 * the new place to storage is not enough — Today holds the old one in
 * memory, showed it again when opened, and wrote it back (seen on an
 * Android 17 emulator: the task ran, and the app opened on Stockholm). So
 * the task also hands the place to Today's own loader, the one a position
 * found on screen goes through.
 *
 * Its own small file: the task imports half the app, and the hook that
 * listens must not import the task.
 */
export type LiveMove = {
  latitude: number;
  longitude: number;
  label: string;
  cityId: string;
};

let handler: ((move: LiveMove) => void) | null = null;

/** Today's loader, while it is mounted. Returns the way to take it back. */
export function onLiveMove(fn: (move: LiveMove) => void): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

/** True when the app was there to be told. */
export function tellLiveMove(move: LiveMove): boolean {
  if (!handler) return false;
  try {
    handler(move);
  } catch {
    // The stored place stands; the next opening loads it.
  }
  return true;
}
