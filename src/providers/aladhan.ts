import type { TimingsMap } from '../types/prayer';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import {
  ProviderError,
  isAbortOrTimeoutError,
  isNetworkError,
} from './errors';
import type { PrayerTimesResult } from './types';
import {
  ALADHAN_LATITUDE_ADJUSTMENT,
  CUSTOM_METHOD_ID,
  getCalculationPreferences,
} from '../prayer/calculationPreferences';
import { SWEDEN_METHOD_ID } from './swedenMethodId';

const PROVIDER = 'aladhan';
const BASE = 'https://api.aladhan.com/v1';

type AladhanTimingsResponse = {
  code: number;
  status: string;
  data?: {
    timings: TimingsMap;
    meta?: {
      timezone?: string;
    };
  };
};

/**
 * AlAdhan's path segment is DD-MM-YYYY, and it does not reject anything else.
 *
 * The app sent `formatLocalDate` — ISO `YYYY-MM-DD` — for years. AlAdhan
 * parses that day-first too, so `2026-08-30` was read as day 2026 of month
 * 08, normalised, and answered for **30-08-2030**: four years out, and for
 * Morocco an hour out as well, because the wrong year lands on the wrong
 * side of the country's Ramadan clock change. There is no error in the
 * response — `code` is 200, the shape validates, the times look plausible —
 * so nothing downstream could have caught it. Only comparing a stored day
 * against the ministry's own table made it visible.
 *
 * Hence its own function and its own test: the ISO formatter is right for
 * every OTHER use in this file's neighbourhood (cache keys, dataset lookups),
 * which is exactly why it got used here.
 */
export function formatAladhanDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${d.getFullYear()}`;
}

export async function fetchAladhanTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  method?: number | 'auto';
  school?: number;
}): Promise<PrayerTimesResult> {
  const dateStr = formatAladhanDate(params.date);
  const query = new URLSearchParams();
  query.append('latitude', String(params.latitude));
  query.append('longitude', String(params.longitude));
  const prefs = getCalculationPreferences();
  if (params.method === CUSTOM_METHOD_ID) {
    // The user's own angles: `methodSettings` is Fajr angle, Maghrib
    // (null = sunset), Isha angle.
    query.append('method', String(CUSTOM_METHOD_ID));
    query.append('methodSettings', `${prefs.customFajrAngle},null,${prefs.customIshaAngle}`);
  } else if (params.method === SWEDEN_METHOD_ID) {
    // The app's own id, which AlAdhan has not; asked anyway (a caller
    // that could not compute it), the nearest AlAdhan has for Sweden is
    // the Muslim World League's angles.
    query.append('method', '3');
  } else if (params.method !== 'auto' && params.method !== undefined) {
    query.append('method', String(params.method));
  } else {
    // If 'auto' or undefined, AlAdhan automatically selects the best method based on location.
    // We can explicitly pass '99' for auto, or just omit it. Omitting it defaults to auto detection.
  }
  if (params.school !== undefined) {
    query.append('school', String(params.school));
  }
  // The summer-night rule, named so it is the same one the phone computes
  // with offline (`localAdhan.ts`); AlAdhan's default is the same ANGLE_BASED.
  query.append('latitudeAdjustmentMethod', String(ALADHAN_LATITUDE_ADJUSTMENT[prefs.highLatitudeRule]));
  const url = `${BASE}/timings/${dateStr}?${query.toString()}`;

  let res: Response;
  try {
    res = await fetchWithRetry(url, undefined, {
      maxAttempts: 4,
      baseDelayMs: 1000,
      timeoutMs: 7000,
    });
  } catch (e) {
    if (isAbortOrTimeoutError(e)) {
      throw new ProviderError(PROVIDER, 'timeout', 'AlAdhan request timed out', { cause: e });
    }
    if (isNetworkError(e)) {
      throw new ProviderError(PROVIDER, 'network', 'AlAdhan network failure', { cause: e });
    }
    throw new ProviderError(PROVIDER, 'unknown', 'AlAdhan request failed', { cause: e });
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(
      PROVIDER,
      'unauthorized',
      `AlAdhan returned ${res.status}`,
      { status: res.status },
    );
  }
  if (res.status >= 500) {
    throw new ProviderError(
      PROVIDER,
      'server',
      `AlAdhan server error (${res.status})`,
      { status: res.status },
    );
  }
  if (!res.ok) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `AlAdhan request failed (${res.status})`,
      { status: res.status },
    );
  }

  let json: AladhanTimingsResponse;
  try {
    json = (await res.json()) as AladhanTimingsResponse;
  } catch (e) {
    throw new ProviderError(PROVIDER, 'shape', 'AlAdhan response was not valid JSON', { cause: e });
  }
  if (json.code !== 200 || !json.data?.timings) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      json.status || 'AlAdhan returned an unexpected payload shape',
    );
  }
  return {
    timings: json.data.timings,
    timezone: json.data.meta?.timezone,
  };
}
