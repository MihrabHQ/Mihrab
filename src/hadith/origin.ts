/**
 * The packs, rebuilt from where they come from — for when our own copy
 * (the `data-hadith-v1` release) cannot be reached, and always in a
 * browser, which cannot read a release asset.
 *
 * The same files `scripts/hadith/build-packs.js` writes, built the same
 * way: HadeethEnc's own API for its entries and its topics (every value
 * kept as sent), fawazahmed0's Arabic of an-Nawawi's Forty, and
 * Open-Hadith-Data's vowelled matn column for the books. A HadeethEnc pack
 * is one request per entry, so this is slower than our copy by design; it
 * exists so a pack can still be had when GitHub cannot be.
 *
 * ── WHAT IS NOT REBUILT ────────────────────────────────────────────────
 *
 * Only what may be served (`bookGrades.ts`, `grade.ts`). The four Sunan
 * and the Muwaṭṭaʾ are not rebuilt at all: Open-Hadith-Data's file is
 * every hadith of the book with no grade, and which of them are sound is
 * in our copy alone. A HadeethEnc entry its Arabic grade does not call
 * sound is left out, as it is from our copy.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import type {
  BookFile,
  CategoriesFile,
  CategoryRow,
  HencEntry,
  HencPack,
  NawawiFile,
  NumberedText,
  PackFile,
  PackKey,
} from './packTypes';
import { findSet, NAWAWI_CROSSWALK, ROOT_TOPICS, WHOLE_PACK } from './catalog';
import { SAHIH_BOOKS } from './bookGrades';
import { gradeClass, servedGrade } from './grade';
import WITHHELD from './withheld.json';
import { reportedInSahihayn } from './sahihayn';

export const HADEETHENC_API = 'https://hadeethenc.com/api/v1';
export const NAWAWI_ARABIC_URL =
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-nawawi.min.json';
export const OPEN_HADITH_DATA = 'https://raw.githubusercontent.com/mhashim6/Open-Hadith-Data/master';

/**
 * Open-Hadith-Data's folder and file for each book that is rebuilt from
 * it: the two that are served whole. The graded five have no entry here,
 * on purpose (the header).
 */
export const BOOK_FILES: Readonly<Record<string, string>> = {
  bukhari: 'Sahih_Al-Bukhari/sahih_al-bukhari_ahadith_mushakkala_mufassala',
  muslim: 'Sahih_Muslim/sahih_muslim_ahadith_mushakkala_mufassala',
};

/** The HadeethEnc ids not served on the day the packs were last built (`grade.ts`). */
const WITHHELD_IDS: ReadonlySet<string> = new Set(WITHHELD.henc);

type Progress = (done: number, total: number) => void;
type Signal = { cancelled: boolean };

const today = () => new Date().toISOString().slice(0, 10);

/** The source answered, and the answer was not the thing asked for. */
export class SourceStatusError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`${status} ${url}`);
  }
}

async function getJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const res = await fetchWithRetry(url, undefined, { maxAttempts: 3, baseDelayMs: 500, timeoutMs });
  if (!res.ok) throw new SourceStatusError(res.status, url);
  return res.json();
}

// ── HadeethEnc ─────────────────────────────────────────────────────────

type ApiOne = {
  id: string | number;
  title: string;
  hadeeth: string;
  attribution?: string;
  grade?: string;
  explanation?: string;
  hints?: string[];
  categories?: Array<string | number>;
  hadeeth_ar?: string;
  words_meanings?: Array<{ word: string; meaning: string }>;
  reference?: string;
  /** HadeethEnc's Arabic attribution, beside a translation's own. */
  attribution_ar?: string;
  /** The Arabic grade a translation was made with. */
  grade_ar?: string;
};

/**
 * Is this entry served? Not one the builder found unsound in the Arabic,
 * and not one whose own Arabic grade says so — a translation's, which can
 * be an older one, is the nearest thing to the Arabic entry there is here.
 */
export function servedEntry(lang: string, d: ApiOne): boolean {
  if (WITHHELD_IDS.has(String(d.id))) return false;
  return servedGrade(lang === 'ar' ? d.grade : d.grade_ar);
}

