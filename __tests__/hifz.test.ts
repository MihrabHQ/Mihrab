/**
 * Hifz (src/quran/hifz.ts, #121): the schedule, the marking, and the merge
 * the sync depends on.
 */
import {
  addDays,
  coerceHifz,
  EMPTY_HIFZ,
  hifzStock,
  markRange,
  markSurah,
  markUpTo,
  mergeHifz,
  nextInterval,
  portionAt,
  portionSpan,
  recitedToday,
  removePortion,
  reviewPortion,
  setCap,
  surahMemorised,
  todaysRevision,
  unmarkFrom,
  unmarkRange,
  unmarkSurah,
  type HifzState,
} from '../src/quran/hifz';
import { ayahIndexOf } from '../src/quran/ayahIndex';
import { mergeQuran } from '../src/sync/merge';
import { coerceQuranState, DEFAULT_QURAN_STATE } from '../src/quran/quranState';

const TODAY = '2026-11-04';
const NOW = new Date(2026, 10, 4, 12).getTime();

describe('the schedule', () => {
  it('steps 1 → 3 → 7 → 14 → 30, fluent skips a step, again is back to daily', () => {
    expect(nextInterval(1, 'fine', 30)).toBe(3);
    expect(nextInterval(3, 'fine', 30)).toBe(7);
    expect(nextInterval(14, 'fine', 30)).toBe(30);
    expect(nextInterval(30, 'fine', 30)).toBe(30);
    expect(nextInterval(1, 'fluent', 30)).toBe(7);
    expect(nextInterval(14, 'fluent', 30)).toBe(30);
    expect(nextInterval(30, 'again', 30)).toBe(1);
  });

  it('never waits past the cap', () => {
    expect(nextInterval(7, 'fine', 7)).toBe(7);
    expect(nextInterval(7, 'fluent', 14)).toBe(14);
    expect(nextInterval(3, 'fine', 7)).toBe(7);
  });

  it('a new portion is due tomorrow; a recitation moves it on', () => {
    let s = markSurah(EMPTY_HIFZ, 67, TODAY, NOW);
    const p = s.portions[0];
    expect(p.due).toBe(addDays(TODAY, 1));
    expect(todaysRevision(s, TODAY).due).toHaveLength(0);
    const tomorrow = addDays(TODAY, 1);
    expect(todaysRevision(s, tomorrow).due.map(x => x.id)).toEqual([p.id]);
    s = reviewPortion(s, p.id, 'fine', tomorrow, NOW + 864e5);
    expect(s.portions[0].interval).toBe(3);
    expect(s.portions[0].due).toBe(addDays(tomorrow, 3));
    expect(recitedToday(s, tomorrow).map(x => x.id)).toEqual([p.id]);
    expect(todaysRevision(s, tomorrow).due).toHaveLength(0);
  });

  it("today's revision: the most overdue first, the day's budget shown, the rest counted", () => {
    let s: HifzState = { ...EMPTY_HIFZ, budget: 2 };
    for (const surah of [112, 113, 114, 67]) s = markSurah(s, surah, TODAY, NOW);
    const later = addDays(TODAY, 5);
    // All four due; one fell further behind.
    s = { ...s, portions: s.portions.map(p => (portionSpan(p).surah === 114 ? { ...p, due: addDays(TODAY, -3) } : p)) };
    const r = todaysRevision(s, later);
    expect(r.due).toHaveLength(4);
    expect(portionSpan(r.due[0]).surah).toBe(114);
    expect(r.shown).toHaveLength(2);
    expect(r.more).toBe(2);
  });

  it('a shorter cap brings the far-off portions in', () => {
    let s = markSurah(EMPTY_HIFZ, 67, TODAY, NOW);
    s = { ...s, portions: [{ ...s.portions[0], interval: 30, due: addDays(TODAY, 25) }] };
    s = setCap(s, 7, TODAY, NOW);
    expect(s.portions[0].due).toBe(TODAY);
    expect(s.portions[0].interval).toBe(7);
  });
});

