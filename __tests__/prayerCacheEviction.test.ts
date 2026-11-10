/**
 * What the prayer-times cache gives up first — asked directly.
 *
 * Until these were functions of their own, the only way to see the policy
 * was to fill a mocked disk through prayerStorage and watch what was left.
 */
import {
  CACHE_MAX_CHARS,
  capToSize,
  evictOldestMonth,
  pickEvictableMonthKey,
  pickStalestCacheKey,
  type CacheEntry,
  type V2Shape,
} from '../src/prayer/prayerCacheEviction';

const NOW = new Date(2026, 10, 10); // 10 November 2026

function entry(months: string[], lastAccessedAt = '2026-11-01T00:00:00Z', pad = 0): CacheEntry {
  return {
    provider: 'aladhan',
    latitude: 59.33,
    longitude: 18.07,
    calculationMethod: 3,
    school: 0,
    months: Object.fromEntries(
      months.map(m => [m, { [`${m}-01`]: { Fajr: '05:00', filler: 'x'.repeat(pad) } }]),
    ),
    lastAccessedAt,
  } as unknown as CacheEntry;
}

describe('pickEvictableMonthKey', () => {
  it('gives up a month already behind us first, the oldest of them', () => {
    expect(pickEvictableMonthKey(entry(['2026-09', '2026-10', '2026-11', '2026-12']), NOW)).toBe('2026-09');
  });

  it('then the month furthest ahead, never this one while another is left', () => {
    expect(pickEvictableMonthKey(entry(['2026-11', '2026-12', '2027-01']), NOW)).toBe('2027-01');
    expect(pickEvictableMonthKey(entry(['2026-11', '2026-12']), NOW)).toBe('2026-12');
  });

  it('this month only when it is all there is, and nothing from nothing', () => {
    expect(pickEvictableMonthKey(entry(['2026-11']), NOW)).toBe('2026-11');
    expect(pickEvictableMonthKey(entry([]), NOW)).toBeNull();
  });
});

describe('evictOldestMonth', () => {
  it('returns a copy without the month, and leaves the entry it was given alone', () => {
    const e = entry(['2020-01', '2099-12']);
    const slim = evictOldestMonth(e)!;
    expect(Object.keys(slim.months)).toEqual(['2099-12']);
    expect(Object.keys(e.months)).toEqual(['2020-01', '2099-12']);
    expect(slim.lastAccessedAt).toBe(e.lastAccessedAt);
  });

  it('has nothing to give from an empty entry', () => {
    expect(evictOldestMonth(entry([]))).toBeNull();
  });
});

describe('pickStalestCacheKey', () => {
  const v2: V2Shape = {
    caches: {
      home: entry(['2026-11'], '2026-11-09T00:00:00Z'),
      trip: entry(['2026-11'], '2026-03-01T00:00:00Z'),
      old: entry(['2026-11'], 'not a date'),
    },
  };

  it('is the slot touched longest ago — one with no readable stamp counts as oldest', () => {
    expect(pickStalestCacheKey(v2, 'home')).toBe('old');
    const { old: _old, ...rest } = v2.caches;
    expect(pickStalestCacheKey({ caches: rest }, 'home')).toBe('trip');
  });

  it('never the slot being written, and nothing when that is the only one', () => {
    expect(pickStalestCacheKey(v2, 'old')).toBe('trip');
    expect(pickStalestCacheKey({ caches: { home: v2.caches.home } }, 'home')).toBeNull();
  });
});

describe('capToSize', () => {
  const big = Math.floor(CACHE_MAX_CHARS / 3);

  it('leaves a blob under the cap exactly as it is', () => {
    const v2: V2Shape = { caches: { home: entry(['2026-11']) } };
    const { shape, json } = capToSize(v2, 'home');
    expect(shape).toBe(v2);
    expect(json).toBe(JSON.stringify(v2));
  });

  it('drops the slots touched longest ago first, and keeps the one being written', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const v2: V2Shape = {
      caches: {
        home: entry(['2026-11'], '2026-11-09T00:00:00Z', big),
        recent: entry(['2026-11'], '2026-11-08T00:00:00Z', big),
        stale: entry(['2026-11'], '2026-01-01T00:00:00Z', big),
        staler: entry(['2026-11'], '2025-01-01T00:00:00Z', big),
      },
    };
    const { shape, json } = capToSize(v2, 'home');
    expect(json.length).toBeLessThanOrEqual(CACHE_MAX_CHARS);
    expect(Object.keys(shape.caches).sort()).toEqual(['home', 'recent']);
    expect(JSON.parse(json)).toEqual(shape);
    // The shape it was given is not the one it trimmed.
    expect(Object.keys(v2.caches)).toHaveLength(4);
    warn.mockRestore();
  });

  it('only then trims the written slot’s own months — past ones before this one', () => {
    const now = new Date();
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = key(now);
    const past = key(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const ahead = key(new Date(now.getFullYear(), now.getMonth() + 2, 1));
    const v2: V2Shape = { caches: { home: entry([past, thisMonth, ahead], '2026-11-09T00:00:00Z', Math.floor(CACHE_MAX_CHARS / 2.2)) } };
    const { shape, json } = capToSize(v2, 'home');
    expect(json.length).toBeLessThanOrEqual(CACHE_MAX_CHARS);
    const left = Object.keys(shape.caches.home.months);
    expect(left).toContain(thisMonth);
    expect(left).not.toContain(past);
  });
});
