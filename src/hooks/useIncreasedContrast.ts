/**
 * Whether the person has asked the system for more contrast: iOS "Increase
 * Contrast" (darker system colours) or "Reduce Transparency", Android's
 * high-contrast text. The hero's countdown wears a soft glow of the
 * hour's accent under the Sky theme by night; for someone who has asked
 * for contrast a halo behind the digits is the opposite of what they
 * asked for, so it is left off.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

type Query = () => Promise<boolean>;
type Event = 'darkerSystemColorsChanged' | 'reduceTransparencyChanged' | 'highTextContrastChanged';

const QUERIES: ReadonlyArray<{ ask: Query | undefined; on: Event }> =
  Platform.OS === 'ios'
    ? [
        { ask: AccessibilityInfo.isDarkerSystemColorsEnabled, on: 'darkerSystemColorsChanged' },
        { ask: AccessibilityInfo.isReduceTransparencyEnabled, on: 'reduceTransparencyChanged' },
      ]
    : Platform.OS === 'android'
      ? [{ ask: AccessibilityInfo.isHighTextContrastEnabled, on: 'highTextContrastChanged' }]
      : [];

export function useIncreasedContrast(): boolean {
  const [flags, setFlags] = useState<boolean[]>(() => QUERIES.map(() => false));
  useEffect(() => {
    let alive = true;
    QUERIES.forEach((q, i) => {
      void q.ask?.().then(
        v => {
          if (alive) setFlags(prev => (prev[i] === v ? prev : prev.map((p, j) => (j === i ? v : p))));
        },
        () => {},
      );
    });
    const subs = QUERIES.map((q, i) =>
      AccessibilityInfo.addEventListener(q.on, (v: boolean) => {
        setFlags(prev => (prev[i] === v ? prev : prev.map((p, j) => (j === i ? v : p))));
      }),
    );
    return () => {
      alive = false;
      subs.forEach(s => s.remove());
    };
  }, []);
  return flags.some(Boolean);
}
