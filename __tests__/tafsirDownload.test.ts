/**
 * A tafsir edition as a whole download (`kind: 'tafsir'`).
 *
 * One file per surah, 114 requests instead of 6,236; read from disk after
 * that. A surah upstream has no file for must not stop the run, a failed
 * one must not be written down as done, and an ayah answers from the
 * downloaded file without touching the network.
 */
import {
  downloadTafsirEdition,
  loadTafsir,
  hasTafsirSurah,
  resetTafsirMemory,
  tafsirSizeLabel,
  TAFSIR_EDITIONS,
  TAFSIR_SURAHS,
} from '../src/quran/tafsir';
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
const ED = 'ar-tafsir-muyassar';

let disk: Map<string, string>;
function installDisk() {
  disk = new Map();
  fsMock.exists = jest.fn(async (p: string) => disk.has(p) || p.endsWith('/s'));
  fsMock.readFile = jest.fn(async (p: string) => disk.get(p));
  fsMock.writeFile = jest.fn(async (p: string, c: string) => {
    disk.set(p, c);
  });
}
const ok = (rows: unknown) => ({ ok: true, status: 200, json: async () => rows });

describe('downloadTafsirEdition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetTafsirMemory();
    installDisk();
  });

  it('fetches every surah once, from the surah files, and reports surahs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const n = Number(url.split('/').pop()!.replace('.json', ''));
      return ok([{ surah: n, ayah: 1, text: `تفسير ${n}` }]);
    });
    const seen: number[] = [];
    const out = await downloadTafsirEdition(ED, {
      onProgress: p => seen.push(p.done),
    }).promise;
    expect(out).toEqual({ complete: true, interrupted: false });
    expect(fetchMock).toHaveBeenCalledTimes(TAFSIR_SURAHS);
    expect(fetchMock.mock.calls[0][0]).toContain(`/tafsir/${ED}/`);
    expect(Math.max(...seen)).toBe(TAFSIR_SURAHS);
  });

  it('treats a surah upstream has no file for as done, not as a failure', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/9.json')
        ? { ok: false, status: 404, json: async () => ({}) }
        : ok([{ surah: 1, ayah: 1, text: 'x' }]),
    );
    const out = await downloadTafsirEdition(ED, {}).promise;
    expect(out.complete).toBe(true);
    expect(await hasTafsirSurah(ED, 9)).toBe(true);
  });

  it('does not write a failed surah down as done', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/5.json')
        ? { ok: false, status: 500, json: async () => ({}) }
        : ok([{ surah: 1, ayah: 1, text: 'x' }]),
    );
    const out = await downloadTafsirEdition(ED, {}).promise;
    expect(out.complete).toBe(false);
    expect(await hasTafsirSurah(ED, 5)).toBe(false);
  });

  it('skips surahs already on disk, so a stopped run resumes', async () => {
    fetchMock.mockImplementation(async () => ok([{ ayah: 1, text: 'x' }]));
    await downloadTafsirEdition(ED, {}).promise;
    fetchMock.mockClear();
    const out = await downloadTafsirEdition(ED, {}).promise;
    expect(out.complete).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports interrupted — not complete — when the network is gone', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const out = await downloadTafsirEdition(ED, {}).promise;
    expect(out).toEqual({ complete: false, interrupted: true });
  });

  it('stops when cancelled, and is not "interrupted"', async () => {
    fetchMock.mockImplementation(async () => ok([{ ayah: 1, text: 'x' }]));
    const h = downloadTafsirEdition(ED, {});
    h.cancel();
    const out = await h.promise;
    expect(out.complete).toBe(false);
    expect(out.interrupted).toBe(false);
  });
});

describe('loadTafsir with a downloaded edition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetTafsirMemory();
    installDisk();
  });

  it('answers from the surah file without touching the network', async () => {
    fetchMock.mockImplementation(async () =>
      ok([
        { surah: 2, ayah: 255, text: 'آية الكرسي' },
        { surah: 2, ayah: 256, text: 'لا إكراه' },
      ]),
    );
    await downloadTafsirEdition(ED, {}).promise;
    resetTafsirMemory(); // read it back from the "disk"
    fetchMock.mockClear();
    await expect(loadTafsir(ED, 2, 255)).resolves.toBe('آية الكرسي');
    await expect(loadTafsir(ED, 2, 256)).resolves.toBe('لا إكراه');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('edition sizes', () => {
  it('every edition carries a size for the offer, and al-Muyassar is the small one', () => {
    for (const e of TAFSIR_EDITIONS) expect(e.approxBytes).toBeGreaterThan(1_000_000);
    const muyassar = TAFSIR_EDITIONS.find(e => e.id === ED)!;
    expect(muyassar.approxBytes).toBeLessThan(5_000_000);
    expect(tafsirSizeLabel(3_100_000)).toBe('3.1 MB');
    expect(tafsirSizeLabel(84_100_000)).toBe('84 MB');
  });
});
