/**
 * HOW FAR THE PHONE'S CLOCK IS FROM THE REAL TIME.
 *
 * Morocco left GMT+1 on 2026-09-20 (#82). A phone whose zone data predates
 * that still runs Africa/Casablanca an hour ahead of GMT. With network time
 * its clock then reads an hour ahead and every instant is still right; but
 * an owner who set the clock back by hand to match the clocks on the wall
 * has a phone whose instants are an hour behind the real ones — and a phone
 * cannot tell the two apart from its own clock. A server can: every HTTP
 * response carries the server's time in its `Date` header.
 *
 * The app already fetches from GitHub (the methods' certification once a
 * day, `methodCurrency.ts`; the Hijri overrides), so those responses are
 * read for their `Date`, and the difference — server minus phone, in
 * seconds — is kept with when it was taken. `deviceClockSkewSeconds()` is
 * synchronous, from memory, and 0 when nothing recent is known.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'clock.skew.v1';
/** A measurement older than this is not trusted: the clock may have been put right since. */
export const CLOCK_SKEW_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

type Skew = { seconds: number; at: number };
let skew: Skew | null = null;

function fresh(s: Skew | null, now: number): s is Skew {
  return (
    !!s &&
    Number.isFinite(s.seconds) &&
    Number.isFinite(s.at) &&
    Math.abs(now - s.at) <= CLOCK_SKEW_MAX_AGE_MS
  );
}

/** Server time minus the phone's, in seconds, from the last response read (0 when unknown or stale). */
export function deviceClockSkewSeconds(now = Date.now()): number {
  return fresh(skew, now) ? skew.seconds : 0;
}

type WithHeaders = { headers?: { get(name: string): string | null } | null };

/**
 * Note the server's time from a response's `Date` header. `deviceNowMs` is
 * the phone's time when the response arrived. A missing or unreadable
 * header is ignored.
 */
export function noteServerDate(
  res: WithHeaders | null | undefined,
  deviceNowMs = Date.now(),
): void {
  let header: string | null | undefined;
  try {
    header = res?.headers?.get('date');
  } catch {
    return;
  }
  if (!header) return;
  const server = Date.parse(header);
  if (!Number.isFinite(server)) return;
  skew = {
    seconds: Math.round((server - deviceNowMs) / 1000),
    at: deviceNowMs,
  };
  AsyncStorage.setItem(KEY, JSON.stringify(skew)).catch(() => undefined);
}

/** Read the last measurement back at start. Never overrides one taken since. */
export async function hydrateClockSkew(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw || skew) return;
    const s = JSON.parse(raw) as Skew;
    if (typeof s?.seconds === 'number' && typeof s?.at === 'number') skew = s;
  } catch {
    /* unknown: 0 */
  }
}

/** Test seam. */
export function _resetClockSkewForTests(): void {
  skew = null;
}
