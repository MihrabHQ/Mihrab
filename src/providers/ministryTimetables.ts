/**
 * Six national timetables, on the phone: Egypt's (the General Authority of
 * Survey), Kuwait's and Jordan's (their Ministries of Awqaf), Qatar's (the
 * Calendar House), Kazakhstan's (the Spiritual Administration of Muslims)
 * and Brunei's (the Ministry of Religious Affairs).
 *
 * Each is the authority's own method (`<country>Method.ts`, from
 * MihrabHQ/mihrab-methods) at the point its table gives the place that
 * answers for the reader (`ministryPlaces.ts`), with its correction list
 * for the few times the printed table is on the other side of a minute
 * (applied in `localAdhan.ts`): the printed minute, every time, over the
 * span checked. Offline, for any date; nothing is downloaded.
 *
 * All but Kazakhstan's print the first Asr, and a reader who keeps the
 * Hanafi Asr gets it from the same method at two shadow lengths;
 * Kazakhstan's prints the Hanafi Asr alone.
 */
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import {
  BRUNEI_METHOD_ID,
  EGYPT_METHOD_ID,
  JORDAN_METHOD_ID,
  KAZAKHSTAN_METHOD_ID,
  KUWAIT_METHOD_ID,
  QATAR_METHOD_ID,
  QATAR_PLACE,
  bruneiDistrictFor,
  kuwaitAreaFor,
  nearestEgyptCity,
  nearestJordanZone,
  nearestKazakhstanCity,
} from './ministryPlaces';
import type { PrayerTimesResult } from './types';

type Query = { latitude: number; longitude: number; date: Date; school?: number };
type Zone = PlaceClock & { zone: string };

export const EGYPT_CLOCK = { zone: 'Africa/Cairo' } as Zone;
export const KUWAIT_CLOCK = { zone: 'Asia/Kuwait' } as Zone;
export const QATAR_CLOCK = { zone: 'Asia/Qatar' } as Zone;
export const JORDAN_CLOCK = { zone: 'Asia/Amman' } as Zone;
/** The whole country keeps UTC+5, and the Administration prints every place on it. */
export const KAZAKHSTAN_CLOCK = { zone: 'Asia/Almaty' } as Zone;
export const BRUNEI_CLOCK = { zone: 'Asia/Brunei' } as Zone;

/** Defence in depth past the country's outline: Egypt's and Jordan's lists reach every part of the country well inside this. */
const MAX_PLACE_KM = 400;
/**
 * How far from one of Kazakhstan's listed cities its table is taken as the
 * reader's. Further out the method is computed for the reader's own spot,
 * as the Administration's own service does for any coordinates.
 */
const KAZAKHSTAN_CITY_KM = 40;

function at(point: { lat: number; lon: number }, method: number, clock: Zone, params: Query, school = params.school ?? 0): PrayerTimesResult {
  return {
    ...computeLocalAdhanTimes({ latitude: point.lat, longitude: point.lon, date: params.date, calculationMethod: method, school, placeClock: clock }),
    timezone: clock.zone,
    source: 'local',
  };
}

/** The Survey Authority's times for the nearest listed city of Egypt. @throws ProviderError('shape') out of coverage. */
export async function getEgyptTimes(params: Query): Promise<PrayerTimesResult> {
  const city = nearestEgyptCity(params.latitude, params.longitude);
  if (!city || city.distanceKm > MAX_PLACE_KM) throw new ProviderError('egypt', 'shape', 'Outside the cities of Egypt’s timetable.');
  return at(city, EGYPT_METHOD_ID, EGYPT_CLOCK, params);
}

/** The Ministry's table for the area of Kuwait this longitude is in. */
export async function getKuwaitTimes(params: Query): Promise<PrayerTimesResult> {
  return at(kuwaitAreaFor(params.longitude), KUWAIT_METHOD_ID, KUWAIT_CLOCK, params);
}

/** The Calendar House's table, Doha's, which Qatar keeps. */
export async function getQatarTimes(params: Query): Promise<PrayerTimesResult> {
  return at(QATAR_PLACE, QATAR_METHOD_ID, QATAR_CLOCK, params);
}

/** The Ministry's times for the nearest zone of Jordan. @throws ProviderError('shape') out of coverage. */
export async function getJordanTimes(params: Query): Promise<PrayerTimesResult> {
  const zone = nearestJordanZone(params.latitude, params.longitude);
  if (!zone || zone.distanceKm > MAX_PLACE_KM) throw new ProviderError('jordan', 'shape', 'Outside the zones of Jordan’s timetable.');
  return at(zone, JORDAN_METHOD_ID, JORDAN_CLOCK, params);
}

/** The Administration's times: a listed city's near it, the reader's own spot elsewhere in Kazakhstan. Its one Asr is the Hanafi one. */
export async function getKazakhstanTimes(params: Query): Promise<PrayerTimesResult> {
  const city = nearestKazakhstanCity(params.latitude, params.longitude);
  const point = city && city.distanceKm <= KAZAKHSTAN_CITY_KM ? city : { lat: params.latitude, lon: params.longitude };
  return at(point, KAZAKHSTAN_METHOD_ID, KAZAKHSTAN_CLOCK, params, 1);
}

/** The Ministry's table for the district of Brunei this longitude is in. */
export async function getBruneiTimes(params: Query): Promise<PrayerTimesResult> {
  return at(bruneiDistrictFor(params.longitude), BRUNEI_METHOD_ID, BRUNEI_CLOCK, params);
}

export const MINISTRY_TIMETABLES = {
  egypt: getEgyptTimes,
  kuwait: getKuwaitTimes,
  qatar: getQatarTimes,
  jordan: getJordanTimes,
  kazakhstan: getKazakhstanTimes,
  brunei: getBruneiTimes,
} as const;
export type MinistryTimetableId = keyof typeof MINISTRY_TIMETABLES;
export const isMinistryTimetable = (id: string): id is MinistryTimetableId => Object.prototype.hasOwnProperty.call(MINISTRY_TIMETABLES, id);
