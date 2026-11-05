import { readFileSync } from 'fs';
import path from 'path';
import { MAX_SUGGESTIONS } from '../src/quran/audio/listenSuggestions';
import { readSuggestions } from '../src/quran/readSuggestions';
import { addDays, EMPTY_HIFZ, neededHelpLast, practiseAhead, PRACTISE_WITHIN, type HifzPortion, type HifzState } from '../src/quran/hifz';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
// Local times: the suggestions read the local clock.
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe('readSuggestions — Recommended now on the Qur’an tab', () => {
  const ids = (d: Date, maghrib: Date | null = null) => readSuggestions(d, maghrib).map(s => s.id);

  it('always holds Al-Kahf and Al-Mulk, the old "Often read"', () => {
    for (let day = 1; day <= 7; day++) {
      for (let h = 0; h < 24; h += 1) {
        const list = readSuggestions(at(2026, 11, day + 1, h));
        expect(list.some(s => s.surah === 18)).toBe(true);
        expect(list.some(s => s.surah === 67)).toBe(true);
        expect(list.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
        // One card per surah.
        expect(new Set(list.map(s => s.surah)).size).toBe(list.length);
      }
    }
  });

  it('puts what the hour asks first: Friday morning, Thursday night, an ordinary night', () => {
    // Friday 6 November 2026, 08:00: Al-Kahf (Friday), then Fajr's two.
    // Al-Mulk keeps its place; Al-Baqarah waits for a quieter hour.
    expect(ids(at(2026, 11, 6, 8))).toEqual(['kahf', 'sajdah-friday', 'insan-friday', 'mulk']);
    // Thursday 5 November, 21:00, after maghrib: Al-Kahf from tonight, the night's.
    expect(ids(at(2026, 11, 5, 21))).toEqual(['kahf', 'mulk', 'baqarah-end', 'sajdah-night']);
    // A Tuesday at noon: nothing timely; the two and Al-Baqarah.
    expect(ids(at(2026, 11, 3, 12))).toEqual(['kahf', 'mulk', 'baqarah']);
    // A Tuesday evening: the morning-and-evening three first.
    expect(ids(at(2026, 11, 3, 16))).toEqual(['muawwidhat', 'kahf', 'mulk', 'baqarah']);
  });

  it('turns the evening at maghrib when it is known', () => {
    const maghrib = at(2026, 11, 5, 15, 51);
    expect(ids(at(2026, 11, 5, 16), maghrib)[0]).toBe('kahf');
    expect(ids(at(2026, 11, 5, 15, 30), maghrib)).not.toContain('baqarah-end');
  });
});

describe('practiseAhead — Practise before it’s due', () => {
  const today = '2026-11-05';
  let n = 0;
  const portion = (due: string, extra: Partial<HifzPortion> = {}): HifzPortion => ({
    id: `p${++n}`,
    start: 6000 + n * 10,
    end: 6005 + n * 10,
    memorisedAt: 0,
    updatedAt: 0,
    interval: 7,
    due,
    reviews: [],
    ...extra,
  });
  const state = (portions: HifzPortion[]): HifzState => ({ ...EMPTY_HIFZ, portions });

  it('offers what comes up within the week, soonest first, not today’s or overdue', () => {
    const tomorrow = portion(addDays(today, 1));
    const inThree = portion(addDays(today, 3));
    const inWeek = portion(addDays(today, PRACTISE_WITHIN));
    const later = portion(addDays(today, PRACTISE_WITHIN + 1));
    const dueToday = portion(today);
    const overdue = portion(addDays(today, -2));
    const got = practiseAhead(state([later, inThree, dueToday, inWeek, overdue, tomorrow]), today);
    expect(got.map(p => p.id)).toEqual([tomorrow.id, inThree.id, inWeek.id]);
  });

  it('brings one that needed help a day sooner, and leaves out one recited today', () => {
    const inTwo = portion(addDays(today, 2));
    const weakInThree = portion(addDays(today, 3), {
      reviews: [{ at: new Date(2026, 10, 1, 9).getTime(), grade: 'again' }],
    });
    const recited = portion(addDays(today, 1), { reviews: [{ at: new Date(2026, 10, 5, 9).getTime(), grade: 'fine' }] });
    expect(neededHelpLast(weakInThree)).toBe(true);
    const got = practiseAhead(state([inTwo, weakInThree, recited]), today);
    // The weak one ranks with "in two days" and, tied, the sooner date wins.
    expect(got.map(p => p.id)).toEqual([inTwo.id, weakInThree.id]);
  });

  it('is capped, and empty with nothing coming up', () => {
    const many = Array.from({ length: 9 }, (_, i) => portion(addDays(today, 1 + (i % 5))));
    expect(practiseAhead(state(many), today)).toHaveLength(4);
    expect(practiseAhead(state([]), today)).toEqual([]);
  });
});

describe('wiring', () => {
  it('takes the "Often read" row’s place, and practice records nothing', () => {
    const screen = read('src/screens/QuranScreen.tsx');
    expect(screen).not.toContain('OFTEN_READ');
    expect(screen).toContain('<ReadRecommendations');
    expect(screen).toMatch(/hifzReview: p\.id,\s*hifzPractice: true,/);
    const reader = read('src/screens/quran/TranslationSurahScreen.tsx');
    expect(reader).toMatch(/if \(hifzReview\.practice\) \{\s*if \(navigation\.canGoBack\(\)\) navigation\.goBack\(\);\s*\} else setReviewGrading\(true\);/);
    expect(read('src/screens/QuranSurahScreen.tsx')).toContain('practice: hifzPractice === true,');
  });
});
