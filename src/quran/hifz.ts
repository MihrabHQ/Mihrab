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
/**
 * The green as text or an outline. On a dark page the fill green is under
 * 3:1 against the card; this one is over 7:1 there and stays HIFZ_COLOR on
 * a light page. Fills carrying white keep HIFZ_COLOR (5:1 with white).
 */
export function hifzInk(isDark: boolean): string {
  return isDark ? '#7fd3a3' : HIFZ_COLOR;
}

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
 * those equally due, in the order of the muṣḥaf. The day asks for `budget`
 * recitations: what was recited today counts towards it, `shown` is what is
 * left of it, and `more` is what waits for another day. A recitation moves
 * its portion's due date on, so `due` never holds one recited today.
 */
export function todaysRevision(state: HifzState, today: string): { due: HifzPortion[]; shown: HifzPortion[]; more: number } {
  const due = state.portions
    .filter(p => overdueBy(p, today) >= 0)
    .sort((a, b) => overdueBy(b, today) - overdueBy(a, today) || a.start - b.start);
  const left = Math.max(0, Math.max(1, budgetOf(state)) - recitedToday(state, today).length);
  const shown = due.slice(0, left);
  return { due, shown, more: due.length - shown.length };
}

/**
 * How far ahead a portion is offered to practise before it is due, days:
 * tomorrow and the day after. A week ahead filled the four cards with
 * portions far from mattering while today's were still waiting.
 */
export const PRACTISE_WITHIN = 2;

/** Whether the last recitation of a portion needed help. */
export function neededHelpLast(p: HifzPortion): boolean {
  return p.reviews.length > 0 && p.reviews[p.reviews.length - 1].grade === 'again';
}

/**
 * What to practise: today's portions not yet marked done first — the most
 * overdue first, then the muṣḥaf's order — and after them the ones coming
 * up tomorrow and the day after (`PRACTISE_WITHIN`), a portion that needed
 * help last time a day sooner than its date. Four at most.
 *
 * So the cards follow the day: while today's revision is open its portions
 * are here to rehearse before reciting them; marking one done moves its
 * due date on and takes it out (a recitation today counts as done), and
 * tomorrow's and the day after's take the room it leaves. Practising
 * itself records nothing (the reader's practice mode), so it never marks
 * a portion done or moves the schedule.
 */
