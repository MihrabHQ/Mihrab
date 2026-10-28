/**
 * Whole-surah recitations — issue #110.
 *
 * mp3quran.net keeps a surah in one file. An ayah plays as a CLIP of it: a
 * track that starts at the ayah (`trimStart`) and ends at its end
 * (`clipEnd`). These pin the table the clips come from, the queue built
 * from it, the download those recitations require, and the seam that stops
 * a clip from running on into the rest of its surah.
 */
import TrackPlayer, { type Track } from 'react-native-track-player';
import {
  _resetSurahTablesForTests,
  _setSurahTableForTests,
  ayahClip,
  clipAyahCount,
  confirmedBoundaries,
  excludedSurahs,
  expectedSurahBytes,
  hasSurahTable,
  isExactRecitation,
  isExactSurah,
  surahExcluded,
  surahFileSeconds,
  surahRecitationBytes,
} from '../src/quran/audio/surahRecitation';
import {
  RECITERS,
  SURAH_FILE_RECITERS,
  isWholeSurah,
  reciterRiwayah,
  surahAudioUrl,
} from '../src/quran/audio/reciters';
import {
  getPlaybackStatus,
  isPreviewing,
  listenFrom,
  previewReciter,
  playAyahOnRepeat,
  playRange,
  resumePlayback,
  seekInRecitation,
  seekTo,
  stopPlayback,
} from '../src/quran/audio/playback';
import { clipProgress } from '../src/quran/audio/useProgressWhileActive';
import { readFileSync } from 'fs';
import path from 'path';
import { setQuranPrefs } from '../src/quran/quranState';
import { ayahCount } from '../src/quran/ayahIndex';
import { riwayahAyahOf } from '../src/quran/riwayahAudio';
import {
  checkRemoteSurah,
  localSurahFileIfAny,
  surahChangedAtSource,
} from '../src/quran/audio/audioStore';
import { isRestTrack } from '../src/quran/audio/rest';
import { onStateChanged, watchSeam } from '../src/quran/audio/seams';

jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => null),
  prefetchAyahAudio: jest.fn(async () => null),
  localSurahFileIfAny: jest.fn(async () => null),
  surahChangedAtSource: jest.fn(async () => false),
  // Not on the device and the server not reachable, unless a test says so.
  checkRemoteSurah: jest.fn(async () => 'unreachable'),
  keepSurahQuietly: jest.fn(async () => null),
}));
jest.mock('../src/native/NowPlayingState', () => ({
  setNowPlayingState: jest.fn(),
}));
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.Platform.OS = 'ios';
  return rn;
});

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;
const local = localSurahFileIfAny as jest.Mock;
const changedAtSource = surahChangedAtSource as jest.Mock;
const remote = checkRemoteSurah as jest.Mock;
const queued = () => tp.add.mock.calls[tp.add.mock.calls.length - 1][0] as Track[];
const tick = () => new Promise(r => setTimeout(r, 0));
/** A player event's handler, as playback registered it when it set up. */
const handlers = new Map<string, (e: unknown) => void>();
const listener = (name: string) => handlers.get(name)!;
beforeAll(async () => {
  // Setting up registers the handlers; catch them before any clearAllMocks.
  await stopPlayback();
  await resumePlayback();
  for (const [name, fn] of tp.addEventListener.mock.calls) handlers.set(name, fn);
});
const num = (t: Track, k: string) => (t as Record<string, unknown>)[k] as number | undefined;

