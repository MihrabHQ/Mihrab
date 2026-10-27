/**
 * "Has this screen just come in front of someone?" — the window in which
 * the page's small motions run.
 *
 * The three twinkling stars and Minimal's breathing rail head are native
 * animation loops: nothing on the JS thread, but every frame of them is a
 * frame the renderer draws, and a loop that never ends keeps the display
 * pipeline at its full rate for as long as the page is in front. Measured
 * on a Pixel 10 Pro with Today standing still at night: the render thread
 * at half to two thirds of a core, hour after hour — heat, battery, and a
 * phone with no memory to spare starved of the time it needed at the
 * adhan. Over the emulator's software GL the same.
 *
 * So the motions are an arrival, not a condition. They run for a while
 * after the screen comes in front — opened, returned to from another tab,
 * brought back from the background — and then the page is still, as a
 * page is. The countdown's own turning says the count is live. They come
 * again on the next arrival.
 */
import { useEffect, useState } from 'react';

/** How long the small motions run after an arrival. */
export const LIVELY_MS = 30_000;

/**
 * True for `ms` after `active` becomes true, then false until it becomes
 * true again. Never true while `active` is false.
 */
export function useLively(active: boolean, ms: number = LIVELY_MS): boolean {
  const [lively, setLively] = useState(active);
  useEffect(() => {
    if (!active) {
      setLively(false);
      return undefined;
    }
    setLively(true);
    const id = setTimeout(() => setLively(false), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return active && lively;
}
