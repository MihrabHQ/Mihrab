/**
 * What a reader has done with the hadith: read, bookmarked, noted — and
 * which sets they already knew before they opened the app.
 *
 * Pure. `hadithStore.ts` keeps it on disk (encrypted, like the journal);
 * `sync/merge.ts` folds two copies together through `mergeHadith` below.
 *
 * ── EVERY MARK IS A VALUE AND THE TIME IT WAS SET ─────────────────────
 *
 * `[value, at]`, and a merge keeps the newer. That is what lets a mark be
 * taken BACK and stay taken back across devices: a bookmark removed here
 * is `[0, later]`, and it beats the `[1, earlier]` the other phone still
 * holds. (Quran bookmarks are a union, so a removed one returns from the
 * other device — fine for a list, wrong for "I have read this", which a
 * reader must be able to undo.) Equal times are settled by the value, the
 * same way on every device, so the merge stays commutative and idempotent
 * (`sync/snapshot.ts` explains why both matter).
 */
export const HADITH_KEY = 'prayerapp.hadith.v1';

/** `[value, epoch ms]`. */
export type Stamped<T> = [T, number];

export type HadithItemMarks = {
  /** Read: 1, or taken back: 0. */
  r?: Stamped<0 | 1>;
  /** Bookmarked. */
  b?: Stamped<0 | 1>;
  /** The reader's own note; '' when cleared. */
  n?: Stamped<string>;
  /** Being memorised: 1; memorised: 2; neither (taken back): 0. */
  m?: Stamped<0 | 1 | 2>;
  /** The bookmark folder it is filed in, by the folder's id; '' for none. */
  f?: Stamped<string>;
};

/**
 * A reading plan: a list read through in a number of days, from a day.
 * `from` is the reader's own calendar day (YYYY-MM-DD), not an instant: a
 * plan begun on the 3rd is on its second day on the 4th wherever the
 * phone is. One plan at a time; ended, it is `0`, which a merge can keep
 * over the plan another device still holds.
 */
export type ReadingPlan = { list: string; days: number; from: string };

export type FamiliarityLevel = 'starting' | 'building' | 'depth';

export type HadithRecord = {
  v: 1;
  /** By entry id (`catalog.ts`: `h:…`, `n:…`, `b:…`). */
  items: Record<string, HadithItemMarks>;
  /** A whole set marked as already known ("Mark as already read"). */
  sets: Record<string, Stamped<0 | 1>>;
  /** The level chip last chosen. */
  level?: Stamped<FamiliarityLevel>;
  /** Where the reader was last: the entry and the list it was read in. */
  last?: Stamped<{ id: string; list?: string }>;
  /** Bookmark folders, by id: each its name, or '' once deleted. Absent until one is made. */
  folders?: Record<string, Stamped<string>>;
  /** The reading plan, or 0 once ended. */
  plan?: Stamped<ReadingPlan | 0>;
  /**
   * Paragraphs marked in the Library's books, by `book:chapter:block`
   * (`libraryMarkKey`): 1 marked, 0 taken back. A place in a book's pack,
   * not a copy of its words. Absent until one is made.
   */
  library?: Record<string, Stamped<0 | 1>>;
  /**
   * The reader's own words on a place in a Library book, by the same key as its mark: a name for a
   * bookmark, a thought on a passage; '' once cleared. Beside the marks and not in them, so a record written
   * before there were notes reads as it did. Absent until one is written.
   */
  libraryNotes?: Record<string, Stamped<string>>;
};

export const EMPTY_HADITH_RECORD: HadithRecord = { v: 1, items: {}, sets: {} };

const LEVELS: readonly FamiliarityLevel[] = ['starting', 'building', 'depth'];
const MAX_NOTE = 4000;
const MAX_ID = 64;
const MAX_FOLDER_NAME = 60;
export const MAX_FOLDERS = 50;
/** The lengths a plan is offered in, and the most a stored one may claim. */
export const PLAN_DAYS = [30, 60, 90] as const;
const MAX_PLAN_DAYS = 730;

function stamp<T>(raw: unknown, value: (v: unknown) => T | undefined): Stamped<T> | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const at = raw[1];
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return undefined;
  const v = value(raw[0]);
  return v === undefined ? undefined : [v, at];
}

const bit = (v: unknown): 0 | 1 | undefined => (v === 0 || v === 1 ? v : undefined);
const note = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.slice(0, MAX_NOTE) : undefined;
const level = (v: unknown): FamiliarityLevel | undefined =>
  LEVELS.includes(v as FamiliarityLevel) ? (v as FamiliarityLevel) : undefined;
