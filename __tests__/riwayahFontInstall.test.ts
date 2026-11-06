/**
 * The KFGQPC face arriving beside a muṣḥaf that is already on the device:
 * fetched, pinned, attached, counted, replaced and erased — and, every
 * time it cannot be had, the muṣḥaf still drawn (in Amiri).
 *
 * The filesystem is the in-memory one from jest.setup.js; the platform's
 * font registry is mocked here, and refuses anything that is not one of
 * the fixture "fonts" below, as the platform refuses a file it cannot
 * parse.
 */
import * as BlobUtil from 'react-native-blob-util';
import { createHash } from 'crypto';

const GOOD = 'FONT:qalun-v21';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

jest.mock('../src/native/MushafFont', () => {
  const blob = jest.requireMock('react-native-blob-util') as {
    __files: Map<string, string>;
  };
  const isFont = (path: string) => (blob.__files.get(path) ?? '').startsWith('FONT:');
  return {
    mushafFontAvailable: true,
    registerNamedFont: jest.fn(async (family: string, path: string) =>
      isFont(path) ? family : null,
    ),
    isValidFontFile: jest.fn(async (path: string) => isFont(path)),
  };
});

jest.mock('../src/quran/riwayahFonts', () => {
  const metrics = { typicalLineEm: 18.9, lineHeightEm: 1.85, ascentEm: 1.15, descentEm: 0.57 };
  const file = (name: string, body: string) => ({
    name,
    bytes: body.length,
    sha256: require('crypto').createHash('sha256').update(body, 'utf8').digest('hex'),
    original: `https://quranpedia.example/${name}`,
    metrics,
  });
  const fonts = {
    warsh: file('UthmanicWarsh_V21.ttf', 'FONT:warsh-v21'),
    qalun: file('UthmanicQaloun_V21.ttf', 'FONT:qalun-v21'),
    shubah: file('UthmanicShuba_V20.ttf', 'FONT:shubah-v20'),
  };
  return {
    RIWAYAH_FONTS: fonts,
    riwayahFontUrls: (f: { name: string; original: string }) => [
      `https://mirror.example/data-riwayah-v1/${f.name}`,
      f.original,
    ],
  };
});

import { FONTS } from '../src/theme/typography';
import {
  _resetRiwayahDataCacheForTests,
  hydrateRiwayahData,
  installRiwayahDataset,
  riwayahProvenance,
  riwayatMissingFont,
  uninstallRiwayah,
} from '../src/quran/riwayahData';
import {
  _resetRiwayahFontCatchUpForTests,
  fetchMissingRiwayahFonts,
  fetchRiwayahFont,
} from '../src/quran/riwayahFontDownload';
import type { RiwayahDataset } from '../src/quran/riwayahImport';
import { riwayahDir, writeRiwayahDataset } from '../src/quran/riwayahStore';
import {
  riwayahAvailable,
  riwayahById,
  riwayahFontFamily,
  riwayahPrintedMetrics,
} from '../src/quran/riwayat';

const files = (BlobUtil as unknown as { __files: Map<string, string> }).__files;
const config = (BlobUtil as unknown as {
  default: { config: jest.Mock };
}).default.config;

const DATASET: RiwayahDataset = {
  pages: [{ page: 1, surah: 1, ayah: 1, endSurah: 1, endAyah: 7 }] as never,
  surahs: [],
  ayahCounts: [7],
  text: { '1:1': 'بِسْمِ' },
};

/** What each URL answers: a body to land at the requested path, or a status. */
let served: Record<string, string | number> = {};
const asked: string[] = [];

beforeEach(() => {
  files.clear();
  asked.length = 0;
  served = {};
  _resetRiwayahDataCacheForTests();
  _resetRiwayahFontCatchUpForTests();
  config.mockImplementation(({ path }: { path: string }) => ({
    fetch: jest.fn(async (_method: string, url: string) => {
      asked.push(url);
      const answer = served[url] ?? 404;
      if (typeof answer === 'number') return { info: () => ({ status: answer }) };
      files.set(path, answer);
      return { info: () => ({ status: 200 }) };
    }),
  }));
});

const MIRROR = 'https://mirror.example/data-riwayah-v1/UthmanicQaloun_V21.ttf';
const ORIGINAL = 'https://quranpedia.example/UthmanicQaloun_V21.ttf';
const fontPath = (name: string) => `${riwayahDir('qalun')}/${name}`;

async function installQalunText() {
  await installRiwayahDataset('qalun', DATASET, 'test');
}

