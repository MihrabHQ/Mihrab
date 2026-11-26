/**
 * The hadith of the day: one a day, the same one for everyone on that
 * day, from the hadith al-Bukhārī and Muslim both report.
 *
 * FROM "AGREED UPON" AND NOWHERE ELSE (`AGREED_IDS`, catalog.ts). A
 * hadith put in front of a reader who did not go looking for it — on
 * Today, in a notification — is the app choosing for them, so it is
 * chosen from where there is nothing to choose between: HadeethEnc's
 * entries attributed to both Ṣaḥīḥs and graded ṣaḥīḥ, each of which the
 * app already serves and has in translation.
 *
 * BY THE DATE, NOT BY CHANCE. The day is the reader's own calendar day
 * (year, month, day — no clock, no zone arithmetic: `zoneClock.ts` has
 * why offsets are not parsed here), counted from a fixed day, and the
 * list is walked with a stride that has no factor in common with its
 * length. So two days running are not two neighbours of the list — which
 * are often one topic, or one hadith told twice — and every hadith comes
 * round once before any comes twice. Nothing is random and nothing is
 * stored: the same date gives the same hadith on every device, before and
 * after a reinstall, which is what lets two people talk about "today's".
 *
 * When the list is rebuilt (`scripts/hadith/agreed-list.js`) its length
 * changes and so does the walk: tomorrow's hadith is another than it
 * would have been. Nothing depends on yesterday's.
 */
import { AGREED_IDS } from './catalog';

/** A step through the list: prime, and far from any short cycle of days (a week, a month). */
const STRIDE = 613;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The stride for a list of this length: `STRIDE`, or the next number above it that shares no factor with the length. */
export function strideFor(length: number): number {
  let s = STRIDE;
  while (length > 1 && gcd(s, length) !== 1) s++;
  return s;
}

/** Days from 1 January 2026 to this calendar day, by the calendar alone. */
export function dayNumber(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(2026, 0, 1)) / 86_400_000);
}

/** Where in a list of `length` the day stands. */
export function dailyIndex(day: number, length: number): number {
  if (length <= 0) return -1;
  const at = (day * strideFor(length)) % length;
  return at < 0 ? at + length : at;
}

/** The entry id (`h:<HadeethEnc id>`) of the hadith of this calendar day, or null where the list is empty. */
export function dailyHadithId(date: Date, ids: readonly string[] = AGREED_IDS): string | null {
  const at = dailyIndex(dayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate()), ids.length);
  return at < 0 ? null : `h:${ids[at]}`;
}