/* eslint-disable no-bitwise */
function packed(values: number[]): string {
  const bytes: number[] = [];
  for (const v of values) {
    const n = Math.round(v * 100);
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return Buffer.from(bytes).toString('base64');
}
function packed32(values: number[]): string {
  const bytes: number[] = [];
  for (const v of values) bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  return Buffer.from(bytes).toString('base64');
}
/* eslint-enable no-bitwise */

/**
 * A table where surah s, ayah a starts at 1000·s + 10·a seconds — every
 * boundary readable at a glance — in the given count.
 */
function syntheticTable(counts: number[]) {
  const bounds: number[] = [];
  counts.forEach((n, i) => {
    for (let a = 1; a <= n + 1; a++) bounds.push(1000 * (i + 1) + 10 * a);
  });
  const sizes = counts.map((_, i) => 1_000_000 + i);
  return {
    v: 2,
    n: counts,
    b: packed(bounds),
    // Long enough to hold every boundary: surah s ends by 1000·s + 10·(n+1).
    d: packed(counts.map((n, i) => 1000 * (i + 1) + 10 * (n + 2))),
    z: packed32(sizes),
    bytes: sizes.reduce((a, b) => a + b, 0),
  };
}

// The two counts, from what the app bundles: the Kufan (Ḥafṣ, Shuʿbah)
// and the Madani (Warsh, Qālūn) through the map riwayahAudio keeps — not
// from a downloaded muṣḥaf, which a test does not have.
const KUFAN = Array.from({ length: 114 }, (_, i) => ayahCount(i + 1));
const MADANI = KUFAN.map((n, i) => riwayahAyahOf('warsh', i + 1, n, true));
const countFor = (riwayah: string, s: number) =>
  riwayah === 'warsh' || riwayah === 'qalun' ? MADANI[s - 1] : KUFAN[s - 1];

describe('the catalogue', () => {
  it('lists the whole-surah recitations among the reciters, once each', () => {
    const ids = RECITERS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of SURAH_FILE_RECITERS) {
      expect(ids).toContain(r.id);
      expect(isWholeSurah(r)).toBe(true);
      expect(surahAudioUrl(r, 2)).toMatch(/^https:\/\/cdn\.mp3quran\.net\/audio\/.+\/002\.mp3$/);
    }
    // EveryAyah's voices are untouched.
    expect(RECITERS.filter(r => !isWholeSurah(r))).toHaveLength(44);
  });

  it('never offers the same recording twice', () => {
    // "Al-Qaria Yassen" on mp3quran is EveryAyah's Yassin Al-Jazaery, and
    // "Ahmad Nauina" is Ahmed Neana — measured, not guessed. Neither is here.
    const servers = SURAH_FILE_RECITERS.map(r => r.surahFiles!.server);
    expect(new Set(servers).size).toBe(servers.length);
    expect(servers.join(' ')).not.toMatch(/yassen-jazairi|ahmad-naina/);
  });
});

describe('the bundled boundaries', () => {
  afterEach(() => _resetSurahTablesForTests());

  it.each(SURAH_FILE_RECITERS.map(r => [r.id, r] as const))(
    '%s: every surah, in its reading’s count, in order',
    (id, reciter) => {
      expect(hasSurahTable(id)).toBe(true);
      expect(surahRecitationBytes(id)).toBeGreaterThan(100_000_000);
      for (let s = 1; s <= 114; s++) {
        const n = clipAyahCount(id, s)!;
        expect(n).toBe(countFor(reciterRiwayah(reciter), s));
        let prev = -1;
        for (let a = 1; a <= n; a++) {
          const clip = ayahClip(id, s, a)!;
          expect(clip.start).toBeGreaterThan(prev);
          expect(clip.end).toBeGreaterThan(clip.start);
          prev = clip.start;
        }
      }
    },
  );
});

describe('the counts mapped onto each other, every surah', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { recordedAyahs } = require('../src/quran/audio/recordedAyahs');
  const pairs: Array<[string, string]> = [
    ['hafs', 'warsh'],
    ['hafs', 'qalun'],
    ['warsh', 'hafs'],
    ['qalun', 'hafs'],
    ['shubah', 'warsh'],
    ['warsh', 'shubah'],
  ];
  it.each(pairs)('a listen on a %s page in a %s voice hears every recorded ayah once, in order', (reader, recording) => {
    for (let s = 1; s <= 114; s++) {
      const readerN = countFor(reader, s);
      const recordedN = countFor(recording, s);
      let next = 1;
      for (let a = 1; a <= readerN; a++) {
        const span = recordedAyahs(reader, recording, s, a, a > 1);
        if (!span) continue; // already heard with the ayah before
        const [first, last] = span;
        expect(first).toBe(next);
        expect(last).toBeGreaterThanOrEqual(first);
        next = last + 1;
      }
      expect(next - 1).toBe(recordedN);
    }
  });

  it.each(pairs)('an ayah on its own (%s page, %s voice) is inside the recording', (reader, recording) => {
    for (let s = 1; s <= 114; s++) {
      const recordedN = countFor(recording, s);
      for (let a = 1; a <= countFor(reader, s); a++) {
        const span = recordedAyahs(reader, recording, s, a, false)!;
        expect(span[0]).toBeGreaterThanOrEqual(1);
        expect(span[1]).toBeLessThanOrEqual(recordedN);
        expect(span[1]).toBeGreaterThanOrEqual(span[0]);
      }
    }
  });
});

describe('the Madani count, through the map', () => {
  it('reaches the end of al-Wāqiʿah, three ayahs past Ḥafṣ', () => {
    // riwayahAyahOf used to look at most two ayahs ahead, and al-Wāqiʿah
    // ends three ahead (99 Madani to 96 Ḥafṣ): its last ayahs mapped wrong.
    expect(riwayahAyahOf('warsh', 56, 96, true)).toBe(99);
    expect(MADANI.reduce((a, b) => a + b, 0)).toBe(6214);
  });
});

