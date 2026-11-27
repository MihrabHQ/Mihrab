/**
 * The files the Hadith tab reads, as `scripts/hadith/build-packs.js`
 * writes them and as `origin.ts` rebuilds them when our copy cannot be
 * reached. One shape, whichever of the two a file came from.
 */
import { validBookFile, type BookRow } from './bookGrades';

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
/**
 * A book. `grades` is there in the five that are graded hadith by hadith
 * (`bookGrades.ts`): who the graders are, where their verdicts are from
 * and the rule a row was kept by; `of` is how many rows the source has.
 */
export type BookFile = {
  book: string;
  source: string;
  license: string;
  retrieved: string;
  hadiths: BookRow[];
  grades?: { source: string; rule: string; graders: string[] };
  of?: number;
};

/**
 * A book of the Library (`scripts/library/build-library.js`): its author's
 * text, whole and in his order. A block is a paragraph (a string), a
 * heading inside a chapter (`h`) or lines of verse (`v`). It is not hadith
 * served by the app's rule, and nothing of it is read outside the book
 * (docs/hadith-policy.md, "The Library").
 */
export type LibraryBlock = string | { h: string } | { v: string[] };
/** `p`: the part a chapter stands in, in a book of books (al-ʿIqd al-Farīd's twenty-five); chapters of one part follow one another. */
export type LibraryChapter = { t: string; p?: string; b: LibraryBlock[] };
export type LibraryFile = {
  id: string;
  title: string;
  author: string;
  died: string;
  lang: string;
  /** `edition`: the printed edition the transcription was made from, where the source says. */
  source: { name: string; license: string; licenseUrl: string; url: string; edition?: string };
  asOf: string;
  /** Empty for a book that is a file (`pdf`): its pack says what it is and whose, and the file is the book. */
  chapters: LibraryChapter[];
  /** A book published as a typeset file and passed on unaltered: the file's size, SHA-256 and pages (`libraryPdf.ts`). */
  pdf?: { bytes: number; sha256: string; pages: number };
};

/** The packs, by their key — also their path under build/hadith/v1 and on the device, less `.json`. */
export type PackKey =
  | `henc/${string}/${string}`
  | `categories/${string}`
  | 'nawawi/ar'
  | `library/${string}`
  | `books/${string}`;

export type PackFile = HencPack | CategoriesFile | NawawiFile | BookFile | LibraryFile;

/**
 * What the manifest says of one pack. `sha256` is the file's own, lower
 * case hex: it is how a device tells that the copy it holds is no longer
 * the one we publish (`packUpdates.ts`). Optional — a manifest written
 * before it had none, and a pack it does not name is left alone.
 */
export type ManifestEntry = {
  bytes: number;
  sha256?: string;
  count?: number;
  retrieved?: string;
  /** A graded book: the rows its source has, and how many were left out, by why. */
  of?: number;
  left?: Record<string, number>;
  /** A Library book that is a file: what the file is, so the shelf can say what it weighs before anything is fetched. */
  pdf?: { bytes: number; sha256: string; pages: number };
};

export type Manifest = {
  v: 1;
  henc: Record<string, { langs: Record<string, ManifestEntry> }>;
  books: Record<string, ManifestEntry>;
  nawawi: ManifestEntry | null;
  categories: Record<string, ManifestEntry>;
  /** The Library's books. Absent from a manifest written before there were any. */
  library?: Record<string, ManifestEntry>;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A book's file as a pack may name it (the size the shelf will offer is `libraryPdf.ts`'s to say). */
const validPdf = (p: unknown): boolean =>
  isObj(p) && Number.isInteger(p.bytes) && (p.bytes as number) > 0 && typeof p.sha256 === 'string' && /^[0-9a-f]{64}$/.test(p.sha256) && Number.isInteger(p.pages) && (p.pages as number) > 0;

/** Is this the file `key` names? Anything else is not written to disk. */
export function validPack(key: PackKey, v: unknown): boolean {
  if (!isObj(v)) return false;
  if (key.startsWith('henc/')) {
    return Array.isArray(v.entries) && v.entries.every(e => isObj(e) && typeof e.id === 'string' && typeof e.h === 'string');
  }
  if (key.startsWith('categories/')) return Array.isArray(v.items) && v.items.length > 0;
  if (key.startsWith('library/')) {
    const block = (b: unknown) =>
      typeof b === 'string' ||
      (isObj(b) && (typeof b.h === 'string' || (Array.isArray(b.v) && b.v.every(l => typeof l === 'string'))));
    return (
      v.id === key.slice('library/'.length) &&
      typeof v.title === 'string' &&
      isObj(v.source) &&
      typeof v.source.license === 'string' &&
      Array.isArray(v.chapters) &&
      // A book is its text, or it is a file: never neither.
      (v.chapters.length > 0 || validPdf(v.pdf)) &&
      (v.pdf === undefined || validPdf(v.pdf)) &&
      v.chapters.every(c => isObj(c) && typeof c.t === 'string' && (c.p === undefined || typeof c.p === 'string') && Array.isArray(c.b) && c.b.length > 0 && c.b.every(block))
    );
  }
  // A book that is offered, and where it is graded, sound in every row.
  if (key.startsWith('books/')) return validBookFile(key.slice('books/'.length), v);
  return Array.isArray(v.hadiths) && v.hadiths.length > 0 && v.hadiths.every(h => Array.isArray(h) && typeof h[1] === 'string');
}
