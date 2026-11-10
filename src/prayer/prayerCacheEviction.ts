/**
 * What the prayer-times cache gives up when it has to shrink — the policy,
 * with nothing of storage in it.
 *
 * The cache is one value: a slot per place and method, months of days in
 * each. A full disk or a blob grown past its cap means something goes, and
 * what goes first decides whether today's times are still there afterwards.
 * These were private to prayerStorage.ts, reachable only by filling a mock
 * disk; here they take a shape and return one.
 */
import type { StoredPrayerData } from './prayerStorage';

/**
 * Multi-location cache — task #145.
 *
 * Until v1.7.0-beta.32 the prayer-times cache held a SINGLE
 * `StoredPrayerData` object keyed by params. As soon as the user switched to
 * a different location preset, `isSameParams` returned false and the next
 * cache write replaced everything. The user's symptom: "switching deletes
 * stored prayer times".
 *
 * v2 keeps every (provider, lat, lng, method, school) combination alive in
 * its own slot of `caches`. Switching presets just changes which slot we
 * read/write — the other slots stay intact, so going back to a previous
 * preset is instant and doesn't re-fetch anything that was already
 * pre-warmed.
 *
 * Migration: a one-time read of the legacy single-cache key
 * `prayer_times_cache` converts that data into the new `prayer_times_cache.v2`
 * shape so existing users keep their pre-cached months. The legacy key is
 * deleted after migration.
 */
export type CacheEntry = StoredPrayerData & {
  /** ISO timestamp of the last `getCachedPrayerTimes`/`getOrFetch…` hit on
   *  this entry. Used as the LRU key when storage hits quota. */
  lastAccessedAt: string;
  /** ISO timestamp of the last time fresh timings LANDED from a provider
   *  (network or on-device computation) — additive field (v2.7.30), absent
   *  on entries written by older versions. Surfaced on the Home hero as
   *  the data-freshness indicator. */
  lastFetchedAt?: string;
  /**
   * THE DEVICE'S UTC OFFSET WHEN THESE TIMES WERE STORED — issue #56.
   *
   * Every timing in here is a wall-clock string: "05:49". What that string
   * MEANS depends on the rule the clocks were running under when it was
   * written, and that rule is not a law of nature. Morocco abolished GMT+1
   * on 2026-09-20 and every stored row became an hour wrong in the same
   * instant — the strings did not change, the country did.
   *
   * Nothing in the cache could tell. There is no expiry that catches this
   * (the rows are not old, they are superseded), and no fingerprint: a
   * table fetched yesterday for tomorrow looks exactly as good as one
   * fetched under the new rule. So the offset is written down, and a
   * mismatch is what invalidation is made of.
   *
   * Minutes EAST of UTC, the sign people read it in: +60 for GMT+1, 0 for
   * GMT. Absent on entries written before this existed, which is treated
   * as "unknown" rather than as a mismatch — see `timezoneShift.ts`.
   */
  utcOffsetMinutes?: number;
  /**
   * Days (`YYYY-MM-DD`) stored from the phone's own calculation because the
   * provider missed them — offline, rate-limited, down. Kept beside the
   * months rather than in them: the widget and every other reader take a
   * day's TimingsMap as it is. A marked day is asked of the provider again
   * once the phone is online (`refetchFallbackDays`) and the mark goes when
   * the provider answers; before this, such a day was kept for good.
   */
  fallbackDays?: string[];
  /**
   * THE CLOCK THESE TIMES ARE WRITTEN ON — an IANA zone, or absent for the
   * phone's (`DEVICE_CLOCK`, `utils/prayerTimes.ts`).
   *
   * A slot is one provider, place and method, so its days are on one clock:
   * a saved Rabat from AlAdhan on Rabat's, wherever the phone is. Kept beside
   * the months, not in them — the widget and every other reader take a day's
   * TimingsMap as it is. Absent on entries written before it existed, which
   * read as the phone's clock, as they always were.
   */
  clock?: string;
  /**
   * The days on another clock than the slot's (`YYYY-MM-DD` → clock): a day
   * the phone computed when the provider missed it, on the phone's clock in
   * a slot on the place's. Absent when there are none.
   */
  dayClocks?: Record<string, string>;
};

