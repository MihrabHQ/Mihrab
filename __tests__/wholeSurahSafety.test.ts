/**
 * Whole-surah recitations, failing safe (#110).
 *
 * The boundaries fit one recording byte for byte. These pin what keeps a
 * reader from ever hearing an ayah cut in the wrong place: a surah file is
 * used only at its exact measured size; a download that keeps arriving at
 * another size marks that surah as changed at its source instead of being
 * fetched for ever; a reciter whose boundaries are missing or broken is not
 * offered at all; and a download says which surahs it could not fetch, and
 * stops cleanly when the disk is full.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  _resetRemoteSurahChecksForTests,
  checkRemoteSurah,
  deleteSurahFile,
  downloadSurahAudio,
  keepSurahQuietly,
  surahFileState,
  downloadReciterAudio,
  failedSurahsOf,
  localSurahFileIfAny,
  reciterAudioStats,
  surahAudioFilePath,
  surahChangedAtSource,
} from '../src/quran/audio/audioStore';
import {
  _resetSurahTablesForTests,
  _setSurahTableForTests,
  expectedSurahBytes,
} from '../src/quran/audio/surahRecitation';
import {
  DEFAULT_RECITER_ID,
  findReciter,
  isPlayable,
  searchReciters,
} from '../src/quran/audio/reciters';
import { ayahCount } from '../src/quran/ayahIndex';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const files: Map<string, string> = require('react-native-blob-util').__files;
const blob = ReactNativeBlobUtil as unknown as {
  config: jest.Mock;
  fs: Record<string, jest.Mock | unknown>;
};

/* eslint-disable no-bitwise */
const pack = (values: number[], width: 3 | 4, scale = 1) => {
  const out: number[] = [];
  for (const v of values) {
    const n = Math.round(v * scale);
    for (let k = width - 1; k >= 0; k--) out.push((n >>> (8 * k)) & 255);
  }
  return Buffer.from(out).toString('base64');
};
/* eslint-enable no-bitwise */

/** Surah s's file is 2000 + s bytes; its ayahs are ten seconds apart. */
const sizeOf = (s: number) => 2000 + s;
function table() {
  const n = Array.from({ length: 114 }, (_, i) => ayahCount(i + 1));
  const bounds: number[] = [];
  n.forEach(c => {
    for (let a = 1; a <= c + 1; a++) bounds.push(10 * a);
  });
  const sizes = n.map((_, i) => sizeOf(i + 1));
  return {
    v: 2,
    n,
    b: pack(bounds, 3, 100),
    d: pack(n.map(c => 10 * (c + 2)), 3, 100),
    z: pack(sizes, 4),
    bytes: sizes.reduce((a, b) => a + b, 0),
  };
}

/** A file the four-byte check reads as an MP3 ("ID3", base64 "SUQz"). */
const audio = (size: number) => 'SUQz'.padEnd(size, 'x');

const ID = 'zahrani';
let serve: (surah: number) => number;
let free: number;

beforeEach(() => {
  files.clear();
  _resetSurahTablesForTests();
  _setSurahTableForTests(ID, table());
  serve = sizeOf;
  free = 50 * 1024 ** 3;
  blob.fs.slice = jest.fn(async (src: string, dest: string, start: number, end: number) => {
    files.set(dest, (files.get(src) ?? '').slice(start, end));
    return dest;
  });
  blob.fs.df = jest.fn(async () => ({ free, internal_free: String(free) }));
  blob.config.mockImplementation(({ path }: { path: string }) => ({
    fetch: (_m: string, url: string) => {
      const surah = Number(/(\d{3})\.mp3$/.exec(url)![1]);
      const p = Promise.resolve().then(() => {
        files.set(path, audio(serve(surah)));
        return { info: () => ({ status: 200 }) };
      }) as Promise<unknown> & { progress: () => unknown; cancel: () => void };
      p.progress = () => p;
      p.cancel = () => undefined;
      return p;
    },
  }));
});
afterAll(() => _resetSurahTablesForTests());

