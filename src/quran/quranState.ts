/**
 * Quran reader state — QR-10/12/19/21 (docs/quran-reader-plan.md).
 *
 * Feature-local persistent store for everything the reader remembers:
 * last-read position, bookmarks, starred ayahs, khatmah plans, and
 * playback/memorization preferences. Deliberately its OWN AsyncStorage
 * blob (`mihrab.quran.v1`) rather than a new field on the settings
 * context — the reader state changes on every page turn and must not
 * re-render every settings consumer in the app.
 *
 * Pattern: module-level in-memory state + subscriber set, exposed to
 * React via `useSyncExternalStore` (see `useQuranState`). All writes are
 * serialized through a mutex like `prayerStorage.ts` so a page-turn
 * write can't race a bookmark write and drop data.
 *
 * Schema is additive-only (same rule as the settings blob).
 */
// tokens-ok: the five bookmark colours and the khatmah marker are a named, user-facing set the reader keys on
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOTAL_AYAHS, ayahIndexOf } from './ayahIndex';
import { firstAyahOfPage } from './pages';
import { DEFAULT_RIWAYAH, coerceRiwayahId, type RiwayahId } from './riwayat';
import {
  addRange,
  applyMarks,
  compactMarks,
  contiguousFrom,
  normalizeRanges,
  rangesCover,
  rangesEqual,
  subtractRange,
  type AyahMark,
  type AyahRange,
} from './khatmahDone';
import {
  claimReadingSession,
  noteReadingMoved,
  noteReadingPlaced,
  readingSessionOwner,
  releaseReadingOwner,
} from './readingSession';
import type {
  BookmarkColor,
  KhatmahPlan,
  LastRead,
  QuranBookmark,
  QuranPrefs,
  QuranState,
  Removal,
} from './quranTypes';
import {
  activeKhatmah,
  ayahsThroughHafsPage,
  ayahsThroughPage,
  isLivePlan,
  KHATMAH_TOMBSTONE_TTL_DAYS,
  KHATMAH_TOTAL_PAGES,
  khatmahAyahsRead,
  khatmahCurrentPage,
  khatmahDone,
  khatmahReachAyah,
  khatmahReachPage,
  khatmahStartAyah,
  localYmd,
  pagesThroughAyahs,
  planFrom,
  resetKhatmahGapMemo,
} from './khatmahProgress';
import {
  khatmahCreditWindow,
  khatmahCurrentPortion,
  khatmahDeadline,
  khatmahPaceToday,
  khatmahPageInWindow,
  paceStillFits,
  planDays,
  portionEnd,
} from './khatmahSchedule';
import {
  khatmahDurationForDaysLeft,
  khatmahFinishTarget,
} from './khatmahStatus';

// Moved out in the rewrite plan's step 2.2 and re-exported, so every
// importer is unchanged until step 2.5 points it at the new home.
export type {
  BookmarkColor,
  QuranBookmark,
  LastRead,
  KhatmahPlan,
  RepeatSettings,
  QuranPrefs,
  QuranState,
  Removal,
} from './quranTypes';
export {
  KHATMAH_TOTAL_PAGES,
  KHATMAH_TOTAL_AYAHS,
  KHATMAH_TOMBSTONE_TTL_DAYS,
  isLivePlan,
  activeKhatmah,
  ayahsThroughPage,
  pagesThroughAyahs,
  khatmahStartAyah,
  khatmahAyahsRead,
  khatmahDone,
  khatmahCoversPage,
  isKhatmahPageDone,
  khatmahReachAyah,
  khatmahReachPage,
  khatmahIsComplete,
  khatmahOnlyGapsLeft,
  khatmahUnreadAyahs,
  khatmahGapPages,
  khatmahUnreadPages,
  khatmahCurrentPage,
} from './khatmahProgress';
export {
  khatmahDeadline,
  planDays,
  khatmahDatePassed,
  khatmahDayAnchor,
  khatmahPaceToday,
  khatmahPortionOf,
  khatmahPortion,
  khatmahReachPortion,
  khatmahCurrentPortion,
  khatmahCreditWindow,
  khatmahPageInWindow,
  khatmahGap,
} from './khatmahSchedule';
export type { KhatmahPortion, KhatmahGapReport } from './khatmahSchedule';
export {
  khatmahRealizedPace,
  khatmahPerDayPages,
  khatmahPaceOutgrown,
  khatmahBehindBy,
  khatmahDay,
  khatmahFinishTarget,
  khatmahMarkerAyah,
  khatmahDaysLeft,
  khatmahPages,
  khatmahDurationForDaysLeft,
} from './khatmahStatus';
export type { KhatmahDayState, KhatmahPages } from './khatmahStatus';

/** The Quran blob's key. Exported so the snapshot layer names it once. */
export const QURAN_STORAGE_KEY = 'mihrab.quran.v1';
const STORAGE_KEY = QURAN_STORAGE_KEY;

export const BOOKMARK_COLORS: Record<BookmarkColor, string> = {
  emerald: '#12805c',
  sapphire: '#2a5db0',
  amber: '#b07d1a',
  rose: '#b03a5b',
  violet: '#6d4bb0',
};

/** Reserved highlight color for the khatmah position (distinct from the
 *  five bookmark colors — cyan, used nowhere else in the reader). */
export const KHATMAH_COLOR = '#0891b2';

/**
 * Reading done BEYOND the day's portion, on the progress bars.
 *
 * Gold rather than another shade of the accent because it is not more of
 * the same thing: the day's own reading is the plan being kept, and this
 * is the reader going further than they undertook to. It never appears in
 * the muṣḥaf itself, where the khatmah speaks in one colour only, so
 * there is nothing for it to be confused with.
 */
export const KHATMAH_EXTRA_COLOR = '#c9a227';

/**
 * The reading marker's colour — issue #41 — reserved like the khatmah's.
 *
 * Terracotta: warm where the khatmah is cool, and unlike every bookmark
 * colour (the amber is golden, the rose is a magenta), so the two
 * trails can be told apart at a glance on a page that carries both. It
 * is drawn as a wash under the ayah AND as the ink of the ayah's own
 * end-medallion, which is what lets it share an ayah with a khatmah mark
 * or a bookmark: the wash yields to theirs, the medallion stays.
 */
export const READING_COLOR = '#c8552b';

/** The window a removal has to reach every device — the repo's ninety days. */
export const REMOVAL_TTL_DAYS = 90;
/** At most this many removals travel in the blob, newest kept. */
export const REMOVAL_LIMIT = 256;

/**
 * Both sides' removals, each id once, keeping the LATEST claim for it.
 *
 * Latest rather than earliest: a row removed, re-made and removed again
 * is gone, and the second removal is the one that says so past the
 * re-making. Commutative and idempotent, which is what the merge needs.
 */
export function mergeRemovals(
  a: readonly Removal[] = [],
  b: readonly Removal[] = [],
  now: number = Date.now(),
): Removal[] {
  const byId = new Map<string, number>();
  for (const r of [...a, ...b]) {
    const had = byId.get(r.id);
    if (had === undefined || r.at > had) byId.set(r.id, r.at);
  }
  const cutoff = now - REMOVAL_TTL_DAYS * 24 * 60 * 60 * 1000;
  return [...byId.entries()]
    .filter(([, at]) => at >= cutoff)
    .map(([id, at]) => ({ id, at }))
    .sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1))
    .slice(-REMOVAL_LIMIT);
}

/** A removal newer than the thing it removes wins; anything else loses. */
export function removedAfter(
  removals: readonly Removal[],
  id: string,
  stamp: number,
): boolean {
  const at = removals.find(r => r.id === id)?.at;
  return at !== undefined && at >= stamp;
}

function coerceRemovals(v: unknown): Removal[] {
  if (!Array.isArray(v)) return [];
  const out: Removal[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) continue;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) continue;
    out.push({ id: r.id, at: r.at });
  }
  // The same prune the merge does, so a blob on disk cannot grow past
  // what a merge would have kept.
  return mergeRemovals(out, []);
}

export const DEFAULT_QURAN_STATE: QuranState = {
  version: 1,
  lastRead: null,
  bookmarks: [],
  starred: [],
  khatmah: [],
  prefs: {
    reciterId: 'husary',
    playbackRate: 1,
    mushafNightMode: false,
    mushafPaperTone: 'paper',
    mushafToneAuto: true,
    riwayah: DEFAULT_RIWAYAH,
    riwayahNoticeSeen: false,
    bookmarkFollowDefault: 'follow',
    keepAwake: true,
    readerKeepAwake: true,
    wordReader: false,
    wordReaderReciterId: '',
    tajweedColours: false,
    hideMode: 'none',
    repeat: { eachAyah: 1, range: 1, pauseFactor: 0 },
    votdMode: 'translation',
    companionMode: 'translation',
    tafsirEditionId: '',
    verseOfDayOpen: false,
    shuffleSurahs: false,
    tilawahShowPage: true,
  },
};

let state: QuranState = DEFAULT_QURAN_STATE;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

// Serialize writes: each setItem awaits the previous one (prayerStorage
// pattern) so concurrent updates can't interleave stale snapshots.
let writeMutex: Promise<void> = Promise.resolve();

function emit(): void {
  for (const l of listeners) l();
}

const VALID_BOOKMARK_COLORS = new Set<string>(Object.keys(BOOKMARK_COLORS));

function int(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  return n >= min && n <= max ? n : null;
}

function coerceBookmark(v: unknown): QuranBookmark | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const surah = int(r.surah, 1, 114);
  const ayah = int(r.ayah, 1, 286);
  const page = int(r.page, 1, 604);
  if (surah === null || ayah === null || page === null) return null;
  if (typeof r.id !== 'string' || !r.id) return null;
  const color =
    typeof r.color === 'string' && VALID_BOOKMARK_COLORS.has(r.color)
      ? (r.color as BookmarkColor)
      : 'emerald';
  const createdAt =
    typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
      ? r.createdAt
      : 0;
  const out: QuranBookmark = { id: r.id, surah, ayah, page, color, createdAt };
  // Only when set: a key written onto a bookmark that never had it makes
  // a snapshot merged with itself stop equalling itself.
  if (r.follows === true) out.follows = true;
  if (typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)) {
    out.updatedAt = r.updatedAt;
  }
  return out;
}