describe('reading a table', () => {
  afterEach(() => _resetSurahTablesForTests());

  it('gives each ayah its start and end, and the surah’s opening on request', () => {
    _setSurahTableForTests('husary-warsh', syntheticTable(MADANI));
    expect(ayahClip('husary-warsh', 2, 3)).toEqual({ start: 2030, end: 2040 });
    expect(ayahClip('husary-warsh', 2, 1)).toEqual({ start: 2010, end: 2020 });
    expect(ayahClip('husary-warsh', 2, 1, true)).toEqual({ start: 0, end: 2020 });
    expect(ayahClip('husary-warsh', 2, MADANI[1] + 1)).toBeNull();
    expect(surahRecitationBytes('husary-warsh')).toBe(
      MADANI.reduce((a, _n, i) => a + 1_000_000 + i, 0),
    );
  });

  it('refuses a table that does not add up, rather than cut in the wrong places', () => {
    const bad = syntheticTable(MADANI);
    _setSurahTableForTests('husary-warsh', { ...bad, n: [...bad.n.slice(0, 113), 99] });
    expect(ayahClip('husary-warsh', 1, 1)).toBeNull();
    expect(hasSurahTable('husary-warsh')).toBe(false);
  });

  /** The v3 form: `c` sets one bit per boundary, most significant first. */
  function confirmedTable(counts: number[], unconfirmed: number[] = []) {
    const total = counts.reduce((a, n) => a + n + 1, 0);
    const bytes = new Uint8Array(Math.ceil(total / 8));
    /* eslint-disable no-bitwise */
    for (let k = 0; k < total; k++) {
      if (!unconfirmed.includes(k)) bytes[k >> 3] |= 0x80 >> (k & 7);
    }
    /* eslint-enable no-bitwise */
    return { ...syntheticTable(counts), v: 3, c: Buffer.from(bytes).toString('base64') };
  }

  it('reads a v3 table the same way, and knows every boundary was confirmed', () => {
    _setSurahTableForTests('zahrani', confirmedTable(KUFAN));
    expect(ayahClip('zahrani', 2, 3)).toEqual({ start: 2030, end: 2040 });
    expect(isExactRecitation('zahrani')).toBe(true);
    const total = KUFAN.reduce((a, n) => a + n + 1, 0);
    expect(confirmedBoundaries('zahrani')).toEqual({ confirmed: total, total });
  });

  it('is not exact while one boundary is still a best attempt', () => {
    _setSurahTableForTests('zahrani', confirmedTable(KUFAN, [42]));
    expect(isExactRecitation('zahrani')).toBe(false);
    // Boundary 42 is in al-Baqarah (al-Fātiḥah holds the first 8): that
    // surah alone is the best attempt; every other surah is exact.
    expect(isExactSurah('zahrani', 2)).toBe(false);
    expect(isExactSurah('zahrani', 1)).toBe(true);
    expect(isExactSurah('zahrani', 114)).toBe(true);
    const total = KUFAN.reduce((a, n) => a + n + 1, 0);
    expect(confirmedBoundaries('zahrani')).toEqual({ confirmed: total - 1, total });
    // Still playable: an unconfirmed boundary is the shipped one.
    expect(ayahClip('zahrani', 1, 1)).not.toBeNull();
  });

  it('counts a v2 table as best attempts throughout', () => {
    _setSurahTableForTests('zahrani', syntheticTable(KUFAN));
    expect(isExactRecitation('zahrani')).toBe(false);
    expect(confirmedBoundaries('zahrani')?.confirmed).toBe(0);
  });

  it('refuses a v3 table without its bits', () => {
    const noBits: Record<string, unknown> = confirmedTable(KUFAN);
    delete noBits.c;
    _setSurahTableForTests('zahrani', noBits as Parameters<typeof _setSurahTableForTests>[1]);
    expect(hasSurahTable('zahrani')).toBe(false);
    expect(isExactRecitation('zahrani')).toBe(false);
  });

  it('has no report link and no best-effort note for an exact recitation', () => {
    _setSurahTableForTests('zahrani', confirmedTable(KUFAN));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ayahBoundaryReportUrl } = require('../src/quran/audio/ayahBoundaryReport');
    expect(ayahBoundaryReportUrl('zahrani', 2, 255, 'hafs')).toBeNull();
  });

  it('leaves a surah the recording does not hold out of everything but its boundaries', () => {
    _setSurahTableForTests('zahrani', { ...confirmedTable(KUFAN, [42]), x: [2] });
    // Exact without it, and the sheet says so of that surah alone.
    expect(isExactRecitation('zahrani')).toBe(true);
    expect(isExactSurah('zahrani', 2)).toBe(false);
    expect(surahExcluded('zahrani', 2)).toBe(true);
    expect(excludedSurahs('zahrani')).toEqual([2]);
    expect(surahRecitationBytes('zahrani')).toBe(
      KUFAN.reduce((a, _n, i) => a + 1_000_000 + i, 0) - (1_000_000 + 1),
    );
    // Still readable: the table's boundaries for it are the shipped ones.
    expect(ayahClip('zahrani', 2, 3)).toEqual({ start: 2030, end: 2040 });
    // No report for a surah that is never played.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ayahBoundaryReportUrl } = require('../src/quran/audio/ayahBoundaryReport');
    expect(ayahBoundaryReportUrl('zahrani', 2, 3, 'hafs')).toBeNull();
    // (That it is never fetched, streamed or counted: wholeSurahSafety.)
  });

  it('refuses a table whose excluded surahs are not surahs', () => {
    _setSurahTableForTests('zahrani', { ...confirmedTable(KUFAN), x: [0, 115] });
    expect(hasSurahTable('zahrani')).toBe(false);
  });

  it('keeps the report for the one surah that is still a best attempt', () => {
    _setSurahTableForTests('zahrani', confirmedTable(KUFAN, [42]));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ayahBoundaryReportUrl } = require('../src/quran/audio/ayahBoundaryReport');
    expect(ayahBoundaryReportUrl('zahrani', 2, 255, 'hafs')).not.toBeNull();
    expect(ayahBoundaryReportUrl('zahrani', 3, 1, 'hafs')).toBeNull();
  });
});

