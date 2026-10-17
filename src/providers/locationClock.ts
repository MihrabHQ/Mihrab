/**
 * WHOSE CLOCK THE TIMES ARE WRITTEN ON.
 *
 * An authority's table prints a place's times on that place's clock, and so
 * does AlAdhan for the same place. Morocco's, Algeria's, Sweden's and
 * Indonesia's times are computed on the phone now rather than read from the
 * tables, and a computed instant is written on the phone's clock — the same
 * thing while the phone is in the country, an hour or more apart for a saved
 * place in another zone (Rabat, saved on a phone in Stockholm, read 07:05
 * for the ministry's 05:05). Where the phone is on another clock, these are
 * written on the place's, as the table writes them.
 */
import { DEVICE_CLOCK, formatLocalTime } from '../utils/prayerTimes';
import {
  civilInZone,
  deviceZone,
  GMT_ZONES,
  zoneOffsetMinutes,
} from '../utils/zoneClock';
import { deviceClockSkewSeconds } from './clockSkew';

export { civilInZone, deviceZone, zoneOffsetMinutes };

export type PlaceClock = {
  /** The place's zone (IANA). */
  zone: string;
  /**
   * The zone to write the times in when the phone is elsewhere, where the
   * place's own may be stale in a phone's zone data (Morocco left GMT+1 in
   * 2026; the ministry prints GMT).
   */
  away?: string;
  /**
   * The zone's current rule, for telling stale zone data: its offset from
   * UTC (minutes east) at `probe`, a moment after the latest change. A phone
   * whose zone data gives another offset there has data from before it.
   */
  rule?: { probe: string; offsetMinutes: number };
};

