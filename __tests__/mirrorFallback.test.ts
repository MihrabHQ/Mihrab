/**
 * Mirror first, original second — through the real modules and real fetch.
 *
 * Nothing here mocks the fetch layer or the mirror config. A local server
 * plays both hosts: the real mirror URLs (this repo's GitHub releases) and
 * the real original hosts (jsDelivr, QuranEnc, Quranpedia) are rewritten
 * to it, and it records which one each request went to. Each feature is
 * run with the mirror healthy, missing a file, failing, and unreachable,
 * and must always end up with the right content.
 *
 * Set MIRROR_DIR to a build of scripts/mirror/build-mirror.js to also
 * install the REAL mirrored Warsh/Qālūn/Shuʿbah files through the
 * verifier (skipped otherwise).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  downloadTafsirEdition,
  loadTafsir,
  resetTafsirMemory,
} from '../src/quran/tafsir';
import {
  downloadWordMeanings,
  resetWordMeaningsMemory,
  wordMeaningsFor,
} from '../src/quran/wordMeanings';
import { installRiwayahMirrored } from '../src/quran/riwayahDownload';
import type { RiwayahId } from '../src/quran/riwayat';
import {
  quranDownloadState,
  resetQuranDownloadState,
  resumableJob,
  startQuranDownload,
  subscribeQuranDownload,
} from '../src/quran/quranDownloadManager';

/** Start a manager job and wait for it to end, however it ends. */
function runJob(job: Parameters<typeof startQuranDownload>[0]) {
  resetQuranDownloadState();
  return new Promise<ReturnType<typeof quranDownloadState>>(resolve => {
    const off = subscribeQuranDownload(st => {
      if (!st.running && st.last) {
        off();
        resolve(st);
      }
    });
    expect(startQuranDownload(job)).toBe(true);
  });
}

type Mode = 'up' | 'missing' | 'error' | 'unreachable';
let mode: Mode = 'up';
/** Serve the real built mirror (MIRROR_DIR) instead of the stand-in. */
let realMirror = false;
/** The original hosts unreachable too — the phone is offline. */
let originalDown = false;
let log: string[] = [];
let server: http.Server;
let base = '';
const realDir = process.env.MIRROR_DIR;

const MIRROR = 'https://github.com/MihrabHQ/Mihrab/releases/download/';
const ORIGINALS = [
  'https://cdn.jsdelivr.net/',
  'https://quranenc.com/',
  'https://api.quranpedia.net/',
];
const ED = 'ar-tafsir-muyassar';

function tafsirRows(surah: number, who: string) {
  return [1, 2, 3].map(a => ({ surah, ayah: a, text: `${who} ${surah}:${a}` }));
}

function respond(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url ?? '';
  const send = (body: unknown) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  if (url.startsWith('/mirror/real/')) {
    log.push('mirror');
    const file = path.join(realDir ?? '', url.slice('/mirror/real/'.length));
    if (!fs.existsSync(file)) return void res.writeHead(404).end();
    return send(fs.readFileSync(file, 'utf8'));
  }
  if (url.startsWith('/mirror/')) {
    log.push('mirror');
    if (mode === 'missing') return void res.writeHead(404).end('Not Found');
    if (mode === 'error') return void res.writeHead(503).end('busy');
    let m = url.match(/^\/mirror\/data-tafsir-v1\/(.+)__(\d+)\.json$/);
    if (m) return send(tafsirRows(Number(m[2]), 'mirror'));
    m = url.match(/^\/mirror\/data-wordmeanings-v1\/(\d+)\.json$/);
    if (m) return send(suraBody(Number(m[1]), 'mirror'));
    m = url.match(/^\/mirror\/data-riwayah-v1\/(\w+)\.json$/);
    if (m) {
      if (realDir) {
        return send(
          fs.readFileSync(path.join(realDir, 'data-riwayah-v1', `${m[1]}.json`), 'utf8'),
        );
      }
      return send('{"not":"a mushaf"}');
    }
    return void res.writeHead(404).end();
  }
  log.push('original');
  let m = url.match(/^\/tafsir_api@main\/tafsir\/(.+)\/(\d+)\/(\d+)\.json$/);
  if (m) return send({ text: `original ${m[2]}:${m[3]}` });
  m = url.match(/^\/tafsir_api@main\/tafsir\/(.+)\/(\d+)\.json$/);
  if (m) return send(tafsirRows(Number(m[2]), 'original'));
  m = url.match(/\/translation\/sura\/arabic_seraj\/(\d+)$/);
  if (m) return send(suraBody(Number(m[1]), 'original'));
  if (url.startsWith('/v1/mushafs/')) return send('{"also":"not a mushaf"}');
  res.writeHead(404).end();
}