describe('a surah file is used only at its exact size', () => {
  it('plays the file measured, and nothing else under its name', async () => {
    const path = surahAudioFilePath(ID, 18);
    files.set(path, audio(sizeOf(18)));
    expect(await localSurahFileIfAny(ID, 18)).toBe(path);
    // Cut short, or another recording: as good as not downloaded.
    files.set(path, audio(sizeOf(18) - 1));
    expect(await localSurahFileIfAny(ID, 18)).toBeNull();
    files.set(path, audio(sizeOf(18) + 500));
    expect(await localSurahFileIfAny(ID, 18)).toBeNull();
  });

  it('counts only exact files as downloaded', async () => {
    files.set(surahAudioFilePath(ID, 1), audio(sizeOf(1)));
    files.set(surahAudioFilePath(ID, 2), audio(sizeOf(2) - 10));
    const stats = await reciterAudioStats(ID);
    expect(stats.files).toBe(1);
    expect(stats.complete).toBe(false);
  });
});

describe('the download', () => {
  jest.setTimeout(30_000);

  it('brings every surah at its size, and is complete', async () => {
    const outcome = await downloadReciterAudio(ID).promise;
    expect(outcome.complete).toBe(true);
    expect((await reciterAudioStats(ID)).complete).toBe(true);
    expect(await localSurahFileIfAny(ID, 114)).not.toBeNull();
  });

  it('marks a surah served at the wrong size twice as changed at its source', async () => {
    serve = s => (s === 36 ? sizeOf(36) + 999 : sizeOf(s));
    const outcome = await downloadReciterAudio(ID).promise;
    expect(outcome.complete).toBe(false);
    // The source, not the connection: not an interruption to come back to.
    expect(outcome.interrupted).toBe(false);
    expect(await surahChangedAtSource(ID, 36)).toBe(true);
    expect(await localSurahFileIfAny(ID, 36)).toBeNull();
    expect(failedSurahsOf(ID)).toEqual([36]);
    // Named, so the notification can say which.
    expect(outcome.error?.key).toBe('quran.wholeSurahIncompleteBody');
    expect(String(outcome.error?.params?.names)).toMatch(/Ya-?Sin/i);
    // Settled: the recitation counts as all there is, and Continue does
    // not fetch it again.
    expect((await reciterAudioStats(ID)).complete).toBe(true);
    blob.config.mockClear();
    await downloadReciterAudio(ID).promise;
    expect(blob.config).not.toHaveBeenCalled();
  });

  it('clears what a killed run left behind', async () => {
    files.set(`${surahAudioFilePath(ID, 3)}.part`, 'half');
    files.set(`${surahAudioFilePath(ID, 4)}.head`, 'SUQz');
    await downloadReciterAudio(ID).promise;
    for (const key of files.keys()) expect(key).not.toMatch(/\.(part|head)$/);
  });

  it('stops cleanly when the disk is full, and says so', async () => {
    free = 10 * 1024 ** 2; // under the margin the system keeps
    const outcome = await downloadReciterAudio(ID).promise;
    expect(outcome.complete).toBe(false);
    expect(outcome.error?.key).toBe('quran.downloadNoSpaceBody');
    // Nothing half-written, nothing counted.
    expect((await reciterAudioStats(ID)).files).toBe(0);
  });
});

describe('a surah the recording does not hold (the table’s `x`)', () => {
  jest.setTimeout(30_000);
  beforeEach(() => _setSurahTableForTests(ID, { ...table(), x: [2] }));

  it('is blocked for good, like one changed at its source', async () => {
    expect(await surahChangedAtSource(ID, 2)).toBe(true);
    expect(await surahChangedAtSource(ID, 3)).toBe(false);
    expect(await surahFileState(ID, 2)).toBe('changed');
    expect(await keepSurahQuietly(ID, 2)).toBeNull();
  });

  it('is not fetched by the download, which is complete without it', async () => {
    const outcome = await downloadReciterAudio(ID).promise;
    expect(outcome.complete).toBe(true);
    expect(await localSurahFileIfAny(ID, 2)).toBeNull();
    expect(await localSurahFileIfAny(ID, 3)).not.toBeNull();
    const stats = await reciterAudioStats(ID);
    expect(stats.complete).toBe(true);
    expect(stats.files).toBe(113);
  });
});

