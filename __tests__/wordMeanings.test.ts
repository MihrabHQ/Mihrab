/**
 * Arabic hard-word meanings (QuranEnc.com `arabic_seraj`).
 *
 * The terms of use forbid changing the published text, so the parser only
 * LAYS OUT lines and the store keeps each gloss as published. The set is a
 * download job: one request per surah, resumable, and a short or failed
 * response must never be written down as a finished surah.
 */
import {
  parseWordMeanings,
  downloadWordMeanings,
  wordMeaningsFor,
  hasWordMeanings,
  resetWordMeaningsMemory,
  WORD_MEANINGS_CREDIT,
  WORD_MEANINGS_SURAHS,
} from '../src/quran/wordMeanings';
import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import ReactNativeBlobUtil from 'react-native-blob-util';

// These tests pin the ORIGINAL host's behaviour; the mirror-first order is
// covered in mirrors.test.ts, so here the mirror step is a straight pass.
jest.mock('../src/config/mirrors', () => ({
  ...jest.requireActual('../src/config/mirrors'),
  fetchMirrored: (_mirror: string, original: string, init: unknown, opts: unknown) =>
    jest.requireMock('../src/utils/fetchWithRetry').fetchWithRetry(original, init, opts),
}));

jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(),
}));

const fetchMock = fetchWithRetry as unknown as jest.Mock;
const fsMock = ReactNativeBlobUtil.fs as unknown as {
  exists: jest.Mock;
  readFile: jest.Mock;
  writeFile: jest.Mock;
};

/** An in-memory disk behind the mocked fs. */
let disk: Map<string, string>;
function installDisk() {
  disk = new Map();
  fsMock.exists = jest.fn(async (p: string) => disk.has(p) || p.endsWith('/wordmeanings'));
  fsMock.readFile = jest.fn(async (p: string) => disk.get(p));
  fsMock.writeFile = jest.fn(async (p: string, c: string) => {
    disk.set(p, c);
  });
}

/** What QuranEnc's sura endpoint returns: one row per ayah, mostly empty. */
function suraBody(surah: number, ayahs: number, glosses: Record<number, string>) {
  return {
    result: Array.from({ length: ayahs }, (_, i) => ({
      sura: String(surah),
      aya: String(i + 1),
      translation: glosses[i + 1] ?? '',
    })),
  };
}
function answerWith(map: (surah: number) => unknown) {
  fetchMock.mockImplementation(async (url: string) => {
    const surah = Number(url.split('/').pop());
    return { ok: true, status: 200, json: async () => map(surah) };
  });
}

describe('parseWordMeanings', () => {
  it('splits "word: meaning" at the first colon only', () => {
    expect(
      parseWordMeanings('اسْتَوَىٰ عَلَى الْعَرْشِ: عَلَا وَارْتَفَعَ: كَمَا يَلِيقُ بِهِ.'),
    ).toEqual([
      {
        word: 'اسْتَوَىٰ عَلَى الْعَرْشِ',
        meaning: 'عَلَا وَارْتَفَعَ: كَمَا يَلِيقُ بِهِ.',
      },
    ]);
  });

  it('lists one gloss per line and drops only blank lines', () => {
    expect(parseWordMeanings('رَوَاسِيَ: جِبَالًا\n\nيُغْشِي: يُغَطِّي\r\n')).toEqual([
      { word: 'رَوَاسِيَ', meaning: 'جِبَالًا' },
      { word: 'يُغْشِي', meaning: 'يُغَطِّي' },
    ]);
  });

  it('keeps a line with no colon whole instead of dropping or rewording it', () => {
    expect(parseWordMeanings('نص بلا نقطتين')).toEqual([
      { word: '', meaning: 'نص بلا نقطتين' },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(parseWordMeanings('')).toEqual([]);
  });
});

describe('downloadWordMeanings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWordMeaningsMemory();
    installDisk();
  });

  it('fetches every surah once, from the sura endpoint, and reports surahs', async () => {
    // Real ayah counts matter to the completeness check; use the real table.
    const { findSurah } = require('../src/quran/quran');
    answerWith(n => suraBody(n, findSurah(n).ayahCount, { 1: 'كلمة: معنى' }));
    const seen: number[] = [];
    const out = await downloadWordMeanings({
      onProgress: p => seen.push(p.done),
    }).promise;
    expect(out).toEqual({ complete: true, interrupted: false });
    expect(fetchMock).toHaveBeenCalledTimes(WORD_MEANINGS_SURAHS);
    expect(fetchMock.mock.calls[0][0]).toContain('/translation/sura/arabic_seraj/');
    expect(Math.max(...seen)).toBe(WORD_MEANINGS_SURAHS);
  });

  it('stores only the glosses that exist, verbatim, and serves them from disk', async () => {
    const { findSurah } = require('../src/quran/quran');
    answerWith(n =>
      suraBody(n, findSurah(n).ayahCount, n === 13 ? { 3: 'رَوَاسِيَ: جِبَالًا تُثَبِّتُ الْأَرْضَ.' } : {}),
    );
    await downloadWordMeanings({}).promise;
    resetWordMeaningsMemory(); // read back from the "disk", not memory
    expect(await wordMeaningsFor(13, 3)).toEqual([
      { word: 'رَوَاسِيَ', meaning: 'جِبَالًا تُثَبِّتُ الْأَرْضَ.' },
    ]);
    expect(await wordMeaningsFor(13, 1)).toEqual([]); // ayah with no gloss
    expect(await hasWordMeanings(13)).toBe(true);
  });

  it('skips surahs already on disk, so a stopped run resumes', async () => {
    const { findSurah } = require('../src/quran/quran');
    answerWith(n => suraBody(n, findSurah(n).ayahCount, {}));
    await downloadWordMeanings({}).promise;
    fetchMock.mockClear();
    const out = await downloadWordMeanings({}).promise;
    expect(out.complete).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never writes down a short answer as a finished surah', async () => {
    answerWith(n => suraBody(n, 1, {})); // every surah "has" 1 ayah
    const out = await downloadWordMeanings({}).promise;
    expect(out.complete).toBe(false);
    // Surah 1 has 7 ayahs; a 1-row answer must not have been saved.
    expect(await hasWordMeanings(1)).toBe(false);
  });

  it('reports interrupted — not complete — when the network is gone', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const out = await downloadWordMeanings({}).promise;
    expect(out).toEqual({ complete: false, interrupted: true });
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it('stops when cancelled, and is not "interrupted"', async () => {
    const { findSurah } = require('../src/quran/quran');
    answerWith(n => suraBody(n, findSurah(n).ayahCount, {}));
    const h = downloadWordMeanings({});
    h.cancel();
    const out = await h.promise;
    expect(out.complete).toBe(false);
    expect(out.interrupted).toBe(false);
  });
});

describe('credit', () => {
  it('names QuranEnc.com as the publisher', () => {
    expect(WORD_MEANINGS_CREDIT).toContain('QuranEnc.com');
  });
});