const AYAHS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

/** QuranEnc's shape; every ayah carries a gloss naming who served it. */
function suraBody(surah: number, who: string) {
  const n = AYAHS[surah - 1];
  return {
    result: Array.from({ length: n }, (_, i) => ({
      sura: String(surah),
      aya: String(i + 1),
      translation: `كلمة: ${who}`,
    })),
  };
}

const setupFetch = global.fetch;
beforeAll(async () => {
  server = http.createServer(respond);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  global.fetch = ((input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.startsWith(MIRROR)) {
      if (mode === 'unreachable') {
        log.push('mirror');
        return Promise.reject(new TypeError('Network request failed'));
      }
      const sub = realMirror ? 'mirror/real' : 'mirror';
      return setupFetch(`${base}/${sub}/${url.slice(MIRROR.length)}`, init);
    }
    for (const o of ORIGINALS) {
      if (url.startsWith(o)) {
        if (originalDown) {
          log.push('original');
          return Promise.reject(new TypeError('Network request failed'));
        }
        const rest = url.slice(o.length).replace(/^gh\/spa5k\//, '');
        return setupFetch(`${base}/${rest}`, init);
      }
    }
    return Promise.reject(new TypeError(`unexpected host: ${url}`));
  }) as typeof fetch;
});
afterAll(async () => {
  global.fetch = setupFetch;
  await new Promise(r => server.close(r));
});

let disk: Map<string, string>;
beforeEach(() => {
  log = [];
  mode = 'up';
  realMirror = false;
  originalDown = false;
  disk = new Map();
  resetTafsirMemory();
  resetWordMeaningsMemory();
  const f = ReactNativeBlobUtil.fs as unknown as Record<string, jest.Mock>;
  f.exists = jest.fn(async (p: string) => disk.has(p) || /\/(s|wordmeanings)$/.test(p));
  f.readFile = jest.fn(async (p: string) => disk.get(p));
  f.writeFile = jest.fn(async (p: string, c: string) => void disk.set(p, c));
});

const count = (who: string) => log.filter(x => x === who).length;

describe('tafsir, one ayah under an open sheet', () => {
  it('answers from the mirror and never asks the original', async () => {
    expect(await loadTafsir(ED, 2, 2)).toBe('mirror 2:2');
    // The next ayah of the same surah is already in memory.
    expect(await loadTafsir(ED, 2, 3)).toBe('mirror 2:3');
    expect(log).toEqual(['mirror']);
  });

  it.each<Mode>(['missing', 'error', 'unreachable'])(
    'falls back to the original when the mirror is %s',
    async m => {
      mode = m;
      expect(await loadTafsir(ED, 5, 1)).toBe('original 5:1');
      expect(log).toEqual(['mirror', 'original']);
    },
  );
});

describe('tafsir, whole edition', () => {
  it('downloads every surah from the mirror alone', async () => {
    const out = await downloadTafsirEdition(ED, {}).promise;
    expect(out).toEqual({ complete: true, interrupted: false });
    expect(count('mirror')).toBe(114);
    expect(count('original')).toBe(0);
    expect(await loadTafsir(ED, 114, 1)).toBe('mirror 114:1');
  });

  it.each<Mode>(['missing', 'error', 'unreachable'])(
    'completes from the original when the mirror is %s',
    async m => {
      mode = m;
      const out = await downloadTafsirEdition(ED, {}).promise;
      expect(out).toEqual({ complete: true, interrupted: false });
      expect(count('original')).toBe(114);
      expect(await loadTafsir(ED, 3, 2)).toBe('original 3:2');
    },
  );
});

