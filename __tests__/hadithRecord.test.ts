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
