/**
 * `missed` is not only a verdict — it is how people note that a prayer is
 * owed and will be made up. So a day holding one has to be findable on the
 * graph afterwards, even when the rest of that day went well.
 *
 * And the ramp has to rank the statuses the way the user reads them: a
 * prayer prayed late is closer to kept than one made up days later.
 */
import {
  STATUS_WEIGHT,
  scoreByDay,
  upsertEntry,
  type JournalEntry,
} from '../src/journal/journal';
import { dayKey } from '../src/practice/practiceStore';

const NOW = new Date(2026, 4, 13, 12, 0, 0); // Wed 13 May 2026

describe('the status ramp ranks the way a user reads it', () => {
  test('on-time beats late beats qadha beats missed', () => {
    expect(STATUS_WEIGHT['on-time']).toBeGreaterThan(STATUS_WEIGHT.late);
    expect(STATUS_WEIGHT.late).toBeGreaterThan(STATUS_WEIGHT.qadha);
    expect(STATUS_WEIGHT.qadha).toBeGreaterThan(STATUS_WEIGHT.missed);
  });

  test('missed is worth nothing, so it darkens nothing', () => {
    expect(STATUS_WEIGHT.missed).toBe(0);
  });

  test('a day of five late is a darker square than a day of five qadha', () => {
    let late: JournalEntry[] = [];
    let qadha: JournalEntry[] = [];
    for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const) {
      late = upsertEntry(late, '2026-05-11', p, 'late', NOW);
      qadha = upsertEntry(qadha, '2026-05-11', p, 'qadha', NOW);
    }
    const keptLate = scoreByDay(late).get('2026-05-11')!.kept;
    const keptQadha = scoreByDay(qadha).get('2026-05-11')!.kept;
    expect(keptLate).toBeGreaterThan(keptQadha);
  });

  test('neither is flattened to nothing — both mean the prayer was prayed', () => {
    expect(STATUS_WEIGHT.late).toBeGreaterThan(0);
    expect(STATUS_WEIGHT.qadha).toBeGreaterThan(0);
  });
});

describe('scoreByDay counts missed prayers separately', () => {
  test('counts them', () => {
    let entries = upsertEntry([], '2026-05-11', 'Fajr', 'missed', NOW);
    entries = upsertEntry(entries, '2026-05-11', 'Asr', 'missed', NOW);
    entries = upsertEntry(entries, '2026-05-11', 'Isha', 'on-time', NOW);
    const score = scoreByDay(entries).get('2026-05-11')!;
    expect(score.missed).toBe(2);
    expect(score.logged).toBe(3);
  });

  test('a day with none reports zero, not undefined', () => {
    const entries = upsertEntry([], '2026-05-11', 'Fajr', 'late', NOW);
    expect(scoreByDay(entries).get('2026-05-11')!.missed).toBe(0);
  });

  test('qadha is not counted as missed — it is the opposite', () => {
    const entries = upsertEntry([], '2026-05-11', 'Fajr', 'qadha', NOW);
    expect(scoreByDay(entries).get('2026-05-11')!.missed).toBe(0);
  });
});
