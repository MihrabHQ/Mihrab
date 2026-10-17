/**
 * A zone's clock, by the phone's zone data — the arithmetic both the
 * producers (`providers/locationClock.ts`, which write a place's times on its
 * clock) and the readers (`utils/prayerTimes.ts`, which turn a written time
 * back into an instant) need. A leaf, so neither has to import the other.
 */

/**
 * The zone as last resolved, and the device offset it was resolved under.
 * Building a formatter to ask Intl is the slow part on Hermes, and the
 * question is asked for every stored day and every time read back.
 */
let zoneCache: { zone: string | undefined; offset: number } | null = null;

/**
 * The phone's own zone (IANA), or undefined where Intl cannot say.
 *
 * Kept until something could have changed it: the app coming back to the
 * foreground (`invalidateDeviceZone`, from deviceZoneAppState.ts — the zone
 * is changed in the phone's settings, with the app in the background), or
 * the device's offset moving under it (a zone changed by the network while
 * the app runs moves the offset with it, in all but the rare move between
 * two zones on the same offset, which the next foreground catches).
 */
export function deviceZone(): string | undefined {
  const offset = new Date().getTimezoneOffset();
  if (zoneCache && zoneCache.offset === offset) return zoneCache.zone;
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  zoneCache = { zone, offset };
  return zone;
}

/** Ask Intl again on the next `deviceZone()`. */
export function invalidateDeviceZone(): void {
  zoneCache = null;
}

/** Tests that change the phone's zone (a mocked `resolvedOptions`). */
export function _resetZoneCacheForTests(): void {
  zoneCache = null;
}

/** Zones that are GMT all year, written without asking Intl. */
export const GMT_ZONES: ReadonlySet<string> = new Set([
  'Etc/GMT',
  'Etc/UTC',
  'UTC',
  'GMT',
  'Africa/Abidjan',
]);

/** One formatter per zone and shape: building them is the slow part on Hermes. */
const formatters = new Map<string, Intl.DateTimeFormat>();
/** The constructor the cache was filled from; a replaced one (a test's) empties it. */
let formattersFrom: unknown = null;
function formatterFor(zone: string, withTime: boolean): Intl.DateTimeFormat {
  if (formattersFrom !== Intl.DateTimeFormat) {
    formatters.clear();
    formattersFrom = Intl.DateTimeFormat;
  }
  const key = `${zone}|${withTime ? 't' : 'd'}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(withTime
        ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }
        : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

/**
 * The civil date (and, with `withTime`, the hour and minute) of an instant
 * on a zone's clock; null when the phone cannot say (no Intl, an unknown
 * zone).
 */
export function civilInZone(
  at: Date,
  zone: string,
  withTime = false,
): { y: number; m: number; d: number; h: number; min: number } | null {
  if (GMT_ZONES.has(zone)) {
    return {
      y: at.getUTCFullYear(),
      m: at.getUTCMonth() + 1,
      d: at.getUTCDate(),
      h: at.getUTCHours(),
      min: at.getUTCMinutes(),
    };
  }
  try {
    const parts = formatterFor(zone, withTime).formatToParts(at);
    const n = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const out = {
      y: n('year'),
      m: n('month'),
      d: n('day'),
      h: withTime ? n('hour') % 24 : 0,
      min: withTime ? n('minute') : 0,
    };
    return Object.values(out).every(Number.isFinite) ? out : null;
  } catch {
    return null;
  }
}

/**
 * A zone's offset from UTC at an instant (minutes east), by the phone's zone
 * data; null when the phone cannot say.
 */
export function zoneOffsetMinutes(zone: string, at: Date): number | null {
  if (GMT_ZONES.has(zone)) return 0;
  const ymd = civilInZone(at, zone, true);
  if (!ymd) return null;
  const wall = Date.UTC(ymd.y, ymd.m - 1, ymd.d, ymd.h, ymd.min);
  return Math.round((wall - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/**
 * The instant a zone's clock reads `hour`:`minute` on the civil date
 * y-m-d (month 0-based); null when the phone cannot say. A time the clock
 * shows twice (the hour it goes back) is the earlier instant, and a time in
 * the hour it skips is moved past the gap — as `Date` does on the phone's own
 * clock.
 */
export function instantOnZoneClock(
  zone: string,
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
): Date | null {
  const wall = Date.UTC(y, m, d, hour, minute);
  const first = zoneOffsetMinutes(zone, new Date(wall));
  if (first == null) return null;
  let t = wall - first * 60_000;
  const second = zoneOffsetMinutes(zone, new Date(t));
  if (second == null) return null;
  if (second !== first) {
    const retry = wall - second * 60_000;
    const third = zoneOffsetMinutes(zone, new Date(retry));
    // Where the clock reads the wall time the offset holds; neither holding
    // is the hour the clock skips, read on the offset before the skip.
    t = third === second ? retry : wall - Math.min(first, second) * 60_000;
  }
  // The earlier of two readings, where the clock goes back.
  for (const back of [120, 60, 30]) {
    const earlier = t - back * 60_000;
    const off = zoneOffsetMinutes(zone, new Date(earlier));
    if (off != null && earlier + off * 60_000 === wall)
      return new Date(earlier);
  }
  return new Date(t);
}
