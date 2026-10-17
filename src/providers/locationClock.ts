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
import { formatLocalTime } from '../utils/prayerTimes';

export type PlaceClock = {
  /** The place's zone (IANA). */
  zone: string;
  /**
   * The zone to write the times in when the phone is elsewhere, where the
   * place's own may be stale in a phone's zone data (Morocco left GMT+1 in
   * 2026; the ministry prints GMT).
   */
  away?: string;
};

function deviceZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Zones that are GMT all year, written without asking Intl. */
const GMT_ZONES = new Set(['Etc/GMT', 'Etc/UTC', 'UTC', 'GMT', 'Africa/Abidjan']);

/** "HH:MM" of an instant on a zone's clock; the phone's on any failure. */
export function formatInZone(d: Date, zone: string): string {
  // GMT is arithmetic, not a lookup. Hermes on iOS resolves `timeZone`
  // through the system's list of zone names, which need not hold the
  // `Etc/` ones; a RangeError there is caught below and the times quietly
  // fall back to the phone's clock — the very thing Morocco's `away` exists
  // to avoid on a phone outside Morocco.
  if (GMT_ZONES.has(zone)) {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value;
    const m = parts.find(p => p.type === 'minute')?.value;
    if (h == null || m == null) return formatLocalTime(d);
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  } catch {
    return formatLocalTime(d);
  }
}

/** How to write a place's instants: on the phone's clock when it is the place's, else on the place's. */
export function clockFormatter(clock: PlaceClock | undefined): (d: Date) => string {
  if (!clock) return formatLocalTime;
  if (deviceZone() === clock.zone) return formatLocalTime;
  const zone = clock.away ?? clock.zone;
  return (d: Date) => formatInZone(d, zone);
}

export const MOROCCO_CLOCK: PlaceClock = { zone: 'Africa/Casablanca', away: 'Etc/GMT' };
export const ALGERIA_CLOCK: PlaceClock = { zone: 'Africa/Algiers' };
export const SWEDEN_CLOCK: PlaceClock = { zone: 'Europe/Stockholm' };

/** Indonesia prints each regency in its own zone; the province (`nameEn`'s parenthesis) says which. */
const WITA = new Set([
  'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Bali',
  'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Sulawesi Barat', 'Sulawesi Selatan',
  'Sulawesi Tengah', 'Sulawesi Tenggara', 'Sulawesi Utara', 'Gorontalo',
]);
const WIT = new Set(['Maluku', 'Maluku Utara', 'Papua', 'Papua Barat']);
export function indonesiaClock(nameEn: string | undefined): PlaceClock {
  const province = /\(([^)]*)\)\s*$/.exec(nameEn ?? '')?.[1] ?? '';
  return { zone: WIT.has(province) ? 'Asia/Jayapura' : WITA.has(province) ? 'Asia/Makassar' : 'Asia/Jakarta' };
}
