/**
 * The reader's hadith record: what survives a round trip through storage,
 * and the sync merge's laws — the same answer in any order, any number of
 * times, and an unmark that outlives an older mark on another device.
 */
import {
  coerceHadithRecord,
  EMPTY_HADITH_RECORD,
  isBookmarked,
  isRead,
  isSetMarked,
  mergeHadith,
  noteOf,
  setBookmark,
  setLast,
  setLevel,
  setNote,
  setRead,
  setSetMarked,
  type HadithRecord,
} from '../src/hadith/hadithRecord';

const T = 1_700_000_000_000;

function phone(): HadithRecord {
  let r = setRead(EMPTY_HADITH_RECORD, 'h:5456', true, T);
  r = setBookmark(r, 'h:5456', true, T + 1);
  r = setNote(r, 'n:7', 'sincerity', T + 2);
  r = setSetMarked(r, 'foundations', true, T + 3);
  r = setLevel(r, 'building', T + 4);
  return setLast(r, 'h:5456', 'set:nawawi40', T + 5);
}

function tablet(): HadithRecord {
  let r = setRead(EMPTY_HADITH_RECORD, 'h:5456', false, T + 10);
  r = setRead(r, 'b:bukhari:0', true, T + 11);
  r = setLevel(r, 'depth', T + 2);
  return setLast(r, 'b:bukhari:0', 'book:bukhari', T + 12);
}

describe('mergeHadith', () => {
  it('is commutative, to the byte', () => {
    expect(JSON.stringify(mergeHadith(phone(), tablet()))).toBe(JSON.stringify(mergeHadith(tablet(), phone())));
  });

  it('is idempotent', () => {
    const m = mergeHadith(phone(), tablet());
    expect(mergeHadith(m, m)).toEqual(m);
    expect(mergeHadith(m, phone())).toEqual(m);
  });

  it('is associative', () => {
    const third = setRead(EMPTY_HADITH_RECORD, 'n:7', true, T + 20);
    expect(mergeHadith(mergeHadith(phone(), tablet()), third)).toEqual(
      mergeHadith(phone(), mergeHadith(tablet(), third)),
    );
  });

  it('keeps the newer of a mark and its undoing, wherever each was made', () => {
    const m = mergeHadith(phone(), tablet());
    // Read on the phone, taken back later on the tablet.
    expect(isRead(m, 'h:5456')).toBe(false);
    // Untouched on the tablet: the phone's stands.
    expect(isBookmarked(m, 'h:5456')).toBe(true);
    expect(noteOf(m, 'n:7')).toBe('sincerity');
    expect(isSetMarked(m, 'foundations')).toBe(true);
    expect(isRead(m, 'b:bukhari:0')).toBe(true);
    // The level chosen last, and the place read last.
    expect(m.level?.[0]).toBe('building');
    expect(m.last?.[0]).toEqual({ id: 'b:bukhari:0', list: 'book:bukhari' });
  });

  it('settles a tie the same way on both sides', () => {
    const a = setNote(EMPTY_HADITH_RECORD, 'h:1', 'alpha', T);
    const b = setNote(EMPTY_HADITH_RECORD, 'h:1', 'beta', T);
    expect(noteOf(mergeHadith(a, b), 'h:1')).toBe(noteOf(mergeHadith(b, a), 'h:1'));
  });
});

