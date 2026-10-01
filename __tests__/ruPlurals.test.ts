/**
 * Russian counts take one of three word forms (1 аят, 2 аята, 5 аятов, and
 * 21 аят again). English has two, so a Russian string written with the
 * English pair either said "2 аятов" or fell back to the bare key. Every
 * {{count}} string that names a counted noun in full carries all of
 * `_one/_few/_many/_other`, and i18next picks the right one.
 */
import i18next from 'i18next';
import { readFileSync } from 'fs';
import { join } from 'path';

const load = (lang: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));

const ru = load('ru');
const PLURAL_FORM = /_(one|few|many|other)$/;

function flatten(o: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
}

let t: (key: string, opts?: Record<string, unknown>) => string;

beforeAll(async () => {
  const inst = i18next.createInstance();
  await inst.init({
    lng: 'ru',
    fallbackLng: 'en',
    compatibilityJSON: 'v4',
    resources: { ru: { translation: ru }, en: { translation: load('en') } },
    interpolation: { escapeValue: false },
  });
  t = inst.t.bind(inst) as typeof t;
});

describe('Russian plurals', () => {
  it('picks one, few and many', () => {
    expect(t('quran.ayahCount', { count: 1 })).toBe('1 аят');
    expect(t('quran.ayahCount', { count: 3 })).toBe('3 аята');
    expect(t('quran.ayahCount', { count: 7 })).toBe('7 аятов');
    expect(t('quran.ayahCount', { count: 21 })).toBe('21 аят');
    expect(t('quran.ayahCount', { count: 111 })).toBe('111 аятов');
    expect(t('home.khatmahDaysToGo', { count: 2 })).toBe('осталось 2 дня');
    expect(t('home.khatmahDaysToGo', { count: 1 })).toBe('остался 1 день');
    expect(t('settings.prayerOffsetsCount', { count: 4 })).toBe('Изменено 4 намаза');
    expect(t('quran.khatmahPerDay', { count: 5 })).toBe('5 страниц в день');
  });

  it('carries every form wherever it carries one', () => {
    const flat = flatten(ru);
    const bases = new Set(
      Object.keys(flat).filter(k => /_(few|many)$/.test(k)).map(k => k.replace(PLURAL_FORM, '')),
    );
    expect(bases.size).toBeGreaterThan(15);
    for (const base of bases) {
      for (const form of ['one', 'few', 'many', 'other']) {
        expect(`${base}_${form} ${flat[`${base}_${form}`] !== undefined}`).toBe(`${base}_${form} true`);
      }
    }
  });

  it('uses the app’s terms: намаз, Коран, Кибла — not the apostrophe forms', () => {
    const all = Object.values(flatten(ru)).join('\n');
    expect(all).not.toMatch(/молитв/i);
    expect(all).not.toMatch(/Кур'ан|Кыбл|'Аср|'Иша|Ду['‘]а|Джуму'а/);
  });
});
