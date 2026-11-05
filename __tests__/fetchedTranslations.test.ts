/**
 * The translations that are downloads rather than assets (2026-11-05).
 *
 * They are served by the store tafsir has always used: an ayah on demand
 * from the mirror or the source, cached as it goes; a whole edition as
 * 114 surah files, read from disk after that. Each source answers in its
 * own shape, and the right text has to come back for the ayah asked for —
 * from every source, by every path.
 */
import {
  deleteTranslationEdition,
  downloadTranslationEdition,
  findTranslationEdition,
  getAyahTranslation,
  getSurahTranslation,
  hasTranslationSurah,
  isFetchedTranslation,
  QURAN_TRANSLATIONS,
  TRANSLATION_SURAHS,
  type QuranTranslationId,
} from '../src/quran/translations';
import { resetStoreMemory } from '../src/quran/surahStore';
import { TEXT_SOURCES } from '../src/quran/textSources';
import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import ReactNativeBlobUtil from 'react-native-blob-util';

jest.mock('../src/config/mirrors', () => ({
  ...jest.requireActual('../src/config/mirrors'),
  fetchMirrored: (_mirror: string, original: string, init: unknown, opts: unknown) =>
    jest.requireMock('../src/utils/fetchWithRetry').fetchWithRetry(original, init, opts),
}));
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));

const fetchMock = fetchWithRetry as unknown as jest.Mock;
const fsMock = ReactNativeBlobUtil.fs as unknown as {
  exists: jest.Mock;
  readFile: jest.Mock;
  writeFile: jest.Mock;
  unlink: jest.Mock;
};

let disk: Map<string, string>;
function installDisk() {
  disk = new Map();
  fsMock.exists = jest.fn(async (p: string) => disk.has(p) || p.endsWith('/s'));
  fsMock.readFile = jest.fn(async (p: string) => disk.get(p));
  fsMock.writeFile = jest.fn(async (p: string, c: string) => {
    disk.set(p, c);
  });
  fsMock.unlink = jest.fn(async (p: string) => {
    for (const k of [...disk.keys()]) if (k.startsWith(p)) disk.delete(k);
  });
}
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const gone = { ok: false, status: 404, json: async () => ({}) };

/** Each source's answers, carrying who answered and for what. */
function answer(url: string): ReturnType<typeof ok> | typeof gone {
  // The mirror holds a surah file as the source answered it: the same
  // shape, served from the release. Here it answers with the source's own
  // surah, so a test can tell the surah path from the one-ayah one.
  let m = /releases\/download\/data-translations-v1\/(.+)__(\d+)\.json$/.exec(url);
  if (m) {
    const ed = QURAN_TRANSLATIONS.find(e => e.id === m![1]);
    if (!ed?.source) return gone;
    return answer(TEXT_SOURCES[ed.source].surahUrl(ed.sourceId ?? ed.id, Number(m[2])));
  }
  m = /alquran\.cloud\/v1\/surah\/(\d+)\/([^/]+)$/.exec(url);
  if (m) {
    const s = Number(m[1]);
    return ok({
      data: {
        ayahs: [1, 2, 3].map(a => ({ numberInSurah: a, text: `tanzil ${m![2]} ${s}:${a}` })),
      },
    });
  }
  m = /alquran\.cloud\/v1\/ayah\/(\d+):(\d+)\/([^/]+)$/.exec(url);
  if (m) return ok({ data: { text: `tanzil-ayah ${m[3]} ${m[1]}:${m[2]}` } });
  m = /quranenc\.com\/api\/v1\/translation\/sura\/([^/]+)\/(\d+)$/.exec(url);
  if (m) {
    const s = Number(m[2]);
    return ok({
      result: [1, 2, 3].map(a => ({
        sura: String(s),
        aya: String(a),
        translation: `quranenc ${m![1]} ${s}:${a}[1]`,
        footnotes: a === 1 ? '[1] a note' : '',
      })),
    });
  }
  m = /quranenc\.com\/api\/v1\/translation\/aya\/([^/]+)\/(\d+)\/(\d+)$/.exec(url);
  if (m) {
    return ok({ result: { translation: `quranenc-ayah ${m[1]} ${m[2]}:${m[3]}`, footnotes: '' } });
  }
  return gone;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStoreMemory();
  installDisk();
  fetchMock.mockImplementation(async (url: string) => answer(url));
});

