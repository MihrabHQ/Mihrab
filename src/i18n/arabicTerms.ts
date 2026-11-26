/**
 * Arabic for the words that are Arabic — for a reader who knows them in
 * Arabic and keeps the app in another language.
 *
 * Someone who reads Arabic may still want English (or Swedish, or
 * Turkish) menus: a right-to-left interface is not what they are used to
 * on this phone. But "Sahih al-Bukhari", "Dhuhr" and "Dhul-Hijjah" are
 * transliterations of names they know as صحيح البخاري, الظهر and ذو
 * الحجة, and the Latin spelling is the stranger of the two. This shows
 * those names in Arabic and leaves everything else — sentences, buttons,
 * the layout's direction — in the app's language.
 *
 * ── GROUPS, EACH ITS OWN CHOICE ───────────────────────────────────────
 *
 * `quran`    the surahs' names
 * `hadith`   the collections, the books to read and their compilers, the
 *            chapters of a collection
 * `prayers`  the prayers and the night's marks
 * `calendar` the Hijri months and the days of the Islamic year
 * `dhikr`    the phrases of remembrance
 * `sections` the parts of the app named in Arabic (Qibla, Tasbih, Duas…)
 *
 * ── HOW ───────────────────────────────────────────────────────────────
 *
 * As the Mālikī name for dawn is done (`prayer/madhab.ts`): the KEY a
 * screen asks for is unchanged and the string it resolves to is what
 * moves, so the widgets, the notifications and every screen follow
 * without knowing of it. Only keys whose whole value is a name are
 * listed — never a sentence, which would be an Arabic sentence in a
 * left-to-right page. The surahs' names are not strings of the
 * translation files; `surahName.ts` asks `arabicTermsHas('quran')`.
 *
 * Applied AFTER the madhab's naming, which it re-applies itself: both
 * write `prayer.Fajr`, and under the Mālikī reckoning the Arabic for it
 * is الصبح.
 */
import type i18nType from 'i18next';
import { ensureLanguage } from './index';
import { applyMadhabNaming, type Madhab } from '../prayer/madhab';
import { coerceArabicTerms, setActiveArabicTerms, type ArabicTermGroup } from './arabicTermGroups';

export { ARABIC_TERM_GROUPS, arabicTermsHas, coerceArabicTerms, setActiveArabicTerms, type ArabicTermGroup } from './arabicTermGroups';


const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Midnight', 'Lastthird', 'Firstthird', 'Subh', 'Jumuah'];
/** The keys of each group: every one a name and nothing else. */
export const ARABIC_TERM_KEYS: Readonly<Record<Exclude<ArabicTermGroup, 'quran'>, readonly string[]>> = {
  hadith: [
    ...['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik'].map(b => `hadith.book.${b}`),
    ...['riyad', 'umdah', 'bulugh', 'kalim', 'adhkar', 'wabil', 'rajab', 'tawhid'].flatMap(c => [`hadith.comp.${c}.title`, `hadith.comp.${c}.compiler`]),
    'hadith.comp.qudsi.title',
    'hadith.set.nawawi40.title',
    'hadith.set.book-bukhari.title',
    'hadith.set.book-muslim.title',
    'hadith.agreed.title',
    // Which of a chapter's two names is shown (`catalog.chapterName`): 'ar' in the Arabic file.
    'hadith.chapterNamesIn',
  ],
  prayers: [
    // "1/3" has no Arabic name to show, and its Arabic file writes it in other digits than the times beside it.
    ...PRAYERS.flatMap(p => [`prayer.${p}`, `prayer.${p}_abbr`]).filter(k => k !== 'prayer.Firstthird_abbr' && k !== 'prayer.Jumuah_abbr'), // Friday has no short form
    'sunnah.witr',
    'sunnah.qiyam',
  ],
  calendar: [
    ...Array.from({ length: 12 }, (_, i) => `hijri.month_${i + 1}`),
    ...['islamicNewYear', 'ashura', 'mawlid', 'isra', 'midShaban', 'ramadanBegins', 'laylatAlQadr', 'eidAlFitr', 'arafah', 'eidAlAdha', 'whiteDays', 'sixOfShawwal'].map(e => `events.${e}`),
  ],
  dhikr: ['subhanallah', 'alhamdulillah', 'allahuakbar', 'lailaha', 'astaghfirullah', 'salahonprophet'].map(k => `tasbih.${k}`),
  sections: ['compass', 'tasbih', 'duas', 'quran', 'hadith', 'dhikr'].map(k => `nav.${k}`),
};
const MANAGED: readonly string[] = Object.values(ARABIC_TERM_KEYS).flat();
/** Written by the madhab's naming too: restored from its own keeping, not ours. */
const DAWN = new Set(['prayer.Fajr', 'prayer.Fajr_abbr']);
const NS = 'translation';

