/**
 * A fast taken off a day is kept as a tombstone for sync. It must never be
 * drawn or counted as a fast, and marking the day again must bring it back.
 * (Reported: 1 October showed as fasted on the Log and could not be
 * removed — the grid counted the tombstone, and "Mark as fasted" wrote
 * onto it without clearing it.)
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  deleteFastEntry,
  findFastEntry,
  liveFasts,
  upsertFastEntry,
  type FastEntry,
} from '../src/fasting/fasting';
import { computePracticeStats } from '../src/practice/practiceStats';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const fast: FastEntry = {
  date: '2026-10-01',
  type: 'voluntary',
  completed: true,
  loggedAt: '2026-10-01T10:00:00.000Z',
};

describe('a fast taken off a day', () => {
  it('is a tombstone no reader returns', () => {
    const after = deleteFastEntry([fast], '2026-10-01');
    expect(after[0].cleared).toBe(true);
    expect(findFastEntry(after, '2026-10-01')).toBeUndefined();
    expect(liveFasts(after)).toEqual([]);
  });

  it('comes back when the day is marked again', () => {
    const removed = deleteFastEntry([fast], '2026-10-01');
    const again = upsertFastEntry(removed, '2026-10-01', { type: 'voluntary', completed: true });
    expect(again).toHaveLength(1);
    expect(again[0].cleared).toBeUndefined();
    expect(findFastEntry(again, '2026-10-01')?.completed).toBe(true);
  });

  it('is not counted in the month', () => {
    const removed = deleteFastEntry([fast], '2026-10-01');
    const stats = computePracticeStats({
      entries: [],
      fasts: removed,
      sunnah: {},
      streak: 0,
      bestStreak: 0,
      now: new Date(2026, 9, 22, 12),
    });
    expect(stats.fastsThisMonth).toBe(0);
  });

  it('is not drawn on the Log grid, nor taken as today on Home', () => {
    expect(read('src/screens/LogScreen.tsx')).toMatch(
      /const fasted = new Set\(liveFasts\(fasts\)\.filter\(f => f\.completed\)/,
    );
    expect(read('src/practice/practiceStore.ts')).toMatch(
      /d\.fasts\.find\(f => f\.date === today && f\.cleared !== true\)/,
    );
  });
});