const place = (v: unknown): { id: string; list?: string } | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || r.id.length > MAX_ID) return undefined;
  return typeof r.list === 'string' && r.list.length <= MAX_ID ? { id: r.id, list: r.list } : { id: r.id };
};

const memo = (v: unknown): 0 | 1 | 2 | undefined => (v === 0 || v === 1 || v === 2 ? v : undefined);
const folderId = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= MAX_ID ? v : undefined);
const folderName = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME) : undefined;
const plan = (v: unknown): ReadingPlan | 0 | undefined => {
  if (v === 0) return 0;
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r.list !== 'string' || !r.list || r.list.length > MAX_ID) return undefined;
  if (typeof r.days !== 'number' || !Number.isInteger(r.days) || r.days < 1 || r.days > MAX_PLAN_DAYS) return undefined;
  if (typeof r.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.from)) return undefined;
  return { list: r.list, days: r.days, from: r.from };
};

/** Anything at all, as a record: what does not fit is dropped. */
export function coerceHadithRecord(raw: unknown): HadithRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_HADITH_RECORD;
  const r = raw as Record<string, unknown>;
  const items: Record<string, HadithItemMarks> = {};
  if (r.items && typeof r.items === 'object') {
    for (const [id, marks] of Object.entries(r.items as Record<string, unknown>)) {
      if (!id || id.length > MAX_ID || !marks || typeof marks !== 'object') continue;
      const m = marks as Record<string, unknown>;
      const out: HadithItemMarks = {};
      const rr = stamp(m.r, bit);
      const bb = stamp(m.b, bit);
      const nn = stamp(m.n, note);
      if (rr) out.r = rr;
      if (bb) out.b = bb;
      if (nn) out.n = nn;
      const mm = stamp(m.m, memo);
      const ff = stamp(m.f, folderId);
      if (mm) out.m = mm;
      if (ff) out.f = ff;
      if (out.r || out.b || out.n || out.m || out.f) items[id] = out;
    }
  }
  const sets: Record<string, Stamped<0 | 1>> = {};
  if (r.sets && typeof r.sets === 'object') {
    for (const [id, s] of Object.entries(r.sets as Record<string, unknown>)) {
      const v = id.length <= MAX_ID ? stamp(s, bit) : undefined;
      if (v) sets[id] = v;
    }
  }
  const out: HadithRecord = { v: 1, items, sets };
  const lv = stamp(r.level, level);
  const last = stamp(r.last, place);
  if (lv) out.level = lv;
  if (last) out.last = last;
  if (r.folders && typeof r.folders === 'object' && !Array.isArray(r.folders)) {
    const folders: Record<string, Stamped<string>> = {};
    for (const [id, f] of Object.entries(r.folders as Record<string, unknown>)) {
      const v = id && id.length <= MAX_ID ? stamp(f, folderName) : undefined;
      if (v) folders[id] = v;
    }
    if (Object.keys(folders).length) out.folders = folders;
  }
  const pl = stamp(r.plan, plan);
  if (pl) out.plan = pl;
  if (r.library && typeof r.library === 'object' && !Array.isArray(r.library)) {
    const library: Record<string, Stamped<0 | 1>> = {};
    for (const [key, m] of Object.entries(r.library as Record<string, unknown>)) {
      const v = key.length <= MAX_ID && LIBRARY_MARK.test(key) ? stamp(m, bit) : undefined;
      if (v) library[key] = v;
    }
    if (Object.keys(library).length) out.library = library;
  }
  if (r.libraryNotes && typeof r.libraryNotes === 'object' && !Array.isArray(r.libraryNotes)) {
    const notes: Record<string, Stamped<string>> = {};
    for (const [key, m] of Object.entries(r.libraryNotes as Record<string, unknown>)) {
      const v = key.length <= MAX_ID && LIBRARY_MARK.test(key) ? stamp(m, note) : undefined;
      if (v) notes[key] = v;
    }
    if (Object.keys(notes).length) out.libraryNotes = notes;
  }
  return out;
}

/** A total order on values, so equal times settle the same way everywhere. */
function rank(v: unknown): string {
  return typeof v === 'string' ? `s${v}` : JSON.stringify(v);
}

function newer<T>(a: Stamped<T> | undefined, b: Stamped<T> | undefined): Stamped<T> | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a[1] !== b[1]) return a[1] > b[1] ? a : b;
  return rank(a[0]) >= rank(b[0]) ? a : b;
}

