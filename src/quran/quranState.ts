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
import { TOTAL_AYAHS } from './ayahIndex';
import { DEFAULT_RIWAYAH, coerceRiwayahId } from './riwayat';
import {
  compactMarks,
  normalizeRanges,
  type AyahMark,
  type AyahRange,
} from './khatmahDone';
import type {
  BookmarkColor,
  KhatmahPlan,
  LastRead,
  QuranBookmark,
  QuranPrefs,
  QuranState,
  Removal,
  AyahSheetPanel,
} from './quranTypes';
import {
  KHATMAH_TOMBSTONE_TTL_DAYS,
  KHATMAH_TOTAL_PAGES,
  endSetAside,
  keepReadersPlan,
  localYmd,
  oneLivePlan,
  resetKhatmahGapMemo,
} from './khatmahProgress';
import { KHATMAH_MARK_LIMIT } from './khatmahEdits';

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
    volumeKeyPaging: false,
    volumeKeyUpForward: false,
    volumeKeyTouchLock: false,
    hideMode: 'none',
    repeat: { eachAyah: 1, range: 1, pauseFactor: 0 },
    votdMode: 'translation',
    companionMode: 'translation',
    tafsirEditionId: '',
    verseOfDayOpen: false,
    ayahSheetPanel: 'none',
    verseOfDay: false,
    homeBookmarkId: '',
    bookmarkColourReuse: false,
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
  if (r.shortcut === true) out.shortcut = true;
  if (typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)) {
    out.updatedAt = r.updatedAt;
  }
  return out;
}

/** The āyah sheet's kept panel: a known one, else none. */
function coerceSheetPanel(v: unknown): AyahSheetPanel {
  return v === 'translation' || v === 'tafsir' || v === 'tajweed' ? v : 'none';
}

/**
 * The colour-reuse setting as the blob has it — or, when the blob has
 * never said, as its bookmarks imply: two in one colour means the reader
 * was keeping them that way before the one-per-colour rule, and the rule
 * must not cost them a bookmark. Only an absent key is inferred; `false`
 * written by a reader who then has duplicates (made on another device,
 * say) is their answer and stays.
 */
function coerceColourReuse(raw: unknown, bookmarks: QuranBookmark[]): boolean {
  if (typeof raw === 'boolean') return raw;
  const seen = new Set<string>();
  for (const b of bookmarks) {
    if (seen.has(b.color)) return true;
    seen.add(b.color);
  }
  return false;
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
  // Past the TTL a tombstone is cut to a skeleton, not dropped. Dropped,
  // an offline device's copy of the plan came back open on its next sync —
  // and with more reading than the current plan it took the khatmah over
  // (`oneLivePlan`); a device whose clock ran ahead dropped fresh endings at
  // once. The ending must outlive every peer that could still hold the plan,
  // and what made the row heavy was its reading (`done`, marks), not this.
  if (
    abandonedAt != null &&
    Date.now() - abandonedAt > KHATMAH_TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000
  ) {
    return { id: r.id, startedAt, targetDays, pagesRead: 0, completedAt, abandonedAt };
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
  const liveBookmarks = Array.isArray(r.bookmarks)
    ? r.bookmarks
        .map(coerceBookmark)
        .filter((b): b is QuranBookmark => b !== null)
        // A bookmark a tombstone has already buried never comes back
        // out of the blob, whichever order the two were written in.
        .filter(b => !removedAfter(removedBookmarks, b.id, b.updatedAt ?? b.createdAt))
    : [];
  return {
    version: 1,
    lastRead: coerceLastRead(r.lastRead),
    bookmarks: liveBookmarks,
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
    // One live plan, as the merge leaves it (`oneLivePlan`): a blob with
    // two — written by a build from before the rule — must read the way it
    // would after a sync, or merging it with itself would not return it.
    khatmah: Array.isArray(r.khatmah)
      ? oneLivePlan(
          r.khatmah.map(coerceKhatmah).filter((k): k is KhatmahPlan => k !== null),
        )
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
      // Off unless explicitly on.
      volumeKeyPaging:
        (r.prefs as { volumeKeyPaging?: unknown } | undefined)
          ?.volumeKeyPaging === true,
      // #72 made volume DOWN the next page. Anyone who had the buttons on
      // before then learned up-for-forward, and keeps it until they choose
      // otherwise; everyone else gets the new default.
      volumeKeyUpForward: (() => {
        const p = r.prefs as
          | { volumeKeyUpForward?: unknown; volumeKeyPaging?: unknown }
          | undefined;
        if (typeof p?.volumeKeyUpForward === 'boolean') return p.volumeKeyUpForward;
        return p?.volumeKeyPaging === true;
      })(),
      volumeKeyTouchLock:
        (r.prefs as { volumeKeyTouchLock?: unknown } | undefined)
          ?.volumeKeyTouchLock === true,
      // Off unless explicitly on: the card was shown to everyone before
      // this was a setting, and the setting's default is off.
      verseOfDay:
        (r.prefs as { verseOfDay?: unknown } | undefined)?.verseOfDay === true,
      // Only a known panel; anything else (or a blob from before) is none.
      ayahSheetPanel: coerceSheetPanel(
        (r.prefs as { ayahSheetPanel?: unknown } | undefined)?.ayahSheetPanel,
      ),
      homeBookmarkId:
        typeof (r.prefs as { homeBookmarkId?: unknown } | undefined)?.homeBookmarkId ===
        'string'
          ? ((r.prefs as { homeBookmarkId: string }).homeBookmarkId)
          : '',
      // A blob from before the one-per-colour rule that already holds two
      // bookmarks in one colour keeps them: the setting that allows it is
      // switched on for that reader, once, and written. A blob that has
      // the key keeps its answer whatever the bookmarks say.
      bookmarkColourReuse: coerceColourReuse(
        (r.prefs as { bookmarkColourReuse?: unknown } | undefined)?.bookmarkColourReuse,
        liveBookmarks,
      ),
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
  const next = updater(state);
  // One khatmah after every write, as after a merge or a read of the blob
  // (`oneLivePlan`). A write that ended the kept plan ends the plans set
  // aside behind it too (`endSetAside`), or one would surface in its place;
  // and a write that rewound it never hands the reader another plan
  // (`keepReadersPlan`).
  state =
    next.khatmah === state.khatmah
      ? next
      : {
          ...next,
          khatmah: keepReadersPlan(
            state.khatmah,
            oneLivePlan(endSetAside(state.khatmah, next.khatmah)),
            Date.now(),
          ),
        };
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
