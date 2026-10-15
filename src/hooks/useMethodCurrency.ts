/**
 * Is the calculation behind these times current (`methodCurrency.ts`)? Null
 * where the source is not a computed authority's. Follows a list put in
 * force, or a certification read, while the screen is open.
 */
import { useEffect, useState } from 'react';
import {
  methodAuthorityFor,
  methodCurrency,
  onMethodCurrencyChange,
  type MethodCurrency,
} from '../providers/methodCurrency';
import type { PrayerDataProviderId } from '../settings/types';

export function useMethodCurrency(
  provider: PrayerDataProviderId,
  coords: { latitude: number; longitude: number } | null,
  calculationMethod: number | 'auto',
  /** The last day the screen shows (default: today). */
  until?: Date,
): MethodCurrency | null {
  const [tick, setTick] = useState(0);
  useEffect(() => onMethodCurrencyChange(() => setTick(n => n + 1)), []);
  void tick;
  if (!coords || (coords.latitude === 0 && coords.longitude === 0)) return null;
  const authority = methodAuthorityFor(provider, calculationMethod, coords.latitude, coords.longitude);
  return authority ? methodCurrency(authority, until ?? new Date()) : null;
}
