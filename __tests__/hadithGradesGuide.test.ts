/**
 * "What the grades mean" (Settings → Hadith, and the foot of a hadith)
 * says what docs/hadith-policy.md says, in every language, and no more.
 *
 * The page explains; it must not claim. The app grades nothing itself
 * (policy §4), a hadith left out is not called weak (§5), ḥasan is sound
 * (§1), the two Ṣaḥīḥs are whole and not graded one by one (§3) — and
 * nothing is "official", "the only" or "the first".
 */
import fs from 'fs';
import path from 'path';
import { GRADE_SECTIONS } from '../src/screens/settings/pages/HadithGradesSettingsScreen';
import { ALL_SETTINGS_SUBPAGES, SETTINGS_STACK_PAGES } from '../src/screens/settings/subpages';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const LOCALES = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];
const KEYS = ['title', 'blurb', 'intro', 'sahihTitle', 'sahih', 'hasanTitle', 'hasan', 'sahihaynTitle', 'sahihayn', 'leftOutTitle', 'leftOut', 'fullRule', 'fullRuleSub'];
const grades = (lang: string): Record<string, string> => JSON.parse(read(`src/i18n/locales/${lang}.json`)).hadith.grades;

describe('the guide to the grades', () => {
  it('is whole in all thirteen languages, and every section the page draws has its words', () => {
    for (const lang of LOCALES) {
      const g = grades(lang);
      expect(Object.keys(g)).toEqual(KEYS);
      for (const k of KEYS) expect(g[k].trim().length).toBeGreaterThan(2);
      // No language was left in English.
      if (lang !== 'en') for (const k of ['intro', 'sahih', 'hasan', 'leftOut']) expect(g[k]).not.toBe(grades('en')[k]);
    }
    for (const [title, body] of GRADE_SECTIONS) {
      expect(KEYS).toContain(title);
      expect(KEYS).toContain(body);
    }
  });

  it('says what the policy says', () => {
    const en = grades('en');
    const policy = read('docs/hadith-policy.md').replace(/\s+/g, ' ');
    // The app grades nothing itself; a grade is always someone's.
    expect(policy).toContain('Mihrab grades nothing itself');
    expect(en.intro).toContain('Mihrab grades nothing itself');
    expect(en.intro).toMatch(/named scholar's/);
    // Ḥasan is sound, and shown as what it is.
    expect(policy).toContain('Ḥasan is sound');
    expect(en.hasan).toMatch(/sound/);
    expect(en.hasan).toMatch(/shown as hasan/);
    // The two Ṣaḥīḥs: whole, not graded one by one.
    expect(en.sahihayn).toMatch(/whole/);
    expect(en.sahihayn).toMatch(/not graded one by one/);
    // Left out: weak by anyone cited, disputed, ungraded — and not thereby called weak.
    expect(en.leftOut).toMatch(/calls weak/);
    expect(en.leftOut).toMatch(/disagree/);
    expect(en.leftOut).toMatch(/no grade/);
    expect(policy).toContain('A hadith left out is not thereby called weak by Mihrab');
    expect(en.leftOut).toMatch(/not Mihrab calling it weak/);
  });

  it('claims nothing the copy rules forbid, in any language’s English or its own', () => {
    for (const lang of LOCALES) {
      const all = Object.values(grades(lang)).join(' ');
      expect(all).not.toMatch(/\bofficial\b|\bthe only\b|\bthe first\b/i);
    }
  });

  it('is reached from Settings → Hadith and from a hadith’s foot, and ends on the rule itself', () => {
    const hadith = ALL_SETTINGS_SUBPAGES.find(p => p.route === 'SettingsHadith')!;
    expect(hadith.children?.map(c => c.route)).toEqual(['SettingsHadithGrades']);
    expect(SETTINGS_STACK_PAGES.some(p => p.route === 'SettingsHadithGrades')).toBe(true);
    expect(read('src/screens/settings/pages/HadithSettingsScreen.tsx')).toContain('<NestedPageRows parent="SettingsHadith" />');
    expect(read('src/screens/hadith/HadithReaderScreen.tsx')).toContain("navigation.navigate('SettingsHadithGrades')");
    const page = read('src/screens/settings/pages/HadithGradesSettingsScreen.tsx');
    expect(page).toContain('Linking.openURL(HADITH_POLICY_URL)');
    expect(read('src/navigation/resumeWhereLeft.ts')).toContain('SettingsHadithGrades: {},');
  });
});
