/**
 * Hifz — what the reader knows by heart, and when to recite it again (#121).
 *
 * A PORTION is a run of ayahs the reader has memorised: a whole surah, or
 * a stretch of one ("an-Naba 1–20"), kept as absolute ayah indices
 * (`ayahIndexOf`, 1 to 6236) so it holds across every reading and reader. Each portion carries its own
 * revision schedule: the day it is next due and the interval that got it
 * there. Reciting it from memory and saying how it went moves it on.
 *
 * THE SCHEDULE IS THE QURAN'S, NOT A FLASHCARD'S. A card in a spaced-
 * repetition app can earn an interval of years; no hafiz leaves a surah a
 * year. The traditional structure is new, recent and old: what was just
 * memorised is recited daily, what was memorised lately often, and the
 * whole stock cycled through within a fixed span. So the intervals are
 * 1 → 3 → 7 → 14 → 30 days and stop at a CAP the reader chooses (7, 14 or
 * 30), "needed help" sends a portion back to daily, and "fluent" skips a
 * step. The arithmetic is in `scheduleAfter`.
 *
 * It lives inside the Qur'an blob (`QuranState.hifz`, additive), so it
 * travels with every backup and sync round the khatmah does, merged the
 * same way (`mergeHifz`): newest copy of a portion wins by id, a removal
 * is a fact with a date on it (`removed`), and a merge of a state with
 * itself is that state. Nothing here reads the clock: every function takes
 * the day, so the tests can hold any date.
 */
import { ayahAtIndex, ayahCount, ayahIndexOf, TOTAL_AYAHS } from './ayahIndex';
import { mergeRemovals, removedAfter } from './quranState';
import type { Removal } from './quranTypes';

/** How a recitation from memory went. */
export type HifzGrade = 'again' | 'fine' | 'fluent';

export type HifzReview = { at: number; grade: HifzGrade };

export type HifzPortion = {
  id: string;
  /** Absolute ayah indices (`ayahIndexOf`, 1-based), both inclusive. */
  start: number;
  end: number;
  /** Epoch ms it was marked memorised. */
  memorisedAt: number;
  /** Epoch ms of the last change, for the merge. */
  updatedAt: number;
  /** Days between the last recitation and the next; the schedule's step. */
  interval: number;
  /** The day it is next due, local `YYYY-MM-DD`. */
  due: string;
  /** The last recitations, newest last; kept to `REVIEWS_KEPT`. */
  reviews: HifzReview[];
};

export type HifzCap = 7 | 14 | 30;

export type HifzState = {
  portions: HifzPortion[];
  /** Portions the reader took away, with the time — a tombstone, as for bookmarks. */
  removed?: Removal[];
  /** No portion waits longer than this many days between recitations. */
  cap?: HifzCap;
  /** How many portions a day's revision shows before the rest wait for tomorrow. */
  budget?: number;
  /** When cap or budget last changed, for the merge. */
  prefsUpdatedAt?: number;
};

export const HIFZ_INTERVALS = [1, 3, 7, 14, 30] as const;
export const HIFZ_DEFAULT_CAP: HifzCap = 30;
export const HIFZ_DEFAULT_BUDGET = 3;
export const HIFZ_CAPS: readonly HifzCap[] = [7, 14, 30];
const REVIEWS_KEPT = 30;
/** The colour the reader draws Hifz in — a green apart from the khatmah's teal and the marker's rust. */
export const HIFZ_COLOR = '#2e7d4f';

export const EMPTY_HIFZ: HifzState = { portions: [] };

// ── Days ─────────────────────────────────────────────────────────────

/** Local calendar day of an instant, `YYYY-MM-DD`. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `days` calendar days after a day key. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  return dayOf(t.getTime());
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
}

// ── The schedule ─────────────────────────────────────────────────────

export function capOf(state: HifzState): HifzCap {
  return state.cap ?? HIFZ_DEFAULT_CAP;
}

export function budgetOf(state: HifzState): number {
  return state.budget ?? HIFZ_DEFAULT_BUDGET;
}

/**
 * The next interval after a recitation graded `grade`, from the interval
 * the portion had. `again` is back to daily; `fine` the next step; `fluent`
 * the step after that. Never past the cap, never under a day.
 */