function coerceKhatmah(v: unknown): KhatmahPlan | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const startedAt =
    typeof r.startedAt === 'number' && Number.isFinite(r.startedAt)
      ? r.startedAt
      : 0;
  const targetDays = int(r.targetDays, 1, 3650) ?? 30;
  // CLAMPED, not rejected. `pagesRead` is a high-water mark of someone's
  // reading; an out-of-range value is a bad number, but resetting it to 0
  // would throw away the progress it was reporting. 604 is the mushaf.
  const pagesRead =
    typeof r.pagesRead === 'number' && Number.isFinite(r.pagesRead)
      ? Math.min(604, Math.max(0, Math.floor(r.pagesRead)))
      : 0;
  const completedAt =
    typeof r.completedAt === 'number' && Number.isFinite(r.completedAt)
      ? r.completedAt
      : null;
  const abandonedAt =
    typeof r.abandonedAt === 'number' && Number.isFinite(r.abandonedAt)
      ? r.abandonedAt
      : null;
  // Expired tombstones are dropped rather than carried: past the TTL the
  // plan is gone everywhere and the row is pure weight in every sealed
  // file. `coerceSunnahLog` prunes on exactly this reasoning.
  if (
    abandonedAt != null &&
    Date.now() - abandonedAt > KHATMAH_TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000
  ) {
    return null;
  }
  const out: KhatmahPlan = {
    id: r.id,
    startedAt,
    targetDays,
    pagesRead,
    completedAt,
  };
  if (abandonedAt != null) out.abandonedAt = abandonedAt;
  const p = r.position;
  if (p && typeof p === 'object') {
    const surah = int((p as Record<string, unknown>).surah, 1, 114);
    const ayah = int((p as Record<string, unknown>).ayah, 1, 286);
    const page = int((p as Record<string, unknown>).page, 1, 604);
    if (surah !== null && ayah !== null && page !== null) {
      out.position = { surah, ayah, page };
    }
  }
  /**
   * Kept even when the pin itself is gone — that pairing IS the claim
   * "there is no pin, and here is when I said so". A stamp with no
   * position is what a cleared pin looks like on the wire, and dropping
   * it would put the pin back on the next merge. See `positionAt`.
   */
  if (typeof r.positionAt === 'number' && Number.isFinite(r.positionAt)) {
    out.positionAt = r.positionAt;
  }
  // One short of the book: see `planFrom`.
  const fp = int(r.fromPage, 0, 603);
  if (fp !== null && fp > 0) out.fromPage = fp;
  const dsp = int(r.dayStartPagesRead, 0, 604);
  if (dsp !== null) out.dayStartPagesRead = dsp;
  // Clamped to the ayah count for the same reason `pagesRead` is clamped
  // to the page count: a bad number is still someone's reading.
  const ar = int(r.ayahsRead, 0, TOTAL_AYAHS);
  if (ar !== null) out.ayahsRead = ar;
  const dsa = int(r.dayStartAyahsRead, 0, TOTAL_AYAHS);
  if (dsa !== null) out.dayStartAyahsRead = dsa;
  if (Array.isArray(r.done)) {
    const ranges = normalizeRanges(r.done as AyahRange[], TOTAL_AYAHS);
    if (ranges.length > 0) out.done = ranges;
  }
  if (Array.isArray(r.marks)) {
    const cutoff =
      Date.now() - KHATMAH_TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const marks = (r.marks as unknown[])
      .map(m => coerceMark(m))
      .filter((m): m is AyahMark => m !== null)
      // The same ninety days the other tombstones keep. A claim older
      // than that has had every chance to reach every device.
      .filter(m => m[2] >= cutoff)
      .sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    // Resolved as it is read, so a log that arrived from a merge — two
    // devices' claims unioned, overlapping — is stored as the verdicts it
    // amounts to. The cap is a backstop behind that; see `compactMarks`.
    const compacted = compactMarks(marks, TOTAL_AYAHS).slice(-KHATMAH_MARK_LIMIT);
    if (compacted.length > 0) out.marks = compacted;
  }
  if (typeof r.dayStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dayStartDate)) {
    out.dayStartDate = r.dayStartDate;
  }
  /**
   * The pacing and its stamp travel together, and the stamp survives a
   * deadline that has been taken OFF — that pairing is the claim "this
   * plan is a duration again, and here is when I said so", exactly as a
   * cleared pin is a `positionAt` with no position.
   */
  if (typeof r.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline)) {
    out.deadline = r.deadline;
  }
  /**
   * `deadlineAt` is what this was called while the stamp covered only the
   * date (2.25 development builds). Read as the same thing, because it
   * WAS the same thing: the moment the plan was last paced.
   */
  const stamp = typeof r.pacedAt === 'number' ? r.pacedAt : r.deadlineAt;
  // A positive instant, or nothing: zero is what the merge reads as "no
  // stamp", and a negative one would out-rank nothing and mean nothing.
  if (typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0) {
    out.pacedAt = stamp;
  }
  // Where and when that decision was made. Only alongside a stamp: on
  // their own they date nothing, and the schedule they would move is the
  // one thing a stray number must not be allowed to move.
  if (out.pacedAt !== undefined) {
    const at = int(r.pacedFrom, 0, KHATMAH_TOTAL_PAGES);
    if (at !== null) out.pacedFrom = at;
    if (typeof r.pacedDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.pacedDay)) {
      out.pacedDay = r.pacedDay;
    }
  }
  // The day's cut, and only on a plan that still has a date to pace
  // against — a stale one on a duration plan would be read by nothing and
  // synced by everything.
  if (out.deadline && r.pace && typeof r.pace === 'object') {
    const pc = r.pace as Record<string, unknown>;
    const day = typeof pc.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pc.day)
      ? pc.day
      : null;
    const from = int(pc.from, 1, TOTAL_AYAHS);
    const to = int(pc.to, 1, TOTAL_AYAHS);
    /**
     * NOT A DAY THAT HAS NOT HAPPENED YET. A device whose clock ran
     * ahead — or that was set forward and back — pins a cut dated in the
     * future; it is ignored for display (the day key will not match) but
     * it would out-rank every real cut in the merge, for as long as it
     * took the calendar to catch up, and the other device would keep
     * being handed a portion nobody had opened. Tomorrow's is allowed:
     * it is what a device an hour ahead of the day boundary writes.
     */
    const stale = day !== null && day > dayKeyAfter(localYmd(), 1);
    if (day !== null && !stale && from !== null && to !== null && to >= from) {
      out.pace = { day, from, to };
      if (typeof pc.at === 'number' && Number.isFinite(pc.at) && pc.at > 0) {
        out.pace.at = Math.trunc(pc.at);
      }
    }
  }
  return out;
}

/** At most this many claims travel with a plan — newest kept. */
/**
 * A backstop, not a budget. The log is one claim per page the plan has
 * read plus its denials (`compactMarks`), so a plan that has read the
 * whole book holds about six hundred; the cap only ever bites a log
 * that has gone wrong, and takes the oldest claims first.
 */
const KHATMAH_MARK_LIMIT = 1024;

function coerceMark(v: unknown): AyahMark | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const [from, to, at, read] = v as unknown[];
  const ok = (n: unknown, lo: number, hi: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi
      ? Math.trunc(n)
      : null;
  const f = ok(from, 1, TOTAL_AYAHS);
  const t = ok(to, 1, TOTAL_AYAHS);
  const a = ok(at, 1, Number.MAX_SAFE_INTEGER);
  if (f === null || t === null || a === null || t < f) return null;
  return [f, t, a, read === 1 ? 1 : 0];
}

function coerceLastRead(v: unknown): LastRead | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const surah = int(r.surah, 1, 114);
  const ayah = int(r.ayah, 1, 286);
  const page = int(r.page, 1, 604);
  if (surah === null || ayah === null || page === null) return null;
  return {
    surah,
    ayah,
    page,
    mode: r.mode === 'mushaf' ? 'mushaf' : 'withTranslation',
    updatedAt:
      typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)
        ? r.updatedAt
        : 0,
    ...(r.pinned === true ? { pinned: true } : {}),
  };
}

/**
 * Validate a Quran blob item by item.
 *
 * This used to be a shallow merge that trusted any array it found, which was
 * defensible while the only writer was this app's own store. It is not
 * defensible now that the same shape arrives from an exported file or
 * another device: a bookmark pointing at page 9000, or a khatmah claiming
 * 700 pages read, would be written straight back to disk and then drawn.
 * Every field is range-checked against the mushaf it has to index into, and
 * an item that cannot be repaired is dropped rather than kept as a
 * half-object nothing downstream expects.
 */
export function coerceQuranState(raw: unknown): QuranState {
  return mergeStored(raw);
}

/**
 * A stored `bookmarkFollowDefault`, or `fixed` for a blob without one.
 *
 * The default in `DEFAULT_QURAN_STATE` is `follow`, which is right for a
 * fresh install and wrong to apply retroactively: a reader with twenty
 * coloured pins did not ask for them to start walking.
 */
function coerceFollowDefault(v: unknown): QuranPrefs['bookmarkFollowDefault'] {
  return v === 'follow' || v === 'ask' ? v : 'fixed';
}