/** Commutative, idempotent, associative: newest mark wins, field by field. */
export function mergeHadith(a: HadithRecord, b: HadithRecord): HadithRecord {
  const items: Record<string, HadithItemMarks> = {};
  // Keys in one order, so two devices holding the same record hold the same bytes.
  for (const id of [...new Set([...Object.keys(a.items), ...Object.keys(b.items)])].sort()) {
    const x = a.items[id] ?? {};
    const y = b.items[id] ?? {};
    const m: HadithItemMarks = {};
    const r = newer(x.r, y.r);
    const bm = newer(x.b, y.b);
    const n = newer(x.n, y.n);
    if (r) m.r = r;
    if (bm) m.b = bm;
    if (n) m.n = n;
    const mm = newer(x.m, y.m);
    const f = newer(x.f, y.f);
    if (mm) m.m = mm;
    if (f) m.f = f;
    items[id] = m;
  }
  const sets: Record<string, Stamped<0 | 1>> = {};
  for (const id of [...new Set([...Object.keys(a.sets), ...Object.keys(b.sets)])].sort()) {
    sets[id] = newer(a.sets[id], b.sets[id])!;
  }
  const out: HadithRecord = { v: 1, items, sets };
  const lv = newer(a.level, b.level);
  const last = newer(a.last, b.last);
  if (lv) out.level = lv;
  if (last) out.last = last;
  // Absent stays absent: a record that never had a folder or a plan merges to the bytes it had.
  const folderIds = [...new Set([...Object.keys(a.folders ?? {}), ...Object.keys(b.folders ?? {})])].sort();
  if (folderIds.length) {
    out.folders = {};
    for (const id of folderIds) out.folders[id] = newer(a.folders?.[id], b.folders?.[id])!;
  }
  const pl = newer(a.plan, b.plan);
  if (pl) out.plan = pl;
  const markKeys = [...new Set([...Object.keys(a.library ?? {}), ...Object.keys(b.library ?? {})])].sort();
  if (markKeys.length) {
    out.library = {};
    for (const k of markKeys) out.library[k] = newer(a.library?.[k], b.library?.[k])!;
  }
  const noteKeys = [...new Set([...Object.keys(a.libraryNotes ?? {}), ...Object.keys(b.libraryNotes ?? {})])].sort();
  if (noteKeys.length) {
    out.libraryNotes = {};
    for (const k of noteKeys) out.libraryNotes[k] = newer(a.libraryNotes?.[k], b.libraryNotes?.[k])!;
  }
  return out;
}

// ── Reading it ─────────────────────────────────────────────────────────

export const isRead = (rec: HadithRecord, id: string) => rec.items[id]?.r?.[0] === 1;
export const isBookmarked = (rec: HadithRecord, id: string) => rec.items[id]?.b?.[0] === 1;
export const noteOf = (rec: HadithRecord, id: string) => rec.items[id]?.n?.[0] ?? '';
export const isSetMarked = (rec: HadithRecord, set: string) => rec.sets[set]?.[0] === 1;

/** The ids bookmarked, newest first. */
export function bookmarkedIds(rec: HadithRecord): string[] {
  return Object.entries(rec.items)
    .filter(([, m]) => m.b?.[0] === 1)
    .sort((x, y) => (y[1].b?.[1] ?? 0) - (x[1].b?.[1] ?? 0))
    .map(([id]) => id);
}

/** 0 not being memorised, 1 being memorised, 2 memorised. */
export const memoOf = (rec: HadithRecord, id: string): 0 | 1 | 2 => rec.items[id]?.m?.[0] ?? 0;

/** What is being memorised, then what has been: each in the order it was taken up. */
export function memoIds(rec: HadithRecord): string[] {
  const of = (state: 1 | 2) =>
    Object.entries(rec.items)
      .filter(([, m]) => m.m?.[0] === state)
      .sort((x, y) => (x[1].m?.[1] ?? 0) - (y[1].m?.[1] ?? 0) || (x[0] < y[0] ? -1 : 1))
      .map(([id]) => id);
  return [...of(1), ...of(2)];
}

/** The folders there are, by name: `[id, name]`. A deleted one ('' name) is not among them. */
export function foldersOf(rec: HadithRecord): Array<[string, string]> {
  return Object.entries(rec.folders ?? {})
    .filter(([, f]) => f[0] !== '')
    .map(([id, f]): [string, string] => [id, f[0]])
    .sort((x, y) => x[1].localeCompare(y[1]) || (x[0] < y[0] ? -1 : 1));
}

/** The folder a bookmark is in, or '' — also '' where its folder has since been deleted. */
export function folderOf(rec: HadithRecord, id: string): string {
  const f = rec.items[id]?.f?.[0] ?? '';
  return f && rec.folders?.[f]?.[0] ? f : '';
}

/** The bookmarks in a folder, newest first. */
export const folderIds = (rec: HadithRecord, folder: string): string[] =>
  bookmarkedIds(rec).filter(id => folderOf(rec, id) === folder);

