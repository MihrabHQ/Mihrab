/**
 * Gregorian ↔ Hijri conversion — task #20.
 *
 * `gregorianToHijri` reads the date in the calendar the user chose
 * (`calendar.ts`): the arithmetic one below by default, or one of the
 * Indonesian tables, moved by the user's adjustment. Everything in the app
 * that prints or decides on a Hijri date goes through it.
 *
 * The arithmetic (tabular, "Kuwaiti") calendar: a 30-year cycle with 11
 * leap years. Accurate to ±1 day vs. the observed lunar calendar.
 * Reference: Khalid Shaukat, "The Hijri Calendar Algorithm" (1985);
 * standard implementation matched against Tanzil and ulug.org for the
 * range AD 1900–2100.
 */

import type { HijriDate } from './events';
import { activeHijriCalendar, fromTable, julianDay, monthTable, type MonthTable } from './calendar';

const HIJRI_EPOCH_JD = 1948440; // Julian Day for 1 Muharram 1 AH (16 July 622 CE, Friday)

/**
 * The Hijri date of a Gregorian date (local calendar; only year/month/day
 * are used), in the chosen calendar.
 */
export function gregorianToHijri(d: Date): HijriDate {
  const { id, adjustDays } = activeHijriCalendar();
  const jd = julianDay(d.getFullYear(), d.getMonth() + 1, d.getDate()) + adjustDays;
  const table = monthTable(id);
  if (table) return fromTableOrBeyond(table, jd);
  return tabularFromJd(jd);
}

/**
 * Inside a table, the table. Before or after it, months of the arithmetic
 * calendar's lengths counted from the table's own edge — never the
 * arithmetic calendar's own dates, which can be a day off the table's at
 * the seam and would repeat or skip a day there.
 */
export function fromTableOrBeyond(table: MonthTable, jd: number): HijriDate {
  const inside = fromTable(table, jd);
  if (inside) return inside;
  const s = table.starts;
  if (jd < s[0]) {
    let year = table.year;
    let month = table.month;
    let start = s[0];
    while (jd < start) {
      if (month === 1) {
        year -= 1;
        month = 12;
      } else {
        month -= 1;
      }
      start -= hijriMonthLength(year, month);
    }
    return { year, month, day: jd - start + 1 };
  }
  // After: the month that follows the table's last one.
  const index = table.month - 1 + (s.length - 1);
  let year = table.year + Math.floor(index / 12);
  let month = (index % 12) + 1;
  let start = s[s.length - 1];
  while (jd >= start + hijriMonthLength(year, month)) {
    start += hijriMonthLength(year, month);
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
  return { year, month, day: jd - start + 1 };
}

/** The arithmetic calendar alone, whatever the user chose. */
export function tabularGregorianToHijri(d: Date): HijriDate {
  return tabularFromJd(julianDay(d.getFullYear(), d.getMonth() + 1, d.getDate()));
}

function tabularFromJd(jd: number): HijriDate {
  const days = jd - HIJRI_EPOCH_JD;
  // 30-year cycle: 11 leap years at fixed positions.
  const cycle30 = Math.floor(days / 10631);
  const remDays = days - cycle30 * 10631;
  const yearInCycle = Math.min(29, Math.floor((remDays + 1) / 354));
  const yearStartDays = Math.floor((yearInCycle * 354) + Math.floor((yearInCycle * 11 + 3) / 30));
  let dayInYear = remDays - yearStartDays;
  // Handle boundary edge: the rough year-in-cycle estimate can over-shoot
  // by one day at year boundaries because the leap-day distribution is
  // uneven — drop back one year if so.
  let year = cycle30 * 30 + yearInCycle + 1;
  if (dayInYear < 0) {
    year -= 1;
    const leap = isHijriLeap(year);
    dayInYear += leap ? 355 : 354;
  }
  // Convert day-in-year to month/day. Months alternate 30/29 with the 12th
  // month gaining a day in leap years.
  let month = 1;
  let day = dayInYear + 1;
  while (true) {
    const dim = hijriMonthLength(year, month);
    if (day <= dim) break;
    day -= dim;
    month += 1;
    if (month > 12) {
      // Roll into next year — extremely rare cycle-boundary edge.
      year += 1;
      month = 1;
    }
  }
  return { year, month, day };
}

/** True if the given Hijri year is a leap year in the 30-year cycle. */
export function isHijriLeap(year: number): boolean {
  // Leap years in each 30-year cycle: 2,5,7,10,13,16,18,21,24,26,29
  const inCycle = ((year - 1) % 30) + 1;
  return [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29].includes(inCycle);
}

/** Days in a given Hijri month: odd months = 30, even = 29; 12th month +1 in leap year. */
export function hijriMonthLength(year: number, month: number): number {
  if (month === 12) return isHijriLeap(year) ? 30 : 29;
  return month % 2 === 1 ? 30 : 29;
}
