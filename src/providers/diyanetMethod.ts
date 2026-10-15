/**
 * Diyanet's prayer times anywhere in the world, calculated on the phone.
 *
 * Diyanet (the Turkish Presidency of Religious Affairs) publishes a table for
 * every place it lists — the districts of Türkiye and thousands of places
 * abroad, through awqatsalah.com. They are all one method — the International
 * Prayer Times Congress method (`congressMethod.ts`, the same code that gives
 * Sweden's tables): Fajr at 18°, the temkins, the five-hour floors and the
 * carried night share where the dawn does not form, and from about 44.4°
 * north the takdir at midsummer. What differs between countries is Isha's
 * angle: 16° (the Congress's) in most of Europe, Russia, Ukraine, Belarus,
 * Kazakhstan, Mongolia, China, the United States and Canada; 17° (Diyanet's
 * own) everywhere else; the high-latitude rules are the Congress's at 16°
 * either way. In Türkiye (and Northern Cyprus) each prayer is computed at a
 * point of its own in the district, which moves by a few thousandths of a
 * degree from one year's table to the next.
 *
 * So a reader near a place Diyanet lists gets that place's table: the method
 * at the place's points (`data/diyanetPlaces.json`, fitted to Diyanet's
 * tables by MihrabHQ/mihrab-methods) with the correction list for the few
 * times Diyanet's program rounds the other way — on the printed minute, every
 * time, over the years the tables were checked. Elsewhere it is the method
 * for the reader's own spot, the country read from the coordinates
 * (`diyanetRegion.ts`).
 */
import type { PrayerTimesResult } from './types';
import { formatLocalTime } from '../utils/prayerTimes';
import { congressTimes, CONGRESS_ISHA_DEG, DIYANET_ISHA_DEG, type CongressInstants } from './congressMethod';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import { diyanetUsesCongressIsha } from './diyanetRegion';
import { diyanetCorrection, swedenCorrection } from './swedenCorrections';
import placesFile from './data/diyanetPlaces.json';

/** Isha's depression in Diyanet's tables for the country a spot is in (`diyanetRegion.ts`). */
export function diyanetIshaDeg(latitude: number, longitude: number): number {
  return diyanetUsesCongressIsha(latitude, longitude) ? CONGRESS_ISHA_DEG : DIYANET_ISHA_DEG;
}

const toMinute = (d: Date) => new Date(Math.round(d.getTime() / 60_000) * 60_000);

/** The id AlAdhan gives Türkiye's method; the app computes it as Diyanet does, on the phone. */
export const DIYANET_METHOD_ID = 13;

/**
 * A place Diyanet lists: its point, Isha's angle, and — in Türkiye — a point
 * per prayer per year ([fajr, sunrise, dhuhr, asr, maghrib, isha] as lat, lon).
 */
export type DiyanetPlace = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  ishaDeg: number;
  /** Türkiye: year → twelve numbers, lat and lon for each of the six prayers. */
  years?: Record<string, number[]>;
  /** Which correction list its points are keyed in. */
  list: 'sweden' | 'diyanet';
};
type PlacesFile = { places: [string, string, number, number, number, string?][]; turkey: Record<string, Record<string, number[]>> };

let placesCache: DiyanetPlace[] | null = null;
export function diyanetPlaces(): DiyanetPlace[] {
  if (placesCache) return placesCache;
  const f = placesFile as unknown as PlacesFile;
  placesCache = f.places.map(([id, name, lat, lon, ishaDeg, list]) => ({
    id,
    name,
    lat,
    lon,
    ishaDeg,
    years: f.turkey[id],
    list: list === 's' ? 'sweden' : 'diyanet',
  }));
  return placesCache;
}

/** How far a listed place stands in for the reader's spot: a district in Türkiye, a town abroad. */
const SNAP_KM_TURKEY = 40;
const SNAP_KM_ABROAD = 25;

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return 6371 * Math.hypot(x, y);
};

