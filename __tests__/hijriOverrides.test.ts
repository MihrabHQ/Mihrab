/**
 * Announced Hijri month starts (data/hijri/v1/overrides.json) — the way a
 * sidang isbat that overrules the MABIMS prediction reaches phones without
 * a release. See src/hijri/overrides.ts and calendar.ts `applyOverrides`.
 */
import file from '../data/hijri/v1/overrides.json';
import { parseOverrides, updatedMs } from '../src/hijri/overridesFile';
import {
  applyOverrides,
  julianDay,
  setHijriCalendar,
  setHijriOverrides,
  type MonthTable,
} from '../src/hijri/calendar';
import { gregorianToHijri } from '../src/hijri/convert';

const at = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const jd = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return julianDay(y, m, d);
};

const bundled = parseOverrides(file)!;
afterEach(() => {
  setHijriOverrides({ mabims: bundled.mabims, khgt: bundled.khgt }, bundled.updated);
  setHijriCalendar('tabular', 0);
});

describe('the file in the repository', () => {
  it('validates', () => {
    expect(bundled).not.toBeNull();
  });

  it('is what the tables already say, or a month the table can take', () => {
    // Every entry must land: the month before it stays 29 or 30 days.
    for (const id of ['mabims', 'khgt'] as const) {
      setHijriCalendar(id, 0);
      for (const o of bundled[id]) {
        expect(gregorianToHijri(at(o.start))).toEqual({ year: o.year, month: o.month, day: 1 });
      }
    }
  });

  it('names a source for every entry', () => {
    for (const e of [...file.mabims, ...file.khgt] as { source?: string; url?: string }[]) {
      expect(e.source).toBeTruthy();
      expect(e.url).toMatch(/^https:\/\//);
    }
  });
});

describe('parseOverrides', () => {
  const ok = { schema: 1, updated: '2027-02-07', mabims: [{ year: 1448, month: 9, start: '2027-02-09' }], khgt: [] };

  it('takes a well-formed file', () => {
    expect(parseOverrides(ok)?.mabims).toEqual([{ year: 1448, month: 9, start: '2027-02-09' }]);
  });

  it.each([
    ['another schema', { ...ok, schema: 2 }],
    ['no updated date', { ...ok, updated: undefined }],
    ['a month 13', { ...ok, mabims: [{ year: 1448, month: 13, start: '2027-02-09' }] }],
    ['a date that is not one', { ...ok, mabims: [{ year: 1448, month: 9, start: '9 Feb 2027' }] }],
    ['a list that is not one', { ...ok, khgt: 'none' }],
    ['a day that does not exist', { ...ok, mabims: [{ year: 1448, month: 9, start: '2027-02-30' }] }],
    ['the same month twice', { ...ok, mabims: [ok.mabims[0], { year: 1448, month: 9, start: '2027-02-10' }] }],
    ['an updated time without seconds', { ...ok, updated: '2027-02-07T18:30Z' }],
    ['an updated day that does not exist', { ...ok, updated: '2027-02-30' }],
  ])('refuses the whole file with %s', (_l, raw) => {
    expect(parseOverrides(raw)).toBeNull();
  });
});

describe('applyOverrides', () => {
  // From 1 Muharram 1448: 29, 29, 30, 30 days.
  const table: MonthTable = {
    year: 1448,
    month: 1,
    starts: [jd('2026-06-16'), jd('2026-07-15'), jd('2026-08-13'), jd('2026-09-12'), jd('2026-10-12')],
  };

  it('moves the announced month and leaves the rest when they still fit', () => {
    // Rabiʿ I a day late: Safar becomes 30 days, Rabiʿ I 29.
    const t = applyOverrides(table, [{ year: 1448, month: 3, start: '2026-08-14' }]);
    expect(t.starts).toEqual([jd('2026-06-16'), jd('2026-07-15'), jd('2026-08-14'), jd('2026-09-12'), jd('2026-10-12')]);
  });

  it('pushes the next month when the announced one would be too short', () => {
    // Safar a day late would leave it 28 days, so Rabiʿ I follows it.
    const t = applyOverrides(table, [{ year: 1448, month: 2, start: '2026-07-16' }]);
    expect(t.starts).toEqual([jd('2026-06-16'), jd('2026-07-16'), jd('2026-08-14'), jd('2026-09-12'), jd('2026-10-12')]);
  });

  it('refuses an announcement that would make the month before impossible', () => {
    // Muharram would be 32 days.
    const t = applyOverrides(table, [{ year: 1448, month: 2, start: '2026-07-18' }]);
    expect(t.starts).toEqual(table.starts);
  });

  it('refuses a date far from the table — a typo, not an announcement', () => {
    const t = applyOverrides(table, [{ year: 1448, month: 3, start: '2026-08-16' }]);
    expect(t.starts).toEqual(table.starts);
  });

  it('ignores months outside the table', () => {
    const t = applyOverrides(table, [{ year: 1500, month: 1, start: '2077-01-01' }]);
    expect(t.starts).toEqual(table.starts);
  });
});

describe('a correction from the server', () => {
  it('moves the date the app prints, and only in its calendar', () => {
    setHijriCalendar('mabims', 0);
    // Find the predicted 1 Ramadan 1448 and the length of Sha'ban before it.
    const d = at('2027-02-01');
    while (!(gregorianToHijri(d).month === 9 && gregorianToHijri(d).day === 1)) d.setDate(d.getDate() + 1);
    const predicted = new Date(d);
    const eve = new Date(d);
    eve.setDate(eve.getDate() - 1);
    const shaban = gregorianToHijri(eve).day;
    // The isbat can only move it within Sha'ban's 29–30 days: a day later
    // after a 29-day Sha'ban, a day earlier after a 30-day one.
    const announced = new Date(predicted);
    announced.setDate(announced.getDate() + (shaban === 29 ? 1 : -1));
    const ymd = `${announced.getFullYear()}-${String(announced.getMonth() + 1).padStart(2, '0')}-${String(announced.getDate()).padStart(2, '0')}`;
    setHijriOverrides({ mabims: [...bundled.mabims, { year: 1448, month: 9, start: ymd }] }, '2099-01-01');
    expect(gregorianToHijri(announced)).toEqual({ year: 1448, month: 9, day: 1 });
    expect(gregorianToHijri(predicted)).not.toEqual({ year: 1448, month: 9, day: 1 });
    // Muhammadiyah's calendar is not touched by a MABIMS correction.
    setHijriCalendar('khgt', 0);
    expect(gregorianToHijri(at('2027-02-08'))).toEqual({ year: 1448, month: 9, day: 1 });
  });
});

describe('which file is newer', () => {
  it('orders a bare date before a time later that day, and times by time', () => {
    expect(updatedMs('2027-02-07')).toBeLessThan(updatedMs('2027-02-07T12:00:00Z'));
    expect(updatedMs('2027-02-07T09:00:00Z')).toBeLessThan(updatedMs('2027-02-07T18:30:00Z'));
  });
});
