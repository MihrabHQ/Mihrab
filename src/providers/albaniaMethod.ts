/**
 * Albania — the Muslim Community of Albania's calendar, as its times are
 * computed.
 *
 * The Community prints one table a year, computed for Tirana (41°20′ N,
 * 19°49′ E, as its calendar says), and gives twenty-one other towns — of
 * Albania, Kosovo, North Macedonia, Montenegro and the Preševo valley — as
 * whole minutes on it. It is a reference town's table with the sun taken
 * once a day (`townTableMethod.ts`; from MihrabHQ/mihrab-methods, revision 1):
 *
 *   • the day's sun is taken at 0h UT of the date (one in the morning in
 *     Tirana, by winter time);
 *   • Fajr — the calendar's Imsak — at 18° with no margin; sunrise 7
 *     minutes earlier, Dhuhr 5 later, Asr 4 later, Maghrib 7 later; Isha at
 *     17° with no margin; each to the nearest minute.
 *
 * This gives the calendar's minute for about 98 % of the table; every other
 * time is a single minute away.
 */
import { townTableRawMinutes, townTableTimes, type TownTable, type TownTableInstants, type TownTableMinutes } from './townTableMethod';

/** Tirana's table. */
export const ALBANIA_TABLE: TownTable = {
  lat: 41.3333,
  lon: 19.8167,
  sunAt: 0,
  margins: { fajr: 0, sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7, isha: 0 },
};

export type AlbaniaInstants = TownTableInstants;

/** The times before rounding, minutes past 00:00 UT of the civil date (month 0-based), for the town whose point has this longitude. */
export function albaniaRawMinutes(longitude: number, year: number, month: number, day: number, asrShadow = 1): TownTableMinutes {
  return townTableRawMinutes(ALBANIA_TABLE, longitude, year, month, day, asrShadow);
}

/** The Community's times for the civil date (month 0-based) in the town whose point has this longitude, each on the minute it prints. */
export function albaniaTimes(longitude: number, year: number, month: number, day: number, asrShadow = 1): AlbaniaInstants {
  return townTableTimes(ALBANIA_TABLE, longitude, year, month, day, asrShadow);
}