export type V2Shape = {
  /**
   * Keyed by `cacheKey(params)` — see below. Round-tripped through JSON via
   * AsyncStorage; not encrypted (prayer times are derivable from coordinates,
   * which is the privacy-sensitive bit and lives in the encrypted store).
   */
  caches: Record<string, CacheEntry>;
};

export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The month to give up first when the cache must shrink: one already behind
 * us (the oldest of them), else the one furthest ahead — and the month we
 * are in only when it is all there is. The oldest key outright was this
 * month as soon as the past ones were gone, which is how a full disk evicted
 * today along with the day just fetched for it, and the next load fetched
 * it again, and lost it again.
 */
export function pickEvictableMonthKey(
  data: StoredPrayerData,
  now: Date = new Date(),
): string | null {
  const keys = Object.keys(data.months).sort();
  if (keys.length === 0) return null;
  const current = getMonthKey(now);
  if (keys[0] < current) return keys[0];
  const last = keys[keys.length - 1];
  return last > current ? last : keys[0];
}

export function evictOldestMonth(entry: CacheEntry): CacheEntry | null {
  const oldest = pickEvictableMonthKey(entry);
  if (!oldest) return null;
  const months = { ...entry.months };
  delete months[oldest];
  return { ...entry, months };
}

/**
 * Pick the cache entry to evict first under quota pressure: the one with the
 * oldest `lastAccessedAt`. Falls back to any non-current key if timestamps
 * are missing (e.g., freshly migrated entries).
 */
export function pickStalestCacheKey(v2: V2Shape, exclude: string): string | null {
  const keys = Object.keys(v2.caches).filter(k => k !== exclude);
  if (keys.length === 0) return null;
  return keys.reduce((a, b) => {
    const ta = Date.parse(v2.caches[a].lastAccessedAt) || 0;
    const tb = Date.parse(v2.caches[b].lastAccessedAt) || 0;
    return ta <= tb ? a : b;
  });
}

/**
 * The most the cache may hold, serialized. A location's year is about
 * 170 KB, so this is six or seven of them; past it the slots touched
 * longest ago go first. Android's AsyncStorage keeps a value in one SQLite
 * row read whole through a 2 MB cursor window, so a blob that kept growing
 * with every place visited would one day stop being readable at all.
 */
export const CACHE_MAX_CHARS = 1_200_000;

/**
 * Keep the blob under `CACHE_MAX_CHARS`: the slots accessed longest ago go
 * first, the one being written last of all — and only then its oldest
 * months. Returns the shape to write, serialized.
 */
export function capToSize(v2: V2Shape, activeKey: string): { shape: V2Shape; json: string } {
  let json = JSON.stringify(v2);
  if (json.length <= CACHE_MAX_CHARS) return { shape: v2, json };
  const caches = { ...v2.caches };
  const stamp = (k: string) => Date.parse(caches[k]?.lastAccessedAt) || 0;
  const others = Object.keys(caches)
    .filter(k => k !== activeKey)
    .sort((a, b) => stamp(a) - stamp(b));
  let size = json.length;
  for (const k of others) {
    if (size <= CACHE_MAX_CHARS) break;
    size -= JSON.stringify(k).length + 1 + JSON.stringify(caches[k]).length + 1;
    delete caches[k];
  }
  let shape: V2Shape = { ...v2, caches };
  json = JSON.stringify(shape);
  while (json.length > CACHE_MAX_CHARS && caches[activeKey]) {
    const slim = evictOldestMonth(caches[activeKey]);
    if (!slim) break;
    caches[activeKey] = slim;
    shape = { ...v2, caches };
    json = JSON.stringify(shape);
  }
  if (others.some(k => !(k in caches))) {
    console.warn('prayerStorage: over the size cap, evicted the least recently used locations');
  }
  return { shape, json };
}