/** The listed place nearest the reader, if one is near enough to be theirs. */
export function nearestDiyanetPlace(latitude: number, longitude: number): DiyanetPlace | null {
  let best: DiyanetPlace | null = null;
  let bestKm = Infinity;
  for (const p of diyanetPlaces()) {
    if (Math.abs(p.lat - latitude) > 1 || Math.abs(p.lon - longitude) > 1.5) continue;
    const d = km(latitude, longitude, p.lat, p.lon);
    if (d < bestKm) {
      bestKm = d;
      best = p;
    }
  }
  if (!best) return null;
  return bestKm <= (best.years ? SNAP_KM_TURKEY : SNAP_KM_ABROAD) ? best : null;
}

/** Türkiye: each prayer at its own point for the year (the nearest year's beyond the tables). */
function perPrayer(p: DiyanetPlace, y: number, m: number, d: number, asrShadow: number, clock: number): CongressInstants {
  const ys = Object.keys(p.years!).map(Number);
  const yr = ys.reduce((b, v) => (Math.abs(v - y) < Math.abs(b - y) ? v : b), ys[0]);
  const pts = p.years![String(yr)];
  const at = (i: number) => congressTimes(pts[2 * i], pts[2 * i + 1], y, m, d, asrShadow, p.ishaDeg, clock);
  return { fajr: at(0).fajr, sunrise: at(1).sunrise, dhuhr: at(2).dhuhr, asr: at(3).asr, maghrib: at(4).maghrib, isha: at(5).isha };
}

/**
 * The table prints the whole day in the clock kept at noon: on the morning the
 * clocks go forward a Fajr before the change is printed in the new time.
 */
function onDaysClock(at: Date, date: Date): Date {
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const shift = at.getTimezoneOffset() - noon.getTimezoneOffset();
  return shift ? new Date(at.getTime() + shift * 60_000) : at;
}

type Instants = Record<'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', Date>;

/**
 * Diyanet's six times for a spot and a civil date, as instants on the printed
 * minute: the nearest listed place's table when one is near, else the method
 * for the spot itself.
 */
export function diyanetInstants(latitude: number, longitude: number, date: Date, school: number): Instants {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const asrShadow = school === 1 ? 2 : 1;
  // The clock the day is kept in — Diyanet walks its summer transition on it (`congressMethod.ts`)
  const clock = -new Date(y, m, d, 12).getTimezoneOffset();
  const place = nearestDiyanetPlace(latitude, longitude);
  let at: CongressInstants;
  let fix: Partial<Record<keyof Instants, number>> | undefined;
  if (place) {
    at = place.years ? perPrayer(place, y, m, d, asrShadow, clock) : congressTimes(place.lat, place.lon, y, m, d, asrShadow, place.ishaDeg, clock);
    fix = (place.list === 'sweden' ? swedenCorrection : diyanetCorrection)(place.lat, place.lon, y, m, d);
  } else {
    at = congressTimes(latitude, longitude, y, m, d, asrShadow, diyanetIshaDeg(latitude, longitude), clock);
  }
  const out = {} as Instants;
  for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
    // the correction list is for the standard Asr only
    const step = k === 'asr' && school === 1 ? 0 : (fix?.[k] ?? 0);
    out[k] = onDaysClock(new Date(toMinute(at[k]).getTime() + step * 60_000), date);
  }
  return out;
}

/** Is this spot on a listed place's table, or the method for the spot itself? */
export function diyanetCoverage(latitude: number, longitude: number): 'place' | 'own' {
  return nearestDiyanetPlace(latitude, longitude) ? 'place' : 'own';
}

/**
 * Diyanet's times for a place and a civil date, in the phone's clock.
 * `school` 1 gives the Hanafi Asr (two shadow lengths); the tables print
 * the standard.
 */
export function computeDiyanetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  school: number;
}): PrayerTimesResult {
  const at = diyanetInstants(params.latitude, params.longitude, params.date, params.school);
  const fajr = formatLocalTime(at.fajr);
  return {
    timings: {
      Fajr: fajr,
      Sunrise: formatLocalTime(at.sunrise),
      Dhuhr: formatLocalTime(at.dhuhr),
      Asr: formatLocalTime(at.asr),
      Maghrib: formatLocalTime(at.maghrib),
      Isha: formatLocalTime(at.isha),
      Imsak: computeImsak(fajr, DEFAULT_IMSAK_OFFSET_MINUTES),
    },
    source: 'local',
  };
}
