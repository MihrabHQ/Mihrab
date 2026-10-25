/**
 * The reader opens on the page the caller MEANT, in the muṣḥaf on screen.
 *
 * Pages handed to the reader do not say which print they count in. For
 * the two prints of Ḥafṣ an ayah decides; a bare page is checked against
 * the surah the route names. A synthetic second print of Ḥafṣ stands in
 * for IndoPak: every surah on a page of its own, so no page number means
 * the same thing in both.
 */
import { findPageForAyah, MUSHAF_PAGES, MUSHAF_SURAHS, resolveOpenPage } from '../src/quran/pages';
import { ayahCount } from '../src/quran/ayahIndex';
import {
  _resetRiwayahDataCacheForTests,
  _setRiwayahDataForTests,
} from '../src/quran/riwayahData';

function onePagePerSurah() {
  const pages = MUSHAF_SURAHS.map((s, i) => ({
    page: i + 1,
    juz: 1,
    start: { surah: s.number, ayah: 1 },
    end: i + 1 < 114 ? { surah: s.number + 1, ayah: 1 } : null,
  }));
  const text: Record<string, string> = {};
  for (const s of MUSHAF_SURAHS) {
    for (let a = 1; a <= ayahCount(s.number); a++) text[`${s.number}:${a}`] = 'x';
  }
  return {
    pages,
    surahs: [...MUSHAF_SURAHS],
    ayahCounts: MUSHAF_SURAHS.map(s => ayahCount(s.number)),
    text,
  };
}

describe('resolveOpenPage', () => {
  beforeEach(() => {
    _resetRiwayahDataCacheForTests();
    _setRiwayahDataForTests('indopak', onePagePerSurah(), 'IndoPakFace');
  });
  afterAll(() => _resetRiwayahDataCacheForTests());

  it('lets the ayah decide in a print of Ḥafṣ', () => {
    // Yā-Sīn 36:1 is on Madinah page 440; in the stand-in it is page 36.
    const madinah = findPageForAyah(36, 1);
    expect(madinah).toBe(440);
    expect(resolveOpenPage('indopak', 36, 1, madinah)).toBe(36);
    // And in the Madinah print the same call is the Madinah page.
    expect(resolveOpenPage('hafs', 36, 1, madinah)).toBe(440);
    expect(resolveOpenPage('hafs', 2, 255, 1)).toBe(findPageForAyah(2, 255));
  });

  it('keeps a bare page only when it holds the surah', () => {
    // Page 36 of the stand-in is Yā-Sīn: kept.
    expect(resolveOpenPage('indopak', 36, undefined, 36)).toBe(36);
    // A Madinah page number for Yā-Sīn means Fāṭir... here something else
    // entirely: the surah's own first page is opened instead.
    expect(resolveOpenPage('indopak', 36, undefined, 440)).toBe(36);
    expect(resolveOpenPage('hafs', 36, undefined, 440)).toBe(440);
    expect(resolveOpenPage('hafs', 36, undefined, 3)).toBe(findPageForAyah(36, 1));
  });

  it('leaves the page to the reader when nothing is known', () => {
    expect(resolveOpenPage('indopak', 36)).toBeUndefined();
  });

  it('ignores an ayah the surah does not have', () => {
    expect(resolveOpenPage('hafs', 108, 9, MUSHAF_PAGES[601].page)).toBe(602);
  });

  it('keeps the given page for a reading that numbers its ayahs otherwise', () => {
    expect(resolveOpenPage('warsh', 36, 1, 440)).toBe(440);
  });
});
