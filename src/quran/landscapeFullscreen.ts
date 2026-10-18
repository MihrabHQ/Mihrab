/**
 * ON ITS SIDE, A PHONE READS FULLSCREEN.
 *
 * Landscape on a phone is a short window — the header, the page bar and the
 * status bar take a third of it — and the phone is turned to read, not to
 * use the chrome. So turning to landscape goes fullscreen, and turning back
 * puts upright back the way it was: windowed if it was windowed.
 *
 * Fullscreen can still be left on its side (✕, a tap, back); that is the
 * reader's choice for this turn, and the next turn to landscape starts
 * fullscreen again. Only a change of orientation decides anything here — a
 * toggle within one orientation is the reader's own.
 *
 * Phones only (the caller says which): an iPad on its side is the spread,
 * with room for everything.
 */
import { useEffect, useRef } from 'react';

export function useLandscapeFullscreen(
  landscape: boolean,
  isFullscreen: boolean,
  request: (next?: boolean) => void,
): void {
  /** Upright's choice, kept while on its side. */
  const upright = useRef<boolean | null>(null);
  const was = useRef<boolean | null>(null);
  // Read at the moment of the turn, not a dependency: a toggle within an
  // orientation must not run this.
  const full = useRef(isFullscreen);
  full.current = isFullscreen;
  const ask = useRef(request);
  ask.current = request;

  useEffect(() => {
    const before = was.current;
    was.current = landscape;
    if (before === landscape) return;
    if (landscape) {
      // Opened on its side counts as coming from a windowed upright.
      upright.current = before == null ? false : full.current;
      if (!full.current) ask.current(true);
    } else if (before === true) {
      const back = upright.current ?? false;
      upright.current = null;
      if (full.current !== back) ask.current(back);
    }
  }, [landscape]);
}