/** "HH:MM" of an instant on a zone's clock; the phone's on any failure. */
export function formatInZone(d: Date, zone: string): string {
  // GMT is arithmetic, not a lookup. Hermes on iOS resolves `timeZone`
  // through the system's list of zone names, which need not hold the
  // `Etc/` ones; a RangeError there is caught below and the times quietly
  // fall back to the phone's clock — the very thing Morocco's `away` exists
  // to avoid on a phone outside Morocco.
  if (GMT_ZONES.has(zone)) {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(
      d.getUTCMinutes(),
    ).padStart(2, '0')}`;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value;
    const m = parts.find(p => p.type === 'minute')?.value;
    // What is written here is stored and parsed back (`extractClock`, the
    // widgets' "HH:mm" readers), which read Latin digits only: an engine
    // that wrote another script's digits, or a 24 for midnight, must not
    // reach the cache.
    if (
      h == null ||
      m == null ||
      !/^[0-9]{1,2}$/.test(h) ||
      !/^[0-9]{2}$/.test(m)
    )
      return formatLocalTime(d);
    return `${String(Number(h) % 24).padStart(2, '0')}:${m}`;
  } catch {
    return formatLocalTime(d);
  }
}

/**
 * The place's own civil date for the day the phone calls `date` (month
 * 0-based). On the phone's clock, or with no place clock, the phone's date.
 * Elsewhere, the place's date at the phone's noon that day: the same date
 * wherever the two clocks are less than twelve hours apart, and across the
 * date line the day the place is on for most of the phone's day — a phone on
 * Kiritimati (UTC+14) asking for Rabat's 16 October gets Rabat's 15th, which
 * is the day Rabat is on until two in the Kiritimati afternoon. The phone's
 * date when the phone cannot say.
 */
export function placeCivilDay(
  date: Date,
  clock: PlaceClock | undefined,
): { y: number; m: number; d: number } {
  const phone = {
    y: date.getFullYear(),
    m: date.getMonth(),
    d: date.getDate(),
  };
  const here = deviceZone();
  if (!clock || here === clock.zone) return phone;
  // The phone's day and noon by its zone, as Intl gives them — what the Date
  // getters answer on a phone — and by the getters where Intl cannot say.
  const own = here ? civilInZone(date, here) : null;
  const day = own ? { y: own.y, m: own.m - 1, d: own.d } : phone;
  const offset = here ? zoneOffsetMinutes(here, date) : null;
  const noon =
    offset == null
      ? new Date(day.y, day.m, day.d, 12)
      : new Date(Date.UTC(day.y, day.m, day.d, 12) - offset * 60_000);
  const at = civilInZone(noon, clock.away ?? clock.zone);
  return at ? { y: at.y, m: at.m - 1, d: at.d } : phone;
}

const staleMemo = new Map<string, number | null>();
/**
 * How far the phone's zone data is off the zone's current rule, in minutes
 * (60 for a phone that still runs Morocco at GMT+1), or 0 when it is current
 * or the place has no rule to check. Read once per zone per run.
 */
export function zoneDataLagMinutes(clock: PlaceClock | undefined): number {
  if (!clock?.rule) return 0;
  const key = `${clock.zone}@${clock.rule.probe}`;
  if (!staleMemo.has(key)) {
    const off = zoneOffsetMinutes(clock.zone, new Date(clock.rule.probe));
    staleMemo.set(key, off == null ? null : off - clock.rule.offsetMinutes);
  }
  return staleMemo.get(key) ?? 0;
}

/** Is the phone in this place's zone, with zone data from before the zone's latest change? */
export function phoneZoneDataStale(clock: PlaceClock | undefined): boolean {
  return (
    !!clock && deviceZone() === clock.zone && zoneDataLagMinutes(clock) !== 0
  );
}

/** How far off the server's time a clock put right by hand would be (±10 minutes). */
const HAND_SET_TOLERANCE_S = 600;

/**
 * Is the phone in this place's zone, with stale zone data, and its clock set
 * by hand to the real one? Then the phone's clock is behind the real time by
 * the zone data's lag (the server's time is that far ahead), and it reads the
 * place's wall clock on the zone's current rule — so the times are written
 * on that rule (`away`), not on the phone's stale one (#82).
 */
export function phoneClockSetByHand(clock: PlaceClock | undefined): boolean {
  if (!phoneZoneDataStale(clock)) return false;
  const lagS = zoneDataLagMinutes(clock) * 60;
  return Math.abs(deviceClockSkewSeconds() - lagS) <= HAND_SET_TOLERANCE_S;
}

/**
 * How to write a place's instants: on the phone's clock when it is the
 * place's, else on the place's.
 *
 * In Morocco (#82) a phone with zone data from before 2026 runs
 * Africa/Casablanca at GMT+1. On network time its clock reads an hour ahead
 * but every instant is right, and the times are written on its clock so
 * that they agree with it (and the alerts, read back on it, come on time).
 * Set back by hand to the wall clocks, its instants are an hour behind:
 * written on its clock, every time would be an hour late; written on the
 * ministry's GMT they read as the wall clocks do and, read back on the
 * phone's clock, come on time. The server's time tells the two apart
 * (`clockSkew.ts`).
 */
export function clockFormatter(
  clock: PlaceClock | undefined,
): (d: Date) => string {
  return clockFor(clock).format;
}

/**
 * `clockFormatter`, and the clock the times it writes are to be read on:
 * `'device'` where they are written on the phone's (and where a phone set by
 * hand reads the ministry's GMT on its own clock, as its alerts must), else
 * the zone they are written in — the tag a result carries
 * (`PrayerTimesResult.clock`) so that a saved place's times are read back on
 * its clock and not on the phone's (`utils/prayerTimes.ts`).
 */
export function clockFor(clock: PlaceClock | undefined): {
  format: (d: Date) => string;
  zone: string;
} {
  if (!clock) return { format: formatLocalTime, zone: DEVICE_CLOCK };
  if (deviceZone() === clock.zone) {
    // Set by hand: written on GMT so that they read right on the phone's
    // own (wrong) clock — which is the clock they are read on.
    if (phoneClockSetByHand(clock)) {
      const zone = clock.away ?? clock.zone;
      return { format: (d: Date) => formatInZone(d, zone), zone: DEVICE_CLOCK };
    }
    return { format: formatLocalTime, zone: DEVICE_CLOCK };
  }
  const zone = clock.away ?? clock.zone;
  return { format: (d: Date) => formatInZone(d, zone), zone };
}

/** Test seam: forget what was read of the phone's zone data. */
export function _resetZoneDataMemoForTests(): void {
  staleMemo.clear();
}

export const MOROCCO_CLOCK: PlaceClock = {
  zone: 'Africa/Casablanca',
  away: 'Etc/GMT',
  // GMT all year from 2026-09-20 (Ramadan included).
  rule: { probe: '2026-12-01T12:00:00Z', offsetMinutes: 0 },
};
export const ALGERIA_CLOCK: PlaceClock = { zone: 'Africa/Algiers' };
export const SWEDEN_CLOCK: PlaceClock = { zone: 'Europe/Stockholm' };

/** Indonesia prints each regency in its own zone; the province (`nameEn`'s parenthesis) says which. */
const WITA = new Set([
  'Kalimantan Selatan',
  'Kalimantan Timur',
  'Kalimantan Utara',
  'Bali',
  'Nusa Tenggara Barat',
  'Nusa Tenggara Timur',
  'Sulawesi Barat',
  'Sulawesi Selatan',
  'Sulawesi Tengah',
  'Sulawesi Tenggara',
  'Sulawesi Utara',
  'Gorontalo',
]);
const WIT = new Set(['Maluku', 'Maluku Utara', 'Papua', 'Papua Barat']);
export function indonesiaClock(nameEn: string | undefined): PlaceClock {
  const province = /\(([^)]*)\)\s*$/.exec(nameEn ?? '')?.[1] ?? '';
  return {
    zone: WIT.has(province)
      ? 'Asia/Jayapura'
      : WITA.has(province)
      ? 'Asia/Makassar'
      : 'Asia/Jakarta',
  };
}