/** Merge a possibly-older stored blob over the defaults (additive schema). */
function mergeStored(raw: unknown): QuranState {
  if (!raw || typeof raw !== 'object') return DEFAULT_QURAN_STATE;
  const r = raw as Partial<QuranState>;
  const removedBookmarks = coerceRemovals(r.bookmarksRemoved);
  const removedStars = coerceRemovals(r.starsRemoved);
  const starsAt: Record<string, number> = {};
  if (r.starsAt && typeof r.starsAt === 'object') {
    for (const [k, v] of Object.entries(r.starsAt as Record<string, unknown>)) {
      if (!/^\d{1,3}:\d{1,3}$/.test(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) starsAt[k] = v;
    }
  }
  const keptStars = Array.isArray(r.starred)
    ? new Set(
        [
          ...new Set(
            r.starred.filter(
              (k): k is string =>
                typeof k === 'string' && /^\d{1,3}:\d{1,3}$/.test(k),
            ),
          ),
        ].filter(k => !removedAfter(removedStars, k, starsAt[k] ?? 0)),
      )
    : new Set<string>();
  const liveStarsAt: Record<string, number> = {};
  for (const [k, at] of Object.entries(starsAt)) {
    if (keptStars.has(k)) liveStarsAt[k] = at;
  }
  return {
    version: 1,
    lastRead: coerceLastRead(r.lastRead),
    bookmarks: Array.isArray(r.bookmarks)
      ? r.bookmarks
          .map(coerceBookmark)
          .filter((b): b is QuranBookmark => b !== null)
          // A bookmark a tombstone has already buried never comes back
          // out of the blob, whichever order the two were written in.
          .filter(b => !removedAfter(removedBookmarks, b.id, b.updatedAt ?? b.createdAt))
      : [],
    starred: Array.isArray(r.starred)
      ? [
          ...new Set(
            r.starred.filter(
              (s): s is string =>
                typeof s === 'string' && /^\d{1,3}:\d{1,3}$/.test(s),
            ),
          ),
        ].filter(k => keptStars.has(k))
      : [],
    khatmah: Array.isArray(r.khatmah)
      ? r.khatmah.map(coerceKhatmah).filter((k): k is KhatmahPlan => k !== null)
      : [],
    prefs: {
      ...DEFAULT_QURAN_STATE.prefs,
      ...(r.prefs ?? {}),
      // Coerced, NOT resolved. An unknown id becomes Hafs, but a known
      // one is kept whether or not this device currently has its data —
      // the muṣḥaf is read from disk asynchronously and may not have
      // arrived yet, and resolving here would quietly overwrite the
      // reader's choice with Hafs on the next preference write. See
      // `coerceRiwayahId`.
      riwayah: coerceRiwayahId(
        (r.prefs as Record<string, unknown> | undefined)?.riwayah as
          | string
          | undefined,
      ),
      repeat: {
        ...DEFAULT_QURAN_STATE.prefs.repeat,
        ...(r.prefs?.repeat ?? {}),
      },
      // Migration (v2.7.40): blobs written before `companionMode` existed
      // seed it from the legacy votd-only toggle so a "tafsir" choice on
      // the verse-of-the-day card carries over to the app-wide mode.
      companionMode:
        r.prefs?.companionMode ??
        r.prefs?.votdMode ??
        DEFAULT_QURAN_STATE.prefs.companionMode,
      // Anything but the one other light tone is paper — a blob from
      // before the field existed, or a value no build has written.
      mushafPaperTone:
        (r.prefs as { mushafPaperTone?: unknown } | undefined)
          ?.mushafPaperTone === 'sepia'
          ? 'sepia'
          : 'paper',
      // Only an explicit true is auto: a blob written before the field
      // existed chose a tone, and keeps it.
      mushafToneAuto:
        (r.prefs as { mushafToneAuto?: unknown } | undefined)?.mushafToneAuto === true,
      // A blob from before the field keeps the behaviour it had: fixed
      // pins. Only a fresh install gets the default above.
      bookmarkFollowDefault: coerceFollowDefault(
        (r.prefs as { bookmarkFollowDefault?: unknown } | undefined)
          ?.bookmarkFollowDefault,
      ),
      // On unless it was explicitly turned off, and the old shared flag
      // is NOT consulted: a coffee cup switched off during Tilāwah was
      // never a decision about the muṣḥaf.
      readerKeepAwake:
        (r.prefs as { readerKeepAwake?: unknown } | undefined)
          ?.readerKeepAwake !== false,
      tajweedColours:
        (r.prefs as { tajweedColours?: unknown } | undefined)?.tajweedColours === true,
    },
    // Kept if it is there and sane, and LEFT OUT otherwise rather than
    // written as 0: an export of a blob that never had it must round-trip
    // to itself, key for key.
    ...(typeof r.prefsUpdatedAt === 'number' && r.prefsUpdatedAt > 0
      ? { prefsUpdatedAt: r.prefsUpdatedAt }
      : {}),
    // Same rule for the tombstones: present when there are any, absent
    // when there are none, so a blob that never removed anything stays
    // exactly the blob it was.
    ...(removedBookmarks.length > 0 ? { bookmarksRemoved: removedBookmarks } : {}),
    ...(removedStars.length > 0 ? { starsRemoved: removedStars } : {}),
    // A stamp for a star that is not there says nothing, and a blob that
    // holds one does not survive a merge unchanged — the merge prunes it,
    // so the store has to as well or `merge(a, a) === a` fails on a state
    // only the disk can hold. Caught by the fuzz in
    // `syncMergeProperties.test.ts`.
    ...(Object.keys(liveStarsAt).length > 0 ? { starsAt: liveStarsAt } : {}),
  };
}

/** Load the blob once. Safe to call repeatedly. */
export function hydrateQuranState(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) state = mergeStored(JSON.parse(raw));
    } catch (e) {
      console.warn('quranState: hydrate failed, using defaults', e);
    } finally {
      hydrated = true;
      emit();
    }
  })();
  return hydrating;
}

/**
 * Adopt a blob the caller has just written to disk itself.
 *
 * Backup restore writes `mihrab.quran.v1` straight to AsyncStorage, because
 * it is merging whole categories rather than making one edit. That left this
 * module holding the pre-restore state with `hydrated` already true — so
 * `hydrateQuranState()` no-opped, every reader kept the old value, and the
 * widget's reading block described a position the user had just replaced.
 * It corrected itself on the next process start, which is not a thing a
 * restore should require.
 *
 * Deliberately does NOT persist: the caller wrote it, and writing it back
 * would race their write with ours over the same key.
 */
export function primeQuranState(raw: unknown): void {
  state = mergeStored(raw);
  hydrated = true;
  emit();
}

/**
 * Adopt a blob AND write it, through this store's own queue.
 *
 * For a sync round: the merged result is what the store should hold
 * next, and the write has to go through `persist` rather than straight
 * to the key, or a page turned in the same instant — whose own write is
 * already queued behind the mutex — would be overwritten by a slower
 * write of the older result landing after it (see `writeData`).
 */
export function adoptQuranState(raw: unknown): void {
  primeQuranState(raw);
  persist();
}

/**
 * Set while a write is queued for the end of the current tick, so a burst of
 * updates lands on disk as ONE write of the state they left behind.
 *
 * A page turn is two updates — the last-read position, then the khatmah's
 * progress — and each used to serialise the whole store and hand it to
 * AsyncStorage on its own. The second write carried everything the first
 * had, a tick later. Deferring to a microtask keeps every update visible to
 * readers immediately (`emit` is synchronous, above) and coalesces the
 * writes; anything `await`ed, which is everything that reads the store back,
 * runs after the flush.
 */
let persistQueued = false;

function persist(): void {
  if (persistQueued) return;
  persistQueued = true;
  void Promise.resolve().then(() => {
    persistQueued = false;
    const snapshot = state;
    writeMutex = writeMutex
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)))
      .catch(e => {
        console.warn('quranState: persist failed', e);
      });
  });
}

export function getQuranState(): QuranState {
  return state;
}

export function updateQuranState(
  updater: (prev: QuranState) => QuranState,
): void {
  state = updater(state);
  emit();
  persist();
}

export function subscribeQuranState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — subscribes narrowly via useSyncExternalStore. */
export function useQuranState(): QuranState {
  return useSyncExternalStore(subscribeQuranState, getQuranState, getQuranState);
}

/**
 * Whether the stored blob has been read yet.
 *
 * Until it has, every reader of this store is being served DEFAULTS, and the
 * one that shows is `mushafNightMode: false` — so a reader opened before the
 * read completes paints its page pure white and then flips to black once the
 * real preference lands. On a phone that is a frame nobody sees; on a 5K Mac
 * window it is a full-screen white flash, which is what this exists to let the
 * reader avoid. Anything whose colour depends on a stored preference should
 * wait for this rather than render a default it is about to contradict.
 */
export function isQuranHydrated(): boolean {
  return hydrated;
}

export function useQuranHydrated(): boolean {
  return useSyncExternalStore(
    subscribeQuranState,
    isQuranHydrated,
    isQuranHydrated,
  );
}

// ── Convenience mutations ────────────────────────────────────────────

export function setLastRead(pos: Omit<LastRead, 'updatedAt'>): void {
  updateQuranState(prev => ({
    ...prev,
    lastRead: { ...pos, updatedAt: Date.now() },
  }));
}

/**
 * How near a page has to be to the khatmah's own page to be its reading.
 *
 * Two, not one: a spread turns two pages at a time, and a turn that lands
 * two ahead of the plan's page is the plan being read on an iPad, not a
 * reader who went somewhere else.
 */
const KHATMAH_PAGE_REACH = 2;

/**
 * Is this page where the khatmah is being read — the plan's own next
 * page, or the one beside it?
 *
 * Narrower than `khatmahTracksPage`, and on purpose: that answers "does
 * reading here count towards the plan", and it says yes to every page
 * behind the frontier because re-reading is still the khatmah's ground.
 * This answers "is the reader on the khatmah's page RIGHT NOW", which is
 * what decides whether the reading marker (below) should follow them.
 * A page well behind the frontier is not the khatmah's reading; it is
 * someone reading Al-Baqarah on a Tuesday while their plan sits in juz
 * twenty, and that is exactly the reading the marker is for.
 */
export function isKhatmahPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  s: QuranState = getQuranState(),
): boolean {
  const plan = activeKhatmah(s);
  if (!plan) return false;
  return Math.abs(page - khatmahCurrentPage(plan, riwayah)) <= KHATMAH_PAGE_REACH;
}

/**
 * Record where the reader is — issue #41.
 *
 * ── TWO TRAILS THROUGH ONE BOOK ───────────────────────────────────────
 *
 * `lastRead` is the reading marker: the place "Continue reading" hands
 * back. A khatmah is a second trail with its own marker (the plan's next
 * page, `khatmahContinueTarget`), and a reader can walk both — the plan
 * in the morning, Al-Kahf on a Friday — which is a thing this store used
 * to make impossible: every page turn wrote `lastRead`, so an evening in
 * the khatmah erased the afternoon's place in Al-Kahf, and the marker
 * was never more than "the last page looked at".
 *
 * There are three trails now, not two — a khatmah, any number of
 * bookmarks, and the marker — and the marker is the one that takes what
 * the others did not claim. Each of the two rules that hold it back is
 * written at the point it applies, below: a bookmark visit records no
 * marker at all, and the khatmah vetoes a marker that was not already
 * riding with the plan.
 */
