/**
 * The app's own Intl.PluralRules (src/i18n/pluralRules.ts) — the one Hermes
 * runs, since it has none — must answer exactly as ICU does, for every
 * language the app speaks. Node's Intl is ICU, so it is the reference.
 */
import { AppPluralRules, PLURAL_RULES } from '../src/i18n/pluralRules';
import i18n from 'i18next';

const LANGS = ['en', 'ar', 'sv', 'de', 'fr', 'es', 'tr', 'ur', 'bn', 'hi', 'id', 'ru', 'zh'];
const NUMBERS = [...Array.from({ length: 2001 }, (_, i) => i), 1000000, 2000000, 0.5, 1.5, 2.5, 3.25, 21.1];

describe('the plural rules Hermes runs', () => {
  for (const lang of LANGS) {
    it(`${lang} agrees with ICU`, () => {
      const icu = new Intl.PluralRules(lang);
      const ours = new AppPluralRules(lang);
      const wrong = NUMBERS.filter(n => icu.select(n) !== ours.select(n)).map(n => `${n}: icu ${icu.select(n)}, ours ${ours.select(n)}`);
      expect(wrong).toEqual([]);
      expect([...ours.resolvedOptions().pluralCategories].sort()).toEqual([...icu.resolvedOptions().pluralCategories].sort());
    });
  }

  it('covers every language the app ships', () => {
    expect(Object.keys(PLURAL_RULES).sort()).toEqual([...LANGS].sort());
  });

  it('gives i18next the Arabic dual and plurals, the Russian few and many', async () => {
    const real = Intl.PluralRules;
    // As on Hermes: no Intl.PluralRules but ours.
    (Intl as { PluralRules: unknown }).PluralRules = AppPluralRules;
    try {
      const t = i18n.createInstance();
      await t.init({
        lng: 'ar',
        compatibilityJSON: 'v4',
        resources: {
          ar: { translation: { p: '{{count}} مقطع', p_one: 'مقطع واحد', p_two: 'مقطعان', p_few: '{{count}} مقاطع', p_many: '{{count}} مقطعًا' } },
          ru: { translation: { p: '{{count}} отрывка', p_one: '{{count}} отрывок', p_few: '{{count}} отрывка', p_many: '{{count}} отрывков' } },
        },
      });
      expect([1, 2, 3, 11, 100].map(count => t.t('p', { count }))).toEqual([
        'مقطع واحد',
        'مقطعان',
        '3 مقاطع',
        '11 مقطعًا',
        '100 مقطع',
      ]);
      await t.changeLanguage('ru');
      expect([1, 3, 5, 21].map(count => t.t('p', { count }))).toEqual(['1 отрывок', '3 отрывка', '5 отрывков', '21 отрывок']);
    } finally {
      (Intl as { PluralRules: unknown }).PluralRules = real;
    }
  });
});