export function nextInterval(interval: number, grade: HifzGrade, cap: HifzCap): number {
  if (grade === 'again') return 1;
  const steps = HIFZ_INTERVALS.filter(d => d <= cap);
  // The step the portion is on: the largest not above its interval.
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (steps[k] <= interval) i = k;
  const up = grade === 'fluent' ? 2 : 1;
  return steps[Math.min(i + up, steps.length - 1)];
}

/** The portion after a recitation on `today`, graded. */
export function scheduleAfter(p: HifzPortion, grade: HifzGrade, today: string, cap: HifzCap, now: number): HifzPortion {
  const interval = nextInterval(p.interval, grade, cap);
  return {
    ...p,
    interval,
    due: addDays(today, interval),
    reviews: [...p.reviews, { at: now, grade }].slice(-REVIEWS_KEPT),
    updatedAt: now,
  };
}

/** Days a portion is overdue on `today` (0 when due today, negative when not yet). */
export function overdueBy(p: HifzPortion, today: string): number {
  return daysBetween(p.due, today);
}

/**
 * Today's revision: every portion due, the most overdue first and, among
 * those equally due, in the order of the muṣḥaf. `budget` of them are the
 * day's; the rest wait, and `more` says how many.
 */
export function todaysRevision(state: HifzState, today: string): { due: HifzPortion[]; shown: HifzPortion[]; more: number } {
  const due = state.portions
    .filter(p => overdueBy(p, today) >= 0)
    .sort((a, b) => overdueBy(b, today) - overdueBy(a, today) || a.start - b.start);
  const n = Math.max(1, budgetOf(state));
  return { due, shown: due.slice(0, n), more: Math.max(0, due.length - n) };
}

/** The portions recited today (a review dated today), for "2 of 3 done". */
export function recitedToday(state: HifzState, today: string): HifzPortion[] {
  return state.portions.filter(p => p.reviews.some(r => dayOf(r.at) === today));
}

// ── Portions ─────────────────────────────────────────────────────────