describe('a reciter whose boundaries cannot be used', () => {
  it('is not offered, and a choice of it falls back to the default voice', () => {
    expect(isPlayable(findReciter(ID))).toBe(true);
    const broken = table();
    _setSurahTableForTests(ID, { ...broken, bytes: broken.bytes + 1 });
    expect(expectedSurahBytes(ID, 1)).toBeNull();
    expect(findReciter(ID).id).toBe(DEFAULT_RECITER_ID);
    expect(searchReciters('zahrani').map(r => r.id)).not.toContain(ID);
  });

  it('refuses a table without sizes (v1)', () => {
    const noSizes: Partial<ReturnType<typeof table>> = { ...table(), v: 1 };
    delete noSizes.z;
    _setSurahTableForTests(ID, noSizes as never);
    expect(findReciter(ID).id).toBe(DEFAULT_RECITER_ID);
  });
});

describe('one surah at a time', () => {
  it('downloads just that surah, at its size, and deletes it again', async () => {
    const outcome = await downloadSurahAudio(ID, 18).promise;
    expect(outcome.complete).toBe(true);
    expect(await surahFileState(ID, 18)).toBe('here');
    expect(await surahFileState(ID, 19)).toBe('absent');
    expect([...files.keys()].filter(k => k.endsWith('.mp3'))).toHaveLength(1);
    expect(await deleteSurahFile(ID, 18)).toBe(true);
    expect(await surahFileState(ID, 18)).toBe('absent');
  });
});

describe('streaming, checked first', () => {
  const realFetch = global.fetch;
  let served: number | null;
  beforeEach(() => {
    _resetRemoteSurahChecksForTests();
    served = null;
    global.fetch = jest.fn(async (_url: unknown, init?: { method?: string }) => {
      if (served == null) throw new TypeError('Network request failed');
      expect(init?.method).toBe('HEAD');
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? String(served) : null) },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('streams only a file the server says is exactly the measured size', async () => {
    served = sizeOf(36);
    expect(await checkRemoteSurah(ID, 36)).toBe('ok');
    _resetRemoteSurahChecksForTests();
    served = sizeOf(36) + 1;
    expect(await checkRemoteSurah(ID, 36)).toBe('changed');
  });

  it('asks again after no answer, and not after a definite one', async () => {
    expect(await checkRemoteSurah(ID, 2)).toBe('unreachable');
    served = sizeOf(2);
    expect(await checkRemoteSurah(ID, 2)).toBe('ok');
    served = 1;
    expect(await checkRemoteSurah(ID, 2)).toBe('ok'); // kept for the session
  });
});

describe('keeping what is listened to', () => {
  it('saves a short surah quietly, at its size', async () => {
    expect(await keepSurahQuietly(ID, 112)).toBe(surahAudioFilePath(ID, 112));
    expect(await surahFileState(ID, 112)).toBe('here');
  });

  it('leaves a long surah to the stream', async () => {
    const big = table();
    // Al-Baqarah at 120 MB: past what is saved without asking.
    const sizes = Array.from({ length: 114 }, (_, i) => (i === 1 ? 120 * 1024 * 1024 : sizeOf(i + 1)));
    _setSurahTableForTests(ID, { ...big, z: pack(sizes, 4), bytes: sizes.reduce((a, b) => a + b, 0) });
    blob.config.mockClear();
    expect(await keepSurahQuietly(ID, 2)).toBeNull();
    expect(blob.config).not.toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringMatching(/002\.mp3/) }));
  });
});
