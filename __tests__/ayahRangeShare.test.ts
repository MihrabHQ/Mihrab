/**
 * Several ayahs at once — a Play review (12 Nov 2026): "add the option to
 * copy or share more than one verse; it shouldn't be limited to just one".
 */
import { readFileSync } from 'fs';
import path from 'path';
import { ayahRangeReference, ayahRangeShareText } from '../src/share/shareText';

const repo = (...p: string[]) => readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const run = {
  arabic: ['ٱلْحَمْدُ لِلَّهِ', 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'مَٰلِكِ يَوْمِ ٱلدِّينِ'],
  translation: ['All praise is for Allah', 'the Most Compassionate, Most Merciful', 'Master of the Day of Judgment'],
  first: 2,
  surah: 1,
  surahName: 'Al-Fatihah',
};

describe('the text of a run of ayahs', () => {
  it('closes each ayah with its number as the muṣḥaf prints it, and numbers each translation', () => {
    const body = ayahRangeShareText(run);
    expect(body).toContain('ٱلْحَمْدُ لِلَّهِ ﴿٢﴾ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ﴿٣﴾ مَٰلِكِ يَوْمِ ٱلدِّينِ ﴿٤﴾');
    expect(body).toContain('(2) All praise is for Allah\n(3) the Most Compassionate, Most Merciful\n(4) Master of the Day of Judgment');
    // One reference for the run, last.
    expect(body.endsWith('\n\n— Al-Fatihah 1:2–4')).toBe(true);
  });

  it('sends only the part asked for, and the reference with each', () => {
    const arabic = ayahRangeShareText(run, 'arabic');
    expect(arabic).toContain('﴿٤﴾');
    expect(arabic).not.toContain('All praise');
    expect(arabic.endsWith('— Al-Fatihah 1:2–4')).toBe(true);
    const translation = ayahRangeShareText(run, 'translation');
    expect(translation).not.toContain('ٱلْحَمْدُ');
    expect(translation.endsWith('— Al-Fatihah 1:2–4')).toBe(true);
  });

  it('a run of one names one ayah', () => {
    expect(ayahRangeReference('Al-Kahf', 18, 10, 10)).toBe('Al-Kahf 18:10');
    expect(ayahRangeReference('Al-Kahf', 18, 1, 10)).toBe('Al-Kahf 18:1–10');
  });
});

describe('where it is offered', () => {
  const sheet = repo('src', 'quran', 'mushaf', 'AyahActionSheet.tsx');
  const range = repo('src', 'quran', 'mushaf', 'ShareAyahRangeSheet.tsx');

  it('is the fourth answer to the ayah sheet’s Share, and opens a sheet of its own', () => {
    expect(sheet).toMatch(/id: 'range',[\s\S]*?onPress: \(\) => setRangeVisible\(true\)/);
    expect(sheet).toMatch(/<ShareAyahRangeSheet[\s\S]*?surah=\{surah\}[\s\S]*?ayah=\{ayah\}[\s\S]*?riwayah=\{riwayah\}[\s\S]*?edition=\{edition\}/);
    // Latched off with the ayah sheet, like the share card: a nested modal
    // left visible over a closed sheet eats every touch.
    expect(sheet).toMatch(/setShareCardVisible\(false\);\s*setRangeVisible\(false\);/);
  });

  it('shares and copies, in the riwayah on the page, within one surah', () => {
    expect(range).toContain('await Share.share({ message: body });');
    expect(range).toContain('await copyToClipboard(body);');
    expect(range).toContain('riwayahAyahText(riwayah, surah, n) ?? bundled?.[n - 1]');
    expect(range).toContain('const count = Math.max(1, ayahCountForRiwayah(riwayah, surah));');
  });

  it('does not send what Android would refuse to carry', () => {
    expect(range).toContain('export const MAX_CHARS = 90_000;');
    expect(range).toMatch(/return text\.length > MAX_CHARS \? null : text;/);
    expect(range.match(/if \(body == null\) \{\s*say\('tooLong'\);/g)).toHaveLength(2);
  });

  it('is said in every language', () => {
    for (const loc of ['en', 'sv', 'ar', 'tr', 'ur', 'id', 'de', 'fr', 'es', 'ru', 'bn', 'hi', 'zh']) {
      const q = (JSON.parse(repo('src', 'i18n', 'locales', `${loc}.json`)) as { quran: Record<string, string> }).quran;
      for (const k of ['shareRange', 'shareRangeHelp', 'shareRangeTitle', 'rangeFrom', 'rangeTo', 'rangeEarlier', 'rangeLater', 'rangeHint', 'rangeTooLong', 'rangeCopy']) {
        expect(q[k]?.length).toBeGreaterThan(0);
      }
      expect(q.rangeHint).toContain('{{count}}');
      expect(q.shareRangeHelp).toContain('{{surah}}');
    }
  });
});