/** The same mapping as the build script's `packEntry`. */
export function packEntry(lang: string, d: ApiOne): HencEntry {
  const e: HencEntry = {
    id: String(d.id),
    t: d.title,
    h: d.hadeeth,
    a: d.attribution,
    g: d.grade,
    e: d.explanation,
    x: Array.isArray(d.hints) ? d.hints : [],
    c: (d.categories ?? []).map(String),
  };
  if (lang !== 'ar') e.ar = d.hadeeth_ar;
  if (Array.isArray(d.words_meanings) && d.words_meanings.length) e.w = d.words_meanings;
  if (d.reference) e.r = d.reference;
  if (reportedInSahihayn(lang === 'ar' ? d.attribution : d.attribution_ar)) e.s = 1;
  // The grade's class, in the Arabic pack only: a translation's Arabic
  // grade can be an older one than the Arabic entry's, and that entry is
  // not fetched here (`grade.ts`).
  const q = lang === 'ar' ? gradeClass(d.grade) : 0;
  if (q) e.q = q;
  return e;
}

async function listIds(lang: string, category: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page < 50; page++) {
    const body = (await getJson(
      `${HADEETHENC_API}/hadeeths/list/?language=${lang}&category_id=${category}&page=${page}&per_page=500`,
    )) as { data?: Array<{ id: string | number }>; meta?: { current_page?: string; last_page?: number } };
    if (!Array.isArray(body?.data)) break;
    ids.push(...body.data.map(d => String(d.id)));
    if (Number(body.meta?.current_page) >= Number(body.meta?.last_page)) break;
  }
  return ids;
}

/**
 * The entries a pack holds, in a language.
 *
 *   • `all` — every entry under the seven topics: what our copy holds as
 *     one file, and so what is rebuilt when our copy cannot be reached.
 *     Thousands of requests; slow, and whole.
 *   • `cat-<id>` — one topic and everything under it.
 *   • `set-<id>` — a Learn set: its chosen entries, or an-Nawawi's Forty.
 *
 * The last two are a browser's (`catalog.ts`, "what is downloaded").
 */
export async function packIds(pack: string, lang: string): Promise<string[]> {
  if (pack === WHOLE_PACK) {
    const ids = new Set<string>();
    for (const root of ROOT_TOPICS) for (const id of await listIds(lang, root)) ids.add(id);
    for (const c of NAWAWI_CROSSWALK) if (c.henc) ids.add(c.henc);
    return [...ids];
  }
  if (pack.startsWith('cat-')) return listIds(lang, pack.slice(4));
  if (pack.startsWith('set-')) {
    const set = findSet(pack.slice(4));
    if (set?.nawawi) return NAWAWI_CROSSWALK.flatMap(c => (c.henc ? [c.henc] : []));
    if (set?.ids) return [...set.ids];
  }
  throw new Error(`unknown HadeethEnc pack ${pack}`);
}

/**
 * A pack is whole or it is not kept.
 *
 * An entry the language does not have (the list can name one; HadeethEnc
 * answers 404, or an entry with no text) is left out, and that is the
 * pack as HadeethEnc has it. An entry that could not be FETCHED — the
 * connection dropped, the server erred — is a hole, and a pack with holes
 * used to be saved as ready: every request after a lost connection failed
 * quietly, and the reader was left with a set of three hadith, or none,
 * marked as downloaded. Now one hole fails the download, to be tried again.
 */