describe('the bundled tables, as shipped', () => {
  afterEach(() => _resetSurahTablesForTests());

  /** The table's own `bytes`: the sum of every surah file, held or not. */
  function uint32Sum(id: string): number {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require(`../src/quran/data/surahRecitations/${id}.json`) as { bytes: number }).bytes;
  }

  it('are v3, every boundary confirmed — Al-Buʿayjan without Ṭā-Hā, which his recording does not hold', () => {
    for (const r of SURAH_FILE_RECITERS) {
      const { confirmed, total } = confirmedBoundaries(r.id)!;
      expect(confirmed).toBe(total);
      expect(isExactRecitation(r.id)).toBe(true);
      // The file stops partway through 20:133: the surah is excluded from
      // the voice altogether, and is the only one anywhere.
      expect(excludedSurahs(r.id)).toEqual(r.id === 'buaijan' ? [20] : []);
    }
    expect(surahExcluded('buaijan', 20)).toBe(true);
    expect(isExactSurah('buaijan', 20)).toBe(false);
    expect(isExactSurah('buaijan', 19)).toBe(true);
    // Its download is the recitation without that file.
    expect(surahRecitationBytes('buaijan')).toBe(
      uint32Sum('buaijan') - expectedSurahBytes('buaijan', 20)!,
    );
  });

  it('start every surah after its opening, and inside its file', () => {
    // Three recordings open straight on the first ayah, no basmalah before
    // it (heard): Balilah's Ghāfir, Wadee' Al-Yamani's ad-Dukhān and al-Ḥadīd.
    const noOpening = new Set(['balilah:40', 'wadee-yamani:44', 'wadee-yamani:57']);
    for (const r of SURAH_FILE_RECITERS) {
      for (let s = 1; s <= 114; s++) {
        const first = ayahClip(r.id, s, 1)!;
        const n = clipAyahCount(r.id, s)!;
        const last = ayahClip(r.id, s, n)!;
        // Al-Fātiḥah's basmalah is its first ayah; at-Tawbah has none; every
        // other surah opens with a basmalah the reader is not played in the
        // ayah — so its first ayah cannot start at the file's first instant.
        if (s !== 1 && s !== 9 && !noOpening.has(`${r.id}:${s}`)) {
          expect(first.start).toBeGreaterThan(1);
        }
        expect(last.end).toBeLessThanOrEqual(surahFileSeconds(r.id, s)! + 0.5);
      }
    }
  });
});

