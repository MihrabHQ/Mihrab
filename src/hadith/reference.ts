/**
 * A hadith asked for by where it is: "Bukhari 2345", "مسلم ١٥٩٩",
 * "Nawawi 14".
 *
 * The search field looked for these as words, and "2345" is not a word of
 * any hadith: someone who knew exactly which one they wanted found
 * nothing. Now a query that is a collection's name and one number is read
 * as a reference, and its hadith is the first thing shown — above whatever
 * the words also find, never instead of it.
 *
 * WHICH NUMBER. A book's numbers are the ones its pack carries:
 * Open-Hadith-Data's, which are its edition's and are not always the
 * numbering another edition or website uses. The row says the number it
 * was found under; nothing here converts between numberings, and a number
 * the pack does not hold finds nothing.
 */
import { BOOKS, bookKey, HADITH_SETS, nawawiIds } from './catalog';
import { bookRows, foldForSearch, latinDigits, loadItem, type SearchHit } from './library';
import { packStatus } from './packs';

/** an-Nawawi's Forty, beside the books. */
export const NAWAWI_REF = 'nawawi';

export type Reference = { book: string; n: number };

/**
 * What each collection is called in a search field, already folded
 * (`foldForSearch`): lower case, no accents, no diacritics, أ as ا, ة as ه.
 * The app's own name for it, in the app's language, is added by the caller.
 */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  bukhari: ['bukhari', 'al bukhari', 'sahih bukhari', 'sahih al bukhari', 'bukhaari', 'buhari', 'البخاري', 'بخاري', 'صحيح البخاري'],
  muslim: ['muslim', 'sahih muslim', 'مسلم', 'صحيح مسلم'],
  abudawud: [
    'abu dawud',
    'abu dawood',
    'abu daud',
    'abu daoud',
    'abi dawud',
    'abudawud',
    'sunan abu dawud',
    'sunan abi dawud',
    'ابو داود',
    'ابي داود',
    'ابو داوود',
    'سنن ابي داود',
  ],
  tirmidhi: ['tirmidhi', 'at tirmidhi', 'al tirmidhi', 'tirmizi', 'jami at tirmidhi', 'sunan at tirmidhi', 'الترمذي', 'سنن الترمذي', 'جامع الترمذي'],
  nasai: ['nasai', 'nasa i', 'an nasai', 'an nasa i', 'al nasai', 'sunan an nasai', 'sunan an nasa i', 'النسائي', 'سنن النسائي'],
  ibnmajah: ['ibn majah', 'ibn maja', 'ibnmajah', 'sunan ibn majah', 'ابن ماجه', 'سنن ابن ماجه'],
  malik: ['malik', 'muwatta', 'al muwatta', 'muwatta malik', 'مالك', 'الموطا', 'موطا مالك'],
  [NAWAWI_REF]: [
    'nawawi',
    'an nawawi',
    'al nawawi',
    'forty',
    'forty hadith',
    'arbain',
    'arba in',
    'نووی',
    'নববী',
    '奈瓦维',
    'النووي',
    'الاربعين',
    'الاربعون',
    'الاربعين النوويه',
    'الاربعون النوويه',
  ],
};

/** Words that sit between a name and its number and are neither. */
const FILLER = new Set(['no', 'nr', 'num', 'number', 'hadith', 'hadeeth', 'hadis', 'hadits', 'حديث', 'رقم']);

/**
 * The reference a query is, or null when it is words to be searched for.
 *
 * A collection's name and exactly one number, in either order. `names` is
 * each collection's name in the app's language (`hadith.book.*`, the
 * Forty's set title), so "Sahih al-Bukhari 1" works as the app writes it
 * in Turkish or Bengali too — whole, or the part of it that is no other
 * collection's ("Бухари 1").
 */
export function parseReference(query: string, names: Readonly<Record<string, string>> = {}): Reference | null {
  const words = foldForSearch(latinDigits(query)).split(' ').filter(Boolean);
  const numbers = words.filter(w => /^\d+$/.test(w));
  if (numbers.length !== 1) return null;
  const n = Number(numbers[0]);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  const name = words.filter(w => !/^\d+$/.test(w) && !FILLER.has(w)).join(' ');
  if (!name) return null;
  const all = [...BOOKS, NAWAWI_REF];
  for (const book of all) {
    const own = names[book] ? foldForSearch(names[book]) : '';
    if (ALIASES[book]?.includes(name) || (own && own === name)) return { book, n };
  }
  // Part of the app's own name for exactly one collection: "Бухари" of
  // "Сахих аль-Бухари", "Nevevî" of "Nevevî’nin Kırk Hadisi". "Sahih"
  // alone is two collections' and names neither.
  const typed = name.split(' ');
  const partOf = all.filter(book => {
    const own = names[book] ? foldForSearch(names[book]).split(' ') : [];
    return typed.every(w => own.includes(w));
  });
  return partOf.length === 1 ? { book: partOf[0], n } : null;
}

export type ReferenceAnswer = {
  ref: Reference;
  /** The hadith under that number: one, or the few an edition gives the same number. */
  rows: SearchHit[];
  /** The list a row is opened in, so the reader has its neighbours. */
  list: string;
  /** Its collection is not on the device: the row offers the way to it. */
  missing: boolean;
};

/** The hadith a reference names, from what is on the device. */
export async function lookUpReference(ref: Reference, appLang: string): Promise<ReferenceAnswer> {
  if (ref.book === NAWAWI_REF) {
    const set = HADITH_SETS.find(s => s.nawawi);
    const list = set ? `set:${set.id}` : '';
    const id = nawawiIds()[ref.n - 1];
    if (!id) return { ref, rows: [], list, missing: false };
    const item = await loadItem(id, appLang);
    if (!item) return { ref, rows: [], list, missing: true };
    return {
      ref,
      rows: [{ id: item.id, title: item.title, number: ref.n, where: item.source === 'nawawi' ? 'nawawi' : 'hadeethenc' }],
      list,
      missing: false,
    };
  }
  const list = `book:${ref.book}`;
  if (packStatus(bookKey(ref.book)).state !== 'ready') return { ref, rows: [], list, missing: true };
  const rows = (await bookRows(ref.book)).filter(r => r.number === ref.n);
  return { ref, rows: rows.map(r => ({ ...r, where: 'book' as const, book: ref.book })), list, missing: false };
}
