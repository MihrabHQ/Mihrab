/**
 * The Hadith packs are release assets, not files in the repository: the app
 * and scripts/hadith/upload-packs.sh must agree on the tag and on how a pack
 * key becomes an asset name, or every download quietly falls through to the
 * slow original sources.
 */
import fs from 'fs';
import path from 'path';

const fetched: string[] = [];

jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(async (url: string) => {
    fetched.push(url);
    return {
      ok: true,
      json: async () => ({ pack: 'starter', lang: 'en', source: 'x', retrieved: '2026-11-25', entries: [{ id: '1', h: 'text' }] }),
    };
  }),
}));
jest.mock('../src/quran/mushafDownload', () => ({ mkdirDeep: jest.fn(async () => undefined) }));
jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/doc', CacheDir: '/cache' },
    writeFile: jest.fn(async () => undefined),
    exists: jest.fn(async () => false),
    unlink: jest.fn(async () => undefined),
    mv: jest.fn(async () => undefined),
    lstat: jest.fn(async () => []),
  },
}));

import { hadithAssetName, MIRROR_TAGS } from '../src/config/mirrors';
import { _resetPacksForTests, downloadPack } from '../src/hadith/packs';

const RELEASE = 'https://github.com/MihrabHQ/Mihrab/releases/download/data-hadith-v1';

describe('Hadith packs as release assets', () => {
  beforeEach(() => {
    fetched.length = 0;
    _resetPacksForTests();
  });

  it('names an asset by the key with its slashes as dots', () => {
    expect(hadithAssetName('henc/cat-1/sv')).toBe('henc.cat-1.sv.json');
    expect(hadithAssetName('books/bukhari')).toBe('books.bukhari.json');
    expect(hadithAssetName('nawawi/ar')).toBe('nawawi.ar.json');
  });

  it('asks the release first, and stops there when it answers', async () => {
    await expect(downloadPack('henc/starter/en')).resolves.toBe(true);
    expect(fetched).toEqual([`${RELEASE}/henc.starter.en.json`]);
  });

  it('publishes to the tag the app reads, flattening the same way', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hadith', 'upload-packs.sh'), 'utf8');
    expect(script).toContain(`TAG="${MIRROR_TAGS.hadith}"`);
    expect(script).toContain("tr '/' '.'");
  });

  it('keeps the packs out of the repository', () => {
    const build = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hadith', 'build-packs.js'), 'utf8');
    expect(build).toContain("path.join(ROOT, 'build', 'hadith', 'v1')");
    expect(fs.existsSync(path.join(__dirname, '..', 'data', 'hadith'))).toBe(false);
  });
});
