/**
 * A value made once and kept for the component's life — an
 * `Animated.Value`, a store, a list of them.
 *
 * In place of `useRef(new Animated.Value(0)).current`, which the app used
 * everywhere and which has two costs: the value is built again on every
 * render and thrown away, and reading `.current` while rendering keeps the
 * React Compiler out of the whole component (tools/compiler-report.js).
 * State that is never set is the same thing without either.
 */
import { useState } from 'react';

export function useConst<T>(make: () => T): T {
  return useState(make)[0];
}
