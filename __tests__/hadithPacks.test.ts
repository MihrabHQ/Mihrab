/**
 * A Hadith pack coming down (`src/hadith/packs.ts`, `origin.ts`): what it
 * is said to weigh, that the bar moves, that Cancel stops all of it, and
 * that a pack rebuilt from HadeethEnc is whole or is not kept.
 *
 * Each of these was wrong on a phone on 2026-11-25:
 *   • Sahih al-Bukhari read "4.2 MB" after its download and "7.7 MB" after
 *     a restart — the first was the text's length in characters.
 *   • The bar stayed empty for as long as our own copy was being fetched.
 *   • Cancel stopped the pack in flight; the next of the list began at once.
 *   • A connection lost midway left a set of three hadith marked downloaded.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';

type Answer = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const mockRequests: string[] = [];
const mockNet: { answer: Answer } = { answer: async () => ({ ok: false, status: 404, json: async () => null }) };

jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn((url: string) => {
    mockRequests.push(url);
    return mockNet.answer(url);
  }),
}));
jest.mock('../src/quran/mushafDownload', () => ({ mkdirDeep: jest.fn(async () => undefined) }));

import {
  _resetPacksForTests,
  cancelPack,
  downloadPack,
  ensurePacks,
  loadPack,
  packStatus,
  refreshPacks,
  utf8Length,
  type PackStatus,
} from '../src/hadith/packs';

const files = (jest.requireMock('react-native-blob-util') as { __files: Map<string, string> }).__files;
const config = ReactNativeBlobUtil.config as unknown as jest.Mock;

const MATN = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى';
/** A book's pack: whole for al-Bukhārī and Muslim, with each row's grades for the graded five. */
const book = (name: string) =>
  JSON.stringify({
    book: name,
    source: 'Open-Hadith-Data',
    license: 'ODbL-1.0',
    retrieved: '2026-11-25',
    ...(name === 'bukhari' || name === 'muslim'
      ? { hadiths: [[1, MATN]] }
      : {
          hadiths: [[1, MATN, 0, [[0, 'Sahih']]]],
          grades: { source: 'fawazahmed0/hadith-api', rule: 'sound-by-all', graders: ['Al-Albani'] },
          of: 1,
        }),
  });

type Transfer = { url: string; path: string; finish: (status?: number) => void; fail: (e: Error) => void; cancelled: boolean; progress?: (received: number, total: number) => void };
const transfers: Transfer[] = [];

/** `config({ path }).fetch()` as a transfer the test finishes by hand. */
function holdTransfers(body: (url: string) => string) {
  config.mockImplementation(({ path }: { path: string }) => ({
    fetch: (_method: string, url: string) => {
      let finish!: (status?: number) => void;
      let fail!: (e: Error) => void;
      const transfer = {} as Transfer;
      const task = new Promise<{ info: () => { status: number } }>((resolve, reject) => {
        finish = (status = 200) => {
          if (status === 200) files.set(path, body(url));
          resolve({ info: () => ({ status }) });
        };
        fail = reject;
      }) as Promise<{ info: () => { status: number } }> & Record<string, unknown>;
      Object.assign(transfer, { url, path, finish, fail, cancelled: false });
      task.progress = (_opts: unknown, cb: (received: number, total: number) => void) => {
        transfer.progress = cb;
        return task;
      };
      task.cancel = () => {
        transfer.cancelled = true;
        fail(new Error('cancelled'));
      };
      transfers.push(transfer);
      return task;
    },
  }));
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  mockRequests.length = 0;
  transfers.length = 0;
  files.clear();
  _resetPacksForTests();
  mockNet.answer = async () => ({ ok: false, status: 404, json: async () => null });
});

describe('what a pack weighs', () => {
  it('counts bytes, not characters', () => {
    const arabic = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ';
    expect(utf8Length(arabic)).toBe(Buffer.byteLength(arabic, 'utf8'));
    expect(utf8Length(arabic)).toBeGreaterThan(arabic.length);
    expect(utf8Length('plain')).toBe(5);
    expect(utf8Length('ṣalāh ﷺ 📖')).toBe(Buffer.byteLength('ṣalāh ﷺ 📖', 'utf8'));
  });

  it('says after the download what the file on disk says after a restart', async () => {
    holdTransfers(() => book('bukhari'));
    const done = downloadPack('books/bukhari');
    await settle();
    transfers[0].finish();
    await expect(done).resolves.toBe(true);
    const status = packStatus('books/bukhari') as Extract<PackStatus, { state: 'ready' }>;
    expect(status.state).toBe('ready');
    expect(status.bytes).toBe(Buffer.byteLength(book('bukhari'), 'utf8'));
    expect(status.bytes).toBeGreaterThan(book('bukhari').length);
  });
});

