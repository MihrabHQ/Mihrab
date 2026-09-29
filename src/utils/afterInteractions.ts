/**
 * `InteractionManager.runAfterInteractions`, which React Native 0.87
 * removed in favour of `requestIdleCallback` — same shape, so the call
 * sites change only their import. (Rewrite plan, 5.1 spike.)
 */
type Idle = {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function afterInteractions(run: () => void): { cancel: () => void } {
  const g = globalThis as Idle;
  if (g.requestIdleCallback) {
    const id = g.requestIdleCallback(run);
    return { cancel: () => g.cancelIdleCallback?.(id) };
  }
  const t = setTimeout(run, 0);
  return { cancel: () => clearTimeout(t) };
}
