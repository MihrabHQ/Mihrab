/**
 * Is a sidang isbat today?
 *
 * Kemenag decides Ramadan, Syawal and Zulhijah on the evening of the 29th of
 * the month before. On that day this prints a GitHub issue (title, then
 * body) asking for the result to be checked against the app's prediction,
 * and for data/hijri/v1/overrides.json to be updated if they differ. On any
 * other day it prints nothing. Run by .github/workflows/hijri-isbat-reminder.yml.
 *
 * Usage: npx tsx tools/hijri-calendars/isbatReminder.ts [yyyy-mm-dd]
 */
import { gregorianToHijri } from '../../src/hijri/convert';
import { setHijriCalendar } from '../../src/hijri/calendar';
import data from '../../src/hijri/data/monthStarts.json';

const DECIDED: Record<number, string> = { 9: 'Ramadan', 10: 'Syawal', 12: 'Zulhijah' };

// The day in Indonesia (WIB, UTC+7), unless one is given.
const arg = process.argv[2];
const today = arg ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const [y, m, d] = today.split('-').map(Number);
const date = new Date(y, m - 1, d, 12);
const next = new Date(y, m - 1, d + 1, 12);

setHijriCalendar('mabims', 0);
const h = gregorianToHijri(date);
const following = (h.month % 12) + 1;
const name = DECIDED[following];
if (h.day === 29 && name) {
  const year = h.year;
  const uncertain = (data as { mabimsUncertain?: string[] }).mabimsUncertain?.includes(
    `${year}-${String(following).padStart(2, '0')}`,
  ) ?? false;
  const predicted = gregorianToHijri(next).day === 1 ? 'tomorrow' : 'the day after tomorrow';
  const ymd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const predictedDate = predicted === 'tomorrow' ? ymd(next) : ymd(new Date(y, m - 1, d + 2, 12));
  console.log(`Sidang isbat today: check 1 ${name} ${year} H`);
  console.log(
    [
      `Kemenag holds the sidang isbat for **1 ${name} ${year} H** this evening (${today}, 29th by the app's MABIMS calendar).`,
      '',
      `The app predicts **1 ${name} = ${predictedDate}** (${predicted}).`,
      ...(uncertain
        ? ['', `⚠️ This month is **too close to call**: a quarter of a degree, or the other reading of the altitude, gives another day. Expect the announcement to decide it.`]
        : []),
      '',
      'If the announced date differs:',
      '',
      `1. Add \`{ "year": ${year}, "month": ${following}, "start": "<announced yyyy-mm-dd>", "source": "Kemenag sidang isbat (1 ${name} ${year})", "url": "<news link>" }\` to \`mabims\` in \`data/hijri/v1/overrides.json\`.`,
      '2. Set `updated` to the current UTC time (`yyyy-mm-ddThh:mm:ssZ`) and push to main. Phones pick it up within a few hours. CI refuses a malformed file, and phones ignore one.',
      '',
      'If it agrees, add the entry anyway as a record, or just close this issue.',
    ].join('\n'),
  );
}
