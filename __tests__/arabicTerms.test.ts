/**
 * Arabic names in Arabic, the rest of the app in its own language
 * (`src/i18n/arabicTerms.ts`).
 *
 * What must hold: only names move, never a sentence; a group turned off
 * goes back to the language's own words exactly; the Mālikī name for dawn
 * survives in both scripts; a headless process applies it as the app
 * does; and Arabic itself is left alone.
 */
import fs from 'fs';
import path from 'path';
import i18n from '../src/i18n';
import { ARABIC_TERM_GROUPS, ARABIC_TERM_KEYS, applyArabicTerms, arabicTermsHas, coerceArabicTerms } from '../src/i18n/arabicTerms';
import { mushafSurahName, surahName } from '../src/quran/surahName';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const locale = (l: string) => JSON.parse(read(`src/i18n/locales/${l}.json`));
const at = (o: any, key: string) => key.split('.').reduce((v, k) => v?.[k], o);
/** As drawn, less the left-to-right marks round an Arabic name. */
const bare = (v: string) => v.replace(/\u200E/g, '');
const raw = (key: string) => i18n.getFixedT('sv')(key);
const t = (key: string) => bare(raw(key));

beforeAll(async () => {
  await i18n.changeLanguage('sv');
});
afterEach(() => applyArabicTerms(i18n, [], null, 'sv'));

it('shows the chosen names in Arabic and leaves the others as they were', () => {
  const before = { fajr: t('prayer.Fajr'), month: t('hijri.month_9'), book: t('hadith.book.bukhari'), settings: t('nav.settings') };
  applyArabicTerms(i18n, ['prayers'], null, 'sv');
  expect(t('prayer.Fajr')).toBe('الفجر');
  expect(t('prayer.Dhuhr_abbr')).toBe(at(locale('ar'), 'prayer.Dhuhr_abbr'));
  expect(t('sunnah.witr')).toBe('الوتر');
  expect(t('hijri.month_9')).toBe(before.month);
  expect(t('hadith.book.bukhari')).toBe(before.book);
  applyArabicTerms(i18n, ['hadith', 'calendar'], null, 'sv');
  // Turned off again: Swedish, exactly as before.
  expect(t('prayer.Fajr')).toBe(before.fajr);
  expect(t('hijri.month_9')).toBe('رمضان');
  expect(t('hadith.book.bukhari')).toBe('صحيح البخاري');
  expect(t('hadith.chapterNamesIn')).toBe('ar');
  expect(t('nav.settings')).toBe(before.settings);
  applyArabicTerms(i18n, [], null, 'sv');
  expect([t('prayer.Fajr'), t('hijri.month_9'), t('hadith.book.bukhari'), t('hadith.chapterNamesIn')]).toEqual([before.fajr, before.month, before.book, 'en']);
});

it('keeps a left-to-right page left-to-right round an Arabic name', () => {
  applyArabicTerms(i18n, ['prayers', 'calendar'], null, 'sv');
  // A line that begins with the name still begins at the left, and a number after it is not drawn before it.
  expect(raw('prayer.Fajr')).toBe('\u200Eالفجر\u200E');
  expect(raw('hijri.month_6').startsWith('\u200E')).toBe(true);
  expect(raw('hijri.month_6').endsWith('\u200E')).toBe(true);
  // Applied twice, marked once.
  applyArabicTerms(i18n, ['prayers', 'calendar'], null, 'sv');
  expect(raw('prayer.Fajr')).toBe('\u200Eالفجر\u200E');
});

