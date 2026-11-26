/**
 * A correction we publish reaches a pack that is already on the device
 * (`src/hadith/packUpdates.ts`, `replacePack` in `packs.ts`).
 *
 * It did not: on 2026-11-25 the 14th of an-Nawawi's Forty was corrected in
 * our copy, and the phone that held the starter set went on showing the
 * other narration's translation until the pack was deleted by hand. A pack
 * was fetched once and never asked about again.
 *
 * Held here: when the check asks and when it does not, that only the file
 * the manifest names takes the old one's place, that the pack is readable
 * all the way through, and that a book waits for Wi-Fi.
 */
import { createHash } from 'crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import ReactNativeBlobUtil from 'react-native-blob-util';

type Answer = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text?: () => Promise<string> }>;
const mockRequests: string[] = [];
const mockNet: { answer: Answer } = { answer: async () => ({ ok: false, status: 404, json: async () => null }) };

jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn((url: string) => {
    mockRequests.push(url);
    return mockNet.answer(url);
  }),
}));
jest.mock('../src/quran/mushafDownload', () => ({ mkdirDeep: jest.fn(async () => undefined) }));

import { hencIndex } from '../src/hadith/library';
import {
  _resetPacksForTests,
  deletePack,
  downloadPack,
  packStatus,
  packsRevision,
  type PackStatus,
} from '../src/hadith/packs';
import {
  checkPackUpdates,
  NEXT_CHECK_KEY,
  PACK_CHECK_EVERY_MS,
  PACK_CHECK_RETRY_MS,
  QUIET_UPDATE_BYTES,
} from '../src/hadith/packUpdates';
import type { Manifest, PackKey } from '../src/hadith/packTypes';

const files = (jest.requireMock('react-native-blob-util') as { __files: Map<string, string> }).__files;
const config = ReactNativeBlobUtil.config as unknown as jest.Mock;
const netFetch = NetInfo.fetch as unknown as jest.Mock;

const RELEASE = 'https://github.com/MihrabHQ/Mihrab/releases/download/data-hadith-v1';
const MANIFEST_URL = `${RELEASE}/manifest.json`;
const STARTER: PackKey = 'henc/starter/en';
const STARTER_URL = `${RELEASE}/henc.starter.en.json`;
const STARTER_FILE = '/mock/documents/hadith/v1/henc/starter/en.json';
const BOOK: PackKey = 'books/bukhari';
const BOOK_URL = `${RELEASE}/books.bukhari.json`;
const T = 1_800_000_000_000;

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** The starter set, with the translation the 14th of the Forty is shown with. */
const starter = (fourteenth: string) =>
  JSON.stringify({
    pack: 'starter',
    lang: 'en',
    source: 'HadeethEnc.com',
    retrieved: '2026-11-25',
    entries: [{ id: '4714', t: 'The blood of a Muslim', h: fourteenth, c: ['1'] }],
  });
const WRONG = starter('ʿĀʾishah reported: …');
const RIGHT = starter('Ibn Masʿūd reported: "The blood of a Muslim is inviolable except by one of three…"');

const book = (text: string) =>
  JSON.stringify({ book: 'bukhari', source: 'Open-Hadith-Data', license: 'ODbL-1.0', retrieved: '2026-11-25', hadiths: [[1, text]] });

/** What our copy holds, by URL: what a transfer writes when it finishes. */
const published = new Map<string, string>();

function manifestOf(packs: { starter?: string; book?: string; bookBytes?: number; sha256?: boolean }): Manifest {
  const entry = (body: string, bytes = Buffer.byteLength(body)) =>
    packs.sha256 === false ? { bytes } : { bytes, sha256: sha(body) };
  return {
    v: 1,
    henc: packs.starter ? { starter: { langs: { en: entry(packs.starter) } } } : {},
    books: packs.book ? { bukhari: entry(packs.book, packs.bookBytes) } : {},
    nawawi: null,
    categories: {},
  };
}

/** Our copy as a plain request sees it: the manifest, and — when `packs` — the packs as text. */
function publish(manifest: Manifest | null, packs: 'no plain requests' | 'plain requests' = 'no plain requests') {
  mockNet.answer = async url => {
    if (url === MANIFEST_URL && manifest) return { ok: true, status: 200, json: async () => manifest };
    if (url === MANIFEST_URL) return { ok: false, status: 404, json: async () => null };
    const body = published.get(url);
    if (packs === 'no plain requests' || body == null) throw new Error('Network request failed');
    return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
  };
}