export function recordReading(
  pos: Omit<LastRead, 'updatedAt' | 'pinned'>,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  const prev = getQuranState();
  const owner = readingSessionOwner();

  /**
   * ── A BOOKMARK VISIT IS NOT THE MARKER'S TO RECORD ────────────────
   *
   * Whatever was opened owns the turns — see `readingSession` for why
   * proximity cannot be the rule once there is more than one bookmark.
   * What follows from that, and is the whole of this branch: while a
   * bookmark owns the visit the marker does not move AT ALL.
   *
   * A bookmark IS a kept place, so a second marker trailing the same
   * reading is a duplicate of a thing the reader already has — and
   * worse, it is a duplicate that destroys something: the marker it
   * overwrites is where that reader was when they were reading from the
   * index, which is the one place nothing else remembers. Resuming a
   * bookmark for ten minutes must not cost them that.
   *
   * So neither following mode matters here. A following bookmark walks
   * with the reading; a fixed one stays where it was pinned; and in both
   * cases the marker is left alone, because in both cases the place is
   * already kept by the thing that was opened.
   *
   * Reading away from it records NOTHING, which is the honest answer:
   * someone who swipes off to look something up has not started a
   * reading anywhere, and the bookmark is not dragged after them
   * (`withinBookmarkReach`). To keep a place out there, open it from the
   * index — that visit is the marker's — or bookmark it.
   */
  if (owner?.kind === 'bookmark') {
    const b = prev.bookmarks.find(x => x.id === owner.id);
    if (b) {
      /**
       * A TURN THAT DID NOT CHANGE THE PAGE MOVES NOTHING.
       *
       * `recordReading` is given the page's FIRST ayah, so a recorded
       * turn that lands on the page the bookmark is already on would
       * rewrite a deliberately marked ayah — the reader picks 2:47,
       * something re-settles on the same page, and the bookmark says
       * 2:1 instead. There is no reading to record in that case, and
       * the precise ayah is worth more than the page start it would be
       * replaced with. It also keeps the anchor drawn, which a rewrite
       * would have quietly put out.
       */
      if (b.follows && withinBookmarkReach(b, pos) && pos.page !== b.page) {
        moveBookmark(b.id, pos);
        // Carried along by reading, so it stops being drawn: the wash
        // would otherwise reappear under the first line of every page
        // turned to, which is not a place anybody marked.
        noteReadingMoved();
      }
      return;
    }
    // Deleted mid-visit: there is no kept place any more, so the turns
    // fall to the marker like any other reading.
  }

  /**
   * ── THE KHATMAH'S VETO, WHICH GUARDS THE MARKER AND NOTHING ELSE ──
   *
   * A muṣḥaf page within reach of the plan's page leaves the marker
   * where it is, UNLESS the marker was already riding with the plan, in
   * which case it comes along. That second clause is what keeps a reader
   * with one trail exactly where they were: every marker written before
   * this existed sits on the plan's page, and a marker that stopped
   * following would have looked like a lost place. The moment such a
   * reader reads somewhere else, the marker detaches and becomes theirs;
   * the moment it is theirs, the khatmah cannot take it back.
   *
   * It is evaluated HERE, after the bookmark branch, because it is a
   * rule about the marker. It used to return from the top of the
   * function, which also froze a following bookmark that happened to be
   * read within two pages of the plan — a bookmark session silently
   * recording nothing, for a reason that had nothing to do with it.
   *
   * Translation mode always writes. Khatmah progress is credited from
   * muṣḥaf page turns and nowhere else, so a plan read in translation
   * never advances on its own — and a marker that refused to follow that
   * reading would be a place lost with nothing to point at it instead.
   */
  const marker = prev.lastRead;
  if (
    pos.mode === 'mushaf' &&
    marker &&
    isKhatmahPage(pos.page, riwayah, prev) &&
    !isKhatmahPage(marker.page, riwayah, prev)
  ) {
    return;
  }
  // Reading moves the place along, pinned or not; a pin is a correction
  // of where the marker stands, never a bookmark (those exist).
  setLastRead(pos);
}

/**
 * Pin the reading marker to an ayah by hand — the counterpart of
 * `setKhatmahPosition` for the other trail. From an ayah's own panel,
 * so a reader can say "I am here" about a place the page turns did not
 * record: a translation row scrolled past, or a muṣḥaf page whose first
 * ayah is not where they stopped.
 */
export function setReadingPosition(
  surah: number,
  ayah: number,
  page: number,
  mode: LastRead['mode'],
): void {
  setLastRead({ surah, ayah, page, mode, pinned: true });
}

/**
 * The marker as something to DRAW, or null.
 *
 * Only a pinned marker is drawn — see `LastRead.pinned`. The readers
 * ask this rather than reading `lastRead` themselves so that the rule
 * lives in one place and a mark never appears for a reader who did
 * nothing but turn the page.
 */
export function drawnReadingPosition(
  s: QuranState,
): { surah: number; ayah: number } | null {
  const m = s.lastRead;
  return m?.pinned ? { surah: m.surah, ayah: m.ayah } : null;
}

/** Whether the reading marker sits on this ayah, pinned or recorded. */
export function isReadingHere(s: QuranState, surah: number, ayah: number): boolean {
  return s.lastRead?.surah === surah && s.lastRead?.ayah === ayah;
}

/**
 * Where "Continue reading" leads, or null when there is no such place —
 * because nothing has been read, or because the marker is riding with
 * the khatmah and the khatmah's own offer already leads there. Two rows
 * to one page is one row too many; the plan's is the stronger claim.
 */
export function readingContinueTarget(
  s: QuranState,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): LastRead | null {
  const marker = s.lastRead;
  if (!marker) return null;
  // The same reach `recordReading` uses, so the two agree about what
  // "riding with the plan" means; a marker the khatmah would carry along
  // is a marker the khatmah's own row already speaks for.
  if (isKhatmahPage(marker.page, riwayah, s)) return null;
  return marker;
}

export function ayahKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

export function toggleStar(surah: number, ayah: number): void {
  const key = ayahKey(surah, ayah);
  updateQuranState(prev => {
    const on = prev.starred.includes(key);
    /**
     * BOTH HALVES OF THE TOGGLE ARE DATED (see `starsRemoved`).
     *
     * The list of stars merges by union, and a union cannot say "not
     * starred": take a star off here and the other device's list put it
     * straight back. The removal is a dated fact now — and so is the
     * star itself, or re-starring an ayah would lose to the removal it
     * came after, for ever.
     *
     * One clock for the pair, nudged past whichever of the two is newer,
     * so a star and the un-star of it cannot land on the same
     * millisecond and be replayed in the wrong order elsewhere.
     */
    const at = Math.max(
      Date.now(),
      (prev.starsAt?.[key] ?? 0) + 1,
      (prev.starsRemoved?.find(r => r.id === key)?.at ?? 0) + 1,
    );
    const starsAt = { ...(prev.starsAt ?? {}) };
    if (on) delete starsAt[key];
    else starsAt[key] = at;
    return {
      ...prev,
      starred: on ? prev.starred.filter(k => k !== key) : [...prev.starred, key],
      ...(Object.keys(starsAt).length > 0 ? { starsAt } : {}),
      ...(on
        ? { starsRemoved: mergeRemovals(prev.starsRemoved, [{ id: key, at }]) }
        : prev.starsRemoved
          ? { starsRemoved: prev.starsRemoved.filter(r => r.id !== key) }
          : {}),
    };
  });
}

export function isStarred(s: QuranState, surah: number, ayah: number): boolean {
  return s.starred.includes(ayahKey(surah, ayah));
}

/**
 * A change stamp later than the bookmark's last one.
 *
 * The merge keeps whichever copy is NEWER, by strict comparison, and the
 * wall clock is too coarse to order two changes made here in the same
 * millisecond — create and recolour, or two switch flips — so the later
 * could lose to the earlier on the other device. One past the last stamp
 * is later than it and still a time the other device can compare.
 */
function stampAfter(b: QuranBookmark): number {
  return Math.max(Date.now(), (b.updatedAt ?? b.createdAt) + 1);
}

export function addBookmark(
  surah: number,
  ayah: number,
  page: number,
  color: BookmarkColor,
  /**
   * Whether the new bookmark follows the reading. Omitted means "what the
   * reader's default says" — `ask` counts as not following until they say
   * otherwise, because a place that moves without being asked for is
   * worse than one that does not move.
   */
  follows?: boolean,
): void {
  /**
   * BOOKMARKING AN AYAH DURING A FOLLOWING SESSION MOVES THAT BOOKMARK,
   * rather than leaving a second one behind (issue #54).
   *
   * Reported from the device: open a following bookmark, read on a few
   * pages, tap an ayah and bookmark it — and you left the muṣḥaf with TWO
   * bookmarks in the same colour, one on the ayah you chose and one where
   * the following bookmark had got to. Two marks for one place, and no way
   * to tell which was which.
   *
   * The gesture means "my place is here", which is what a following
   * bookmark is for; it is the same reading, said precisely. The bookmark
   * takes the ayah and the colour that was tapped, keeps `createdAt` so it
   * stays where it was in the list, and any other pin already on that ayah
   * gives way — one bookmark per ayah, as before.
   *
   * It asks reach for itself. It used to lean on `recordReading` having
   * released the session once the reading went far enough, which is no
   * longer something that happens — a bookmark owns its visit until the
   * visit ends. Bookmarking an ayah fifty pages away is a NEW place, not
   * this one said precisely, so the reach that decides whether reading
   * moves the bookmark decides this too.
   */
  const owner = readingSessionOwner();
  if (owner?.kind === 'bookmark') {
    const session = getQuranState().bookmarks.find(b => b.id === owner.id);
    if (session?.follows && withinBookmarkReach(session, { surah, page })) {
      const at = stampAfter(session);
      updateQuranState(prev => {
        // A pin that gave way is a pin the reader no longer has, and on
        // the other device it is still there — one bookmark per ayah has
        // to be true after the sync too, not just here. See
        // `bookmarksRemoved`.
        const gaveWay = prev.bookmarks.filter(
          b => b.id !== session.id && b.surah === surah && b.ayah === ayah,
        );
        return {
          ...prev,
          bookmarks: [
            ...prev.bookmarks.filter(
              b => b.id !== session.id && !(b.surah === surah && b.ayah === ayah),
            ),
            { ...session, surah, ayah, page, color, updatedAt: at },
          ],
          ...(gaveWay.length > 0
            ? {
                bookmarksRemoved: mergeRemovals(
                  prev.bookmarksRemoved,
                  gaveWay.map(b => ({ id: b.id, at: stampAfter(b) })),
                ),
              }
            : {}),
        };
      });
      // Put here on purpose, so it is drawn again.
      noteReadingPlaced();
      return;
    }
  }
  const now = Date.now();
  updateQuranState(prev => {
    /**
     * One bookmark per ayah: re-bookmarking is a RECOLOUR, and a recolour
     * keeps the bookmark's identity. It used to make a new one and drop
     * the old, which was two bugs: the visit it owned now named a dead
     * id, so the marker quietly took over — and on the other device the
     * old id was still there, so the sync produced two bookmarks on one
     * ayah. A following bookmark recoloured is still following; a new
     * colour is not a reason to lose a place that keeps itself.
     */
    const replaced = prev.bookmarks.find(b => b.surah === surah && b.ayah === ayah);
    const wants =
      follows ?? prev.prefs.bookmarkFollowDefault === 'follow';
    const base: QuranBookmark = replaced
      ? { ...replaced, page, color, updatedAt: stampAfter(replaced) }
      : {
          id: `${now}-${Math.floor(Math.random() * 1e6)}`,
          surah,
          ayah,
          page,
          color,
          createdAt: now,
        };
    const next: QuranBookmark =
      replaced?.follows || wants
        ? { ...base, follows: true, updatedAt: base.updatedAt ?? now }
        : base;
    // Same rule as above: anything else that was sitting on this ayah has
    // given way, and the other device has to be told rather than left to
    // hand it back.
    const gaveWay = prev.bookmarks.filter(
      b => b.id !== next.id && b.surah === surah && b.ayah === ayah,
    );
    return {
      ...prev,
      bookmarks: [
        ...prev.bookmarks.filter(b => !(b.surah === surah && b.ayah === ayah)),
        next,
      ],
      ...(gaveWay.length > 0
        ? {
            bookmarksRemoved: mergeRemovals(
              prev.bookmarksRemoved,
              gaveWay.map(b => ({ id: b.id, at: stampAfter(b) })),
            ),
          }
        : {}),
    };
  });
  /**
   * A BOOKMARK THAT FOLLOWS, MADE MID-READING, TAKES THE VISIT.
   *
   * Flipping the switch on an existing bookmark already does this
   * (`setBookmarkFollows`), and making one already flipped meant the same
   * thing and did not: the marker went on recording while the new
   * bookmark sat where it was made until the next visit — two places
   * kept for one reading, which is the duplicate this whole model exists
   * to avoid.
   *
   * Not from a khatmah visit. That reading belongs to the plan, and
   * marking an ayah inside it is a note, not a change of what is being
   * read.
   */
  const after = readingSessionOwner();
  const made = getQuranState().bookmarks.find(
    b => b.surah === surah && b.ayah === ayah,
  );
  if (made?.follows && (after == null || after.kind === 'reading')) {
    claimReadingSession({ kind: 'bookmark', id: made.id });
  }
}

