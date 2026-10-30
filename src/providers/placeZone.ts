/**
 * THE CLOCK OF A PLACE THE PHONE COMPUTES TIMES FOR.
 *
 * An instant the phone computes is right wherever it is written, but the
 * day it is written on is not: computed for a saved place in another zone
 * and written on the phone's clock, the place's day lands on the phone's
 * date. On a phone on UTC, Stockholm's midsummer Fajr (01:54) is 23:54 —
 * the evening BEFORE — and every reader put it on the wrong day. The
 * authorities' tables already carry their place's clock (`locationClock.ts`);
 * this gives one to every other place the phone computes for — the on-device
 * calculation, Diyanet's method, AlAdhan's methods offline, namazvakti's
 * calendar and its published days — from what the app knows of the place,
 * best first:
 *
 *   1. the zone AlAdhan named for these coordinates (`meta.timezone`), from
 *      an answer this run or one kept in the cache (`notePlaceZone`);
 *   2. the country's own zone, for the countries the app knows the borders
 *      of (`countryAt`) that keep one zone — Sweden, Morocco (on the
 *      ministry's GMT, `MOROCCO_CLOCK`), Algeria, Türkiye, the Gulf, … —
 *      and Indonesia's three by the regency (`indonesiaClock`); the
 *      countries that span several (Russia, Australia, …) fall through;
 *   3. the longitude's hour, as a fixed offset: `Etc/GMT±N` with
 *      N = round(longitude / 15) — POSIX's sign, so `Etc/GMT-3` is three
 *      hours EAST — written by arithmetic (`fixedOffsetMinutes`). Off the
 *      place's summer time by an hour, but never by a day.
 *
 * And none — the phone's own clock, exactly as before — where the place's
 * clock is the phone's: the same offset that day for a zone from 1 or 2,
 * and for a longitude's hour, any phone within three and a half hours of
 * it. A longitude is only the sun's clock, and the places the app does not
 * know the borders of keep civil time up to three hours from it (Kashgar on
 * Beijing time, Galicia on Central Europe's summer time); one of them is
 * where the phone is, and the place the phone is in must read as it always
 * has. (Except across the date line: Kiritimati keeps UTC+14 at a longitude
 * of −10 h, so its own day is the sun's day before by its date, and it is
 * written on the longitude's hour — the same digits, on the right day.)
 */
import { countryAt, nationalMethodCountryAt } from '../utils/countryAt';
import {
  deviceZone,
  fixedOffsetMinutes,
  zoneOffsetMinutes,
} from '../utils/zoneClock';
import {
  ALGERIA_CLOCK,
  indonesiaClock,
  MOROCCO_CLOCK,
  SWEDEN_CLOCK,
  type PlaceClock,
  withZoneRule,
} from './locationClock';
import { JAKIM_CLOCK, kemenagTable, MUIS_CLOCK } from './nationalTables';

/**
 * Countries with one zone, by `countryAt`'s code (and the national-method
 * countries of `nationalMethodCountryAt`). Spain and Portugal keep their
 * islands apart below; Russia, Australia, Indonesia and Papua New Guinea
 * span several and are answered elsewhere or not at all.
 */
const COUNTRY_ZONE: Readonly<Record<string, string>> = {
  AE: 'Asia/Dubai',
  AM: 'Asia/Yerevan',
  AX: 'Europe/Mariehamn',
  AZ: 'Asia/Baku',
  BD: 'Asia/Dhaka',
  BG: 'Europe/Sofia',
  BH: 'Asia/Bahrain',
  BN: 'Asia/Brunei',
  CY: 'Asia/Nicosia',
  DK: 'Europe/Copenhagen',
  EE: 'Europe/Tallinn',
  EG: 'Africa/Cairo',
  FI: 'Europe/Helsinki',
  GE: 'Asia/Tbilisi',
  GI: 'Europe/Gibraltar',
  GR: 'Europe/Athens',
  IN: 'Asia/Kolkata',
  IQ: 'Asia/Baghdad',
  IR: 'Asia/Tehran',
  JO: 'Asia/Amman',
  KW: 'Asia/Kuwait',
  LT: 'Europe/Vilnius',
  LV: 'Europe/Riga',
  LY: 'Africa/Tripoli',
  ML: 'Africa/Bamako',
  MR: 'Africa/Nouakchott',
  NE: 'Africa/Niamey',
  NO: 'Europe/Oslo',
  OM: 'Asia/Muscat',
  PH: 'Asia/Manila',
  PK: 'Asia/Karachi',
  PL: 'Europe/Warsaw',
  QA: 'Asia/Qatar',
  SA: 'Asia/Riyadh',
  SY: 'Asia/Damascus',
  TH: 'Asia/Bangkok',
  TL: 'Asia/Dili',
  TN: 'Africa/Tunis',
  // Northern Cyprus answers TR (`countryAt`), and keeps Türkiye's clock.
  TR: 'Europe/Istanbul',
};

