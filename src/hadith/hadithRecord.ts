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
};

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
};

export const EMPTY_HADITH_RECORD: HadithRecord = { v: 1, items: {}, sets: {} };

const LEVELS: readonly FamiliarityLevel[] = ['starting', 'building', 'depth'];
const MAX_NOTE = 4000;
const MAX_ID = 64;

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
      if (out.r || out.b || out.n) items[id] = out;
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
