/**
 * Two things made from what the app already holds (2026-11-26):
 *
 *   • "See it in Sahih al-Bukhari / Muslim" on a HadeethEnc entry
 *     (`scripts/hadith/see-in-book.js` → src/hadith/seeInBook.json): the
 *     book HadeethEnc names, the row found with confidence, and the same
 *     Companion's. The fourteen least sure of 1,579 were read; all were
 *     the right hadith. Nobody has read them all.
 *   • The set "Short hadith to memorise" (`scripts/hadith/short-set.js`):
 *     the forty shortest of "Agreed upon", by length and nothing else.
 */
import fs from 'fs';
import path from 'path';
import AGREED from '../src/hadith/agreed.json';
import SEE from '../src/hadith/seeInBook.json';
import SETS from '../src/hadith/sets.json';
import WITHHELD from '../src/hadith/withheld.json';
import { HADITH_SETS, seeInBook } from '../src/hadith/catalog';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('see it in the book', () => {
  const rows = SEE.rows as unknown as Record<string, [string, number]>;

  it('is a list of numbers the script wrote: an entry, a book of the two, a row', () => {
    expect(SEE.note).toContain('scripts/hadith/see-in-book.js');
    const ids = Object.keys(rows);
    expect(ids.length).toBeGreaterThan(1000);
    for (const id of ids) {
      expect(/^\d+$/.test(id)).toBe(true);
      expect(['b', 'm']).toContain(rows[id][0]);
      expect(Number.isInteger(rows[id][1]) && rows[id][1] >= 0).toBe(true);
    }
    // None of an entry the packs withhold.
    for (const id of WITHHELD.henc) expect(rows[id]).toBeUndefined();
  });

  it('answers with the book’s own entry, and with nothing for what is not a HadeethEnc entry or was not found', () => {
    const [id, [letter, place]] = Object.entries(rows)[0];
    const book = letter === 'b' ? 'bukhari' : 'muslim';
    expect(seeInBook(`h:${id}`)).toEqual({ id: `b:${book}:${place}`, book });
    expect(seeInBook('h:0')).toBeNull();
    expect(seeInBook(`b:bukhari:${place}`)).toBeNull();
  });

  it('is found by the compilations’ rule, and for the same Companion', () => {
    const script = read('scripts/hadith/see-in-book.js');
    expect(script).toContain("require('./build-compilation.js')");
    expect(script).toContain('p.share >= PAIR_AT && sameNarrator(w, books[b].W[p.i])');
    // Only an attribution that says which book and nothing more.
    expect(script).toMatch(/const plainly = /);
    const reader = read('src/screens/hadith/HadithReaderScreen.tsx');
    expect(reader).toContain("navigation.push('HadithReader', { id: inBook.id, list: `book:${inBook.book}` })");
  });
});

describe('short hadith to memorise', () => {
  const set = (SETS.sets as Array<{ id: string; level: string; ids?: string[]; chosenBy?: string }>).find(s => s.id === 'short')!;

  it('is forty hadith of "Agreed upon", each once, chosen by a rule that says so', () => {
    expect(set.ids).toHaveLength(40);
    expect(new Set(set.ids).size).toBe(40);
    const agreed = new Set((AGREED as { ids: string[] }).ids);
    for (const id of set.ids!) expect(agreed.has(id)).toBe(true);
    expect(set.chosenBy).toContain('scripts/hadith/short-set.js');
    // Only hadith the English pack has: every other language falls back to English.
    expect(read('scripts/hadith/short-set.js')).toContain('if (!e || !english.has(id)) return;');
    // Not "rules": draft-sets.js leaves a set alone whose choosing is not its own.
    expect(set.chosenBy).not.toBe('rules');
    expect(read('scripts/hadith/draft-sets.js')).toContain("set.chosenBy !== 'rules'");
  });

  it('is a set for someone starting, with its name in every language', () => {
    expect(set.level).toBe('starting');
    expect(HADITH_SETS.some(s => s.id === 'short')).toBe(true);
    for (const lang of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
      const s = JSON.parse(read(`src/i18n/locales/${lang}.json`)).hadith.set.short;
      expect(s.title.length > 3 && s.blurb.length > 10).toBe(true);
    }
  });
});