it('keeps the Mālikī name for dawn, in whichever script', () => {
  const sv = locale('sv');
  applyArabicTerms(i18n, [], 'maliki', 'sv');
  expect(t('prayer.Fajr')).toBe(at(sv, 'prayer.Subh'));
  applyArabicTerms(i18n, ['prayers'], 'maliki', 'sv');
  expect(t('prayer.Fajr')).toBe('الصبح');
  applyArabicTerms(i18n, ['prayers'], null, 'sv');
  expect(t('prayer.Fajr')).toBe('الفجر');
  applyArabicTerms(i18n, [], 'maliki', 'sv');
  expect(t('prayer.Fajr')).toBe(at(sv, 'prayer.Subh'));
  applyArabicTerms(i18n, [], null, 'sv');
  expect(t('prayer.Fajr')).toBe(at(sv, 'prayer.Fajr'));
});

it('names the surahs in Arabic when asked, though they are not strings of the files', () => {
  const meta = { number: 2, name: 'سُورَةُ البَقَرَةِ', englishName: 'Al-Baqara' };
  expect(mushafSurahName(meta, 'sv')).not.toBe(meta.name);
  applyArabicTerms(i18n, ['quran'], null, 'sv');
  expect(arabicTermsHas('quran')).toBe(true);
  expect(bare(mushafSurahName(meta, 'sv'))).toBe(meta.name);
  expect(bare(surahName({ arabic: 'البقرة', romanized: 'Al-Baqarah' }, 'sv'))).toBe('البقرة');
  // A reader of Urdu has them in Arabic already, as they are.
  expect(mushafSurahName(meta, 'ur')).toBe(meta.name);
  applyArabicTerms(i18n, [], null, 'sv');
  expect(surahName({ arabic: 'البقرة', romanized: 'Al-Baqarah' }, 'sv')).toBe('Al-Baqarah');
});

it('moves only names: every key exists everywhere, is short, and takes no values', () => {
  const ar = locale('ar');
  const en = locale('en');
  for (const [group, keys] of Object.entries(ARABIC_TERM_KEYS)) {
    for (const key of keys) {
      const a = at(ar, key);
      const e = at(en, key);
      expect([group, key, typeof a, typeof e]).toEqual([group, key, 'string', 'string']);
      expect([key, /\{\{/.test(a) || /\{\{/.test(e)]).toEqual([key, false]);
      expect([key, String(e).split(/\s+/).length <= 7]).toEqual([key, true]);
      // Arabic, in Arabic letters — or the one switch that says which names to show.
      if (key !== 'hadith.chapterNamesIn') expect([key, /[\u0600-\u06FF]/.test(a)]).toEqual([key, true]);
    }
  }
  // A time beside the name is in Latin digits: no name brings other digits with it.
  for (const key of Object.values(ARABIC_TERM_KEYS).flat()) expect([key, /[\u0660-\u0669]/.test(at(ar, key))]).toEqual([key, false]);
});

it('drops what is not a group, and does nothing to Arabic itself', async () => {
  expect(coerceArabicTerms(['prayers', 'nonsense', 3, 'quran'])).toEqual(['quran', 'prayers']);
  expect(coerceArabicTerms('prayers')).toEqual([]);
  expect(coerceArabicTerms(undefined)).toEqual([]);
  await i18n.changeLanguage('ar');
  const before = i18n.t('prayer.Fajr');
  applyArabicTerms(i18n, ['prayers'], null, 'ar');
  expect(i18n.t('prayer.Fajr')).toBe(before);
  await i18n.changeLanguage('sv');
});

it('is applied wherever the language is: the app, and a process with no screen', () => {
  expect(read('src/context/PrayerSettingsContext.tsx')).toContain('applyArabicTerms(i18n, settings.arabicTerms, settings.madhab, settings.language);');
  expect(read('src/i18n/readerLanguage.ts')).toContain('applyArabicTerms(i18n, s.arabicTerms, s.madhab, s.language ?? undefined);');
  for (const l of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
    const k = locale(l).settings.arabicTerms;
    expect([l, Object.keys(k).sort()]).toEqual([l, ['help', 'title', ...ARABIC_TERM_GROUPS.flatMap(g => [g, `${g}Help`])].sort()]);
  }
});