/** A fresh portion over an index range, due tomorrow. */
function newPortion(start: number, end: number, today: string, now: number): HifzPortion {
  return {
    id: `h${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    start,
    end,
    memorisedAt: now,
    updatedAt: now,
    interval: 1,
    due: addDays(today, 1),
    reviews: [],
  };
}

/** The surah and ayahs a portion spans. */
export function portionSpan(p: HifzPortion): {
  surah: number;
  from: number;
  endSurah: number;
  to: number;
  wholeSurah: boolean;
} {
  const a = ayahAtIndex(p.start);
  const b = ayahAtIndex(p.end);
  const wholeSurah = a.surah === b.surah && a.ayah === 1 && b.ayah === ayahCount(a.surah);
  return { surah: a.surah, from: a.ayah, endSurah: b.surah, to: b.ayah, wholeSurah };
}

/** The portion holding this ayah, if any. */
export function portionAt(state: HifzState, surah: number, ayah: number): HifzPortion | undefined {
  const i = ayahIndexOf(surah, ayah);
  return state.portions.find(p => p.start <= i && i <= p.end);
}

/** The portions touching a surah, in order. */
export function portionsOfSurah(state: HifzState, surah: number): HifzPortion[] {
  const s = ayahIndexOf(surah, 1);
  const e = ayahIndexOf(surah, ayahCount(surah));
  return state.portions.filter(p => p.start <= e && p.end >= s).sort((a, b) => a.start - b.start);
}

/** Whether the whole surah is held, in one portion or several. */
export function surahMemorised(state: HifzState, surah: number): boolean {
  const s = ayahIndexOf(surah, 1);
  const e = ayahIndexOf(surah, ayahCount(surah));
  let at = s;
  for (const p of portionsOfSurah(state, surah)) {
    if (p.start > at) return false;
    at = Math.max(at, p.end + 1);
  }
  return at > e;
}

function remove(state: HifzState, ids: string[], now: number): HifzState {
  if (ids.length === 0) return state;
  const removed = mergeRemovals(state.removed ?? [], ids.map(id => ({ id, at: now })));
  return { ...state, portions: state.portions.filter(p => !ids.includes(p.id)), removed };
}

/**
 * Mark a range memorised. A range that overlaps or touches portions already
 * held joins them into one — the schedule of the earliest-due survivor is
 * kept, so extending "an-Naba 1–20" to 1–30 does not restart its revision —
 * and a new, separate range is due tomorrow.
 */
export function markRange(state: HifzState, start: number, end: number, today: string, now: number): HifzState {
  if (!(start >= 1 && end >= start && end <= TOTAL_AYAHS)) return state;
  // Joined: overlapping, or end to end within one surah (the stretch grown
  // "up to here"). Two whole surahs side by side stay two portions.
  const sameSurah = (a: number, b: number) => ayahAtIndex(a).surah === ayahAtIndex(b).surah;
  const touching = state.portions.filter(
    p => (p.start <= end && p.end >= start) || (p.end + 1 === start && sameSurah(p.end, start)) || (end + 1 === p.start && sameSurah(end, p.start)),
  );
  if (touching.length === 0) {
    return { ...state, portions: [...state.portions, newPortion(start, end, today, now)].sort((a, b) => a.start - b.start) };
  }
  const keep = [...touching].sort((a, b) => a.due.localeCompare(b.due) || a.start - b.start)[0];
  const joined: HifzPortion = {
    ...keep,
    start: Math.min(start, ...touching.map(p => p.start)),
    end: Math.max(end, ...touching.map(p => p.end)),
    updatedAt: now,
  };
  const without = remove(state, touching.filter(p => p.id !== keep.id).map(p => p.id), now);
  return {
    ...without,
    portions: without.portions.map(p => (p.id === keep.id ? joined : p)).sort((a, b) => a.start - b.start),
  };
}

export function markSurah(state: HifzState, surah: number, today: string, now: number): HifzState {
  return markRange(state, ayahIndexOf(surah, 1), ayahIndexOf(surah, ayahCount(surah)), today, now);
}

/** "Memorised up to here": from the surah's first ayah (or the held stretch before it) to this ayah. */
export function markUpTo(state: HifzState, surah: number, ayah: number, today: string, now: number): HifzState {
  return markRange(state, ayahIndexOf(surah, 1), ayahIndexOf(surah, ayah), today, now);
}

/** Take a surah out of the stock: every portion in it, and the parts of portions that reach into it. */
export function unmarkSurah(state: HifzState, surah: number, now: number): HifzState {
  const s = ayahIndexOf(surah, 1);
  const e = ayahIndexOf(surah, ayahCount(surah));
  const inside = portionsOfSurah(state, surah);
  let next = remove(state, inside.map(p => p.id), now);
  // A portion that runs past this surah keeps what lies outside it.
  for (const p of inside) {
    if (p.start < s) next = { ...next, portions: [...next.portions, { ...newPortion(p.start, s - 1, dayOf(now), now), interval: p.interval, due: p.due, reviews: p.reviews }] };
    if (p.end > e) next = { ...next, portions: [...next.portions, { ...newPortion(e + 1, p.end, dayOf(now), now), interval: p.interval, due: p.due, reviews: p.reviews }] };
  }
  return { ...next, portions: next.portions.sort((a, b) => a.start - b.start) };
}

export function removePortion(state: HifzState, id: string, now: number): HifzState {
  return remove(state, [id], now);
}

/** A recitation from memory, graded, on `today`. */
export function reviewPortion(state: HifzState, id: string, grade: HifzGrade, today: string, now: number): HifzState {
  return {
    ...state,
    portions: state.portions.map(p => (p.id === id ? scheduleAfter(p, grade, today, capOf(state), now) : p)),
  };
}

/** A new cap: every portion waiting longer than it is due now. */
export function setCap(state: HifzState, cap: HifzCap, today: string, now: number): HifzState {
  return {
    ...state,
    cap,
    prefsUpdatedAt: now,
    portions: state.portions.map(p =>
      p.interval > cap || daysBetween(today, p.due) > cap ? { ...p, interval: cap, due: today, updatedAt: now } : p,
    ),
  };
}

export function setBudget(state: HifzState, budget: number, now: number): HifzState {
  return { ...state, budget: Math.max(1, Math.min(20, Math.round(budget))), prefsUpdatedAt: now };
}

/** The stock: how many ayahs, and how many whole surahs. */
export function hifzStock(state: HifzState): { ayahs: number; surahs: number } {
  const ayahs = state.portions.reduce((n, p) => n + (p.end - p.start + 1), 0);
  let surahs = 0;
  for (let s = 1; s <= 114; s++) if (surahMemorised(state, s)) surahs++;
  return { ayahs, surahs };
}

// ── Storage and sync ─────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function coercePortion(v: unknown): HifzPortion | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const start = r.start, end = r.end;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 1 || end < start || end > TOTAL_AYAHS) return null;
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const memorisedAt = num(r.memorisedAt, 0);
  const updatedAt = num(r.updatedAt, memorisedAt);
  const interval = Math.max(1, Math.min(30, Math.round(num(r.interval, 1))));
  const due = typeof r.due === 'string' && DAY_RE.test(r.due) ? r.due : dayOf(memorisedAt || 0);
  const reviews: HifzReview[] = [];
  if (Array.isArray(r.reviews)) {
    for (const x of r.reviews) {
      const rv = x as Record<string, unknown>;
      if (!rv || typeof rv !== 'object') continue;
      if (typeof rv.at !== 'number' || !Number.isFinite(rv.at)) continue;
      if (rv.grade !== 'again' && rv.grade !== 'fine' && rv.grade !== 'fluent') continue;
      reviews.push({ at: rv.at, grade: rv.grade });
    }
  }
  return { id: r.id, start, end, memorisedAt, updatedAt, interval, due, reviews: reviews.slice(-REVIEWS_KEPT) };
}

/** A blob's Hifz, or null when it holds none; shapes it cannot read are dropped. */
export function coerceHifz(raw: unknown): HifzState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const portions = (Array.isArray(r.portions) ? r.portions : []).map(coercePortion).filter((p): p is HifzPortion => p !== null);
  const removed = mergeRemovals(
    (Array.isArray(r.removed) ? r.removed : [])
      .filter((x): x is Removal => !!x && typeof x === 'object' && typeof (x as Removal).id === 'string' && typeof (x as Removal).at === 'number')
      .map(x => ({ id: x.id, at: x.at })),
    [],
  );
  const live = portions.filter(p => !removedAfter(removed, p.id, p.updatedAt)).sort((a, b) => a.start - b.start);
  const cap = r.cap === 7 || r.cap === 14 || r.cap === 30 ? r.cap : undefined;
  const budget = typeof r.budget === 'number' && Number.isFinite(r.budget) ? Math.max(1, Math.min(20, Math.round(r.budget))) : undefined;
  const prefsUpdatedAt = typeof r.prefsUpdatedAt === 'number' && r.prefsUpdatedAt > 0 ? r.prefsUpdatedAt : undefined;
  if (live.length === 0 && removed.length === 0 && cap === undefined && budget === undefined) return null;
  return {
    portions: live,
    ...(removed.length > 0 ? { removed } : {}),
    ...(cap !== undefined ? { cap } : {}),
    ...(budget !== undefined ? { budget } : {}),
    ...(prefsUpdatedAt !== undefined ? { prefsUpdatedAt } : {}),
  };
}

/**
 * Two devices' Hifz as one: a portion's newest copy wins by id (ties keep
 * the local), a removal beats a copy older than it, and the preferences
 * follow their stamp. `mergeHifz(a, a)` is `a`, and the result is the same
 * whichever side is local when no stamps tie.
 */
export function mergeHifz(local: HifzState | undefined, incoming: HifzState | undefined): HifzState | undefined {
  if (!local) return incoming;
  if (!incoming) return local;
  const byId = new Map(local.portions.map(p => [p.id, p]));
  for (const p of incoming.portions) {
    const mine = byId.get(p.id);
    if (!mine || p.updatedAt > mine.updatedAt) byId.set(p.id, p);
  }
  const removed = mergeRemovals(local.removed ?? [], incoming.removed ?? []);
  const portions = [...byId.values()].filter(p => !removedAfter(removed, p.id, p.updatedAt)).sort((a, b) => a.start - b.start);
  const theirsNewer = (incoming.prefsUpdatedAt ?? 0) > (local.prefsUpdatedAt ?? 0);
  const prefs = theirsNewer ? incoming : local;
  const prefsUpdatedAt = Math.max(local.prefsUpdatedAt ?? 0, incoming.prefsUpdatedAt ?? 0);
  return {
    portions,
    ...(removed.length > 0 ? { removed } : {}),
    ...(prefs.cap !== undefined ? { cap: prefs.cap } : {}),
    ...(prefs.budget !== undefined ? { budget: prefs.budget } : {}),
    ...(prefsUpdatedAt > 0 ? { prefsUpdatedAt } : {}),
  };
}