describe('playing a whole-surah recitation', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    changedAtSource.mockResolvedValue(false);
    remote.mockResolvedValue('unreachable');
    _setSurahTableForTests('husary-warsh', syntheticTable(MADANI));
    _setSurahTableForTests('zahrani', syntheticTable(KUFAN));
    local.mockImplementation(async (_id: string, surah: number) => `/docs/${surah}.mp3`);
    await stopPlayback();
  });
  afterAll(() => _resetSurahTablesForTests());

  it('queues each ayah as a clip of its surah’s file', async () => {
    expect(MADANI.reduce((a, b) => a + b, 0)).toBe(6214);
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 3 });
    const q = queued();
    expect(q.map(t => t.url)).toEqual(Array(3).fill('file:///docs/2.mp3'));
    // The first ayah from the top of the file — the surah's opening with it.
    expect(num(q[0], 'trimStart')).toBeUndefined();
    expect(num(q[0], 'clipEnd')).toBe(2020);
    expect([num(q[1], 'trimStart'), num(q[1], 'clipEnd')]).toEqual([2020, 2030]);
    expect([num(q[2], 'trimStart'), num(q[2], 'clipEnd')]).toEqual([2030, 2040]);
  });

  it('drills an ayah without the opening, and lands on its start', async () => {
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 3, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 1 });
    const q = queued().filter(t => !isRestTrack(t));
    expect(q).toHaveLength(3);
    for (const t of q) expect(num(t, 'trimStart')).toBe(2010);
    // Started at the clip, not at the top of the file and a seek after.
    expect(tp.skip).toHaveBeenCalledWith(0, 2010);
  });

  it('rests for the length of the clip in a drill', async () => {
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 2, range: 1, pauseFactor: 1 } });
    await playRange({ surah: 2, ayah: 2 }, { surah: 2, ayah: 2 });
    const shape = queued().map(t => (isRestTrack(t) ? 'r' : 'a')).join('');
    expect(shape).toMatch(/^ar+a$/);
  });

  it('maps the reader’s count onto the recording’s', async () => {
    // A Ḥafṣ reader hearing a Warsh voice. Al-Baqarah is 286 ayahs in one
    // count and 285 in the other, divided differently: Ḥafṣ 2:1–2 is one
    // Madani ayah, heard once, and every clip still runs forward in the file.
    setQuranPrefs({ reciterId: 'husary-warsh', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 286 });
    const q = queued();
    let last = 0;
    for (const t of q) {
      const start = num(t, 'trimStart') ?? 0;
      expect(start).toBeGreaterThanOrEqual(last);
      expect(num(t, 'clipEnd')!).toBeGreaterThan(start);
      last = num(t, 'clipEnd')!;
    }
    expect(last).toBe(2000 + 10 * (MADANI[1] + 1));
    expect(q.length).toBeLessThan(286);
  });

  it('does not play without the download, and says which surah it needs', async () => {
    local.mockImplementation(async () => null);
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 18, ayah: 1 }, { surah: 18, ayah: 10 });
    expect(tp.add).not.toHaveBeenCalled();
    expect(tp.play).not.toHaveBeenCalled();
    const st = getPlaybackStatus();
    expect(st.needsDownload).toEqual({ reciterId: 'zahrani', surah: 18, reason: 'missing' });
    expect(st.active).toEqual({ surah: 18, ayah: 1 });
    expect(st.playing).toBe(false);

    // Play on the card asks again — and plays once the file is there.
    local.mockImplementation(async (_id: string, surah: number) => `/docs/${surah}.mp3`);
    await resumePlayback();
    expect(tp.add).toHaveBeenCalled();
    expect(getPlaybackStatus().needsDownload).toBeNull();
  });

  it('loops one ayah as a single clip', async () => {
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs' });
    await playAyahOnRepeat(36, 5);
    const q = queued();
    expect(q).toHaveLength(1);
    expect([num(q[0], 'trimStart'), num(q[0], 'clipEnd')]).toEqual([36050, 36060]);
    expect(tp.setRepeatMode).toHaveBeenLastCalledWith(2);
  });

  it('streams a surah the server confirms at its exact size', async () => {
    local.mockImplementation(async () => null);
    remote.mockResolvedValue('ok');
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 18, ayah: 1 }, { surah: 18, ayah: 3 });
    const q = queued();
    expect(q).toHaveLength(3);
    for (const t of q) expect(t.url).toBe('https://cdn.mp3quran.net/audio/abdulaziz-zahrani/r1/018.mp3');
    expect(getPlaybackStatus().needsDownload ?? null).toBeNull();
  });

  it('never streams a file the server serves at another size', async () => {
    local.mockImplementation(async () => null);
    remote.mockResolvedValue('changed');
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs' });
    await playRange({ surah: 18, ayah: 1 }, { surah: 18, ayah: 3 });
    expect(tp.add).not.toHaveBeenCalled();
    expect(getPlaybackStatus().needsDownload).toEqual({ reciterId: 'zahrani', surah: 18, reason: 'changed' });
  });

  it('previews a voice with al-Fātiḥah, and leaves the chosen one as it was', async () => {
    setQuranPrefs({ reciterId: 'husary', riwayah: 'hafs' });
    await previewReciter('zahrani');
    const q = queued();
    expect(q.every(t => String(t.id).startsWith('1:'))).toBe(true);
    expect(q).toHaveLength(7);
    const st = getPlaybackStatus();
    expect(st.reciterId).toBe('zahrani');
    expect(isPreviewing(st, 'zahrani')).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('../src/quran/quranState').getQuranState().prefs.reciterId).toBe('husary');
  });

  it('says a surah changed at its source cannot be played, rather than offering a download', async () => {
    changedAtSource.mockImplementation(async (_id: string, surah: number) => surah === 36);
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 36, ayah: 1 }, { surah: 36, ayah: 5 });
    expect(tp.add).not.toHaveBeenCalled();
    expect(getPlaybackStatus().needsDownload).toEqual({ reciterId: 'zahrani', surah: 36, reason: 'changed' });
    // The player's own stop, from the queue reset under the card and
    // delivered after it, does not take the card away: the reader would be
    // left with nothing playing and no word why.
    listener('playback-state')({ state: 'none' });
    expect(getPlaybackStatus().active).toEqual({ surah: 36, ayah: 1 });
    expect(getPlaybackStatus().needsDownload?.surah).toBe(36);
    // Closing it does.
    await stopPlayback();
    expect(getPlaybackStatus().active).toBeNull();
    expect(getPlaybackStatus().needsDownload).toBeNull();
  });

  it('stays playing through the buffering at a join; a pause or a stop ends it', () => {
    const state = listener('playback-state');
    state({ state: 'playing' });
    expect(getPlaybackStatus().playing).toBe(true);
    // Every clip is its own player item, and each join buffers for a
    // moment: the ayah stays lit through it.
    state({ state: 'buffering' });
    expect(getPlaybackStatus()).toMatchObject({ playing: true, loading: true });
    state({ state: 'playing' });
    expect(getPlaybackStatus()).toMatchObject({ playing: true, loading: false });
    state({ state: 'paused' });
    expect(getPlaybackStatus().playing).toBe(false);
    // Loading after a pause is not playing yet.
    state({ state: 'loading' });
    expect(getPlaybackStatus()).toMatchObject({ playing: false, loading: true });
    state({ state: 'playing' });
    state({ state: 'stopped' });
    expect(getPlaybackStatus()).toMatchObject({ playing: false, loading: false });
  });

  it('ends a listen at a surah not on the device, and says so when it gets there', async () => {
    local.mockImplementation(async (_id: string, surah: number) => (surah === 114 ? null : `/docs/${surah}.mp3`));
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs' });
    await listenFrom(113, 1);
    const q = queued();
    // Al-Falaq whole, and nothing of an-Nās.
    expect(q.every(t => String(t.id).startsWith('113:'))).toBe(true);
    const emit = listener('playback-active-track-changed');
    const ended = listener('playback-queue-ended');
    // A reset's own "stopped" (no track of this queue played) says nothing.
    ended({});
    await tick();
    expect(getPlaybackStatus().needsDownload ?? null).toBeNull();
    // The last ayah before the hole plays out: now it is said.
    emit({ track: q[q.length - 1] });
    tp.reset.mockClear();
    ended({});
    await tick();
    await tick();
    expect(getPlaybackStatus().needsDownload).toEqual({ reciterId: 'zahrani', surah: 114, reason: 'missing' });
    expect(getPlaybackStatus().active).toEqual({ surah: 114, ayah: 1 });
    // The player let go of the last file, so the card's progress is not
    // that file's last seconds.
    expect(tp.reset).toHaveBeenCalled();
  });

  it('keeps the current clip in the status, for the ayah’s own progress', async () => {
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 2, ayah: 4 }, { surah: 2, ayah: 6 });
    listener('playback-active-track-changed')({ track: queued()[1] });
    expect(getPlaybackStatus().clip).toEqual({ start: 2050, end: 2060 });
    // The app's own scrubber speaks the ayah's seconds, and stays inside it.
    await seekTo(3);
    expect(tp.seekTo).toHaveBeenLastCalledWith(2053);
    await seekTo(99);
    expect(tp.seekTo).toHaveBeenLastCalledWith(2060 - 0.05);
  });

  it('stops a surah whose file runs a different length from the one measured', async () => {
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    await playRange({ surah: 5, ayah: 2 }, { surah: 5, ayah: 3 });
    // Measured: 5000 + 10·(n+2) seconds. Playing: a minute short.
    const measured = 5000 + 10 * (KUFAN[4] + 2);
    tp.getProgress.mockResolvedValue({ position: 5020, duration: measured - 60, buffered: 0 });
    tp.getActiveTrack.mockResolvedValue(queued()[0]);
    listener('playback-active-track-changed')({ track: queued()[0] });
    await tick();
    await tick();
    expect(getPlaybackStatus().needsDownload).toEqual({ reciterId: 'zahrani', surah: 5, reason: 'changed' });
    tp.getProgress.mockResolvedValue({ position: 0, duration: 0, buffered: 0 });
    tp.getActiveTrack.mockResolvedValue(null);
  });

  it('does not judge a surah by the next file’s length when the player has moved on', async () => {
    setQuranPrefs({ reciterId: 'zahrani', riwayah: 'hafs', repeat: { eachAyah: 1, range: 1, pauseFactor: 0 } });
    // 112:4, the last clip of its file, then 113:1 — another file.
    await playRange({ surah: 112, ayah: 4 }, { surah: 113, ayah: 1 });
    const [last, next] = queued();
    // The length the player reports is already the NEXT file's (a minute
    // longer than 112's measured), and the active track has moved on.
    tp.getProgress.mockResolvedValue({ position: 0, duration: 113_000 + 10 * (KUFAN[112] + 2), buffered: 0 });
    tp.getActiveTrack.mockResolvedValue(next);
    listener('playback-active-track-changed')({ track: last });
    listener('playback-active-track-changed')({ track: next });
    await tick();
    await tick();
    expect(getPlaybackStatus().needsDownload).toBeNull();
    expect(getPlaybackStatus().active).toEqual({ surah: 113, ayah: 1 });
    tp.getProgress.mockResolvedValue({ position: 0, duration: 0, buffered: 0 });
    tp.getActiveTrack.mockResolvedValue(null);
  });
});

