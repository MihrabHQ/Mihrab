/**
 * The record by prayer (src/practice/stripRecord.ts): one column a day,
 * one fact a cell, over the same window the heatmap draws.
 */
import { buildStrip, monthLabelFor, statusesByDay, STRIP_PRAYERS } from '../src/practice/stripRecord';
import type { JournalEntry } from '../src/journal/journal';
import { dayKey } from '../src/practice/practiceStore';
import { EMPTY_DAY } from '../src/journal/sunnah';

const NOW = new Date(2026, 9, 26, 12, 0, 0); // Monday 26 Oct 2026
const e = (date: string, prayer: JournalEntry['prayer'], status: JournalEntry['status']): JournalEntry => ({
  date,
  prayer,
  status,
  loggedAt: '2026-10-26T10:00:00Z',
});

describe('the window', () => {
  it('runs from the Monday weeks back to the Sunday of this week, oldest first', () => {
    const days = buildStrip([], new Set(), NOW, 2);
    expect(days).toHaveLength(14);
    expect(days[0].key).toBe('2026-10-19');
    expect(days[0].weekday).toBe(0);
    expect(days[13].key).toBe('2026-11-01');
    expect(days[13].weekday).toBe(6);
    expect(days[13].future).toBe(true);
    expect(days[7].key).toBe(dayKey(NOW));
    expect(days[7].future).toBe(false);
  });

  it('marks the first of a month, and names it', () => {
    const days = buildStrip([], new Set(), NOW, 2);
    const first = days.find(d => d.monthStart);
    expect(first?.key).toBe('2026-11-01');
    expect(monthLabelFor('2026-11-01', 'en')).toMatch(/Nov/);
    expect(monthLabelFor('nonsense', 'en')).toBe('');
  });
});

describe('the cells', () => {
  it('carry each prayer’s own status, and nothing where nothing was logged', () => {
    const days = buildStrip(
      [e('2026-10-26', 'Fajr', 'late'), e('2026-10-26', 'Asr', 'missed'), e('2026-10-26', 'Isha', 'cleared')],
      new Set(),
      NOW,
      1,
    );
    const today = days.find(d => d.key === '2026-10-26')!;
    expect(today.prayers).toEqual(['late', null, 'missed', null, null]);
    expect(STRIP_PRAYERS).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
  });

  it('lets a later entry for the same prayer win', () => {
    const by = statusesByDay([e('2026-10-20', 'Fajr', 'missed'), e('2026-10-20', 'Fajr', 'qadha')]);
    expect(by.get('2026-10-20')?.get('Fajr')).toBe('qadha');
  });

  it('carries the fast and the sunnah', () => {
    const days = buildStrip([], new Set(['2026-10-22']), NOW, 2, {
      '2026-10-22': { ...EMPTY_DAY, fajr: 2, qiyam: 2 },
    });
    const thu = days.find(d => d.key === '2026-10-22')!;
    expect(thu.fasted).toBe(true);
    expect(thu.qiyam).toBe(true);
    expect(thu.sunnah).toBeGreaterThan(0);
  });

  it('knows a day before the record from a day left unfilled inside it', () => {
    const days = buildStrip([e('2026-10-21', 'Fajr', 'on-time')], new Set(), NOW, 2, {}, '2026-10-21');
    const mon = days.find(d => d.key === '2026-10-19')!;
    const wed = days.find(d => d.key === '2026-10-21')!;
    const thu = days.find(d => d.key === '2026-10-22')!;
    expect(mon.beforeRecord).toBe(true);
    expect(mon.unaccounted).toBe(false);
    expect(wed.unaccounted).toBe(true); // four of five never filled in
    expect(thu.unaccounted).toBe(true);
    const today = days.find(d => d.key === '2026-10-26')!;
    expect(today.unaccounted).toBe(false); // not finished yet
  });
});