describe('our copy, fetched onto the disk', () => {
  it('moves the bar as the bytes arrive', async () => {
    holdTransfers(() => book('muslim'));
    const done = downloadPack('books/muslim');
    await settle();
    expect(packStatus('books/muslim')).toEqual({ state: 'downloading', progress: 0 });
    transfers[0].progress?.(250, 1000);
    expect(packStatus('books/muslim')).toEqual({ state: 'downloading', progress: 0.25 });
    transfers[0].progress?.(900, 1000);
    expect(packStatus('books/muslim')).toEqual({ state: 'downloading', progress: 0.9 });
    transfers[0].finish();
    await done;
  });

  it('asks the release, and leaves the pack in its place whole', async () => {
    holdTransfers(() => book('malik'));
    const done = downloadPack('books/malik');
    await settle();
    expect(transfers[0].url).toBe('https://github.com/MihrabHQ/Mihrab/releases/download/data-hadith-v1/books.malik.json');
    transfers[0].finish();
    await done;
    expect(files.has('/mock/documents/hadith/v1/books/malik.json')).toBe(true);
    // Nothing half-written is left beside it.
    expect([...files.keys()].filter(k => k.endsWith('.dl') || k.endsWith('.part'))).toEqual([]);
    // The sources were not troubled.
    expect(mockRequests).toEqual([]);
  });

  it('does not keep what is not the pack', async () => {
    holdTransfers(() => '{"message":"Not Found"}');
    const done = downloadPack('books/muslim');
    await settle();
    transfers[0].finish();
    await settle();
    // Our copy was no good, so the source is asked — and has none either.
    expect(transfers[1].url).toContain('raw.githubusercontent.com/mhashim6/Open-Hadith-Data');
    transfers[1].finish(404);
    await expect(done).resolves.toBe(false);
    expect(packStatus('books/muslim').state).toBe('failed');
    expect(files.has('/mock/documents/hadith/v1/books/muslim.json')).toBe(false);
  });
});

describe('a pack that may no longer be read', () => {
  const at = (key: string) => `/mock/documents/hadith/v1/${key}.json`;
  /** A book as it was before the rule: every hadith of it, and no grade. */
  const ungraded = (name: string) =>
    JSON.stringify({ book: name, source: 'Open-Hadith-Data', license: 'ODbL-1.0', retrieved: '2026-11-20', hadiths: [[1, MATN]] });

  // The shared mock lists a folder's files and not the folders in it; the packs are a tree.
  const lstat = ReactNativeBlobUtil.fs.lstat as unknown as jest.Mock;
  const flat = lstat.getMockImplementation();
  beforeEach(() => {
    lstat.mockImplementation(async (dir: string) => {
      const prefix = `${String(dir).replace(/\/$/, '')}/`;
      const out = new Map<string, { filename: string; size: number; type: string }>();
      for (const [file, data] of files) {
        if (!file.startsWith(prefix)) continue;
        const [name, ...deeper] = file.slice(prefix.length).split('/');
        out.set(name, deeper.length ? { filename: name, size: 0, type: 'directory' } : { filename: name, size: data.length, type: 'file' });
      }
      return [...out.values()];
    });
  });
  afterEach(() => {
    lstat.mockImplementation(flat);
  });

  it('is removed when the packs are looked for, where its book is not offered any more', async () => {
    files.set(at('books/ahmad'), ungraded('ahmad'));
    files.set(at('books/darimi'), ungraded('darimi'));
    files.set(at('books/bukhari'), book('bukhari'));
    await refreshPacks();
    expect(packStatus('books/ahmad').state).toBe('absent');
    expect(packStatus('books/darimi').state).toBe('absent');
    expect(files.has(at('books/ahmad'))).toBe(false);
    expect(files.has(at('books/darimi'))).toBe(false);
    // What is still offered is left where it is.
    expect(packStatus('books/bukhari').state).toBe('ready');
    expect(files.has(at('books/bukhari'))).toBe(true);
  });

  it('is removed the moment it is read, where it is a graded book without its grades', async () => {
    files.set(at('books/abudawud'), ungraded('abudawud'));
    await refreshPacks();
    expect(packStatus('books/abudawud').state).toBe('ready');
    // Not one hadith of it is handed on — the weak ones are in there.
    await expect(loadPack('books/abudawud')).resolves.toBeNull();
    expect(files.has(at('books/abudawud'))).toBe(false);
    // And the book's page offers the download again.
    expect(packStatus('books/abudawud').state).toBe('absent');
  });

  it('is not fetched from the source in its place: a graded book is our copy or nothing', async () => {
    // Our copy answers with the book as it was, ungraded.
    holdTransfers(() => ungraded('tirmidhi'));
    const done = downloadPack('books/tirmidhi');
    await settle();
    transfers[0].finish();
    await expect(done).resolves.toBe(false);
    expect(transfers).toHaveLength(1);
    expect(mockRequests.filter(u => u.includes('Open-Hadith-Data'))).toEqual([]);
    expect(packStatus('books/tirmidhi').state).toBe('failed');
    expect(files.has(at('books/tirmidhi'))).toBe(false);
  });

  it('is read as before where it is the pack: a graded book with every row sound', async () => {
    files.set(at('books/malik'), book('malik'));
    await refreshPacks();
    await expect(loadPack('books/malik')).resolves.toMatchObject({ book: 'malik', grades: { rule: 'sound-by-all' } });
    expect(files.has(at('books/malik'))).toBe(true);
  });
});