describe('coerceHadithRecord', () => {
  it('round-trips a record through JSON', () => {
    const r = mergeHadith(phone(), tablet());
    expect(coerceHadithRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('drops what does not fit instead of throwing', () => {
    const r = coerceHadithRecord({
      v: 1,
      items: {
        'h:1': { r: [2, T], b: [1, -5], n: [42, T] },
        'h:2': { r: [1, T] },
        ['x'.repeat(200)]: { r: [1, T] },
      },
      sets: { a: [1, 'yesterday'], b: [0, T] },
      level: ['expert', T],
      last: [{ id: '' }, T],
    });
    expect(Object.keys(r.items)).toEqual(['h:2']);
    expect(r.sets).toEqual({ b: [0, T] });
    expect(r.level).toBeUndefined();
    expect(r.last).toBeUndefined();
  });

  it('reads nonsense as the empty record', () => {
    expect(coerceHadithRecord(null)).toEqual(EMPTY_HADITH_RECORD);
    expect(coerceHadithRecord([1, 2])).toEqual(EMPTY_HADITH_RECORD);
    expect(coerceHadithRecord('x')).toEqual(EMPTY_HADITH_RECORD);
  });
});

/**
 * Memorising, bookmark folders and a reading plan (2026-11-26): three more
 * things a reader does, kept in the same record by the same rule — a value
 * and the time it was set, the newer winning. A record written before them
 * reads as it did, and merges to the bytes it had.
 */
describe('memorising, folders and a plan', () => {
  const R = require('../src/hadith/hadithRecord') as typeof import('../src/hadith/hadithRecord');
  const E = R.EMPTY_HADITH_RECORD;

  it('leaves a record from before them exactly as it was', () => {
    const old = { v: 1, items: { 'h:1': { r: [1, 10], b: [1, 11], n: ['note', 12] } }, sets: { nawawi: [1, 5] }, level: ['building', 3], last: [{ id: 'h:1', list: 'set:nawawi' }, 9] };
    const read = R.coerceHadithRecord(JSON.parse(JSON.stringify(old)));
    expect(read).toEqual(old);
    expect(JSON.stringify(R.mergeHadith(read, read))).toBe(JSON.stringify(read));
    expect('folders' in read).toBe(false);
    expect('plan' in read).toBe(false);
    expect(R.memoOf(read, 'h:1')).toBe(0);
    expect(R.folderOf(read, 'h:1')).toBe('');
    expect(R.planOf(read)).toBeNull();
  });

  it('keeps what is being memorised, then what has been, and lets either be taken back', () => {
    let r = R.setMemo(E, 'h:2', 1, 20);
    r = R.setMemo(r, 'h:1', 1, 10);
    r = R.setMemo(r, 'h:3', 2, 5);
    expect(R.memoIds(r)).toEqual(['h:1', 'h:2', 'h:3']);
    r = R.setMemo(r, 'h:1', 0, 30);
    expect(R.memoIds(r)).toEqual(['h:2', 'h:3']);
    // Taken back here, it stays taken back against the other phone's older mark.
    const other = R.setMemo(E, 'h:1', 1, 10);
    expect(R.memoOf(R.mergeHadith(other, r), 'h:1')).toBe(0);
    expect(R.mergeHadith(other, r)).toEqual(R.mergeHadith(r, other));
  });

  it('files a bookmark in a folder, and out of it when the folder is deleted', () => {
    let r = R.nameFolder(E, 'f1', '  Fasting   notes ', 1);
    expect(R.foldersOf(r)).toEqual([['f1', 'Fasting notes']]);
    // Filing bookmarks what was not bookmarked.
    r = R.setFolder(r, 'h:1', 'f1', 2);
    r = R.setBookmark(r, 'h:2', true, 3);
    expect(R.isBookmarked(r, 'h:1')).toBe(true);
    expect(R.folderIds(r, 'f1')).toEqual(['h:1']);
    expect(R.folderIds(r, '')).toEqual(['h:2']);
    // Renamed; then deleted: the bookmark stays, in no folder.
    r = R.nameFolder(r, 'f1', 'Ramadan', 4);
    expect(R.foldersOf(r)).toEqual([['f1', 'Ramadan']]);
    r = R.nameFolder(r, 'f1', '', 5);
    expect(R.foldersOf(r)).toEqual([]);
    expect(R.folderOf(r, 'h:1')).toBe('');
    expect(R.bookmarkedIds(r).sort()).toEqual(['h:1', 'h:2']);
    // A folder with no name is not made, and there is an end to how many.
    expect(R.nameFolder(E, 'f2', '   ', 1)).toBe(E);
    let many = E;
    for (let i = 0; i < R.MAX_FOLDERS + 5; i++) many = R.nameFolder(many, `f${i}`, `n${i}`, i);
    expect(R.foldersOf(many).length).toBe(R.MAX_FOLDERS);
  });

  it('merges folders and filing by the newer, commutatively, and survives the disk', () => {
    const a = R.setFolder(R.nameFolder(E, 'f1', 'A', 1), 'h:1', 'f1', 2);
    const b = R.nameFolder(R.nameFolder(E, 'f1', 'B', 3), 'f2', 'C', 1);
    const m = R.mergeHadith(a, b);
    expect(m).toEqual(R.mergeHadith(b, a));
    expect(R.mergeHadith(m, m)).toEqual(m);
    expect(R.foldersOf(m)).toEqual([['f1', 'B'], ['f2', 'C']]);
    expect(R.folderOf(m, 'h:1')).toBe('f1');
    expect(R.coerceHadithRecord(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it('follows one plan at a time, ends it, and drops a plan that makes no sense', () => {
    const p = { list: 'comp:riyad', days: 90, from: '2026-11-26' };
    let r = R.setPlan(E, p, 10);
    expect(R.planOf(r)).toEqual(p);
    expect(R.coerceHadithRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
    const ended = R.setPlan(r, null, 20);
    expect(R.planOf(ended)).toBeNull();
    // Ended here, it stays ended against the plan the other phone still holds.
    expect(R.planOf(R.mergeHadith(r, ended))).toBeNull();
    expect(R.planOf(R.mergeHadith(ended, r))).toBeNull();
    for (const bad of [{ list: '', days: 30, from: '2026-11-26' }, { list: 'x', days: 0, from: '2026-11-26' }, { list: 'x', days: 30, from: 'today' }, { list: 'x', days: 1.5, from: '2026-11-26' }, 'plan']) {
      expect(R.planOf(R.coerceHadithRecord({ v: 1, items: {}, sets: {}, plan: [bad, 5] }))).toBeNull();
    }
  });
});

describe('a reading plan’s day', () => {
  const R = require('../src/hadith/hadithRecord') as typeof import('../src/hadith/hadithRecord');
  const P = require('../src/hadith/plan') as typeof import('../src/hadith/plan');
  const ids = Array.from({ length: 90 }, (_, i) => `h:${i + 1}`);
  const plan = { list: 'set:x', days: 30, from: '2026-11-01' };
  const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0, 0);
  const readOn = (rec: import('../src/hadith/hadithRecord').HadithRecord, from: number, to: number, when: Date) => {
    let r = rec;
    for (let i = from; i <= to; i++) r = R.setRead(r, `h:${i}`, true, when.getTime());
    return r;
  };

  it('is an even share of what is left, counted in the reader’s own days', () => {
    const p = P.planProgress(plan, ids, R.EMPTY_HADITH_RECORD, at(1));
    expect(p).toMatchObject({ day: 1, days: 30, total: 90, read: 0, target: 3, doneToday: 0, finished: false, next: 'h:1' });
    expect(P.daysBetween('2026-11-01', '2026-11-01')).toBe(0);
    expect(P.daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(P.localDay(at(9))).toBe('2026-11-09');
  });

  it('does not shrink as it is read, and counts only what was read today', () => {
    let r = readOn(R.EMPTY_HADITH_RECORD, 1, 3, at(1));
    r = readOn(r, 4, 5, at(2, 9));
    const p = P.planProgress(plan, ids, r, at(2, 10));
    // 87 were unread this morning, over 29 days: three, of which two are read.
    expect(p).toMatchObject({ day: 2, read: 5, target: 3, doneToday: 2, next: 'h:6' });
  });

  it('shares a missed day over the days left, and past the last day asks for what is left', () => {
    const behind = P.planProgress(plan, ids, readOn(R.EMPTY_HADITH_RECORD, 1, 3, at(1)), at(11));
    // 87 left over 20 days.
    expect(behind).toMatchObject({ day: 11, target: 5, doneToday: 0 });
    const over = P.planProgress(plan, ids, readOn(R.EMPTY_HADITH_RECORD, 1, 80, at(1)), new Date(2026, 11, 5, 12));
    expect(over.day).toBeGreaterThan(30);
    expect(over.target).toBe(10);
  });

  it('is finished when every hadith of the list is read, and not before there is a list', () => {
    const done = P.planProgress(plan, ids, readOn(R.EMPTY_HADITH_RECORD, 1, 90, at(3)), at(4));
    expect(done).toMatchObject({ finished: true, next: null, target: 0 });
    expect(P.planProgress(plan, [], R.EMPTY_HADITH_RECORD, at(1)).finished).toBe(false);
  });
});