export function removeBookmark(id: string): void {
  // An owner that no longer exists cannot own the visit.
  const owner = readingSessionOwner();
  if (owner?.kind === 'bookmark' && owner.id === id) releaseReadingOwner();
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.filter(b => b.id !== id),
    /**
     * The row goes; the REMOVAL stays, dated. Dropping the bookmark and
     * saying nothing else is what let the other device hand it back on
     * the next round — see `bookmarksRemoved`. Stamped past the copy it
     * buries, so a bookmark edited in the same millisecond somewhere else
     * does not survive on a tie.
     */
    bookmarksRemoved: mergeRemovals(prev.bookmarksRemoved, [
      {
        id,
        at: Math.max(
          Date.now(),
          (prev.bookmarks.find(b => b.id === id)?.updatedAt ?? 0) + 1,
        ),
      },
    ]),
  }));
}

/**
 * Switch a bookmark between a fixed pin and a place that keeps itself.
 *
 * Turning it ON while the reader is open hands the open visit to it —
 * "mark where I am, and keep tracking from here" is what that gesture
 * means. From the Qur'an tab's list, with no reader open, it is only a
 * setting, and `claimReadingSession` says so by doing nothing.
 */
export function setBookmarkFollows(id: string, follows: boolean): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.map(b => {
      if (b.id !== id) return b;
      const next: QuranBookmark = { ...b, updatedAt: stampAfter(b) };
      if (follows) next.follows = true;
      else delete next.follows;
      return next;
    }),
  }));
  // Switching it ON hands this bookmark the open visit. Switching it OFF
  // does NOT hand the visit to anyone: the bookmark still owns it, it
  // just stops walking with the reading. Releasing it used to let the
  // marker take the turns, which is the duplicate place `recordReading`
  // exists to avoid.
  if (follows) claimReadingSession({ kind: 'bookmark', id });
}

/**
 * How far a following bookmark can be read from before the visit is no
 * longer its reading. Anywhere in the SAME SURAH counts — Al-Baqarah is
 * forty-eight pages and reading it end to end is one reading — and a
 * few pages past its end, for the turn that crosses into the next one.
 * Beyond that the reader has gone to look something up, and dragging the
 * bookmark after them would lose the place it was keeping.
 */
export const BOOKMARK_PAGE_REACH = 3;

/**
 * A SCRUB IS THE READER SAYING "MY READING IS HERE NOW" — so a following
 * bookmark goes with it.
 *
 * Reported from the device: scrub to a page, read on from there, and
 * nothing was saved. Two reasons, and both were right on their own. The
 * jump records no reading by design — "a turn is reading; a jump is not"
 * (#41), which is what stops a glance at the index stealing your place.
 * And the first real turn after the jump was then far outside the
 * bookmark's reach, so the session was released and the marker took it:
 * correct for someone who swiped off to look something up, wrong for
 * someone who deliberately went to where they meant to read.
 *
 * Scrubbing is not browsing. It is a destination chosen on purpose, and
 * inside a following session it moves that bookmark rather than losing
 * it — which also puts reach back around the new page, so the reading
 * that follows keeps being tracked.
 *
 * IT IS NOT DRAWN THERE, THOUGH. What the reader chose was a PAGE, and
 * the ayah this lands on is only whichever one that page happens to
 * start with — washing it says "you marked this line" about a line
 * nobody picked, which is the same noise the wash was taken off page
 * turns to avoid. So the position is recorded and the anchor goes out,
 * exactly as it does when reading carries the bookmark along. The wash
 * is for an ayah that was actually chosen: the one the visit opened on,
 * or one the reader bookmarked by hand.
 *
 * Only the session's bookmark. With nothing owning the visit a jump still
 * records nothing at all, exactly as before: `lastRead` waits for a turn.
 */
export function moveSessionToPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  const owner = readingSessionOwner();
  if (owner?.kind !== 'bookmark') return;
  const b = getQuranState().bookmarks.find(x => x.id === owner.id);
  if (!b?.follows) return;
  const first = firstAyahOfPage(page, riwayah);
  moveBookmark(b.id, { surah: first.surah, ayah: first.ayah, page });
  noteReadingMoved();
}

function withinBookmarkReach(
  b: QuranBookmark,
  pos: { surah: number; page: number },
): boolean {
  return pos.surah === b.surah || Math.abs(pos.page - b.page) <= BOOKMARK_PAGE_REACH;
}

function moveBookmark(
  id: string,
  pos: { surah: number; ayah: number; page: number },
): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.map(b =>
      b.id === id
        ? { ...b, surah: pos.surah, ayah: pos.ayah, page: pos.page, updatedAt: stampAfter(b) }
        : b,
    ),
  }));
}

export function findBookmark(
  s: QuranState,
  surah: number,
  ayah: number,
): QuranBookmark | undefined {
  return s.bookmarks.find(b => b.surah === surah && b.ayah === ayah);
}

export function setQuranPrefs(partial: Partial<QuranPrefs>): void {
  updateQuranState(prev => ({
    ...prev,
    prefs: {
      ...prev.prefs,
      ...partial,
      repeat: { ...prev.prefs.repeat, ...(partial.repeat ?? {}) },
    },
    // Every path into the preferences goes through here, which is what
    // makes one stamp enough — see `prefsUpdatedAt`.
    prefsUpdatedAt: Date.now(),
  }));
}

// ── Khatmah ──────────────────────────────────────────────────────────

/**
 * Where a reader who is ON `page` of `riwayah` stands, for a new plan.
 *
 * Two numbers, and they are answers to different questions.
 *
 * `ayahs` is progress, and it is the reader's own: everything before
 * their page, counted in their muṣḥaf. Nothing rounds it, so "continue"
 * puts them back at the top of the page they named rather than a page to
 * either side of it.
 *
 * `from` is where the plan's DAYS are cut, and the cut is in Ḥafṣ pages
 * (see `portionEnd`) — so it is the last Ḥafṣ page that ends at or before
 * them. Their page boundary is not Ḥafṣ's, so this can sit a fraction of
 * a page behind their position; that is the right side to be on. It makes
 * the first portion open a line or two before the reader rather than past
 * them, and it never hands out a page they have not read.
 */
function planStart(at: { page: number; riwayah?: RiwayahId }): {
  from: number;
  ayahs: number;
} {
  const page = Math.trunc(at.page);
  if (!Number.isFinite(page) || page <= 1) return { from: 0, ayahs: 0 };
  const riwayah = at.riwayah ?? DEFAULT_RIWAYAH;
  const ayahs = ayahsThroughPage(page - 1, riwayah);
  if (ayahs <= 0) return { from: 0, ayahs: 0 };
  let from = 0;
  for (let p = 1; p < KHATMAH_TOTAL_PAGES; p++) {
    if (ayahsThroughHafsPage(p) > ayahs) break;
    from = p;
  }
  return { from, ayahs };
}

/**
 * Begin a plan.
 *
 * `startingAt` is for a khatmah already under way: the page the reader is
 * ON, in the muṣḥaf they are reading it in. Everything before that page
 * counts as read, and the plan's days cover what is left.
 *
 * The page is the reader's own — Warsh page 143 is not Ḥafṣ page 143 —
 * so it is converted through ayahs, which every riwayah agrees on. See
 * `planStart` for why progress keeps that exact figure while the day cut
 * takes the Ḥafṣ page below it.
 */
export function startKhatmah(
  targetDays: number,
  startingAt?: { page: number; riwayah?: RiwayahId },
  /**
   * A date to finish by — the plan is then paced by the calendar rather
   * than by `targetDays`, which is still stored so that taking the date
   * off later lands on a plan of a sensible length rather than on one.
   */
  deadline?: string,
): void {
  const { from, ayahs } = startingAt
    ? planStart(startingAt)
    : { from: 0, ayahs: 0 };
  const now = Date.now();
  const plan: KhatmahPlan = {
    id: `${now}`,
    startedAt: now,
    targetDays,
    fromPage: from,
    pagesRead: pagesThroughAyahs(ayahs),
    ayahsRead: ayahs,
    completedAt: null,
    /**
     * THE PACING IS STAMPED FROM THE FIRST MOMENT, whichever mode it is
     * in — a plan made today and a plan re-paced today are the same kind
     * of claim, and only a stamp on both lets the merge tell which of two
     * devices spoke last (`pacedAt`).
     */
    pacedAt: now,
    pacedDay: localYmd(now),
    pacedFrom: from,
    ...(deadline ? { deadline } : {}),
  };
  const paced = deadline ? withPaceOfDay(plan, now) : plan;
  updateQuranState(prev => ({
    ...prev,
    // One active plan at a time; completed plans stay for history.
    khatmah: [...prev.khatmah.filter(k => !isLivePlan(k)), paced],
  }));
}

/**
 * The day key `days` calendar days after `key`. Stepped on the calendar:
 * "now plus 24 hours" is still today for the first hour after midnight on
 * the night the clocks go back.
 */
function dayKeyAfter(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10));
  const at = new Date(y, m - 1, d + days, 12, 0, 0, 0);
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  return `${at.getFullYear()}-${mm}-${String(at.getDate()).padStart(2, '0')}`;
}

/** Snapshot pagesRead at the first progress of each local day. */
function withDaySnapshot(plan: KhatmahPlan, now?: number): KhatmahPlan {
  const today = localYmd(now);
  const paced = withPaceOfDay(plan, now);
  if (paced.dayStartDate === today) return paced;
  return {
    ...paced,
    dayStartDate: today,
    dayStartPagesRead: plan.pagesRead,
    // The REACH, like everything else that answers "where is the reader"
    // — a snapshot taken from the contiguous run would put the day back
    // at a hole every morning.
    dayStartAyahsRead: khatmahReachAyah(plan),
  };
}

