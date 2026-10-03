/**
 * Listening has its own place, apart from the reading marker.
 *
 * What it must get right: Tilāwah resumes from where the last LISTEN got
 * to, not from the muṣḥaf's marker; a page the muṣḥaf turned to follow a
 * listen is not counted as reading; a long-paused or stopped listen is
 * offered again beside shuffle and what the sunnah recommends for the
 * hour; and those recommendations follow the clock — Al-Kahf from
 * Thursday's maghrib to Friday's, the night's surahs at night.
 */
import { readFileSync } from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  _resetListenProgressForTests,
  coerceListenProgress,
  getListenProgress,
  isListenStale,
  noteListenPaused,
  recordListened,
  STALE_AFTER_MS,
} from '../src/quran/audio/listenProgress';
import { listenSuggestions, MAX_SUGGESTIONS } from '../src/quran/audio/listenSuggestions';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the listening place', () => {
  beforeEach(() => _resetListenProgressForTests());

  it('follows the listen, and knows when it was paused', () => {
    recordListened({ surah: 2, ayah: 120 }, 'husary', 1000);
    expect(getListenProgress()).toMatchObject({ surah: 2, ayah: 120, at: 1000, pausedAt: null });
    noteListenPaused(true, 5000);
    expect(getListenProgress()?.pausedAt).toBe(5000);
    noteListenPaused(true, 9000); // a second pause event keeps the first time
    expect(getListenProgress()?.pausedAt).toBe(5000);
    noteListenPaused(false, 9000);
    expect(getListenProgress()?.pausedAt).toBeNull();
  });

  it('goes stale after a long pause, not a short one', () => {
    const p = { surah: 2, ayah: 1, reciterId: 'x', at: 0, pausedAt: 1000 };
    expect(isListenStale(p, 1000 + STALE_AFTER_MS - 1)).toBe(false);
    expect(isListenStale(p, 1000 + STALE_AFTER_MS)).toBe(true);
    expect(isListenStale(null, Date.now())).toBe(false);
  });

  it('refuses a stored value that is not a place', () => {
    expect(coerceListenProgress({ surah: 0, ayah: 1 })).toBeNull();
    expect(coerceListenProgress({ surah: 115, ayah: 1 })).toBeNull();
    expect(coerceListenProgress('x')).toBeNull();
    expect(coerceListenProgress({ surah: 18, ayah: 10, at: 5 })).toMatchObject({ surah: 18, ayah: 10 });
  });
});

describe('the two places stay apart', () => {
  it('Tilawah starts from the listen, not the reading marker', () => {
    for (const f of ['src/screens/quran/TilawahScreen.tsx', 'src/screens/quran/TilawahRow.tsx']) {
      const src = read(f);
      expect(src).toMatch(/useListenProgress\(\)/);
      expect(src).not.toMatch(/=\s*quran\.lastRead/);
    }
  });

  it('a listen moves the listening place, and only a listen does', () => {
    const pb = read('src/quran/audio/playback.ts');
    expect(pb).toMatch(/if \(ref && listening\) recordListened\(ref, status\.reciterId\)/);
    expect(pb).toMatch(/recordListened\(start, prefs\.reciterId\)/);
  });

  it('a page the muṣḥaf turned to follow the recitation is reading, so a following bookmark moves', () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    // The pager settles only a finger's scrolls, so the follow has to
    // record its own turns; it used to rely on commitPageTurn and recorded
    // nothing.
    expect(core).toMatch(/recordPageReading\(page, prev\);\s*currentPageRef\.current = page;/);
    expect(core).not.toMatch(/followPageRef/);
    expect(core).not.toMatch(/isListening\(\)/);
  });

  it('offers carry on, shuffle and the recommendations when idle or stale', () => {
    const screen = read('src/screens/quran/TilawahScreen.tsx');
    expect(screen).toMatch(
      /const offerAgain =\s*idle \|\| \(!status\.playing && isListening\(\) && isListenStale\(listened\)\);/,
    );
    expect(screen).toMatch(/<ListenAgainPanel/);
  });
});

describe('what the hour recommends', () => {
  // 2026-10-01 is a Thursday, 2026-10-02 a Friday.
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
  const ids = (d: Date, maghrib: Date | null = null) =>
    listenSuggestions(d, maghrib).map(s => s.id);

  it('Al-Kahf from Thursday maghrib until Friday maghrib', () => {
    const thuMaghrib = at(1, 18, 27);
    expect(ids(at(1, 17), thuMaghrib)).not.toContain('kahf');
    expect(ids(at(1, 18, 30), thuMaghrib)[0]).toBe('kahf');
    expect(ids(at(2, 9))[0]).toBe('kahf');
    expect(ids(at(2, 18, 30), at(2, 18, 25))).not.toContain('kahf');
  });

  it("the night's surahs at night, Friday Fajr's on Friday morning", () => {
    expect(ids(at(3, 22))).toEqual(expect.arrayContaining(['mulk', 'baqarah-end']));
    expect(ids(at(2, 7))).toEqual(expect.arrayContaining(['kahf', 'sajdah-friday']));
  });

  it('always offers Al-Baqarah, and never more than the limit', () => {
    for (const d of [at(1, 3), at(1, 10), at(1, 16), at(1, 22), at(2, 8), at(5, 13)]) {
      const s = ids(d);
      expect(s).toContain('baqarah');
      expect(s.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    }
  });

  it('passages play just their ayahs', () => {
    const night = listenSuggestions(at(3, 22));
    expect(night.find(s => s.id === 'baqarah-end')?.to).toEqual({ surah: 2, ayah: 286 });
  });
});
