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
import { DEVICE_CLOCK } from '../utils/prayerTimes';
import { instantOnZoneClock, zoneOffsetMinutes } from '../utils/zoneClock';
import { clockFor, placeCivilDay, type PlaceClock } from './locationClock';
import { congressTimes, CONGRESS_ISHA_DEG, DIYANET_ISHA_DEG, type CongressInstants } from './congressMethod';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import { diyanetUsesCongressIsha } from './diyanetRegion';
import { diyanetCorrection, swedenCorrection } from './swedenCorrections';
import placesFile from './data/diyanetPlaces.json';
import { isCoordinateInTurkey } from '../utils/turkeyRegion';

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
  /**
   * The clock its table is printed in, where that is no zone's: from each
   * date on, minutes east of UTC — Alberta's tables keeping summer time
   * from 2026, Mexico's having it in 2025, Queensland's and Western
   * Australia's in 2024, 2025 and 2027, Xinjiang's on Beijing time. The instants are the method's
   * either way; the method walks its high-latitude rules on this clock.
   */
  clock?: [string, number][];
};
type PlacesFile = {
  places: [string, string, number, number, number, string?][];
  turkey: Record<string, Record<string, number[]>>;
  clocks?: Record<string, [string, number][]>;
};

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
    clock: f.clocks?.[id],
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
let lastAsked: { latitude: number; longitude: number; place: DiyanetPlace | null } | null = null;
export function nearestDiyanetPlace(latitude: number, longitude: number): DiyanetPlace | null {
  // Asked again and again for the same spot: every render that resolves the
  // source (Automatic picks Diyanet near a listed place) asks it.
  if (lastAsked && lastAsked.latitude === latitude && lastAsked.longitude === longitude) return lastAsked.place;
  const place = findNearestDiyanetPlace(latitude, longitude);
  lastAsked = { latitude, longitude, place };
  return place;
}
function findNearestDiyanetPlace(latitude: number, longitude: number): DiyanetPlace | null {
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
  if (bestKm <= SNAP_KM_ABROAD) return best;
  // A district's reach is Türkiye's own: from Svilengrad, Chios, Aleppo or
  // Batumi a district over the border 25–40 km off is not the reader's place.
  return best.years && bestKm <= SNAP_KM_TURKEY && isCoordinateInTurkey(latitude, longitude) ? best : null;
}