describe('adding the face to an installed muṣḥaf', () => {
  it('draws in Amiri until the face lands, then in the face', async () => {
    await installQalunText();
    const def = riwayahById('qalun');
    expect(riwayahFontFamily(def)).toBe(FONTS.arabicQuran);
    expect(riwayatMissingFont()).toEqual(['qalun']);

    served[MIRROR] = GOOD;
    expect(await fetchRiwayahFont('qalun')).toEqual({ ok: true });

    expect(riwayahFontFamily(def)).toBe('MihrabRiwayah_qalun');
    expect(riwayahPrintedMetrics(def)?.lineHeightEm).toBe(1.85);
    expect(riwayatMissingFont()).toEqual([]);
    expect(files.get(fontPath('UthmanicQaloun_V21.ttf'))).toBe(GOOD);
    // Recorded, so the store counts it and erases it with the text.
    const p = riwayahProvenance('qalun')!;
    expect(p.font).toBe('UthmanicQaloun_V21.ttf');
    expect(p.sha256?.['UthmanicQaloun_V21.ttf']).toBe(sha(GOOD));
    // Nothing left in the staging folder.
    expect([...files.keys()].some(k => k.includes('.part'))).toBe(false);
    // The mirror was asked first, and the original not at all.
    expect(asked).toEqual([MIRROR]);
  });

  it('asks Quranpedia when the mirror has a wrong copy', async () => {
    await installQalunText();
    served[MIRROR] = 'FONT:something-else';
    served[ORIGINAL] = GOOD;
    expect(await fetchRiwayahFont('qalun')).toEqual({ ok: true });
    expect(asked).toEqual([MIRROR, ORIGINAL]);
    expect(files.get(fontPath('UthmanicQaloun_V21.ttf'))).toBe(GOOD);
  });

  it('keeps the page in Amiri when no host has the face', async () => {
    await installQalunText();
    const result = await fetchRiwayahFont('qalun');
    expect(result).toMatchObject({ ok: false });
    expect(riwayahFontFamily(riwayahById('qalun'))).toBe(FONTS.arabicQuran);
    expect(riwayahAvailable('qalun')).toBe(true);
    expect(riwayahProvenance('qalun')?.font).toBeUndefined();
    expect(files.has(fontPath('UthmanicQaloun_V21.ttf'))).toBe(false);
  }, 20000);

  it('refuses a file that matches no pin, wherever it came from', async () => {
    await installQalunText();
    served[MIRROR] = 'FONT:tampered';
    served[ORIGINAL] = 'FONT:tampered';
    const result = await fetchRiwayahFont('qalun');
    expect(result).toMatchObject({ ok: false, error: { key: 'quran.riwayahWrongFile' } });
    expect(files.has(fontPath('UthmanicQaloun_V21.ttf'))).toBe(false);
  }, 20000);
});

describe('reading the store at launch', () => {
  async function stored(font?: string) {
    await writeRiwayahDataset('qalun', DATASET, 'test', font ? { font } : {});
    if (font) files.set(fontPath(font), font.includes('V21') ? GOOD : 'FONT:qalun-v3');
  }

  it('registers the face this build pins', async () => {
    await stored('UthmanicQaloun_V21.ttf');
    await hydrateRiwayahData();
    expect(riwayahFontFamily(riwayahById('qalun'))).toBe('MihrabRiwayah_qalun');
  });

  it('announces the muṣḥaf even when its face will not register', async () => {
    await stored('UthmanicQaloun_V21.ttf');
    files.set(fontPath('UthmanicQaloun_V21.ttf'), 'not a font');
    await hydrateRiwayahData();
    expect(riwayahAvailable('qalun')).toBe(true);
    expect(riwayahFontFamily(riwayahById('qalun'))).toBe(FONTS.arabicQuran);
  });

  it('replaces a face from another version, and removes the old file', async () => {
    await stored('UthmanicQaloun.ttf');
    served[MIRROR] = GOOD;
    await hydrateRiwayahData();
    // Not registered: the old face does not cover this text's marks.
    await fetchMissingRiwayahFonts();
    expect(riwayahProvenance('qalun')?.font).toBe('UthmanicQaloun_V21.ttf');
    expect(files.has(fontPath('UthmanicQaloun.ttf'))).toBe(false);
    expect(files.get(fontPath('UthmanicQaloun_V21.ttf'))).toBe(GOOD);
    expect(riwayahFontFamily(riwayahById('qalun'))).toBe('MihrabRiwayah_qalun');
  });

  it('fetches the face for a muṣḥaf installed before it was offered', async () => {
    await stored();
    served[MIRROR] = GOOD;
    await hydrateRiwayahData();
    await fetchMissingRiwayahFonts();
    expect(riwayahProvenance('qalun')?.font).toBe('UthmanicQaloun_V21.ttf');
  });
});

describe('the face goes with the muṣḥaf', () => {
  it('is kept when the text is installed again over itself', async () => {
    await installQalunText();
    served[MIRROR] = GOOD;
    await fetchRiwayahFont('qalun');
    await installQalunText();
    expect(riwayahProvenance('qalun')?.font).toBe('UthmanicQaloun_V21.ttf');
    expect(riwayatMissingFont()).toEqual([]);
  });

  it('is erased when the muṣḥaf is', async () => {
    await installQalunText();
    served[MIRROR] = GOOD;
    await fetchRiwayahFont('qalun');
    await uninstallRiwayah('qalun');
    expect([...files.keys()].filter(k => k.startsWith(riwayahDir('qalun')))).toEqual([]);
    expect(riwayahFontFamily(riwayahById('qalun'))).toBe(FONTS.arabicQuran);
  });
});