describe('the registry', () => {
  it('marks every new edition as a download with a source the app knows', () => {
    const fetched = QURAN_TRANSLATIONS.filter(e => e.source);
    expect(fetched.length).toBeGreaterThanOrEqual(15);
    for (const e of fetched) {
      expect(Object.keys(TEXT_SOURCES)).toContain(e.source);
      expect(e.sourceId).toBeTruthy();
      expect(e.approxBytes).toBeGreaterThan(100_000);
      expect(isFetchedTranslation(e.id)).toBe(true);
    }
    // The bundled ones are untouched.
    expect(isFetchedTranslation('en.sahih')).toBe(false);
    expect(isFetchedTranslation('id.indonesian')).toBe(false);
  });

  it('keeps every bundled edition first in its language, so no default moves', () => {
    for (const locale of ['en', 'sv', 'ur', 'hi', 'fr', 'es', 'de', 'tr', 'id', 'ru', 'zh']) {
      const first = QURAN_TRANSLATIONS.find(e => e.locale === locale);
      expect(first?.source).toBeUndefined();
    }
  });

  it('has one id per edition', () => {
    const ids = QURAN_TRANSLATIONS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('an ayah under an open sheet', () => {
  it('comes from Tanzil in its shape, for the ayah asked', async () => {
    const text = await getAyahTranslation('en.hilali' as QuranTranslationId, 2, 2);
    // The surah (mirror path, passed to the source here) answers first.
    expect(text).toBe('tanzil en.hilali 2:2');
  });

  it('comes from QuranEnc with its footnotes after the text', async () => {
    const text = await getAyahTranslation('swedish_rwwad' as QuranTranslationId, 3, 1);
    expect(text).toBe('quranenc swedish_rwwad 3:1[1]\n\n[1] a note');
    const plain = await getAyahTranslation('swedish_rwwad' as QuranTranslationId, 3, 2);
    expect(plain).toBe('quranenc swedish_rwwad 3:2[1]');
  });

  it('falls back to the one-ayah answer when the surah is not to be had', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      /\/surah\/|\/sura\//.test(url) ? gone : answer(url),
    );
    expect(await getAyahTranslation('tr.vakfi' as QuranTranslationId, 5, 7)).toBe(
      'tanzil-ayah tr.vakfi 5:7',
    );
    expect(await getAyahTranslation('german_rwwad' as QuranTranslationId, 5, 7)).toBe(
      'quranenc-ayah german_rwwad 5:7',
    );
  });

  it('is empty, not an error, when nothing answers', async () => {
    fetchMock.mockImplementation(async () => gone);
    expect(await getAyahTranslation('ru.abuadel' as QuranTranslationId, 9, 9)).toBe('');
  });

  it('never mixes editions: two editions of one language stay apart', async () => {
    const a = await getAyahTranslation('tr.vakfi' as QuranTranslationId, 2, 1);
    const b = await getAyahTranslation('tr.yazir' as QuranTranslationId, 2, 1);
    expect(a).toBe('tanzil tr.vakfi 2:1');
    expect(b).toBe('tanzil tr.yazir 2:1');
  });
});

describe('a whole surah for the reader', () => {
  it('is ordered by ayah and complete as the source gave it', async () => {
    expect(await getSurahTranslation('ms.basmeih' as QuranTranslationId, 112)).toEqual([
      'tanzil ms.basmeih 112:1',
      'tanzil ms.basmeih 112:2',
      'tanzil ms.basmeih 112:3',
    ]);
  });
});

describe('a whole edition downloaded', () => {
  it('fetches every surah from its own source and then reads from disk', async () => {
    const out = await downloadTranslationEdition('indonesian_affairs', {}).promise;
    expect(out).toEqual({ complete: true, interrupted: false });
    expect(fetchMock).toHaveBeenCalledTimes(TRANSLATION_SURAHS);
    expect(fetchMock.mock.calls[0][0]).toContain('quranenc.com/api/v1/translation/sura/indonesian_affairs/');
    expect(await hasTranslationSurah('indonesian_affairs', 114)).toBe(true);
    fetchMock.mockClear();
    resetStoreMemory();
    expect(await getAyahTranslation('indonesian_affairs' as QuranTranslationId, 114, 2)).toBe(
      'quranenc indonesian_affairs 114:2[1]',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lives under its own directory, apart from tafsir and the assets', async () => {
    await downloadTranslationEdition('en.hilali', {}).promise;
    const paths = [...disk.keys()];
    expect(paths.every(p => p.includes('/quran/translations/en.hilali/s/'))).toBe(true);
    await deleteTranslationEdition('en.hilali');
    expect(disk.size).toBe(0);
  });

  it('knows what it is downloading', () => {
    expect(findTranslationEdition('en.hilali')?.language).toBe('English');
  });
});