type Transfer = { url: string; finish: (status?: number) => void; fail: (e: Error) => void; cancelled: boolean; progress?: (received: number, total: number) => void };
const transfers: Transfer[] = [];

const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

/** Put a pack on the device the way a reader does: by downloading it. */
async function have(key: PackKey, url: string, body: string) {
  published.set(url, body);
  const done = downloadPack(key);
  await settle();
  transfers[transfers.length - 1].finish();
  await expect(done).resolves.toBe(true);
  transfers.length = 0;
  mockRequests.length = 0;
}

const WIFI = { isConnected: true, type: 'wifi', details: { isConnectionExpensive: false } };
const CELLULAR = { isConnected: true, type: 'cellular', details: { isConnectionExpensive: true } };

beforeEach(async () => {
  mockRequests.length = 0;
  transfers.length = 0;
  published.clear();
  files.clear();
  _resetPacksForTests();
  await AsyncStorage.clear();
  publish(null);
  netFetch.mockResolvedValue(WIFI);
  // The shared mock lists a folder's files and not its folders; the packs
  // are two and three folders down, and the check begins by finding them.
  (ReactNativeBlobUtil.fs.lstat as unknown as jest.Mock).mockImplementation(async (dir: string) => {
    const prefix = `${String(dir).replace(/\/$/, '')}/`;
    const out = new Map<string, { filename: string; size: number; type: string }>();
    for (const [path, data] of files) {
      if (!path.startsWith(prefix)) continue;
      const [name, ...deeper] = path.slice(prefix.length).split('/');
      out.set(name, deeper.length ? { filename: name, size: 0, type: 'directory' } : { filename: name, size: Buffer.byteLength(data), type: 'file' });
    }
    return [...out.values()];
  });
  config.mockImplementation(({ path }: { path: string }) => ({
    fetch: (_method: string, url: string) => {
      const transfer = { url, cancelled: false } as Transfer;
      const task = new Promise<{ info: () => { status: number } }>((resolve, reject) => {
        transfer.finish = (status = 200) => {
          if (status === 200) files.set(path, published.get(url) ?? '');
          resolve({ info: () => ({ status }) });
        };
        transfer.fail = reject;
      }) as Promise<{ info: () => { status: number } }> & Record<string, unknown>;
      task.progress = (_opts: unknown, cb: (received: number, total: number) => void) => {
        transfer.progress = cb;
        return task;
      };
      task.cancel = () => {
        transfer.cancelled = true;
        transfer.fail(new Error('cancelled'));
      };
      transfers.push(transfer);
      return task;
    },
  }));
});

describe('when the check asks', () => {
  it('makes no request on a device that has downloaded nothing', async () => {
    publish(manifestOf({ starter: RIGHT }));
    const report = await checkPackUpdates({ now: () => T });
    expect(report.checked).toBe(false);
    expect(mockRequests).toEqual([]);
    expect(transfers).toEqual([]);
    // And it has not used up the day: the first pack downloaded is checked.
    expect(await AsyncStorage.getItem(NEXT_CHECK_KEY)).toBeNull();
  });

  it('asks our copy only: the manifest, and nothing of the sources', async () => {
    await have(STARTER, STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));
    const report = await checkPackUpdates({ now: () => T });
    expect(report).toEqual({ checked: true, replaced: [], waiting: [], failed: [] });
    expect(mockRequests).toEqual([MANIFEST_URL]);
    // The pack here is the one we publish: nothing is fetched.
    expect(transfers).toEqual([]);
  });

  it('asks once a day', async () => {
    await have(STARTER, STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));
    await checkPackUpdates({ now: () => T });
    expect(Number(await AsyncStorage.getItem(NEXT_CHECK_KEY))).toBe(T + PACK_CHECK_EVERY_MS);

    mockRequests.length = 0;
    expect((await checkPackUpdates({ now: () => T + PACK_CHECK_EVERY_MS - 1 })).checked).toBe(false);
    expect(mockRequests).toEqual([]);

    expect((await checkPackUpdates({ now: () => T + PACK_CHECK_EVERY_MS })).checked).toBe(true);
    expect(mockRequests).toEqual([MANIFEST_URL]);
  });

  it('asks again in an hour when the manifest could not be read', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    publish(null);
    const report = await checkPackUpdates({ now: () => T });
    expect(report.checked).toBe(true);
    expect(report.replaced).toEqual([]);
    expect(Number(await AsyncStorage.getItem(NEXT_CHECK_KEY))).toBe(T + PACK_CHECK_RETRY_MS);
    expect(files.get(STARTER_FILE)).toBe(WRONG);
  });

  it('does not wait out a time written by a clock that was wrong', async () => {
    await have(STARTER, STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));
    // "Next check" a year off: no check sets one further than a day.
    await AsyncStorage.setItem(NEXT_CHECK_KEY, String(T + 365 * PACK_CHECK_EVERY_MS));
    expect((await checkPackUpdates({ now: () => T })).checked).toBe(true);
  });

  it('leaves alone what a manifest without SHA-256 cannot tell apart', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    publish(manifestOf({ starter: RIGHT, sha256: false }));
    const report = await checkPackUpdates({ now: () => T });
    expect(report).toEqual({ checked: true, replaced: [], waiting: [], failed: [] });
    expect(transfers).toEqual([]);
    expect(files.get(STARTER_FILE)).toBe(WRONG);
  });
});

