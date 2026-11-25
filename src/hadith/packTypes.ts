/**
 * The files the Hadith tab reads, as `scripts/hadith/build-packs.js`
 * writes them and as `origin.ts` rebuilds them when our copy cannot be
 * reached. One shape, whichever of the two a file came from.
 */

/**
 * A HadeethEnc entry, every value as HadeethEnc sent it; only the keys are
 * short. `s` and `q` alone are ours: read off HadeethEnc's Arabic
 * attribution (`sahihayn.ts`) and its Arabic grade (`grade.ts`), added to
 * the entry and changing nothing in it.
 */
export type HencEntry = {
  id: string;
  /** Title (the hadith's opening words, in the pack's language). */
  t: string;
  /** The hadith in the pack's language (Arabic in the Arabic pack). */
  h: string;
  /** Who reported it ("Narrated by al-Bukhārī and Muslim"). */
  a?: string;
  /** Its grade ("Authentic"). */
  g?: string;
  /** The simplified explanation (sharḥ). */
  e?: string;
  /** Takeaways (fawāʾid). */
  x?: string[];
  /** HadeethEnc category ids. */
  c: string[];
  /** The Arabic matn, in every pack but the Arabic one. */
  ar?: string;
  /** Word meanings, where HadeethEnc gives them. */
  w?: Array<{ word: string; meaning: string }>;
  /** A reference, where HadeethEnc gives one. */
  r?: string;
  /** 1 where HadeethEnc's attribution is al-Bukhārī's Ṣaḥīḥ or Muslim's. */
  s?: 1;
  /** 1 where HadeethEnc grades it ṣaḥīḥ outright, 2 where ḥasan; absent where its grade is neither or has a reservation. */
  q?: 1 | 2;
};

export type HencPack = { pack: string; lang: string; source: string; retrieved: string; entries: HencEntry[] };

/** `[id, parent id | null, title, count]`. */
export type CategoryRow = [string, string | null, string, number];
export type CategoriesFile = { lang: string; retrieved: string; items: CategoryRow[] };

/** `[number | null, Arabic text]`. */
export type NumberedText = [number | null, string];
export type NawawiFile = { source: string; retrieved: string; hadiths: NumberedText[] };
export type BookFile = { book: string; source: string; license: string; retrieved: string; hadiths: NumberedText[] };

/** The packs, by their key — also their path under build/hadith/v1 and on the device, less `.json`. */
export type PackKey =
  | `henc/${string}/${string}`
  | `categories/${string}`
  | 'nawawi/ar'
  | `books/${string}`;

export type PackFile = HencPack | CategoriesFile | NawawiFile | BookFile;

/**
 * What the manifest says of one pack. `sha256` is the file's own, lower
 * case hex: it is how a device tells that the copy it holds is no longer
 * the one we publish (`packUpdates.ts`). Optional — a manifest written
 * before it had none, and a pack it does not name is left alone.
 */
export type ManifestEntry = { bytes: number; sha256?: string; count?: number; retrieved?: string };

export type Manifest = {
  v: 1;
  henc: Record<string, { langs: Record<string, ManifestEntry> }>;
  books: Record<string, ManifestEntry>;
  nawawi: ManifestEntry | null;
  categories: Record<string, ManifestEntry>;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Is this the file `key` names? Anything else is not written to disk. */
export function validPack(key: PackKey, v: unknown): boolean {
  if (!isObj(v)) return false;
  if (key.startsWith('henc/')) {
    return Array.isArray(v.entries) && v.entries.every(e => isObj(e) && typeof e.id === 'string' && typeof e.h === 'string');
  }
  if (key.startsWith('categories/')) return Array.isArray(v.items) && v.items.length > 0;
  return Array.isArray(v.hadiths) && v.hadiths.length > 0 && v.hadiths.every(h => Array.isArray(h) && typeof h[1] === 'string');
}