describe('progress and scrubbing inside an ayah', () => {
  it('measures an ayah’s progress from its own start', () => {
    const p = clipProgress({ position: 2055, duration: 9000, buffered: 2070 }, { start: 2050, end: 2060 });
    expect(p).toEqual({ position: 5, duration: 10, buffered: 10 });
    // Any other track passes through as it is.
    const plain = { position: 3, duration: 7, buffered: 7 };
    expect(clipProgress(plain, null)).toBe(plain);
  });

  const clipAt = (i: number, a: number) => ({
    id: `2:${a}:${i}`,
    url: 'file:///docs/2.mp3',
    trimStart: 2000 + 10 * a,
    clipEnd: 2010 + 10 * a,
  });
  beforeEach(() => {
    jest.clearAllMocks();
    tp.getQueue.mockResolvedValue([clipAt(0, 4), clipAt(1, 5), clipAt(2, 6)]);
    tp.getActiveTrackIndex.mockResolvedValue(1);
  });
  afterAll(() => {
    tp.getQueue.mockResolvedValue([]);
    tp.getActiveTrackIndex.mockResolvedValue(0);
  });

  it('plays from a scrub inside the ayah', async () => {
    await seekInRecitation(2053);
    expect(tp.seekTo).toHaveBeenCalledWith(2053);
  });

  it('goes to the queued ayah a scrub lands in, there', async () => {
    await seekInRecitation(2064);
    expect(tp.skip).toHaveBeenCalledWith(2, 2064);
  });

  it('stays in the ayah for a scrub outside the range', async () => {
    await seekInRecitation(9000);
    expect(tp.seekTo).toHaveBeenCalledWith(2060 - 0.05);
    await seekInRecitation(10);
    expect(tp.seekTo).toHaveBeenLastCalledWith(2050);
  });
});