/** The clock the app already knows for the country at a point, if any. */
function countryClock(
  latitude: number,
  longitude: number,
): PlaceClock | undefined {
  const code =
    countryAt(latitude, longitude) ??
    nationalMethodCountryAt(latitude, longitude);
  switch (code) {
    case null:
      return undefined;
    case 'SE':
      return SWEDEN_CLOCK;
    case 'MA':
      return MOROCCO_CLOCK;
    case 'DZ':
      return ALGERIA_CLOCK;
    case 'SG':
      return MUIS_CLOCK;
    case 'MY':
      return JAKIM_CLOCK;
    case 'ID': {
      const place = kemenagTable.nearest(latitude, longitude);
      return place ? indonesiaClock(place.nameEn) : undefined;
    }
    case 'ES':
      return { zone: longitude < -12 ? 'Atlantic/Canary' : 'Europe/Madrid' };
    case 'PT':
      return { zone: longitude < -20 ? 'Atlantic/Azores' : 'Europe/Lisbon' };
    default: {
      const zone = COUNTRY_ZONE[code];
      return zone ? { zone } : undefined;
    }
  }
}

/** The longitude's hour as a fixed-offset zone: `Etc/GMT-1` for 15° E. */
export function longitudeZone(longitude: number): string {
  const hours = Math.max(-12, Math.min(14, Math.round(longitude / 15)));
  if (hours === 0) return 'Etc/GMT';
  // POSIX: the sign is the offset's opposite.
  return `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
}

/** Zones AlAdhan named, by the cache's rounding of the coordinates. */
const named = new Map<string, string>();
const keyOf = (latitude: number, longitude: number) =>
  `${latitude.toFixed(2)},${longitude.toFixed(2)}`;

/**
 * Remember the zone AlAdhan names for these coordinates (`meta.timezone`):
 * the best answer `placeZoneFor` has. Ignores anything that is not a zone
 * name.
 */
export function notePlaceZone(
  latitude: number,
  longitude: number,
  zone: string | null | undefined,
): void {
  if (!zone || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)+$/.test(zone))
    return;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  named.set(keyOf(latitude, longitude), zone);
}

/** Test seam: forget the zones AlAdhan named. */
export function _resetPlaceZonesForTests(): void {
  named.clear();
}

/** The phone's offset from UTC at the phone's noon of `date`, minutes east. */
function phoneOffsetAt(date: Date): number {
  return -new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  ).getTimezoneOffset();
}

/** A longitude's hour is the phone's own within this (see the header). */
const SAME_SUN_MINUTES = 210;

/**
 * The clock to write a computed day for a place in, for the phone's `date`
 * (`placeClock` of `computeLocalAdhanTimes` and its kin), or undefined for
 * the phone's own — see the header for the order.
 */
export function placeZoneFor(
  latitude: number,
  longitude: number,
  date: Date,
  hints: { zone?: string | null } = {},
): PlaceClock | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return undefined;
  const here = deviceZone();
  const phone = phoneOffsetAt(date);
  const noon = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  const named0 =
    (hints.zone ? { zone: hints.zone } : undefined) ??
    (named.has(keyOf(latitude, longitude))
      ? { zone: named.get(keyOf(latitude, longitude)) as string }
      : undefined) ??
    countryClock(latitude, longitude);
  // A zone that keeps one offset all year now is written on it, whatever
  // the phone's zone data says (#117).
  const known = named0 && withZoneRule(named0);
  if (known) {
    // The phone's own zone: `clockFor` decides (Morocco's hand-set clocks).
    if (known.zone === here) return known;
    const off = zoneOffsetMinutes(known.away ?? known.zone, noon);
    if (off == null || off === phone) return undefined;
    return known;
  }
  const zone = longitudeZone(longitude);
  const off = fixedOffsetMinutes(zone) as number;
  // Not modulo a day: the islands that moved across the date line
  // (Kiritimati at UTC+14, a day from its longitude's −10) keep the same
  // digits as the longitude's hour on the NEXT date, and their own day is
  // the sun's day before by that date — the fixed offset writes it so.
  return Math.abs(phone - off) <= SAME_SUN_MINUTES ? undefined : { zone };
}
