/**
 * A reader's own words on a place in a Library book: a name for a
 * bookmark, a thought on a passage. Kept in the hadith record beside the
 * marks (`libraryNotes`), so they are encrypted, backed up and carried
 * between devices as the marks are, and merged note by note.
 */
import { EMPTY_HADITH_RECORD, coerceHadithRecord, libraryMarksOf, mergeHadith, setLibraryMark, setLibraryNote } from '../src/hadith/hadithRecord';

describe('a note on a place in a book', () => {
  it('marks the place it is written on, and is read back with the mark', () => {
    const rec = setLibraryNote(EMPTY_HADITH_RECORD, 'tibyan', 2, 5, '  the adab of the reciter  ', 100);
    expect(libraryMarksOf(rec, 'tibyan')).toEqual([{ c: 2, b: 5, at: 100, n: 'the adab of the reciter' }]);
    // A place marked before keeps the day it was marked.
    const marked = setLibraryNote(setLibraryMark(EMPTY_HADITH_RECORD, 'tibyan', 0, 1, true, 50), 'tibyan', 0, 1, 'begin here', 90);
    expect(libraryMarksOf(marked, 'tibyan')).toEqual([{ c: 0, b: 1, at: 50, n: 'begin here' }]);
  });

  it('is cleared without taking the mark off, and a cleared note marks nothing', () => {
    const rec = setLibraryNote(setLibraryNote(EMPTY_HADITH_RECORD, 'arbainid', 0, 39, 'x', 10), 'arbainid', 0, 39, '', 20);
    expect(libraryMarksOf(rec, 'arbainid')).toEqual([{ c: 0, b: 39, at: 10 }]);
    expect(libraryMarksOf(setLibraryNote(EMPTY_HADITH_RECORD, 'arbainid', 0, 1, '   ', 5), 'arbainid')).toEqual([]);
  });

  it('is carried: the newer words win, note by note, whichever way two devices are merged', () => {
    const a = setLibraryNote(EMPTY_HADITH_RECORD, 'tibyan', 1, 1, 'on the phone', 100);
    const b = setLibraryNote(setLibraryNote(EMPTY_HADITH_RECORD, 'tibyan', 1, 1, 'on the tablet', 200), 'umda', 0, 3, 'another', 150);
    const merged = mergeHadith(a, b);
    expect(merged).toEqual(mergeHadith(b, a));
    expect(mergeHadith(merged, merged)).toEqual(merged);
    expect(libraryMarksOf(merged, 'tibyan')[0].n).toBe('on the tablet');
    expect(libraryMarksOf(merged, 'umda')[0].n).toBe('another');
  });

  it('is kept through storage, and what is not a note on a place in a book is dropped', () => {
    const rec = setLibraryNote(EMPTY_HADITH_RECORD, 'tibyan', 1, 1, 'kept', 100);
    expect(coerceHadithRecord(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
    const odd = coerceHadithRecord({ v: 1, items: {}, sets: {}, libraryNotes: { 'tibyan:1:1': ['ok', 1], 'not a key': ['x', 1], 'umda:0:0': [5, 1], 'umda:0:1': ['late'] } });
    expect(odd.libraryNotes).toEqual({ 'tibyan:1:1': ['ok', 1] });
    // A record with no notes is the bytes it was.
    expect('libraryNotes' in coerceHadithRecord({ v: 1, items: {}, sets: {} })).toBe(false);
    expect('libraryNotes' in mergeHadith(EMPTY_HADITH_RECORD, EMPTY_HADITH_RECORD)).toBe(false);
  });

  it('is no longer than a hadith note may be', () => {
    const rec = setLibraryNote(EMPTY_HADITH_RECORD, 'tibyan', 0, 0, 'x'.repeat(5000), 1);
    expect(libraryMarksOf(rec, 'tibyan')[0].n).toHaveLength(4000);
  });
});