/** The clock a place's table prints a date in: its own where it keeps one, else the phone's. */
export function placeClock(place: DiyanetPlace | null, y: number, m: number, d: number, phoneClock: number): number {
  if (!place?.clock) return phoneClock;
  const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let off = place.clock[0][1];
  for (const [from, o] of place.clock) if (from <= date) off = o;
  return off;
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
function onDaysClock(at: Date, date: Date, place: DiyanetPlace | null, longitude: number, zone?: string): Date {
  if (zone) {
    // Written on the place's own clock (`placeZone.ts`): its changeover,
    // where the table keeps that clock.
    const noonAt = instantOnZoneClock(zone, date.getFullYear(), date.getMonth(), date.getDate(), 12, 0);
    const noonOff = noonAt ? zoneOffsetMinutes(zone, noonAt) : null;
    const atOff = zoneOffsetMinutes(zone, at);
    if (noonOff == null || atOff == null) return at;
    if (place?.clock && noonOff !== placeClock(place, date.getFullYear(), date.getMonth(), date.getDate(), 0)) return at;
    const shift = noonOff - atOff;
    return shift ? new Date(at.getTime() + shift * 60_000) : at;
  }
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  if (!phoneKeepsPlacesClock(noon, date, place, longitude)) return at;
  const shift = at.getTimezoneOffset() - noon.getTimezoneOffset();
  return shift ? new Date(at.getTime() + shift * 60_000) : at;
}

/**
 * Is the phone's clock the place's, so that the phone's changeover is the
 * place's too?
 *
 * The shift above is taken from the PHONE's zone, which is the place's only
 * when the reader is there. For a saved place elsewhere it moved the
 * place's times on the phone's changeover day: New York's 1 November moved
 * a saved Stockholm's Fajr an hour, Stockholm's 25 October a saved
 * Jakarta's. A place that keeps its own clock says so (`clock`); for the
 * rest, a phone whose standard time is more than two hours from the
 * place's longitude is somewhere else, and its changeover is not the
 * place's.
 */
function phoneKeepsPlacesClock(
  noon: Date,
  date: Date,
  place: DiyanetPlace | null,
  longitude: number,
): boolean {
  if (place?.clock) {
    return -noon.getTimezoneOffset() === placeClock(place, date.getFullYear(), date.getMonth(), date.getDate(), 0);
  }
  const y = date.getFullYear();
  const standard = -Math.max(
    new Date(y, 0, 1, 12).getTimezoneOffset(),
    new Date(y, 6, 1, 12).getTimezoneOffset(),
  );
  return Math.abs(standard / 4 - longitude) <= 30;
}

type Instants = Record<'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', Date>;

/**
 * Diyanet's six times for a spot and a civil date, as instants on the printed
 * minute: the nearest listed place's table when one is near, else the method
 * for the spot itself. `zone`: the clock the day is written on, where it is
 * the place's and not the phone's (`placeZone.ts`) — `date` is then the
 * place's own civil date.
 */
export function diyanetInstants(latitude: number, longitude: number, date: Date, school: number, zone?: string): Instants {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const asrShadow = school === 1 ? 2 : 1;
  // The clock the day is kept in — Diyanet walks its summer transition on it (`congressMethod.ts`)
  const place = nearestDiyanetPlace(latitude, longitude);
  const zoneNoon = zone ? instantOnZoneClock(zone, y, m, d, 12, 0) : null;
  const dayOffset =
    (zone && zoneNoon ? zoneOffsetMinutes(zone, zoneNoon) : null) ?? -new Date(y, m, d, 12).getTimezoneOffset();
  const clock = placeClock(place, y, m, d, dayOffset);
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
    out[k] = onDaysClock(new Date(toMinute(at[k]).getTime() + step * 60_000), date, place, longitude, zone);
  }
  return out;
}

/** Is this spot on a listed place's table, or the method for the spot itself? */
export function diyanetCoverage(latitude: number, longitude: number): 'place' | 'own' {
  return nearestDiyanetPlace(latitude, longitude) ? 'place' : 'own';
}

/**
 * Diyanet's times for a place and a civil date, on the phone's clock — or,
 * with `placeClock` for a place in another zone (`placeZone.ts`), the
 * place's own day on the place's clock, as its table prints it: written on
 * the phone's, Stockholm's midsummer Fajr (01:54) was 23:54 the evening
 * before on a phone on UTC. `school` 1 gives the Hanafi Asr (two shadow
 * lengths); the tables print the standard.
 */
export function computeDiyanetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  school: number;
  placeClock?: PlaceClock;
}): PrayerTimesResult {
  const { format, zone } = clockFor(params.placeClock);
  const onPlace = zone !== DEVICE_CLOCK;
  const civil = onPlace ? placeCivilDay(params.date, params.placeClock) : null;
  const at = diyanetInstants(
    params.latitude,
    params.longitude,
    civil ? new Date(civil.y, civil.m, civil.d) : params.date,
    params.school,
    onPlace ? zone : undefined,
  );
  const fajr = format(at.fajr);
  return {
    timings: {
      Fajr: fajr,
      Sunrise: format(at.sunrise),
      Dhuhr: format(at.dhuhr),
      Asr: format(at.asr),
      Maghrib: format(at.maghrib),
      Isha: format(at.isha),
      Imsak: computeImsak(fajr, DEFAULT_IMSAK_OFFSET_MINUTES),
    },
    source: 'local',
    // True instants, written on the phone's clock or the place's (a listed
    // place's own clock steers the method, not the writing).
    clock: zone,
  };
}