describe('word meanings', () => {
  it('downloads every surah from the mirror alone', async () => {
    const out = await downloadWordMeanings({}).promise;
    expect(out).toEqual({ complete: true, interrupted: false });
    expect(count('mirror')).toBe(114);
    expect(count('original')).toBe(0);
    expect((await wordMeaningsFor(2, 255))[0]?.meaning).toBe('mirror');
  });

  it.each<Mode>(['missing', 'error', 'unreachable'])(
    'completes from the original when the mirror is %s',
    async m => {
      mode = m;
      const out = await downloadWordMeanings({}).promise;
      expect(out).toEqual({ complete: true, interrupted: false });
      expect(count('original')).toBe(114);
      expect((await wordMeaningsFor(1, 1))[0]?.meaning).toBe('original');
    },
  );
});

describe('riwayah text', () => {
  it.each<Mode>(['up', 'missing', 'error', 'unreachable'])(
    'tries the mirror, then the publisher, when the mirror is %s and its file does not verify',
    async m => {
      if (realDir) return; // the real files verify; covered below
      mode = m;
      const out = await installRiwayahMirrored('warsh', 'https://api.quranpedia.net/v1/mushafs/4');
      expect(out.ok).toBe(false);
      expect(log).toEqual(['mirror', 'original']);
    },
  );

  (realDir ? it.each<RiwayahId>(['warsh', 'qalun', 'shubah']) : it.skip.each<RiwayahId>(['warsh']))(
    'installs the REAL mirrored %s file without asking the publisher',
    async id => {
      const out = await installRiwayahMirrored(id, 'https://api.quranpedia.net/v1/mushafs/0');
      expect(out.ok).toBe(true);
      expect(log).toEqual(['mirror']);
    },
    60_000,
  );
});

(realDir ? describe : describe.skip)('the REAL mirror files, through the app code', () => {
  beforeEach(() => {
    realMirror = true;
  });

  it.each([
    'en-tafisr-ibn-kathir',
    'en-tafsir-maarif-ul-quran',
    'ar-tafsir-muyassar',
    'ar-tafsir-ibn-kathir',
    'ur-tafseer-ibn-e-kaseer',
    'bn-tafseer-ibn-e-kaseer',
  ])('%s answers Āyat al-Kursī and al-Ikhlāṣ from the mirror alone', async ed => {
    expect((await loadTafsir(ed, 2, 255))?.length).toBeGreaterThan(20);
    expect((await loadTafsir(ed, 112, 1))?.length).toBeGreaterThan(5);
    expect(count('original')).toBe(0);
  }, 60_000);

  it('word meanings download complete from the mirror alone', async () => {
    const out = await downloadWordMeanings({}).promise;
    expect(out).toEqual({ complete: true, interrupted: false });
    expect(count('original')).toBe(0);
    expect((await wordMeaningsFor(2, 255)).length).toBeGreaterThan(0);
  }, 60_000);

  it('the Urdu edition downloads whole from the mirror alone', async () => {
    const out = await downloadTafsirEdition('ur-tafseer-ibn-e-kaseer', {}).promise;
    expect(out).toEqual({ complete: true, interrupted: false });
    expect(count('original')).toBe(0);
  }, 120_000);
});

describe('riwayah, through the download manager', () => {
  afterEach(() => resetQuranDownloadState());

  it('offline everywhere: interrupted, and offered back', async () => {
    mode = 'unreachable';
    originalDown = true;
    const st = await runJob({ kind: 'riwayah', riwayahId: 'warsh' });
    expect(st.last).toMatchObject({ complete: false, interrupted: true });
    expect(st.last?.error?.key).toBe('quran.riwayahUnreachable');
    expect(log).toEqual(['mirror', ...Array(4).fill('original')]);
    expect(resumableJob()).toEqual({ kind: 'riwayah', riwayahId: 'warsh' });
  }, 30_000);

  it('a file that will not verify anywhere: a failure with its reason, not a resume', async () => {
    if (realDir) return;
    const st = await runJob({ kind: 'riwayah', riwayahId: 'warsh' });
    expect(st.last).toMatchObject({ complete: false, interrupted: false });
    expect(st.last?.error?.key).toMatch(/^quran\.riwayah/);
    expect(log).toEqual(['mirror', 'original']);
  });

  (realDir ? it : it.skip)('the REAL mirrored file installs as a complete job', async () => {
    realMirror = true;
    const st = await runJob({ kind: 'riwayah', riwayahId: 'shubah' });
    expect(st.last).toMatchObject({ complete: true, interrupted: false });
    expect(log).toEqual(['mirror']);
  }, 60_000);
});
