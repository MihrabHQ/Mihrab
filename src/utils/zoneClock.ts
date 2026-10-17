/**
 * A zone's clock, by the phone's zone data — the arithmetic both the
 * producers (`providers/locationClock.ts`, which write a place's times on its
 * clock) and the readers (`utils/prayerTimes.ts`, which turn a written time
 * back into an instant) need. A leaf, so neither has to import the other.
 */

/** The phone's own zone (IANA), or undefined where Intl cannot say. */
export function deviceZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Zones that are GMT all year, written without asking Intl. */
export const GMT_ZONES: ReadonlySet<string> = new Set([
  'Etc/GMT',
  'Etc/UTC',
  'UTC',
  'GMT',
  'Africa/Abidjan',
]);

/**
 * A zone that keeps one offset all year, in minutes east — 0 for GMT, and
 * the POSIX-style `Etc/GMT±N` zones (`Etc/GMT-3` is three hours EAST of
 * Greenwich, the sign inverted) that `placeZone.ts` derives from a
 * longitude — or null for any other. Read by arithmetic, never by Intl:
 * Hermes on iOS resolves `timeZone` through the system's list of zone
 * names, which need not hold the `Etc/` ones.
 */
export function fixedOffsetMinutes(zone: string): number | null {
  if (GMT_ZONES.has(zone)) return 0;
  const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone);
  if (!m) return null;
  const hours = parseInt(m[2], 10);
  if (hours > 14) return null;
  return (m[1] === '+' ? -1 : 1) * hours * 60;
}

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
  const fixed = fixedOffsetMinutes(zone);
  if (fixed != null) {
    const wall = new Date(at.getTime() + fixed * 60_000);
    return {
      y: wall.getUTCFullYear(),
      m: wall.getUTCMonth() + 1,
      d: wall.getUTCDate(),
      h: wall.getUTCHours(),
      min: wall.getUTCMinutes(),
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
  const fixed = fixedOffsetMinutes(zone);
  if (fixed != null) return fixed;
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
