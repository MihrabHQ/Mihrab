/**
 * The language hadith are read in (`src/hadith/hadithLang.ts`, Settings →
 * Hadith → Hadith language), and the fifty-nine HadeethEnc languages
 * beyond the app's thirteen (`scripts/hadith/merge-langs.js`).
 *
 * What must hold: nothing changes for a reader who never opens the
 * setting; a language is told by its whole code; a language our copy
 * does not carry is not offered; and adding languages to the published
 * packs cannot touch a pack that is already published.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import LANGUAGES from '../src/hadith/hadithLanguages.json';
import { HADITH_LANGS, HADITH_LANGUAGES, findHadithLanguage, hadithLangIsRtl, packLangs } from '../src/hadith/catalog';
import { HADITH_LANGUAGE_AUTO, hadithLanguageFor, knownHadithLanguage, setHadithLanguage } from '../src/hadith/hadithLang';
import { offeredHadithLanguages } from '../src/screens/settings/pages/HadithLanguageSettingsScreen';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import type { Manifest } from '../src/hadith/packTypes';

const REPO = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

describe('the languages', () => {
  it('are HadeethEnc’s seventy-two, each once, the app’s thirteen among them', () => {
    expect(LANGUAGES).toHaveLength(72);
    expect(new Set(LANGUAGES.map(l => l.code)).size).toBe(72);
    for (const l of LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2,3}$/);
      expect(l.native.trim()).toBe(l.native);
      expect(l.native.length).toBeGreaterThan(1);
    }
    for (const code of HADITH_LANGS) expect(findHadithLanguage(code)).toBeDefined();
    expect(HADITH_LANGUAGES).toHaveLength(72);
  });

  it('run right to left where their packs are in the Arabic script, told by the whole code', () => {
    expect(LANGUAGES.filter(l => (l as { rtl?: boolean }).rtl).map(l => l.code).sort()).toEqual(['ar', 'fa', 'kmr', 'ku', 'prs', 'ps', 'ug', 'ur']);
    expect(hadithLangIsRtl('kmr')).toBe(true);
    // Khmer is not Kurmancî.
    expect(hadithLangIsRtl('km')).toBe(false);
    expect(hadithLangIsRtl('ha')).toBe(false);
    expect(hadithLangIsRtl(null)).toBe(false);
    const reader = read('src/screens/hadith/HadithReaderScreen.tsx');
    expect(reader).toContain("foreignText(hadithLangIsRtl(item.textLang) ? 'ar' : 'en', i18n.language)");
    expect(reader).toContain('meaningRtl={hadithLangIsRtl(item.textLang)}');
  });

  it('are pack languages, with English beside every one but English and Arabic', () => {
    expect(packLangs('en')).toEqual(['en']);
    expect(packLangs('ar')).toEqual(['ar']);
    expect(packLangs('sv')).toEqual(['sv', 'en']);
    expect(packLangs('sv-SE')).toEqual(['sv', 'en']);
    expect(packLangs('ha')).toEqual(['ha', 'en']);
    expect(packLangs('prs')).toEqual(['prs', 'en']);
    expect(packLangs('kmr')).toEqual(['kmr', 'en']);
    // Not a language HadeethEnc has: English.
    expect(packLangs('nb')).toEqual(['en']);
    expect(packLangs('xx-YY')).toEqual(['en']);
  });
});

describe('the setting', () => {
  afterEach(() => setHadithLanguage(HADITH_LANGUAGE_AUTO));

  it('is the app’s language until another is chosen', () => {
    expect(DEFAULT_SETTINGS.hadithLanguage).toBe('auto');
    expect(hadithLanguageFor('sv')).toBe('sv');
    expect(hadithLanguageFor(undefined)).toBe('en');
    setHadithLanguage('ha');
    expect(hadithLanguageFor('sv')).toBe('ha');
    setHadithLanguage('auto');
    expect(hadithLanguageFor('sv')).toBe('sv');
  });

  it('reads anything that is not a language code as the app’s language', () => {
    for (const bad of [undefined, null, 7, '', 'Hausa', '../x', 'en-US']) expect(knownHadithLanguage(bad)).toBe('auto');
    expect(knownHadithLanguage('kmr')).toBe('kmr');
    setHadithLanguage({} as never);
    expect(hadithLanguageFor('de')).toBe('de');
  });

  it('reaches every hadith screen through the one hook, and the notifications outside React', () => {
    expect(read('src/hadith/useHadith.ts')).toMatch(/export function useAppLang\(\): string \{\n  return useHadithLanguage\(\);\n\}/);
    const root = read('src/AppNavigationRoot.tsx');
    expect(root.match(/language: hadithLanguageFor\(settings\.language\),/g)).toHaveLength(2);
    expect(root.match(/settings\.hadithLanguage,/g)).toHaveLength(2);
    expect(read('src/context/PrayerSettingsContext.tsx')).toContain('setHadithLanguage(settings.hadithLanguage);');
    // Read at launch: it must not bring the catalog's lists in with it.
    expect(read('src/hadith/hadithLang.ts')).not.toMatch(/from '\.\/catalog'/);
  });

  it('offers a language our copy carries, one already here, and the app’s own', () => {
    const none = offeredHadithLanguages(null, () => false);
    expect(none.map(l => l.code).sort()).toEqual([...HADITH_LANGS].sort());
    const manifest = { v: 1, henc: { all: { langs: { ha: { bytes: 10, count: 5 } } } }, books: {}, nawawi: null, categories: {} } as Manifest;
    expect(offeredHadithLanguages(manifest, () => false).map(l => l.code)).toContain('ha');
    expect(offeredHadithLanguages(manifest, () => false).map(l => l.code)).not.toContain('bs');
    expect(offeredHadithLanguages(null, c => c === 'bs').map(l => l.code)).toContain('bs');
  });

  it('names a downloaded pack by its language’s own name', () => {
    const { packLabel } = require('../src/hadith/HadithDownloadsSection');
    const t = ((k: string) => k) as never;
    expect(packLabel('henc/all/ha', t)).toBe('hadith.packAll · Hausa');
    expect(packLabel('categories/kmr', t)).toBe('hadith.packCategories · Kurmancî');
    expect(packLabel('henc/all/sv', t)).toBe('hadith.packAll · Svenska');
  });

  it('is named in all thirteen languages, and has a page under Settings → Hadith', () => {
    for (const f of fs.readdirSync(path.join(REPO, 'src/i18n/locales'))) {
      const k = JSON.parse(read(`src/i18n/locales/${f}`)).hadith.language;
      expect([f, Object.keys(k).sort()]).toEqual([f, ['auto', 'blurb', 'note', 'title']]);
      expect(k.note).toContain('HadeethEnc.com');
    }
    expect(read('src/screens/settings/subpages.tsx')).toContain("route: 'SettingsHadithLanguage',");
  });
});

describe('adding languages to the published packs', () => {
  const { plan } = require('../scripts/hadith/merge-langs.js');
  const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-langs-'));
  const put = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
    return { bytes: Buffer.byteLength(body), sha256: sha(body) };
  };
  const pack = (ids: string[]) => JSON.stringify({ pack: 'all', lang: 'x', entries: ids.map(id => ({ id })) });
  const here = { henc: { all: { langs: { en: { bytes: 1, sha256: 'published' } } } }, categories: { en: { bytes: 1, sha256: 'published' } } };

  it('brings a new language across and never reads one that is already published', () => {
    const there = {
      henc: { all: { langs: { en: { bytes: 2, sha256: 'rebuilt' }, ha: { ...put('henc/all/ha.json', pack(['1', '2'])), count: 2 } } } },
      categories: { en: { bytes: 2, sha256: 'rebuilt' }, ha: put('categories/ha.json', '{"items":[]}') },
    };
    // No file of English exists in the other tree: it is not looked for.
    const p = plan(here, there, '/nowhere', dir, ['99']);
    expect(p.kept).toEqual(['en']);
    expect(p.add.map((a: { lang: string }) => a.lang)).toEqual(['ha']);
    expect(p.add[0].files.map((f: { rel: string }) => f.rel)).toEqual(['henc/all/ha.json', 'categories/ha.json']);
  });

  it('refuses a file that is not the one its manifest names, and a pack holding a withheld entry', () => {
    const entry = put('henc/all/bs.json', pack(['1', '10877']));
    const cats = put('categories/bs.json', '{"items":[]}');
    const there = { henc: { all: { langs: { bs: { ...entry, count: 2 } } } }, categories: { bs: cats } };
    expect(() => plan(here, there, '/nowhere', dir, ['10877'])).toThrow(/withheld/);
    expect(plan(here, there, '/nowhere', dir, []).add).toHaveLength(1);
    const wrong = { henc: { all: { langs: { bs: { ...entry, sha256: sha('other'), count: 2 } } } }, categories: { bs: cats } };
    expect(() => plan(here, wrong, '/nowhere', dir, [])).toThrow(/not the file its manifest names/);
    const script = read('scripts/hadith/merge-langs.js');
    expect(script).toContain("if (after !== before) throw new Error('an existing entry changed: nothing written');");
    // It publishes nothing.
    expect(script).not.toContain('gh release');
  });
});
