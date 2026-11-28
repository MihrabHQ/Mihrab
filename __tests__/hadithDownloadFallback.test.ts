/**
 * Our copy first; where it came from when ours cannot be had — as it
 * runs, not as it reads (hadithDownloadsThroughManager.test.ts reads it).
 */
import crypto from 'crypto';
import ReactNativeBlobUtil from 'react-native-blob-util';
import * as Origin from '../src/hadith/libraryPdfOrigin';
import { _resetLibraryPdfForTests, downloadLibraryPdf, libraryPdfPath, libraryPdfStatus } from '../src/hadith/libraryPdf';
import { _resetPacksForTests, downloadPack, isPackReady, loadPack } from '../src/hadith/packs';
import ORIGINS from '../src/hadith/libraryPdfOrigins.json';

const files = (jest.requireMock('react-native-blob-util') as { __files: Map<string, string> }).__files;
const config = ReactNativeBlobUtil.config as unknown as jest.Mock;
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const BOOK = '%PDF-1.4 the book, byte for byte';
const want = { bytes: BOOK.length, sha256: sha(BOOK), pages: 3 };
const PUBLISHER = 'https://publisher.example/book.pdf';

/** Who was asked, in order, and what each answers. */
let asked: string[] = [];
function serve(answers: Record<string, { status: number; body?: string } | 'throw'>) {
  config.mockImplementation((opts: { path?: string }) => ({
    fetch: (_method: string, url: string) => {
      asked.push(url);
      const a = Object.entries(answers).find(([k]) => url.includes(k))?.[1] ?? { status: 404 };
      const task = (async () => {
        if (a === 'throw') throw new Error('Download interrupted.');
        if (a.body != null && opts.path) files.set(opts.path, a.body);
        return { info: () => ({ status: a.status }) };
      })() as Promise<unknown> & { progress?: unknown; cancel?: unknown };
      task.progress = () => task;
      task.cancel = () => undefined;
      return task;
    },
  }));
}

beforeEach(() => {
  files.clear();
  asked = [];
  _resetLibraryPdfForTests();
  _resetPacksForTests();
  // The ordinary request that stands in for a streamed one: it fails too, unless a test says otherwise.
  (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 503 }));
  jest.spyOn(Origin, 'libraryPdfOrigin').mockReturnValue({ url: PUBLISHER, pack: {} as never });
});
afterEach(() => jest.restoreAllMocks());

describe("a Library book's file", () => {
  it('comes from our copy, and the publisher is not asked', async () => {
    serve({ 'github.com': { status: 200, body: BOOK } });
    expect(await downloadLibraryPdf('b', want)).toBe(true);
    expect(files.get(libraryPdfPath('b'))).toBe(BOOK);
    expect(asked.every(u => u.includes('github.com/MihrabHQ/Mihrab/releases/download/data-hadith-v1/'))).toBe(true);
  });

  it("comes from its publisher when ours cannot be had — the same file, so it is kept", async () => {
    serve({ 'github.com': 'throw', 'publisher.example': { status: 200, body: BOOK } });
    expect(await downloadLibraryPdf('b', want)).toBe(true);
    expect(files.get(libraryPdfPath('b'))).toBe(BOOK);
    expect(asked[0]).toContain('github.com');
    expect(asked[asked.length - 1]).toBe(PUBLISHER);
    expect(libraryPdfStatus('b').state).toBe('ready');
  });

  it("refuses the publisher's file when it is not ours byte for byte", async () => {
    const other = '%PDF-1.4 the book, BYTE FOR BYTE';
    expect(other.length).toBe(BOOK.length);
    serve({ 'github.com': { status: 503 }, 'publisher.example': { status: 200, body: other } });
    expect(await downloadLibraryPdf('b', want)).toBe(false);
    expect(files.has(libraryPdfPath('b'))).toBe(false);
    expect(libraryPdfStatus('b')).toEqual({ state: 'failed', why: 'file' });
  });

  it('says it is the connection when neither answers, and leaves nothing behind', async () => {
    serve({ 'github.com': 'throw', 'publisher.example': 'throw' });
    expect(await downloadLibraryPdf('b', want)).toBe(false);
    expect(libraryPdfStatus('b')).toEqual({ state: 'failed', why: 'network' });
    expect([...files.keys()].filter(k => k.includes('/library/b.pdf'))).toEqual([]);
  });
});

describe("a Library book's pack", () => {
  it('is the one in the app when our copy cannot be had', async () => {
    jest.restoreAllMocks();
    const id = Object.keys(ORIGINS)[0];
    serve({ 'github.com': { status: 503 } });
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 503 }));
    expect(await downloadPack(`library/${id}`)).toBe(true);
    expect(isPackReady(`library/${id}`)).toBe(true);
    expect(await loadPack(`library/${id}`)).toEqual((ORIGINS as Record<string, { pack: unknown }>)[id].pack);
  });

  it('is our copy where it answers', async () => {
    jest.restoreAllMocks();
    const id = Object.keys(ORIGINS)[0];
    const ours = { ...(ORIGINS as Record<string, { pack: Record<string, unknown> }>)[id].pack, asOf: '2027-01-01' };
    serve({ 'github.com': { status: 200, body: JSON.stringify(ours) } });
    expect(await downloadPack(`library/${id}`)).toBe(true);
    expect((await loadPack(`library/${id}`)) as unknown).toEqual(ours);
  });
});