export function practiseAhead(state: HifzState, today: string, max = 4): HifzPortion[] {
  const recited = new Set(recitedToday(state, today).map(p => p.id));
  const open = state.portions.filter(p => !recited.has(p.id));
  const dueNow = open
    .filter(p => overdueBy(p, today) >= 0)
    .sort((a, b) => overdueBy(b, today) - overdueBy(a, today) || a.start - b.start);
  const coming = open
    .map(p => ({ p, days: daysBetween(today, p.due) }))
    .filter(({ days }) => days > 0)
    .map(x => ({ ...x, rank: x.days - (neededHelpLast(x.p) ? 1 : 0) }))
    .filter(({ rank }) => rank <= PRACTISE_WITHIN)
    .sort((a, b) => a.rank - b.rank || a.days - b.days || a.p.start - b.p.start)
    .map(x => x.p);
  return [...dueNow, ...coming].slice(0, max);
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

/**
 * A portion KNOWN for a long time rather than being learned now: it joins
 * the long cycle (`interval` the cap) on the day of the cycle with the
 * fewest portions due, so marking Juz' 30 lays its 37 surahs over the
 * month instead of putting all of them on tomorrow, and a surah added
 * later finds the quietest day. Equal days: the earliest.
 */
function knownPortion(state: HifzState, start: number, end: number, today: string, now: number): HifzPortion {
  const cap = capOf(state);
  const load = new Map<string, number>();
  for (const p of state.portions) load.set(p.due, (load.get(p.due) ?? 0) + 1);
  let best = addDays(today, 1);
  let least = Infinity;
  for (let d = 1; d <= cap; d++) {
    const day = addDays(today, d);
    const n = load.get(day) ?? 0;
    if (n < least) {
      least = n;
      best = day;
    }
  }
  return { ...newPortion(start, end, today, now), interval: cap, due: best };
}

/**
 * How a newly marked range enters the schedule. `learning` — memorised now
 * (from the reader, a drill): daily first, then out as it holds. `known` —
 * memorised long ago (the grid, the juz' chips, the part sheet): straight
 * into the long cycle, spread over it.
 */
export type HifzMarkAs = 'learning' | 'known';

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

/** The share of a surah's ayahs held, 0 to 1. */
export function surahShare(state: HifzState, surah: number): number {
  const s = ayahIndexOf(surah, 1);
  const e = ayahIndexOf(surah, ayahCount(surah));
  let held = 0;
  for (const p of state.portions) {
    const lo = Math.max(s, p.start);
    const hi = Math.min(e, p.end);
    if (hi >= lo) held += hi - lo + 1;
  }
  return held / (e - s + 1);
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
export function markRange(
  state: HifzState,
  start: number,
  end: number,
  today: string,
  now: number,
  as: HifzMarkAs = 'learning',
): HifzState {
  if (!(start >= 1 && end >= start && end <= TOTAL_AYAHS)) return state;
  // Joined: overlapping, or end to end within one surah (the stretch grown
  // "up to here"). Two whole surahs side by side stay two portions.
  const sameSurah = (a: number, b: number) => ayahAtIndex(a).surah === ayahAtIndex(b).surah;
  const touching = state.portions.filter(
    p => (p.start <= end && p.end >= start) || (p.end + 1 === start && sameSurah(p.end, start)) || (end + 1 === p.start && sameSurah(end, p.start)),
  );
  if (touching.length === 0) {
    const fresh = as === 'known' ? knownPortion(state, start, end, today, now) : newPortion(start, end, today, now);
    return { ...state, portions: [...state.portions, fresh].sort((a, b) => a.start - b.start) };
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

export function markSurah(state: HifzState, surah: number, today: string, now: number, as: HifzMarkAs = 'learning'): HifzState {
  return markRange(state, ayahIndexOf(surah, 1), ayahIndexOf(surah, ayahCount(surah)), today, now, as);
}

/** "Memorised up to here": from the surah's first ayah (or the held stretch before it) to this ayah. */
export function markUpTo(state: HifzState, surah: number, ayah: number, today: string, now: number): HifzState {
  return markRange(state, ayahIndexOf(surah, 1), ayahIndexOf(surah, ayah), today, now);
}

/**
 * Take a range out of the stock: whatever lies inside it goes, and a portion
 * reaching past either end keeps the part outside — with its schedule, since
 * the part still known is as known as it was.
 */
export function unmarkRange(state: HifzState, start: number, end: number, now: number): HifzState {
  const inside = state.portions.filter(p => p.start <= end && p.end >= start);
  if (inside.length === 0) return state;
  // The part before the range keeps the portion's id — it is the same
  // portion, shorter, and a merge reads it as an edit (newest `updatedAt`)
  // rather than a removal and a stranger. Failing that, the part after
  // does. Only a portion with nothing left is removed, with a tombstone.
  const gone = inside.filter(p => p.start >= start && p.end <= end).map(p => p.id);
  const next = remove(state, gone, now);
  const pieces: HifzPortion[] = [];
  for (const p of inside) {
    const head = p.start < start ? { start: p.start, end: start - 1 } : null;
    const tail = p.end > end ? { start: end + 1, end: p.end } : null;
    if (!head && !tail) continue;
    const first = head ?? tail!;
    pieces.push({ ...p, ...first, updatedAt: now });
    if (head && tail) {
      pieces.push({ ...newPortion(tail.start, tail.end, dayOf(now), now), interval: p.interval, due: p.due, reviews: p.reviews });
    }
  }
  const kept = new Set(pieces.map(p => p.id));
  return {
    ...next,
    portions: [...next.portions.filter(p => !kept.has(p.id)), ...pieces].sort((a, b) => a.start - b.start),
  };
}

/** Take a surah out of the stock: every portion in it, and the parts of portions that reach into it. */
export function unmarkSurah(state: HifzState, surah: number, now: number): HifzState {
  return unmarkRange(state, ayahIndexOf(surah, 1), ayahIndexOf(surah, ayahCount(surah)), now);
}

/**
 * "Not by heart from here": the portion holding this ayah ends before it.
 * The tail is what is forgotten, as a rule; the head keeps its schedule.
 * From the portion's first ayah, it is the whole portion.
 */
export function unmarkFrom(state: HifzState, surah: number, ayah: number, now: number): HifzState {
  const p = portionAt(state, surah, ayah);
  if (!p) return state;
  return unmarkRange(state, ayahIndexOf(surah, ayah), p.end, now);
}

/**
 * Undo a removal: the portion back as it was — its schedule and its
 * recitations — stamped now, so it outranks its own tombstone in a merge
 * (`removedAfter` keeps a portion edited after its removal). If something
 * has been marked over it since, the two join as any marking does.
 */
export function restorePortion(state: HifzState, p: HifzPortion, today: string, now: number): HifzState {
  if (state.portions.some(q => q.start <= p.end && q.end >= p.start)) {
    return markRange(state, p.start, p.end, today, now);
  }
  return { ...state, portions: [...state.portions, { ...p, updatedAt: now }].sort((a, b) => a.start - b.start) };
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