describe('the reports and suggestions around it', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ayahBoundaryReportUrl, clock } = require('../src/quran/audio/ayahBoundaryReport');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { voicesFor } = require('../src/quran/audio/ReadingVoiceHint');
  beforeEach(() => _setSurahTableForTests('zahrani', syntheticTable(KUFAN)));

  it('opens an issue holding everything a fix needs, and nothing personal', () => {
    const url: string = ayahBoundaryReportUrl('zahrani', 2, 255, 'hafs');
    expect(url.startsWith('https://github.com/MihrabHQ/Mihrab/issues/new?')).toBe(true);
    const body = decodeURIComponent(url.slice(url.indexOf('&body=') + 6));
    expect(body).toContain('zahrani');
    expect(body).toContain('2:255');
    expect(body).toContain(`starts at ${clock(2000 + 2550)}`);
    expect(body).toContain('abdulaziz-zahrani/r1/002.mp3');
  });

  it('names the recording’s own ayah when the page counts differently', () => {
    _setSurahTableForTests('husary-warsh', syntheticTable(MADANI));
    // Ḥafṣ 2:2 is inside Madani 2:1 (Ḥafṣ 2:1–2 are one Madani ayah).
    const url: string = ayahBoundaryReportUrl('husary-warsh', 2, 2, 'hafs');
    const body = decodeURIComponent(url.slice(url.indexOf('&body=') + 6));
    expect(body).toMatch(/2:1 in the recording's count \(2:2 on the hafs page\)/);
  });

  it('has no report for a voice whose ayahs are files of their own', () => {
    expect(ayahBoundaryReportUrl('husary', 2, 255, 'hafs')).toBeNull();
  });

  it('suggests the voices of the page’s reading, word timings first', () => {
    expect(voicesFor('qalun').map((r: { id: string }) => r.id).sort()).toEqual(['husary-qalun', 'qalun-hudhaify']);
    expect(voicesFor('shubah').map((r: { id: string }) => r.id)).toEqual(['shubah-hudhaify']);
    const hafs = voicesFor('hafs');
    const firstUntimed = hafs.findIndex((r: { hasTimings: boolean }) => !r.hasTimings);
    expect(hafs.slice(firstUntimed).every((r: { hasTimings: boolean }) => !r.hasTimings)).toBe(true);
  });
});