/**
 * PIN TODAY'S CUT, once a day, for a deadline plan.
 *
 * Every writer that touches a plan goes through `withDaySnapshot`, and
 * this rides with it for the same reason: the first thing the reader does
 * today is when "today" has to be decided. Before that the cut is
 * computed on the fly and is the same answer — it is only once reading
 * starts that holding it still matters (`khatmahPace.ts`).
 *
 * A duration plan never gets one, and a plan that loses its deadline
 * loses the pace with it, so nothing stale is left to be read by a mode
 * that does not use it.
 */
function withPaceOfDay(plan: KhatmahPlan, now?: number): KhatmahPlan {
  const by = khatmahDeadline(plan);
  if (!by) {
    if (plan.pace === undefined) return plan;
    const rest = { ...plan };
    delete rest.pace;
    return rest;
  }
  const today = localYmd(now);
  if (plan.pace && paceStillFits(plan, plan.pace, today)) return plan;
  const pace = khatmahPaceToday(plan, now ?? Date.now());
  return pace ? { ...plan, pace } : plan;
}

/**
 * ── RE-PACING A KHATMAH THAT IS ALREADY UNDER WAY ─────────────────────
 *
 * The two modes are one question asked two ways, so the reader may answer
 * it again at any point, in either direction, without losing a page:
 * `setKhatmahDeadline` makes the plan the calendar's, `setKhatmahDuration`
 * makes it the reader's again. Progress, the holes behind, the pinned
 * position and the day's baseline are untouched by both — the only thing
 * that changes is what the plan asks of today.
 *
 * Both stamp `pacedAt` and `pacedFrom`: the decision is dated, so it can
 * be merged (see `mergeKhatmah`), and it remembers where the reader stood
 * when it was made, so nothing measures the new promise against the old
 * one's calendar (`khatmahBehindBy`, `khatmahPaceOutgrown`).
 */
function repaced(plan: KhatmahPlan, at: number): KhatmahPlan {
  return {
    ...plan,
    pacedAt: at,
    pacedDay: localYmd(at),
    // Never behind the plan's own start: a khatmah begun at page 143 with
    // nothing read yet has a reach of zero, and its schedule starts at
    // 143, not at the opening it was never going to cover.
    pacedFrom: Math.max(planFrom(plan), khatmahReachPage(plan)),
  };
}

/** The plan without today's cut. */
function unpaced(plan: KhatmahPlan): KhatmahPlan {
  if (plan.pace === undefined) return plan;
  const rest = { ...plan };
  delete rest.pace;
  return rest;
}

/** A stamp that is this device's now, and never older than the last one. */
function pacingStamp(plan: KhatmahPlan): number {
  return Math.max(Date.now(), (plan.pacedAt ?? 0) + 1);
}

/**
 * Give a plan a date to be finished by.
 *
 * It is how a plan is created with a deadline, the re-pace for a plan
 * whose date has gone by, and the switch for a reader who started with a
 * length and now has a day in mind. Setting the date re-cuts today as
 * well, because the old cut was made against a number of days that no
 * longer applies — which is the one moment the pace is allowed to change
 * mid-day.
 */
export function setKhatmahDeadline(deadline: string): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const at = pacingStamp(active);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k => {
        if (k.id !== active.id) return k;
        const next = { ...repaced(k, at), deadline };
        delete next.pace;
        const pace = khatmahPaceToday(next);
        return pace ? { ...next, pace } : next;
      }),
    };
  });
}

/**
 * Pace the plan by a number of days again — `days` of reading from today.
 *
 * This is the other half of the switch, and it is also how the length of
 * a duration plan is changed, which was not possible before: both are the
 * same sentence, "I want what is left to take this many days".
 *
 * `targetDays` is the plan's whole length, not what remains, so it is
 * solved for rather than assigned (`khatmahDurationForDaysLeft`) — a
 * reader two thirds of the way through a book who asks for ten more days
 * is asking for portions a third of the book divided by ten, and the plan
 * that hands those out is a thirty-day one, not a ten-day one.
 */
export function setKhatmahDuration(days: number): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const at = pacingStamp(active);
    const targetDays = khatmahDurationForDaysLeft(active, days, at);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k => {
        if (k.id !== active.id) return k;
        const next = { ...repaced(k, at), targetDays };
        // The date, and the cut that was made against it. A duration plan
        // reads neither, and a stale one left on the blob would be synced
        // by every device and understood by none.
        delete next.deadline;
        delete next.pace;
        return next;
      }),
    };
  });
}

export function recordKhatmahProgress(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  /**
   * The first page of the stretch actually turned past.
   *
   * It is what the reading credits and what it may claim. A turn knows
   * it (`recordKhatmahPageTurn` passes it) and crediting only the pages
   * crossed is the honest reading of one.
   *
   * ABSENT MEANS "I HAVE READ UP TO HERE" — a catch-up rather than a
   * turn, credited from the plan's start, which is what a caller naming
   * a page and nothing else can only mean. Nothing in the app takes that
   * path today; it is the shape of the function's own contract.
   */
  fromPage?: number,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    // The page is converted to ayahs FIRST, then compared. Comparing pages
    // would be comparing two different muṣḥafs the moment the reader
    // switched riwayah, and the high-water mark would jump or stall.
    const reached = ayahsThroughPage(page, riwayah);
    /**
     * THE SET FIRST; the high-water fields are written FROM it.
     *
     * Everything read up to `page` that falls inside the plan's credit
     * window is marked done. The window is what stops a future day being
     * banked (`khatmahCreditWindow`); within it, a page read is a page
     * done however the reader got there.
     */
    const window = khatmahCreditWindow(active);
    const start = khatmahStartAyah(active);
    const credited = Math.min(reached, window[1]);
    const floor = Math.max(start, window[0]);
    const turnedFrom =
      fromPage === undefined
        ? floor
        : (() => {
            const at = firstAyahOfPage(
              Math.max(1, Math.min(fromPage, page)),
              riwayah,
            );
            return Math.max(floor, ayahIndexOf(at.surah, at.ayah));
          })();
    /**
     * ── WHAT A TURN CREDITS IS WHAT IT TURNED PAST ────────────────────
     *
     * It used to credit everything from the plan's start to the page
     * reached, on the reasoning that a page read is a page done however
     * the reader got there. That was a deliberate trade with a stated
     * bound: a ten-page slack, the most a plan
     * could ever be wrong by, because a turn starting further ahead than
     * that was refused outright.
     *
     * Replacing the slack with the portion window took the bound away
     * and nothing said so. A portion is a twentieth of the book on a
     * thirty-day plan and an eighth of it on a seven-day one, so an
     * arrival mid-portion plus one page turn could bank eighty pages
     * nobody had read — silently, and reported as progress.
     *
     * The pages turned past are known (`recordKhatmahPageTurn` passes
     * them) and they are the honest answer. A fling still credits every
     * page it crossed, which is what issue #44 asked for; an arrival
     * followed by reading on credits what was read and leaves the pages
     * behind it unread — which is exactly what the card's own row now
     * offers to send the reader back for.
     */
    const filled =
      credited >= turnedFrom
        ? addRange(khatmahDone(active), turnedFrom, credited, TOTAL_AYAHS)
        : khatmahDone(active);
    /**
     * READING IS A DATED CLAIM TOO — AND ONLY ABOUT THE PAGES IT CROSSED.
     *
     * It used to log one only when the reading crossed something this
     * device had denied, on the reasoning that the union carries the
     * rest. The union does carry it, and carries it UNDATED, which is
     * where the "khatmah dragged back to its old point" report came from:
     * a stretch un-marked on the phone on Monday and read on the Mac on
     * Tuesday merged as Monday's denial replayed over Tuesday's reading,
     * every round, because nothing said Tuesday was later. The reading
     * this device just did is a fact with a time on it, exactly like the
     * un-mark it has to out-rank, so it is logged like one.
     *
     * The width matters more than it looks. Crediting runs from the
     * plan's start, so a claim over the credited span would say "all of
     * this is read" and erase every skipped page behind the reader — one
     * page turn after an un-mark and the hole closed itself. The pages
     * turned past are what the reader can honestly claim.
     *
     * The log does not grow a claim per turn: `compactMarks` resolves the
     * run of turns back into the stretch they amount to.
     */
    const marks =
      credited >= turnedFrom
        ? withMark(active, turnedFrom, credited, 1, true)
        : active.marks;
    const next = settled(active, filled, marks);
    // By CONTENT, not identity: every range operation builds a new array,
    // and a turn that re-reads credited ground must not persist, re-render
    // two screens and throw away two memos for a set that did not change.
    if (
      marks === active.marks &&
      rangesEqual(next.done, khatmahDone(active)) &&
      next.ayahsRead <= khatmahAyahsRead(active)
    ) {
      return prev;
    }
    const done = next.ayahsRead;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...next,
              // A PIN IS A STARTING POINT, NOT AN ANCHOR.
              //
              // `khatmahCurrentPage` answers with the pinned page while a
              // pin is set, whatever has been read since. That was already
              // odd — "Continue" kept offering a page the reader had gone
              // past — and it became a stall once reading was gated on the
              // plan's own frontier: pin at page 300, read one page, and
              // the next turn is judged against a frontier still sitting
              // at 300 and refused. The plan froze a page after the pin.
              //
              // So the pin is spent when the reading reaches it, exactly as
              // `finishKhatmahPortion` spends one inside the portion it
              // finishes. Tracking goes back to being derived from what has
              // been read, which is where it can move.
              ...pinned(
                k,
                k.position &&
                  ayahIndexOf(k.position.surah, k.position.ayah) <= done
                  ? null
                  : k.position,
              ),
              completedAt: done >= TOTAL_AYAHS ? Date.now() : null,
            }
          : k,
      ),
    };
  });
}

