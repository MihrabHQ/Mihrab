/**
 * Re-render when the user picks another Hijri calendar or adjustment.
 *
 * A Hijri date is computed from the date alone, so a `useMemo` keyed on the
 * date would keep the old calendar's answer: list this among its
 * dependencies. The same counter-snapshot pattern as `useIslamicDay`.
 */
import { useSyncExternalStore } from 'react';

import { hijriCalendarVersion, subscribeHijriCalendar } from './calendar';

export function useHijriCalendarVersion(): number {
  return useSyncExternalStore(
    subscribeHijriCalendar,
    hijriCalendarVersion,
    hijriCalendarVersion,
  );
}