/**
 * An Arabic name set in a left-to-right page, so that the page stays
 * left-to-right around it: a left-to-right mark before and after.
 *
 * Without the first, a line that BEGINS with the name is taken for a
 * right-to-left line — the day's rows flew to the other edge, away from
 * where every other row begins, which is the very thing this setting is
 * for avoiding. Without the second, a number after the name joins it:
 * "17 جمادى الآخرة 1448" was drawn with the year before the month. The
 * marks are invisible and the name itself is still read right to left.
 * Not added in a right-to-left language (Urdu), whose lines are already
 * what the name wants.
 */
const LRM = '\u200E';
export const inLeftToRight = (name: string): string => (name.startsWith(LRM) ? name : `${LRM}${name}${LRM}`);
const RTL_LANGUAGES = ['ar', 'ur', 'fa', 'he'];

/**
 * Make `language`'s names Arabic for the groups chosen, and its own for
 * the rest. Safe to call again with anything: every call starts from the
 * language's own strings. In Arabic itself there is nothing to do.
 */
export function applyArabicTerms(
  i18n: typeof i18nType,
  groups: readonly string[] | null | undefined,
  madhab: Madhab | null | undefined,
  language: string = i18n.language,
): void {
  const lng = language || 'en';
  const chosen = coerceArabicTerms(groups);
  setActiveArabicTerms(chosen);
  if (lng === 'ar') return;
  ensureLanguage(lng, i18n);
  const set = (key: string, value: unknown) => {
    if (value !== undefined) i18n.addResource(lng, NS, key, value as string, { silent: true } as never);
  };
  // 1. Back to the language's own: what stood there before the first time this ran.
  let touched = false;
  for (const key of MANAGED) {
    const own = i18n.getResource(lng, NS, `${key}_own`);
    if (own === undefined) {
      if (!chosen.length) continue; // never changed, and not about to be
      const now = i18n.getResource(lng, NS, key);
      // Dawn's own name is the madhab's to keep (`_original`), where it has been applied.
      set(`${key}_own`, DAWN.has(key) ? i18n.getResource(lng, NS, `${key}_original`) ?? now : now);
    }
    const back = i18n.getResource(lng, NS, `${key}_own`);
    if (back !== undefined && back !== i18n.getResource(lng, NS, key)) {
      set(key, back);
      touched = true;
    }
  }
  // 2. The madhab's name for dawn, over the language's own.
  applyMadhabNaming(i18n, madhab, lng);
  // 3. Arabic, for the groups chosen.
  if (chosen.length) {
    ensureLanguage('ar', i18n);
    const subh = madhab === 'maliki';
    for (const group of chosen) {
      if (group === 'quran') continue;
      for (const key of ARABIC_TERM_KEYS[group]) {
        const from = subh && DAWN.has(key) ? key.replace('Fajr', 'Subh') : key;
        const word = i18n.getResource('ar', NS, `${from}_own`) ?? i18n.getResource('ar', NS, `${from}_original`) ?? i18n.getResource('ar', NS, from);
        const arabic = typeof word === 'string' && key !== 'hadith.chapterNamesIn' && !RTL_LANGUAGES.includes(lng.slice(0, 2)) ? inLeftToRight(word) : word;
        if (arabic !== undefined && arabic !== i18n.getResource(lng, NS, key)) {
          set(key, arabic);
          touched = true;
        }
      }
    }
  }
  // Screens drawn with the old names draw again (what `useTranslation` listens for).
  if (touched && i18n.language === lng) i18n.emit('languageChanged', lng);
}
