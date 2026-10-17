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

/**
 * The query every AlAdhan request sends for a place and a method: the same
 * for a day and for a month, so the two can never disagree about which
 * method, school or summer-night rule they asked for.
 */
function aladhanQuery(params: {
  latitude: number;
  longitude: number;
  method?: number | 'auto';
  school?: number;
}): URLSearchParams {
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
  return query;
}

/** GET an AlAdhan URL and hand back its `code: 200` payload, or throw a ProviderError. */
async function aladhanGet<T extends { code: number; status: string }>(
  url: string,
  retry: { maxAttempts: number; baseDelayMs: number; timeoutMs: number },
): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithRetry(url, undefined, retry);
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

  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new ProviderError(PROVIDER, 'shape', 'AlAdhan response was not valid JSON', { cause: e });
  }
}

export async function fetchAladhanTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  method?: number | 'auto';
  school?: number;
}): Promise<PrayerTimesResult> {
  const dateStr = formatAladhanDate(params.date);
  const url = `${BASE}/timings/${dateStr}?${aladhanQuery(params).toString()}`;
  const json = await aladhanGet<AladhanTimingsResponse>(url, {
    maxAttempts: 4,
    baseDelayMs: 1000,
    timeoutMs: 7000,
  });
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

type AladhanCalendarResponse = {
  code: number;
  status: string;
  data?: Array<{
    timings?: Record<string, unknown>;
    date?: { gregorian?: { date?: string } };
    meta?: { timezone?: string };
  }>;
};

/** One day of a month from AlAdhan's calendar, not yet checked. */
export type AladhanCalendarDay = {
  /** `YYYY-MM-DD`. */
  date: string;
  timings: TimingsMap;
  timezone?: string;
};

/**
 * A whole month from AlAdhan in one request (`/v1/calendar/{year}/{month}`)
 * — the same query as a single day's (`aladhanQuery`). A year's fill was
 * ~365 requests; it is twelve.
 *
 * The calendar writes every time with its zone after it ("05:12 (CEST)");
 * the zone is cut off so a day reads exactly as the single-day endpoint's.
 * Each day is handed back unchecked: the caller validates it as it would a
 * single day's answer and skips the ones that fail. A day whose date cannot
 * be read is left out.
 */
export async function fetchAladhanCalendar(params: {
  latitude: number;
  longitude: number;
  /** Full year. */
  year: number;
  /** 1–12. */
  month: number;
  method?: number | 'auto';
  school?: number;
}): Promise<AladhanCalendarDay[]> {
  const url = `${BASE}/calendar/${params.year}/${params.month}?${aladhanQuery(params).toString()}`;
  // Two attempts, not four: a month that does not come is filled a day at
  // a time by the caller, which has its own retries.
  const json = await aladhanGet<AladhanCalendarResponse>(url, {
    maxAttempts: 2,
    baseDelayMs: 1000,
    timeoutMs: 15000,
  });
  if (json.code !== 200 || !Array.isArray(json.data)) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      json.status || 'AlAdhan returned an unexpected calendar shape',
    );
  }
  const out: AladhanCalendarDay[] = [];
  for (const item of json.data) {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(item?.date?.gregorian?.date ?? '');
    if (!m || !item.timings || typeof item.timings !== 'object') continue;
    const timings: TimingsMap = {};
    for (const [k, v] of Object.entries(item.timings)) {
      if (typeof v === 'string') timings[k] = v.replace(/\s*\(.*\)\s*$/, '');
    }
    out.push({ date: `${m[3]}-${m[2]}-${m[1]}`, timings, timezone: item.meta?.timezone });
  }
  return out;
}