describe('a pack we have corrected', () => {
  it('is fetched again from our copy, over the one here', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    published.set(STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));

    const check = checkPackUpdates({ now: () => T });
    await settle();
    expect(transfers.map(t => t.url)).toEqual([STARTER_URL]);
    transfers[0].finish();
    await expect(check).resolves.toEqual({ checked: true, replaced: [STARTER], waiting: [], failed: [] });

    expect(files.get(STARTER_FILE)).toBe(RIGHT);
    const status = packStatus(STARTER) as Extract<PackStatus, { state: 'ready' }>;
    expect(status).toEqual({ state: 'ready', bytes: Buffer.byteLength(RIGHT, 'utf8') });
    // Nothing half-written is left beside it, and the sources were not asked.
    expect([...files.keys()].filter(k => k.endsWith('.dl') || k.endsWith('.part'))).toEqual([]);
    expect(mockRequests).toEqual([MANIFEST_URL]);
    expect(Number(await AsyncStorage.getItem(NEXT_CHECK_KEY))).toBe(T + PACK_CHECK_EVERY_MS);
  });

  it('stays readable while its replacement comes down', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    published.set(STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));

    const check = checkPackUpdates({ now: () => T });
    await settle();
    const before = packStatus(STARTER);
    expect(before.state).toBe('ready');
    // The bar of a download does not appear over a pack that is here.
    transfers[0].progress?.(500, 1000);
    expect(packStatus(STARTER)).toBe(before);
    expect(files.get(STARTER_FILE)).toBe(WRONG);
    transfers[0].finish();
    await check;
  });

  it('is read again by what was built from the old one', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    expect((await hencIndex('en')).lang.get('4714')?.h).toContain('ʿĀʾishah');
    const revision = packsRevision();

    published.set(STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));
    const check = checkPackUpdates({ now: () => T });
    await settle();
    transfers[0].finish();
    await check;

    // The same pack by name; the screens key on the revision beside it.
    expect(packsRevision()).toBe(revision + 1);
    expect((await hencIndex('en')).lang.get('4714')?.h).toContain('Ibn Masʿūd');
  });

  it('keeps the old file when what arrives is not the file the manifest names', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    // The release mid-upload: the manifest is new, the asset is not yet.
    published.set(STARTER_URL, starter('some third thing'));
    publish(manifestOf({ starter: RIGHT }));

    const check = checkPackUpdates({ now: () => T });
    await settle();
    transfers[0].finish();
    const report = await check;
    expect(report.replaced).toEqual([]);
    expect(report.failed).toEqual([]);
    expect(files.get(STARTER_FILE)).toBe(WRONG);
    expect(packStatus(STARTER).state).toBe('ready');
    expect([...files.keys()].filter(k => k.endsWith('.dl'))).toEqual([]);
    // Tomorrow, not in an hour: nothing on this device can mend a release.
    expect(Number(await AsyncStorage.getItem(NEXT_CHECK_KEY))).toBe(T + PACK_CHECK_EVERY_MS);
  });

  it('keeps the old file when the transfer breaks off, and tries again in an hour', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    published.set(STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));

    const check = checkPackUpdates({ now: () => T });
    await settle();
    transfers[0].fail(new Error('Download interrupted.'));
    await expect(check).resolves.toEqual({ checked: true, replaced: [], waiting: [], failed: [STARTER] });
    expect(files.get(STARTER_FILE)).toBe(WRONG);
    expect(packStatus(STARTER).state).toBe('ready');
    expect(Number(await AsyncStorage.getItem(NEXT_CHECK_KEY))).toBe(T + PACK_CHECK_RETRY_MS);
    // Our copy was asked again by a plain request, and nobody else: a
    // replacement is our copy or nothing, never a rebuild from HadeethEnc.
    expect(mockRequests).toEqual([MANIFEST_URL, STARTER_URL]);
    expect([...files.keys()].filter(k => k.endsWith('.dl'))).toEqual([]);
  });

  // Found on the Android emulator, 2026-11-25: its NAT cuts the transfer
  // onto the disk, the first download gets through by a plain request, and
  // a replacement that knew only the transfer failed every hour for good.
  it('comes by a plain request where the transfer onto the disk breaks off', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    published.set(STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }), 'plain requests');

    const check = checkPackUpdates({ now: () => T });
    await settle();
    transfers[0].fail(new Error('Download interrupted.'));
    await expect(check).resolves.toEqual({ checked: true, replaced: [STARTER], waiting: [], failed: [] });
    expect(files.get(STARTER_FILE)).toBe(RIGHT);
    expect(packStatus(STARTER)).toEqual({ state: 'ready', bytes: Buffer.byteLength(RIGHT, 'utf8') });
    expect([...files.keys()].filter(k => k.endsWith('.dl'))).toEqual([]);
  });

  it('is held to the manifest by a plain request as well', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    published.set(STARTER_URL, starter('some third thing'));
    publish(manifestOf({ starter: RIGHT }), 'plain requests');

    const check = checkPackUpdates({ now: () => T });
    await settle();
    transfers[0].fail(new Error('Download interrupted.'));
    expect((await check).replaced).toEqual([]);
    expect(files.get(STARTER_FILE)).toBe(WRONG);
    expect([...files.keys()].filter(k => k.endsWith('.dl'))).toEqual([]);
  });

  it('does not come back after the reader deleted it meanwhile', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    published.set(STARTER_URL, RIGHT);
    publish(manifestOf({ starter: RIGHT }));

    const check = checkPackUpdates({ now: () => T });
    await settle();
    await deletePack(STARTER);
    expect(transfers[0].cancelled).toBe(true);
    const report = await check;
    expect(report.replaced).toEqual([]);
    expect(files.has(STARTER_FILE)).toBe(false);
    expect(packStatus(STARTER)).toEqual({ state: 'absent' });
  });
});