describe('Cancel', () => {
  it('stops the transfer in flight and every pack still waiting its turn', async () => {
    holdTransfers(url => book(url.includes('bukhari') ? 'bukhari' : 'muslim'));
    const keys = ['books/bukhari', 'books/muslim', 'books/abudawud'] as const;
    const all = ensurePacks(keys);
    await settle();
    expect(transfers).toHaveLength(1);
    keys.forEach(cancelPack);
    await expect(all).resolves.toBe(false);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].cancelled).toBe(true);
    for (const k of keys) expect(packStatus(k).state).toBe('absent');
    expect(files.size).toBe(0);
  });

  it('is forgotten when the reader asks again', async () => {
    holdTransfers(() => book('malik'));
    cancelPack('books/malik');
    const again = ensurePacks(['books/malik']);
    await settle();
    expect(transfers).toHaveLength(1);
    transfers[0].finish();
    await expect(again).resolves.toBe(true);
  });
});

describe('a pack rebuilt from HadeethEnc', () => {
  const entry = (id: string) => ({ id, title: `Title ${id}`, hadeeth: `Text ${id}`, categories: ['88'], hadeeth_ar: 'نص', grade: 'Authentic', grade_ar: 'صحيح' });

  /** No copy of ours: the release answers 404 both ways. */
  function noMirror() {
    config.mockImplementation(() => ({
      fetch: () => {
        const task = Promise.resolve({ info: () => ({ status: 404 }) }) as Promise<unknown> & Record<string, unknown>;
        task.progress = () => task;
        task.cancel = () => undefined;
        return task;
      },
    }));
  }

  function hadeethenc(one: (id: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
    mockNet.answer = async url => {
      if (url.includes('/hadeeths/list/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], meta: { current_page: '1', last_page: 1 } }),
        };
      }
      if (url.includes('/hadeeths/one/')) return one(new URL(url).searchParams.get('id')!);
      return { ok: false, status: 404, json: async () => null };
    };
  }

  it('is kept when every entry came', async () => {
    noMirror();
    hadeethenc(async id => ({ ok: true, status: 200, json: async () => entry(id) }));
    await expect(downloadPack('henc/cat-2/en')).resolves.toBe(true);
    const kept = JSON.parse(files.get('/mock/documents/hadith/v1/henc/cat-2/en.json')!);
    expect(kept.entries.map((e: { id: string }) => e.id)).toEqual(['1', '2', '3']);
  });

  it('leaves out an entry the language does not have, and is still the pack', async () => {
    noMirror();
    hadeethenc(async id =>
      id === '2' ? { ok: false, status: 404, json: async () => null } : { ok: true, status: 200, json: async () => entry(id) },
    );
    await expect(downloadPack('henc/cat-2/sv')).resolves.toBe(true);
    const kept = JSON.parse(files.get('/mock/documents/hadith/v1/henc/cat-2/sv.json')!);
    expect(kept.entries.map((e: { id: string }) => e.id)).toEqual(['1', '3']);
  });

  it('is not kept with a hole in it: a lost connection fails the download', async () => {
    noMirror();
    hadeethenc(async id => {
      if (id === '2') throw new Error('Network request failed');
      return { ok: true, status: 200, json: async () => entry(id) };
    });
    await expect(downloadPack('henc/cat-2/de')).resolves.toBe(false);
    expect(packStatus('henc/cat-2/de').state).toBe('failed');
    expect(files.has('/mock/documents/hadith/v1/henc/cat-2/de.json')).toBe(false);
  });

  it('is not kept when the server erred on an entry', async () => {
    noMirror();
    hadeethenc(async id =>
      id === '3' ? { ok: false, status: 503, json: async () => null } : { ok: true, status: 200, json: async () => entry(id) },
    );
    await expect(downloadPack('henc/cat-2/fr')).resolves.toBe(false);
    expect(files.has('/mock/documents/hadith/v1/henc/cat-2/fr.json')).toBe(false);
  });
});