describe('the iOS player, natively', () => {
  const patch = readFileSync(
    path.join(__dirname, '..', 'patches', 'react-native-track-player+4.1.2.patch'),
    'utf8',
  );
  it('starts only a clip at an offset; every other track loads as it always did', () => {
    expect(patch).toMatch(/class ClipTrack: Track, InitialTiming/);
    expect(patch).toMatch(/if dictionary\["clipEnd"\] != nil \{ return ClipTrack\(dictionary: dictionary\) \}/);
    expect(patch).not.toMatch(/class Track: AudioItem, TimePitching, AssetOptionsProviding, InitialTiming/);
  });
});

describe('the Android seam, natively', () => {
  const patchText = readFileSync(
    path.join(__dirname, '..', 'patches', 'react-native-track-player+4.1.2.patch'),
    'utf8',
  );
  it('moves a file of its own on exactly as before', () => {
    expect(patchText).toMatch(/if \(clipEnd == null\) \{[\s\S]{0,200}if \(player\.nextItem != null\) player\.next\(\)/);
  });

  const patch = readFileSync(
    path.join(__dirname, '..', 'patches', 'react-native-track-player+4.1.2.patch'),
    'utf8',
  );
  it('falls back to a plain skip when it cannot reach the player inside', () => {
    expect(patch).toMatch(/if \(e == null \|\| ms <= 0L\) \{\s*\+\s*player\.jumpToItem\(index\)/);
  });
  it('stops at the last clip, or loops it, rather than playing on', () => {
    expect(patch).toMatch(/private fun endOfClips\(\)/);
    expect(patch).toMatch(/RepeatMode\.ALL\) \{\s*\+\s*jumpTo\(0, startOf\(0\)\)/);
    expect(patch).toMatch(/player\.stop\(\)/);
  });
});

describe('the seam at the end of a clip (iOS, from JS)', () => {
  const clip = { id: '2:3:0', url: 'file:///docs/2.mp3', trimStart: 2030, clipEnd: 2040 };
  beforeEach(() => {
    jest.clearAllMocks();
    tp.getActiveTrack.mockResolvedValue(clip);
    tp.getPlaybackState.mockResolvedValue({ state: 'playing' });
    tp.getRate.mockResolvedValue(1);
    tp.getActiveTrackIndex.mockResolvedValue(0);
    tp.getProgress.mockResolvedValue({ position: 2040, duration: 9000, buffered: 0 });
  });
  afterEach(() => onStateChanged('paused'));

  it('moves to the next clip at its own start', async () => {
    tp.getTrack.mockResolvedValue({ ...clip, id: '2:4:1', trimStart: 2040, clipEnd: 2050 });
    await watchSeam();
    expect(tp.skip).toHaveBeenCalledWith(1, 2040);
    expect(tp.stop).not.toHaveBeenCalled();
  });

  it('stops at the end of the range instead of playing on into the surah', async () => {
    tp.getTrack.mockResolvedValue(undefined);
    tp.getRepeatMode.mockResolvedValue(0);
    await watchSeam();
    expect(tp.stop).toHaveBeenCalled();
    expect(tp.skip).not.toHaveBeenCalled();
  });

  it('goes round again when the queue is on repeat', async () => {
    tp.getTrack.mockImplementation(async (i: number) => (i === 0 ? clip : undefined));
    tp.getRepeatMode.mockResolvedValue(2);
    await watchSeam();
    expect(tp.skip).toHaveBeenCalledWith(0, 2030);
    expect(tp.stop).not.toHaveBeenCalled();
  });
});