/**
 * Is the reading in front of the reader the khatmah's own reading?
 *
 * A khatmah is a promise about ONE trail through the muṣḥaf, and the
 * reader has every other reason to be somewhere else in it: a bookmark,
 * a juz they wanted to hear, Al-Kahf on a Friday, the surah a search
 * landed on. Progress used to be credited from wherever the pages were
 * turning, so an evening in juz 30 could carry a plan sitting at page 50
 * to page 590 — six hundred pages the reader never read, and no way back
 * to the real place except by hand.
 *
 * The test is the trail, not the button that opened the reader. A page at
 * or behind the plan's own next page IS the khatmah — that is what
 * "Continue" hands you, and what a bookmark on the same page means too.
 * A page ahead of it is not, however the reader got there, and reading
 * there leaves the plan exactly where it was.
 *
 * Which leaves two ways to take the plan somewhere else on purpose, both
 * of them explicit and neither of them gated by this: pinning a position
 * from an ayah's own panel (`setKhatmahPosition` — the frontier becomes
 * the pinned page, so reading from there counts immediately), and marking
 * the portion read (`finishKhatmahPortion` — the frontier moves to the
 * start of the next one). Reading is what has to prove it belongs; saying
 * so out loud does not.
 *
 * ── AND A FEW PAGES AHEAD IS STILL THE SAME TRAIL — #44, second round ─
 *
 * The test above was `page <= frontier` exactly, and that is a hair
 * trigger: the plan's frontier sits ON the page the reader is turning
 * from, every single turn, so there is no slack in it anywhere. Get one
 * page ahead — by ANY means, and the ordinary ones are enough: open the
 * reader at a page, follow a link, let a fast flick settle somewhere the
 * pager corrected — and this said no to that turn, and then to every turn
 * after it, because each one starts from a page further ahead than the
 * last. The plan stopped moving for the rest of the session while the
 * pages kept turning, with nothing on screen to say why. That is the
 * second half of #44: the crossing was fixed and the hair trigger was
 * not, and it was reported back as "works for about six swipes, then it
 * blocks again".
 *
 * So the trail has a width. A page within ten pages of
 * the frontier is the plan's own reading and the turn from it counts —
 * which credits the pages in between, because a high-water mark is the
 * only shape progress has here. That is the trade: skip five pages on
 * purpose and read on, and the plan will count those five. A hizb is the
 * most it can ever be wrong by, it is wrong in the direction the reader
 * can see and correct, and it cannot be wrong silently for ever.
 *
 * Beyond that width nothing changes: juz 30 on a Friday is four hundred
 * pages from a plan sitting at page 50, a bookmark across the muṣḥaf is
 * hundreds, and both are still refused.
 */
/**
 * WHAT READING CAN COUNT RIGHT NOW — the plan's own rule, in ayahs.
 *
 * A page read inside today's portion counts, however the reader arrived:
 * another session, the index, a surah opened for its own sake. Reading
 * that belongs to a FUTURE day does not — it has not been earned, and
 * counting it would let a plan be finished out of order without ever
 * having read what lies between.
 *
 * With one exception, which is the same principle rather than a hole in
 * it: once today's portion is finished, reading on into the next one
 * counts too. Reading ahead is still reading, and a reader who has done
 * their day and carries on should not be told it did not happen.
 *
 * This replaces the ten-page slack, which approximated the same
 * idea with distance — ten pages either side of the frontier, chosen
 * because a high-water mark had to count everything in between and ten
 * was the most it could be wrong by. A set of pages read has no such
 * cost, so the window can be what it always should have been: the
 * portion.
 */
/**
 * Mark one page of the plan read, or unread — by hand, from the mark
 * beside the surah name.
 *
 * NOT GATED BY THE CREDIT WINDOW, and deliberately: the window is what
 * READING has to satisfy, because reading is ambiguous — the app is
 * inferring intent from page turns and must not bank a future day off a
 * glance. A tap is not an inference. It is the reader saying which pages
 * they have read, which is the same standing `finishKhatmahPortion` and
 * `setKhatmahPosition` already have: "reading is what has to prove it
 * belongs; saying so out loud does not".
 *
 * So this is also the way out of a wrong count in either direction —
 * pages the plan credited that you had not read, and pages you read
 * somewhere it could not see.
 *
 * Unmarking is what the old shape could never do. A high-water mark can
 * only be wound back to a point, taking everything after it along; a set
 * can lose one page out of the middle and keep the rest.
 */
export function toggleKhatmahPageDone(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const first = firstAyahOfPage(page, riwayah);
    const from = Math.max(khatmahStartAyah(active), ayahIndexOf(first.surah, first.ayah));
    const to = ayahsThroughPage(page, riwayah);
    // A page entirely behind the plan's own start is not its to mark.
    if (to < from) return prev;
    // Nor is one beyond what the plan may credit today. A tap is a claim
    // about a page, not a licence to skip the portions in between — see
    // `khatmahPageInWindow`. The mark is not offered out there either;
    // this is the same rule, held where it cannot be got around.
    if (!khatmahPageInWindow(active, page, riwayah)) return prev;
    const current = khatmahDone(active);
    const wasDone = rangesCover(current, from, to);
    const changed = wasDone
      ? subtractRange(current, from, to, TOTAL_AYAHS)
      : addRange(current, from, to, TOTAL_AYAHS);
    // A TAP IS THE READER SPEAKING, so it is dated and travels. Without
    // this the other device's set would put an un-marked page straight
    // back on the next merge — see `AyahMark`.
    const next = settled(active, changed, withMark(active, from, to, wasDone ? 0 : 1));
    const start = khatmahStartAyah(active);
    const everything = rangesCover(next.done, start, TOTAL_AYAHS);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...next,
              // Unmarking a page of a finished khatmah re-opens it; the
              // plan is only complete while everything really is read.
              completedAt: everything ? (k.completedAt ?? Date.now()) : null,
            }
          : k,
      ),
    };
  });
}

export function khatmahTracksPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  s: QuranState = getQuranState(),
): boolean {
  const plan = activeKhatmah(s);
  if (!plan) return false;
  return khatmahPageInWindow(plan, page, riwayah);
}

/**
 * Credit a page turn to the khatmah, if the turn belongs to it.
 *
 * The pager's step is the muṣḥaf's, not the plan's: a phone turns one
 * page and a spread turns two, and in both cases what was completed is
 * the page (or pages) left behind. `recordKhatmahProgress` is a
 * high-water mark, so naming the last completed page covers the pair.
 *
 * ── A FLING CROSSES MORE THAN TWO — issue #44 ─────────────────────────
 *
 * This used to credit a step of exactly one or two and nothing else, on
 * the reasoning that one is a phone and two is a spread. But the pager
 * reports where a scroll came to REST, and a hard fling on Android
 * crosses several pages before it settles: the reader sees every one of
 * them go past and the plan is told about none of it.
 *
 * That alone would be a page or two lost. What made it a stall is the
 * gate above: the next turn starts from a page now AHEAD of the plan's
 * frontier, `khatmahTracksPage` says no, and every turn after it says no
 * too. One fling and the plan is frozen for the rest of the session,
 * silently — reported as a khatmah card stuck at page 254 while the
 * reader was at 264, with "Continue reading" tracking correctly the
 * whole time, because the marker has no such gate.
 *
 * So: any FORWARD settle credits the page left behind, however many that
 * crossing covered. What it does not do is credit a jump — those do not
 * come through here as a step at all. `jumpToPage` reports the same page
 * as both arguments (see mushafReaderCore), so the rail, go-to-page, a
 * bookmark and a search result all land with nothing completed, which is
 * the distinction this function actually cares about.
 */
export function recordKhatmahPageTurn(
  prevPage: number,
  newPage: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  if (!khatmahTracksPage(prevPage, riwayah)) return;
  if (newPage <= prevPage) return;
  // The pages left behind are `prevPage … newPage - 1` — every one of
  // them, because a fling settles several pages on (#44) and the reader
  // saw all of them. That span is also what the reading may CLAIM about
  // pages it was told were skipped; see `recordKhatmahProgress`.
  recordKhatmahProgress(newPage - 1, riwayah, prevPage);
}

/**
 * Pin an explicit "I am here" position (v2.7.28). Also aligns
 * `pagesRead` to the pinned page (pages before it count as read) —
 * moving backward is allowed: an explicit pin is authoritative.
 */