/** A marked paragraph's key: the book, the chapter and the block in it. */
const LIBRARY_MARK = /^[a-z0-9-]+:\d+:\d+$/;
export const libraryMarkKey = (book: string, c: number, b: number) => `${book}:${c}:${b}`;

/** A book's marked paragraphs, newest first. */
export function libraryMarksOf(rec: HadithRecord, book: string): { c: number; b: number; at: number; n?: string }[] {
  const out: { c: number; b: number; at: number; n?: string }[] = [];
  for (const [key, m] of Object.entries(rec.library ?? {})) {
    if (m[0] !== 1) continue;
    const [id, c, b] = key.split(':');
    const n = rec.libraryNotes?.[key]?.[0];
    if (id === book) out.push({ c: Number(c), b: Number(b), at: m[1], ...(n ? { n } : {}) });
  }
  return out.sort((x, y) => y.at - x.at || x.c - y.c || x.b - y.b);
}

export const setLibraryMark = (rec: HadithRecord, book: string, c: number, b: number, on: boolean, at: number): HadithRecord => ({
  ...rec,
  library: { ...rec.library, [libraryMarkKey(book, c, b)]: [on ? 1 : 0, at] },
});

/**
 * The reader's words on a place in a book. Writing some marks the place, so it is found again where the
 * bookmarks are; clearing them leaves the mark as it was.
 */
export function setLibraryNote(rec: HadithRecord, book: string, c: number, b: number, text: string, at: number): HadithRecord {
  const key = libraryMarkKey(book, c, b);
  const words = text.trim().slice(0, MAX_NOTE);
  const marked = rec.library?.[key]?.[0] === 1;
  return {
    ...rec,
    ...(words && !marked ? { library: { ...rec.library, [key]: [1, at] } } : {}),
    libraryNotes: { ...rec.libraryNotes, [key]: [words, at] },
  };
}

/** The plan being followed, or null. */
export const planOf = (rec: HadithRecord): ReadingPlan | null => (rec.plan && rec.plan[0] !== 0 ? rec.plan[0] : null);

// ── Changing it ────────────────────────────────────────────────────────

function withItem(rec: HadithRecord, id: string, patch: HadithItemMarks): HadithRecord {
  return { ...rec, items: { ...rec.items, [id]: { ...rec.items[id], ...patch } } };
}

export const setRead = (rec: HadithRecord, id: string, read: boolean, at: number) =>
  withItem(rec, id, { r: [read ? 1 : 0, at] });

export const setBookmark = (rec: HadithRecord, id: string, on: boolean, at: number) =>
  withItem(rec, id, { b: [on ? 1 : 0, at] });

export const setNote = (rec: HadithRecord, id: string, text: string, at: number) =>
  withItem(rec, id, { n: [text.slice(0, MAX_NOTE), at] });

export const setSetMarked = (rec: HadithRecord, set: string, on: boolean, at: number): HadithRecord => ({
  ...rec,
  sets: { ...rec.sets, [set]: [on ? 1 : 0, at] },
});

export const setLevel = (rec: HadithRecord, lv: FamiliarityLevel, at: number): HadithRecord => ({
  ...rec,
  level: [lv, at],
});

export const setLast = (rec: HadithRecord, id: string, list: string | undefined, at: number): HadithRecord => ({
  ...rec,
  last: [list ? { id, list } : { id }, at],
});

export const setMemo = (rec: HadithRecord, id: string, state: 0 | 1 | 2, at: number) =>
  withItem(rec, id, { m: [state, at] });

/** File a bookmark in a folder ('' for none). Filing bookmarks what was not. */
export const setFolder = (rec: HadithRecord, id: string, folder: string, at: number) =>
  withItem(rec, id, isBookmarked(rec, id) ? { f: [folder, at] } : { f: [folder, at], b: [1, at] });

/**
 * Name a folder: a new one under a new id, or an old one again. '' deletes
 * it — its bookmarks stay bookmarks, in no folder (`folderOf`). Refused
 * (the record unchanged) for a name that is empty once trimmed where a
 * new folder is asked for, and past MAX_FOLDERS.
 */
export function nameFolder(rec: HadithRecord, id: string, name: string, at: number): HadithRecord {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);
  const exists = !!rec.folders?.[id]?.[0];
  if (!id || id.length > MAX_ID) return rec;
  if (!exists && (!clean || foldersOf(rec).length >= MAX_FOLDERS)) return rec;
  return { ...rec, folders: { ...rec.folders, [id]: [clean, at] } };
}

/** Begin a plan (replacing any other), or end the one there is. */
export const setPlan = (rec: HadithRecord, p: ReadingPlan | null, at: number): HadithRecord => ({
  ...rec,
  plan: [p ?? 0, at],
});