describe('marking', () => {
  it('a whole surah, a stretch, and "up to here" joining the stretch before it', () => {
    let s = markUpTo(EMPTY_HIFZ, 78, 20, TODAY, NOW); // an-Naba 1–20
    expect(portionSpan(s.portions[0])).toMatchObject({ surah: 78, from: 1, to: 20, wholeSurah: false });
    expect(surahMemorised(s, 78)).toBe(false);
    const id = s.portions[0].id;
    s = reviewPortion(s, id, 'fine', addDays(TODAY, 1), NOW + 864e5); // its schedule has moved on
    s = markUpTo(s, 78, 40, TODAY, NOW + 2e5);
    expect(s.portions).toHaveLength(1);
    expect(s.portions[0].id).toBe(id); // the same portion, longer
    expect(s.portions[0].interval).toBe(3); // its revision not restarted
    expect(portionSpan(s.portions[0]).wholeSurah).toBe(true);
    expect(surahMemorised(s, 78)).toBe(true);
    expect(portionAt(s, 78, 33)?.id).toBe(id);
    expect(portionAt(s, 79, 1)).toBeUndefined();
  });

  it('a range across surahs is one portion, and un-marking a surah keeps what lies outside it', () => {
    let s = markRange(EMPTY_HIFZ, ayahIndexOf(112, 1), ayahIndexOf(114, 6), TODAY, NOW);
    expect(s.portions).toHaveLength(1);
    expect(surahMemorised(s, 113)).toBe(true);
    s = unmarkSurah(s, 113, NOW + 1);
    expect(surahMemorised(s, 112)).toBe(true);
    expect(surahMemorised(s, 113)).toBe(false);
    expect(surahMemorised(s, 114)).toBe(true);
    expect(s.portions).toHaveLength(2);
    expect(hifzStock(s)).toEqual({ ayahs: 4 + 6, surahs: 2 });
  });

  it('"not by heart" on an ayah ends the portion before it, and the head keeps its schedule', () => {
    let s = markSurah(EMPTY_HIFZ, 78, TODAY, NOW); // an-Naba 1–40
    const id = s.portions[0].id;
    s = reviewPortion(s, id, 'fine', addDays(TODAY, 1), NOW + 864e5);
    s = unmarkFrom(s, 78, 31, NOW + 2 * 864e5);
    expect(s.portions).toHaveLength(1);
    expect(portionSpan(s.portions[0])).toMatchObject({ surah: 78, from: 1, to: 30 });
    expect(s.portions[0].interval).toBe(3);
    expect(s.portions[0].reviews).toHaveLength(1);
    // From the first ayah, nothing of it is left.
    s = unmarkFrom(s, 78, 1, NOW + 3 * 864e5);
    expect(s.portions).toHaveLength(0);
    // An ayah not held changes nothing.
    expect(unmarkFrom(s, 1, 1, NOW)).toBe(s);
  });

  it('a portion cut short is the same portion: the shorter copy wins a merge either way', () => {
    const a = markSurah(EMPTY_HIFZ, 78, TODAY, NOW);
    const b = unmarkFrom(a, 78, 31, NOW + 1000);
    expect(b.portions[0].id).toBe(a.portions[0].id);
    expect(b.removed ?? []).toHaveLength(0);
    for (const m of [mergeHifz(a, b), mergeHifz(b, a)]) {
      expect(m?.portions).toHaveLength(1);
      expect(portionSpan(m!.portions[0]).to).toBe(30);
    }
  });

  it('unmarking the middle of a portion leaves both ends', () => {
    let s = markSurah(EMPTY_HIFZ, 67, TODAY, NOW); // al-Mulk 1–30
    s = unmarkRange(s, ayahIndexOf(67, 11), ayahIndexOf(67, 20), NOW + 1);
    expect(s.portions.map(p => [portionSpan(p).from, portionSpan(p).to])).toEqual([
      [1, 10],
      [21, 30],
    ]);
    expect(hifzStock(s).ayahs).toBe(20);
  });

  it('a removed portion stays removed through a merge with a device that still has it', () => {
    const a = markSurah(EMPTY_HIFZ, 67, TODAY, NOW);
    const b = removePortion(a, a.portions[0].id, NOW + 1000);
    expect(b.portions).toHaveLength(0);
    expect(mergeHifz(b, a)?.portions).toHaveLength(0);
    expect(mergeHifz(a, b)?.portions).toHaveLength(0);
  });
});

describe('the merge', () => {
  const stateA = (): HifzState => {
    let s = markSurah(EMPTY_HIFZ, 67, TODAY, NOW);
    s = markSurah(s, 112, TODAY, NOW + 1);
    return s;
  };

  it('is the state itself when merged with itself, and the same whichever side is local', () => {
    const a = stateA();
    expect(mergeHifz(a, a)).toEqual(a);
    const b = markSurah(a, 113, TODAY, NOW + 2);
    const c = reviewPortion(a, a.portions[0].id, 'fluent', addDays(TODAY, 1), NOW + 3e5);
    expect(mergeHifz(b, c)).toEqual(mergeHifz(c, b));
    const m = mergeHifz(b, c)!;
    expect(m.portions).toHaveLength(3);
    expect(m.portions.find(p => p.id === a.portions[0].id)?.interval).toBe(7);
  });

  it('absent stays absent, and the preferences follow their stamp', () => {
    expect(mergeHifz(undefined, undefined)).toBeUndefined();
    const a = { ...stateA(), cap: 7 as const, prefsUpdatedAt: NOW };
    const b = { ...stateA(), cap: 14 as const, prefsUpdatedAt: NOW + 1 };
    expect(mergeHifz(a, b)?.cap).toBe(14);
    expect(mergeHifz(b, a)?.cap).toBe(14);
  });

  it('rides in the Qur’an blob: coerced from disk, merged by mergeQuran, absent when empty', () => {
    const a = stateA();
    const q = coerceQuranState({ ...DEFAULT_QURAN_STATE, hifz: a });
    expect(q.hifz).toEqual(a);
    expect(coerceQuranState(DEFAULT_QURAN_STATE).hifz).toBeUndefined();
    expect(coerceQuranState({ ...DEFAULT_QURAN_STATE, hifz: { portions: [] } }).hifz).toBeUndefined();
    const merged = mergeQuran(q, { ...DEFAULT_QURAN_STATE });
    expect(merged.hifz).toEqual(a);
    expect(mergeQuran(DEFAULT_QURAN_STATE, DEFAULT_QURAN_STATE).hifz).toBeUndefined();
    // A damaged portion on disk is dropped, not fatal.
    expect(coerceHifz({ portions: [{ id: 'x', start: 5, end: 2 }, a.portions[0]] })?.portions).toHaveLength(1);
  });
});