export function setKhatmahPosition(
  surah: number,
  ayah: number,
  page: number,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...pinned(k, { surah, ayah, page }),
              // Pages before the pinned AYAH count as read. Derived from
              // the ayah, not the page, so pinning in one riwayah and
              // reading in the other agree.
              // Ayahs before the pinned one count as read — the same
              // "everything before here" rule the page form has always
              // had, expressed in the coordinate that survives a riwayah
              // switch.
              // A pin is the reader saying where they are, and it is
              // authoritative in both directions — what is behind it is
              // read, what is ahead is not — which is what the mirror has
              // always said of a pin. Two claims, one act, in that order;
              // the second is the one the union would otherwise undo.
              ...settled(
                k,
                normalizeRanges(
                  ayahIndexOf(surah, ayah) - 1 >= khatmahStartAyah(k)
                    ? [[khatmahStartAyah(k), ayahIndexOf(surah, ayah) - 1]]
                    : [],
                  TOTAL_AYAHS,
                ),
                withMarks(k, [
                  [khatmahStartAyah(k), ayahIndexOf(surah, ayah) - 1, 1],
                  [ayahIndexOf(surah, ayah), TOTAL_AYAHS, 0],
                ]),
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/** Clear the pinned position (falls back to automatic page tracking). */
export function clearKhatmahPosition(): void {
  updateQuranState(prev => ({
    ...prev,
    khatmah: prev.khatmah.map(k =>
      k.completedAt == null ? { ...k, ...pinned(k, null) } : k,
    ),
  }));
}

/** Rewind only today's progress (to the day-start snapshot). */
export function resetKhatmahToday(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const today = localYmd();
    // No progress today — nothing to rewind. The REACH, not the
    // contiguous run: with a hole behind the reader the run stops at the
    // hole, and "nothing to rewind" rewound everything past it (caught
    // by the two-device fuzz, 2026-09-22).
    const baseAyahs =
      active.dayStartDate === today
        ? (active.dayStartAyahsRead ??
          ayahsThroughPage(
            active.dayStartPagesRead ?? active.pagesRead,
            DEFAULT_RIWAYAH,
          ))
        : khatmahReachAyah(active);
    const basePages = pagesThroughAyahs(baseAyahs);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...settled(
                k,
                doneRewound(k, baseAyahs),
                withMark(k, baseAyahs + 1, TOTAL_AYAHS, 0),
              ),
              dayStartDate: today,
              dayStartPagesRead: basePages,
              dayStartAyahsRead: baseAyahs,
              // Drop a pin that now sits ahead of where the rewind left
              // us — compared as ayahs, since the pin's page may belong
              // to the other muṣḥaf.
              ...pinned(
                k,
                k.position &&
                  ayahIndexOf(k.position.surah, k.position.ayah) > baseAyahs + 1
                  ? null
                  : k.position,
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/** Restart the active plan from page 0 with a fresh clock. */
export function resetKhatmahAll(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    // Back to where the PLAN began, which is page 0 for most plans and
    // the reader's own start for one begun partway (issue #17). Rewinding
    // such a plan to the opening would hand it back a hundred pages the
    // reader never asked it to cover.
    const from = planFrom(active);
    const ayahs = ayahsThroughHafsPage(from);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              // Without the day's cut: it was made against reading that
              // is being undone, and the first write of the new schedule
              // makes a fresh one.
              ...unpaced(k),
              startedAt: Date.now(),
              ...settled(
                k,
                doneRewound(k, ayahs),
                withMark(k, ayahs + 1, TOTAL_AYAHS, 0),
              ),
              /**
               * "With a fresh schedule" includes the page the schedule is
               * measured from (`pacedFrom`). A plan re-paced at page 300
               * and then restarted would otherwise be three hundred pages
               * behind the moment it began again. The length or the date
               * is kept — that is the plan; this is the reading.
               */
              pacedAt: pacingStamp(k),
              pacedDay: localYmd(),
              pacedFrom: from,
              ...pinned(k, null),
              dayStartDate: localYmd(),
              dayStartPagesRead: from,
              dayStartAyahsRead: ayahs,
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

export function abandonKhatmah(id: string): void {
  const at = Date.now();
  updateQuranState(prev => ({
    ...prev,
    // A WRITE, not a deletion — see `abandonedAt`. The row stays so the
    // abandonment can reach the other devices; `coerceKhatmah` drops it
    // once it is older than any peer could still argue about.
    khatmah: prev.khatmah.map(k =>
      k.id === id && k.abandonedAt == null ? { ...k, abandonedAt: at } : k,
    ),
  }));
}

/**
 * THE SET HAS TO MOVE WITH EVERY REWIND AND EVERY CLAIM.
 *
 * Progress used to be one number, so rewinding it was one assignment.
 * With a set of read ranges, an assignment to `ayahsRead` alone leaves
 * the ranges claiming pages the reader has just taken back: "reset
 * today" would leave every check green, and — since the reach is read
 * from the set — leave the plan's next page where it was. These two put
 * the set where the number says it is.
 */
/**
 * Log a claim, newest last and bounded.
 *
 * Only hand-made claims and readings that cross one come through here —
 * see `AyahMark`. A page turn that touches nothing the reader has denied
 * needs no date, because the union already carries it.
 */
function withMarks(
  plan: KhatmahPlan,
  claims: ReadonlyArray<readonly [from: number, to: number, read: 0 | 1]>,
  /**
   * A page turn, as opposed to something the reader said by hand — a
   * pin, a tap on a page, "finish today". See below.
   */
  turned = false,
): AyahMark[] | undefined {
  const have = plan.marks ?? [];
  /**
   * A TURN OVER GROUND THE LOG ALREADY SAYS IS READ ADDS NOTHING.
   *
   * Flipping back through credited pages on the way somewhere is not a
   * fresh reading of them, and logging it as one would both write state
   * on every such turn and re-date the pages — which, replayed on the
   * other device, would override an un-mark it had made of one of them
   * in between. What the log says of them stands, at the time it said
   * it. A turn that crosses anything currently denied is a new claim,
   * because that is the one thing it changes.
   *
   * Only turns. A claim made BY HAND is the reader speaking — a pin says
   * "everything before here is read" whatever this device's log thought
   * — and it is recorded at its own time so that it also beats a denial
   * the other device made in between and this one has not seen yet.
   */
  const saidRead = turned ? applyMarks([], have, TOTAL_AYAHS) : null;
  const usable = claims.filter(
    ([from, to, read]) =>
      to >= from && !(saidRead && read === 1 && rangesCover(saidRead, from, to)),
  );
  if (usable.length === 0) return plan.marks;
  /**
   * MONOTONIC, because replay order IS the rule.
   *
   * The wall clock is what lets two devices' claims be ordered against
   * each other, and it is too coarse to order two claims made here: a
   * reader who un-marks a page and reads it again in the same
   * millisecond — or a test, or a pin, which is two claims in one act —
   * would have them replayed in whatever order the array sort happened
   * to pick, and the later claim could lose to the earlier one. One past
   * the newest claim we already hold is both later than it and still a
   * wall-clock time the other device can compare against.
   */
  let at = Math.max(Date.now(), (have[have.length - 1]?.[2] ?? 0) + 1);
  const next: AyahMark[] = [...have];
  for (const [from, to, read] of usable) {
    next.push([from, to, at, read]);
    at += 1;
  }
  /**
   * Resolved on the way in, not trimmed on the way out. Page turns are
   * claims now (see `AyahMark`), so an unresolved log would grow by one
   * per turn and a blind `slice` would drop the oldest — which is where
   * the un-marks live. `compactMarks` keeps every verdict and only the
   * claims still deciding one; the cap below is a backstop it should
   * never reach.
   */
  const compacted = compactMarks(next, TOTAL_AYAHS).slice(-KHATMAH_MARK_LIMIT);
  /**
   * THE SAME LOG IS THE SAME OBJECT.
   *
   * Re-reading ground this device already claimed compacts back to the
   * claim it already held — the new turn is absorbed into it, at the
   * earlier time. Handing back a fresh array for that would make every
   * turn over credited pages a state write, and `recordKhatmahProgress`
   * ends on an identity check precisely so that a turn which changes
   * nothing re-renders nothing.
   */
  return sameMarks(compacted, have) ? plan.marks : compacted;
}

function withMark(
  plan: KhatmahPlan,
  from: number,
  to: number,
  read: 0 | 1,
  turned = false,
): AyahMark[] | undefined {
  return withMarks(plan, [[from, to, read]], turned);
}

function sameMarks(a: readonly AyahMark[], b: readonly AyahMark[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, i) => m[0] === b[i][0] && m[1] === b[i][1] && m[2] === b[i][2] && m[3] === b[i][3])
  );
}

type Pin = KhatmahPlan['position'];

function samePin(a: Pin, b: Pin): boolean {
  if (!a || !b) return !a && !b;
  return a.surah === b.surah && a.ayah === b.ayah;
}

/**
 * THE PIN AND THE DATE ON IT, written together or not at all.
 *
 * Every writer that moves the pin — a reader pinning one, reading past
 * one, clearing one, rewinding over one — goes through here, because a
 * pin whose stamp was forgotten is exactly the pin that comes back from
 * the other device (see `positionAt`). Unchanged pins keep their stamp:
 * re-stamping a value nobody touched would let a device that merely
 * opened the reader talk over a removal made elsewhere.
 *
 * The clock is nudged past the pin's own stamp for the same reason
 * `withMarks` nudges a claim past the last one: two acts in the same
 * millisecond — a pin and the clear that a page turn makes of it — must
 * still be orderable, here and on the device that receives them.
 */
function pinned(plan: KhatmahPlan, next: Pin): Pick<KhatmahPlan, 'position' | 'positionAt'> {
  if (samePin(plan.position ?? null, next ?? null)) {
    return {
      position: plan.position ?? null,
      ...(plan.positionAt != null ? { positionAt: plan.positionAt } : {}),
    };
  }
  return {
    position: next ?? null,
    positionAt: Math.max(Date.now(), (plan.positionAt ?? 0) + 1),
  };
}

/**
 * WHAT EVERY WRITER STORES: the resolved set and the mirror derived from it.
 *
 * Three fields say one thing and they have to agree. The set is stored
 * with the claims already replayed, so a merge that replays them again
 * gets the same set back (idempotence, which the P2P cycle rests on).
 * The legacy mirror is the CONTIGUOUS run of that set — never a number
 * a writer chose, because a chosen number can point past a hole and tell
 * an older device about pages nobody read.
 */
function settled(
  plan: KhatmahPlan,
  done: readonly AyahRange[],
  marks: AyahMark[] | undefined,
): { done: AyahRange[]; ayahsRead: number; pagesRead: number; marks?: AyahMark[] } {
  const resolved = marks?.length ? applyMarks(done, marks, TOTAL_AYAHS) : [...done];
  const contiguous = Math.max(
    0,
    contiguousFrom(resolved, khatmahStartAyah(plan), TOTAL_AYAHS),
  );
  return {
    done: resolved,
    ayahsRead: contiguous,
    pagesRead: pagesThroughAyahs(contiguous),
    ...(marks === undefined ? {} : { marks }),
  };
}

function doneRewound(plan: KhatmahPlan, to: number): AyahRange[] {
  return subtractRange(khatmahDone(plan), to + 1, TOTAL_AYAHS, TOTAL_AYAHS);
}

function doneFilled(plan: KhatmahPlan, to: number): AyahRange[] {
  const start = khatmahStartAyah(plan);
  return to >= start
    ? addRange(khatmahDone(plan), start, to, TOTAL_AYAHS)
    : khatmahDone(plan);
}

export function finishKhatmahPortion(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const portion = khatmahFinishTarget(active);
    const to = portion.to;
    // Already covered — by the set, not the mirror, which a hole behind
    // the reader would hold back even with the portion fully read.
    if (rangesCover(khatmahDone(active), portion.from, to)) return prev;
    /**
     * The claim is THE PORTION, not everything from the plan's start.
     * "Finish today's reading" says nothing about a page the reader
     * un-marked last week, and a claim from the start would be newer than
     * that denial and erase it. The fill still runs from the start, as
     * reading credit does; the replay puts the older holes back.
     */
    const next = settled(
      active,
      doneFilled(active, to),
      withMark(active, portion.from, to, 1),
    );
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...next,
              // A pin inside the portion just read is spent; leaving it
              // would send "continue" backwards into finished ground.
              ...pinned(
                k,
                k.position && ayahIndexOf(k.position.surah, k.position.ayah) <= to
                  ? null
                  : k.position,
              ),
              completedAt: rangesCover(next.done, khatmahStartAyah(k), TOTAL_AYAHS)
                ? (k.completedAt ?? Date.now())
                : null,
            }
          : k,
      ),
    };
  });
}

/**
 * Step back one portion, so the one before the current becomes current.
 *
 * The undo for a "done" pressed by mistake, and the way back into
 * yesterday's reading. Progress is rewound to the end of the portion
 * before last, which is what makes the previous one current again; the
 * day snapshot moves with it so the card does not go on claiming a day
 * the reader has just stepped out of.
 */
export function stepKhatmahBack(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const days = planDays(active);
    const current = khatmahCurrentPortion(active).day;
    const to = portionEnd(days, current - 2, planFrom(active));
    if (to >= khatmahAyahsRead(active)) return prev;
    const today = localYmd();
    const pages = pagesThroughAyahs(to);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...settled(k, doneRewound(k, to), withMark(k, to + 1, TOTAL_AYAHS, 0)),
              dayStartDate: today,
              dayStartAyahsRead: to,
              dayStartPagesRead: pages,
              ...pinned(
                k,
                k.position && ayahIndexOf(k.position.surah, k.position.ayah) > to + 1
                  ? null
                  : k.position,
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/** Test-only: reset module state. */
/** Test seam: wait for every queued write of this store to land. */
export async function flushQuranStateForTests(): Promise<void> {
  // The queue is filled a microtask after an update; let that pass, then
  // wait for the chain.
  await Promise.resolve();
  await writeMutex;
}

export function __resetQuranStateForTests(): void {
  state = DEFAULT_QURAN_STATE;
  resetKhatmahGapMemo();
  hydrated = false;
  hydrating = null;
  listeners.clear();
  writeMutex = Promise.resolve();
  persistQueued = false;
}
