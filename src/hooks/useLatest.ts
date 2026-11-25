/**
 * A ref kept at the newest value, for code that runs later — a gesture's
 * handler, a timer, a subscription set up once.
 *
 *     const live = useRef({ index, width });
 *     useKeepLatest(live, { index, width });
 *
 * The app wrote the second line as an assignment while rendering
 * (`live.current = { … }`). It works, and it is what kept the React
 * Compiler out of the components that did it — the muṣḥaf's pager,
 * Minimal's swipe, the hero's clock among them: a ref written during
 * render is something the compiler cannot reason about, so it leaves the
 * whole component as written (tools/compiler-report.js).
 *
 * Here the write happens when the render is committed, in an insertion
 * effect: before any layout effect of any component, so nothing that runs
 * after a render — an effect, a handler, a frame — can see the value of
 * the render before. What differs from the assignment it replaces is only
 * a render React throws away (an interrupted one), whose value the ref now
 * never holds; that is the more correct of the two.
 *
 * The ref stays the component's own `useRef`, which is what lets the
 * compiler see that it is one (and that it never changes): a ref handed
 * back by a hook is, to the compiler, any object.
 *
 * NOT for a value read WHILE rendering: that is state, or a plain variable.
 */
import { useInsertionEffect, type MutableRefObject } from 'react';

export function useKeepLatest<T>(ref: MutableRefObject<T>, value: T): void {
  useInsertionEffect(() => {
    ref.current = value;
  });
}