export async function buildHencPack(pack: string, lang: string, onProgress: Progress, signal: Signal): Promise<HencPack> {
  const ids = await packIds(pack, lang);
  const entries: HencEntry[] = [];
  let next = 0;
  let done = 0;
  let holes = 0;
  const worker = async () => {
    while (next < ids.length && !signal.cancelled && holes === 0) {
      const id = ids[next++];
      try {
        const d = (await getJson(`${HADEETHENC_API}/hadeeths/one/?language=${lang}&id=${id}`)) as ApiOne;
        // A list can name an entry the language does not have yet.
        if (d?.id && d.hadeeth && servedEntry(lang, d)) entries.push(packEntry(lang, d));
      } catch (e) {
        if (!(e instanceof SourceStatusError && e.status === 404)) holes++;
      }
      onProgress(++done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (signal.cancelled) throw new Error('cancelled');
  if (holes > 0) throw new Error(`HadeethEnc ${pack}/${lang}: an entry could not be fetched`);
  const order = new Map(ids.map((id, i) => [id, i]));
  entries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { pack, lang, source: 'HadeethEnc.com', retrieved: today(), entries };
}

async function buildCategories(lang: string): Promise<CategoriesFile> {
  const raw = (await getJson(`${HADEETHENC_API}/categories/list/?language=${lang}`)) as Array<{
    id: string | number;
    parent_id: string | number | null;
    title: string;
    hadeeths_count: string | number;
  }>;
  const items: CategoryRow[] = raw.map(c => [
    String(c.id),
    c.parent_id == null ? null : String(c.parent_id),
    c.title,
    Number(c.hadeeths_count),
  ]);
  return { lang, retrieved: today(), items };
}

async function buildNawawi(): Promise<NawawiFile> {
  const raw = (await getJson(NAWAWI_ARABIC_URL)) as { hadiths: Array<{ hadithnumber: number; text: string }> };
  return {
    source: 'fawazahmed0/hadith-api (ara-nawawi), Arabic only',
    retrieved: today(),
    hadiths: raw.hadiths.map(h => [h.hadithnumber, h.text]),
  };
}

// ── Open-Hadith-Data ───────────────────────────────────────────────────

/**
 * RFC 4180, fed a chunk at a time: a book's file is tens of megabytes
 * (the second column is a commentary), more than a phone should hold as
 * one string. Only the first two fields of a row are kept.
 */
export class CsvMatnReader {
  private field = '';
  private row: string[] = [];
  private quoted = false;
  private pendingQuote = false;
  private pendingCr = false;
  readonly hadiths: NumberedText[] = [];

  push(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (this.pendingCr) {
        this.pendingCr = false;
        if (c === '\n') continue;
      }
      if (this.pendingQuote) {
        this.pendingQuote = false;
        if (c === '"') {
          this.add('"');
          continue;
        }
        this.quoted = false;
      }
      if (this.quoted) {
        if (c === '"') this.pendingQuote = true;
        else this.add(c);
      } else if (c === '"') this.quoted = true;
      else if (c === ',') this.endField();
      else if (c === '\n' || c === '\r') {
        this.pendingCr = c === '\r';
        this.endRow();
      } else this.add(c);
    }
  }

  end(): NumberedText[] {
    if (this.pendingQuote) this.quoted = false;
    if (this.field || this.row.length) this.endRow();
    return this.hadiths;
  }

  private add(c: string): void {
    // Past the matn the commentary runs on; nothing there is kept.
    if (this.row.length < 2) this.field += c;
  }

  private endField(): void {
    this.row.push(this.field);
    this.field = '';
  }

  private endRow(): void {
    this.endField();
    if (this.row.length >= 2) {
      const n = Number(this.row[0]);
      const matn = cleanMatn(this.row[1]);
      if (matn) this.hadiths.push([Number.isFinite(n) && n > 0 ? n : null, matn]);
    }
    this.row = [];
  }
}

/** The editors' direction marks out, their double spaces single — as the build script does. */
export function cleanMatn(s: string): string {
  return s.replace(/[\u200E\u200F]/g, '').replace(/\s+/g, ' ').trim();
}

async function buildBook(book: string, onProgress: Progress, signal: Signal): Promise<BookFile> {
  const file = SAHIH_BOOKS.includes(book) ? BOOK_FILES[book] : undefined;
  // A graded book is our copy or nothing: its source has no grades.
  if (!file) throw new Error(`${book} is not rebuilt from its source`);
  const url = `${OPEN_HADITH_DATA}/${file}.utf8.csv`;
  const reader = new CsvMatnReader();
  if (Platform.OS === 'web') {
    const res = await fetchWithRetry(url, undefined, { maxAttempts: 2, timeoutMs: 180_000 });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    reader.push(await res.text());
  } else {
    const tmp = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/hadith-${book}.csv`;
    const res = await ReactNativeBlobUtil.config({ path: tmp })
      .fetch('GET', url)
      .progress({ interval: 500 }, (received, total) => onProgress(Number(received), Number(total)));
    if (signal.cancelled) throw new Error('cancelled');
    if (res.info().status !== 200) throw new Error(`${res.info().status} ${url}`);
    await new Promise<void>((resolve, reject) => {
      ReactNativeBlobUtil.fs.readStream(tmp, 'utf8', 256 * 1024).then(stream => {
        stream.open();
        stream.onData(chunk => reader.push(String(chunk)));
        stream.onError(reject);
        stream.onEnd(() => resolve());
      }, reject);
    });
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
  }
  return { book, source: 'Open-Hadith-Data', license: 'ODbL-1.0', retrieved: today(), hadiths: reader.end() };
}

/** A pack, from the original sources. */
export function buildFromOrigin(key: PackKey, onProgress: Progress, signal: Signal): Promise<PackFile> {
  const [kind, a, b] = key.split('/');
  if (kind === 'henc') return buildHencPack(a, b, onProgress, signal);
  if (kind === 'categories') return buildCategories(a);
  if (kind === 'nawawi') return buildNawawi();
  return buildBook(a, onProgress, signal);
}