describe('a large pack', () => {
  const OLD = book('old');
  const NEW = book('new');
  const LARGE = QUIET_UPDATE_BYTES + 1;

  it('waits for Wi-Fi on a metered connection, and is asked about again in an hour', async () => {
    await have(BOOK, BOOK_URL, OLD);
    published.set(BOOK_URL, NEW);
    publish(manifestOf({ book: NEW, bookBytes: LARGE }));
    netFetch.mockResolvedValue(CELLULAR);

    const report = await checkPackUpdates({ now: () => T });
    expect(report).toEqual({ checked: true, replaced: [], waiting: [BOOK], failed: [] });
    expect(transfers).toEqual([]);
    expect(Number(await AsyncStorage.getItem(NEXT_CHECK_KEY))).toBe(T + PACK_CHECK_RETRY_MS);
  });

  it('is not fetched on a connection that does not say what it costs', async () => {
    await have(BOOK, BOOK_URL, OLD);
    published.set(BOOK_URL, NEW);
    publish(manifestOf({ book: NEW, bookBytes: LARGE }));
    netFetch.mockRejectedValue(new Error('no NetInfo'));

    expect((await checkPackUpdates({ now: () => T })).waiting).toEqual([BOOK]);
    expect(transfers).toEqual([]);
  });

  it('is fetched on Wi-Fi', async () => {
    await have(BOOK, BOOK_URL, OLD);
    published.set(BOOK_URL, NEW);
    publish(manifestOf({ book: NEW, bookBytes: LARGE }));

    const check = checkPackUpdates({ now: () => T });
    await settle();
    transfers[0].finish();
    expect((await check).replaced).toEqual([BOOK]);
    expect(files.get('/mock/documents/hadith/v1/books/bukhari.json')).toBe(NEW);
  });

  it('does not hold back the small ones beside it', async () => {
    await have(STARTER, STARTER_URL, WRONG);
    await have(BOOK, BOOK_URL, OLD);
    published.set(STARTER_URL, RIGHT);
    published.set(BOOK_URL, NEW);
    publish({ ...manifestOf({ starter: RIGHT }), books: manifestOf({ book: NEW, bookBytes: LARGE }).books });
    netFetch.mockResolvedValue(CELLULAR);

    const check = checkPackUpdates({ now: () => T });
    await settle();
    expect(transfers.map(t => t.url)).toEqual([STARTER_URL]);
    transfers[0].finish();
    await expect(check).resolves.toEqual({ checked: true, replaced: [STARTER], waiting: [BOOK], failed: [] });
  });
});
