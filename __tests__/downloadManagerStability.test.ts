/**
 * The download manager cannot be wedged, and nothing it owns is lost.
 *
 * `quranDownloadManager.test.ts` pins what the manager does when every job
 * behaves. This file is about the jobs that do not: one that throws, one
 * whose promise rejects, one that stops calling back and never settles,
 * one that answers after it has been given up on, a phone too full for
 * it, a process killed halfway — and then a few thousand random
 * operations, checking after every one that the manager still tells the
 * truth.
 *
 * "Something is already downloading" is the manager's one refusal, so a
 * run that never ends is not one stuck download: it is every download
 * button in the app, disabled until the app is killed.
 */
type Outcome = { complete: boolean; interrupted: boolean };
type Progress = { done: number; total: number; failed: number };

type MockHandle = {
  what: string;
  cancel: jest.Mock;
  settle: (o: Outcome) => void;
  reject: (e: unknown) => void;
  onProgress: (p: Progress) => void;
  settled: boolean;
};
const mockHandles: MockHandle[] = [];
/** Make the next job's start throw instead of returning a handle. */
let mockThrowOnStart = false;

function mockMakeHandle(what: string, onProgress?: (p: Progress) => void) {
  if (mockThrowOnStart) {
    mockThrowOnStart = false;
    throw new Error(`could not start ${what}`);
  }
  let settle!: (o: Outcome) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Outcome>((res, rej) => {
    settle = res;
    reject = rej;
  });
  const entry: MockHandle = {
    what,
    cancel: jest.fn(),
    settle: o => {
      entry.settled = true;
      settle(o);
    },
    reject: e => {
      entry.settled = true;
      reject(e);
    },
    onProgress: onProgress ?? (() => {}),
    settled: false,
  };
  mockHandles.push(entry);
  return { promise, cancel: entry.cancel };
}

jest.mock('../src/quran/mushafFontStore', () => ({
  downloadAllPageFonts: (o?: { onProgress?: (p: Progress) => void; set?: string }) =>
    mockMakeHandle(`fonts:${o?.set ?? 'v2'}`, o?.onProgress),
}));
jest.mock('../src/quran/audio/audioStore', () => ({
  downloadReciterAudio: (id: string, p?: (p: Progress) => void) => mockMakeHandle(`audio:${id}`, p),
  downloadAyahs: (id: string, refs: unknown[], p?: (p: Progress) => void) =>
    mockMakeHandle(`ayahs:${id}:${refs.length}`, p),
  downloadSurahAudio: (id: string, s: number, p?: (p: Progress) => void) =>
    mockMakeHandle(`surah:${id}:${s}`, p),
  totalAyahCount: () => 6236,
  estimatedReciterBytes: () => 1_000_000_000,
  // Part-downloaded: a reciter with no files at all is not offered back.
  reciterAudioStats: () => Promise.resolve({ files: 120, bytes: 9_000_000, complete: false }),
}));
jest.mock('../src/quran/riwayahDownload', () => ({
  downloadRiwayah: (id: string, _src: unknown, p?: (p: Progress) => void) =>
    mockMakeHandle(`riwayah:${id}`, p),
}));
const mockShortfall = jest.fn(async (_need: number) => 0);
jest.mock('../src/quran/downloadSpace', () => ({
  spaceShortfall: (need: number) => mockShortfall(need),
  sizeLabel: (b: number) => `${Math.round(b / 1024 ** 2)} MB`,
}));
const mockPublish = jest.fn();
const mockFinish = jest.fn();
jest.mock('../src/quran/downloadNotification', () => ({
  publishDownloadProgress: (...a: unknown[]) => mockPublish(...a),
  finishDownloadNotification: (...a: unknown[]) => mockFinish(...a),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelQuranDownload,
  hydrateResumableJob,
  queueQuranDownload,
  queuedQuranDownloads,
  quranDownloadState,
  resetQuranDownloadState,
  resumableJob,
  startQuranDownload,
  STALL_GRACE_MS,
  STALL_MS,
  subscribeQuranDownload,
  type QuranDownloadJob,
} from '../src/quran/quranDownloadManager';

const PENDING_KEY = 'mihrab.quran.download.pending';
const FONTS: QuranDownloadJob = { kind: 'fonts' };
const HUSARY: QuranDownloadJob = { kind: 'audio', reciterId: 'husary' };
const WARSH: QuranDownloadJob = { kind: 'riwayah', riwayahId: 'warsh' };

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(async () => {
  jest.useRealTimers();
  mockHandles.length = 0;
  mockThrowOnStart = false;
  mockShortfall.mockReset();
  mockShortfall.mockImplementation(async () => 0);
  mockPublish.mockClear();
  mockFinish.mockClear();
  await AsyncStorage.clear();
  resetQuranDownloadState();
});
afterEach(() => {
  resetQuranDownloadState();
  jest.useRealTimers();
});

describe('a job that misbehaves does not wedge the manager', () => {
  it('ends a run whose start throws, and takes the next one', async () => {
    mockThrowOnStart = true;
    expect(startQuranDownload(FONTS)).toBe(true);
    await flush();
    const s = quranDownloadState();
    expect(s.running).toBeNull();
    expect(s.last?.complete).toBe(false);
    expect(s.last?.error?.detail).toMatch(/could not start/);
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(startQuranDownload(HUSARY)).toBe(true);
  });

  it('ends a run whose promise rejects', async () => {
    startQuranDownload(FONTS);
    mockHandles[0].reject(new Error('native module said no'));
    await flush();
    expect(quranDownloadState().running).toBeNull();
    expect(quranDownloadState().last?.error?.detail).toBe('native module said no');
    expect(startQuranDownload(HUSARY)).toBe(true);
  });

  it('cancels a run that has gone silent, and calls it interrupted', async () => {
    jest.useFakeTimers();
    startQuranDownload(HUSARY);
    mockHandles[0].onProgress({ done: 10, total: 6236, failed: 0 });
    await jest.advanceTimersByTimeAsync(STALL_MS - 1000);
    expect(mockHandles[0].cancel).not.toHaveBeenCalled(); // progress re-armed it
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockHandles[0].cancel).toHaveBeenCalledTimes(1);
    // The job answers its cancel the way a real one does.
    mockHandles[0].settle({ complete: false, interrupted: false });
    await flush();
    const s = quranDownloadState();
    expect(s.running).toBeNull();
    expect(s.last?.interrupted).toBe(true);
    expect(s.last?.cancelled).toBe(false);
    expect(resumableJob()).toEqual(HUSARY);
  });

  it('ends a silent run for it when even the cancel goes unanswered', async () => {
    jest.useFakeTimers();
    startQuranDownload(FONTS);
    await jest.advanceTimersByTimeAsync(STALL_MS + STALL_GRACE_MS + 10);
    expect(quranDownloadState().running).toBeNull();
    expect(quranDownloadState().last?.interrupted).toBe(true);
    expect(startQuranDownload(HUSARY)).toBe(true);
  });

  it('drops a late answer and late progress from a run already given up on', async () => {
    jest.useFakeTimers();
    startQuranDownload(FONTS);
    const zombie = mockHandles[0];
    await jest.advanceTimersByTimeAsync(STALL_MS + STALL_GRACE_MS + 10);
    startQuranDownload(HUSARY);
    zombie.onProgress({ done: 600, total: 604, failed: 0 });
    zombie.settle({ complete: true, interrupted: false });
    await flush();
    const s = quranDownloadState();
    expect(s.running).toEqual(HUSARY);
    expect(s.progress.total).toBe(6236);
    expect(mockFinish).toHaveBeenCalledTimes(1); // the stalled run's, only
  });

  it('a cancel that throws still ends the run', async () => {
    startQuranDownload(FONTS);
    mockHandles[0].cancel.mockImplementation(() => {
      throw new Error('boom');
    });
    cancelQuranDownload();
    await flush();
    expect(quranDownloadState().running).toBeNull();
    expect(quranDownloadState().last?.cancelled).toBe(true);
  });
});

describe('nothing is lost to a killed process', () => {
  it('writes the resume note when a run STARTS, so a kill mid-run is still offered back', async () => {
    startQuranDownload(HUSARY);
    await flush();
    expect(JSON.parse(String(await AsyncStorage.getItem(PENDING_KEY)))).toEqual(HUSARY);
    // The process dies: no outcome ever arrives. A fresh process reads the note.
    resetQuranDownloadState();
    await expect(hydrateResumableJob()).resolves.toEqual(HUSARY);
    expect(resumableJob()).toEqual(HUSARY);
  });

  it('clears the note on a finished run and on a cancelled one', async () => {
    startQuranDownload(FONTS);
    mockHandles[0].settle({ complete: true, interrupted: false });
    await flush();
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
    startQuranDownload(HUSARY);
    cancelQuranDownload();
    mockHandles[1].settle({ complete: false, interrupted: false });
    await flush();
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('remembers a riwayah job, link and all, across the kill', async () => {
    const pasted: QuranDownloadJob = {
      kind: 'riwayah',
      riwayahId: 'qalun',
      url: 'https://example.org/qalun.json',
    };
    startQuranDownload(pasted);
    await flush();
    resetQuranDownloadState();
    await expect(hydrateResumableJob()).resolves.toEqual(pasted);
  });
});

describe('a phone too full for the download', () => {
  it('stops a reciter with one reason, says it in the shade, and offers nothing to resume', async () => {
    mockShortfall.mockImplementation(async () => 300 * 1024 ** 2);
    startQuranDownload(HUSARY);
    await flush();
    expect(mockHandles[0].cancel).toHaveBeenCalled();
    mockHandles[0].settle({ complete: false, interrupted: false });
    await flush();
    const s = quranDownloadState();
    expect(s.running).toBeNull();
    expect(s.last?.interrupted).toBe(false);
    expect(s.last?.error).toMatchObject({
      key: 'quran.downloadNoSpaceBody',
      params: { size: '300 MB' },
    });
    expect(mockFinish.mock.calls[0][0]).toMatchObject({
      complete: false,
      interrupted: false,
    });
    expect(resumableJob()).toBeNull();
  });

  it('does not measure the small downloads at all', async () => {
    startQuranDownload(WARSH);
    startQuranDownload(FONTS); // refused: one at a time
    await flush();
    expect(mockShortfall).not.toHaveBeenCalled();
  });
});

describe('the riwayah download is a manager job like the others', () => {
  it('runs one at a time with the rest, and is named for what it is', async () => {
    startQuranDownload(HUSARY);
    expect(startQuranDownload(WARSH)).toBe(false);
    expect(queueQuranDownload(WARSH)).toBe('queued');
    mockHandles[0].settle({ complete: true, interrupted: false });
    await flush();
    expect(quranDownloadState().running).toEqual(WARSH);
    expect(quranDownloadState().progress.total).toBe(1);
    expect(mockHandles[1].what).toBe('riwayah:warsh');
  });
});

// ─── Chaos ──────────────────────────────────────────────────────────────

/** A small seeded generator, so a failure names a seed that reproduces it. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

const JOBS: QuranDownloadJob[] = [
  FONTS,
  { kind: 'fonts', set: 'tajweed-light' },
  HUSARY,
  { kind: 'audio', reciterId: 'alafasy' },
  { kind: 'surah', reciterId: 'husary', surah: 2 },
  { kind: 'wordMeanings' },
  { kind: 'tafsir', editionId: 'ar-tafsir-muyassar' },
  WARSH,
];

describe('a few thousand random operations', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('keeps every invariant (seed %i)', async seed => {
    jest.useFakeTimers();
    const r = rng(seed * 7919);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    // Count runs from the outside, the way a screen sees them: a run begins
    // when `running` becomes a job and ends when it stops being that job.
    let begun = 0;
    let ended = 0;
    let prev: QuranDownloadJob | null = null;
    const unsubscribe = subscribeQuranDownload(st => {
      if (st.running !== prev) {
        if (prev) ended += 1;
        if (st.running) begun += 1;
        prev = st.running;
      }
    });
    let started = 0;

    for (let step = 0; step < 400; step++) {
      const live = mockHandles.filter(h => !h.settled);
      const op = r();
      if (op < 0.25) {
        if (startQuranDownload(pick(JOBS))) started += 1;
      } else if (op < 0.4) {
        const before = quranDownloadState().running;
        const answer = queueQuranDownload(pick(JOBS));
        if (answer === 'started' && !before) started += 1;
      } else if (op < 0.5) {
        cancelQuranDownload();
      } else if (op < 0.7 && live.length) {
        const h = pick(live);
        const roll = r();
        if (roll < 0.15) h.reject(new Error('chaos'));
        else h.settle({ complete: roll < 0.6, interrupted: roll > 0.85 });
      } else if (op < 0.85 && live.length) {
        const total = 1 + Math.floor(r() * 100);
        pick(live).onProgress({ done: Math.floor(r() * total), total, failed: 0 });
      } else if (op < 0.9) {
        mockThrowOnStart = r() < 0.5;
      } else {
        await jest.advanceTimersByTimeAsync(Math.floor(r() * (STALL_MS + STALL_GRACE_MS)));
      }
      await flush();

      const s = quranDownloadState();
      const queued = queuedQuranDownloads();
      // 1. Every run that ended was told to the shade exactly once.
      expect(mockFinish).toHaveBeenCalledTimes(ended);
      // 2. Runs begin and end in pairs: at most one is open, and it is
      //    the one the state says is running.
      expect(begun - ended).toBe(s.running ? 1 : 0);
      // 3. An idle manager has nothing waiting — it takes the head of the
      //    queue in the same breath as it ends a run.
      if (!s.running) expect(queued).toHaveLength(0);
      // 4. No job waits twice, and the running one is not also waiting.
      const keys = queued.map(q => JSON.stringify(q));
      expect(new Set(keys).size).toBe(keys.length);
      if (s.running) expect(keys).not.toContain(JSON.stringify(s.running));
      // 5. A run's report belongs to the job that ran.
      if (s.last) expect(JOBS.map(j => JSON.stringify(j))).toContain(JSON.stringify({ ...s.last.job }));
    }

    // And at the end, however it got here, it can always be brought to rest
    // and asked again.
    cancelQuranDownload();
    await jest.advanceTimersByTimeAsync(STALL_MS + STALL_GRACE_MS + 10);
    await flush();
    for (let i = 0; i < 20 && quranDownloadState().running; i++) {
      // A queue may start the next run as each one ends; let them go.
      cancelQuranDownload();
      await jest.advanceTimersByTimeAsync(STALL_MS + STALL_GRACE_MS + 10);
      await flush();
    }
    expect(quranDownloadState().running).toBeNull();
    mockThrowOnStart = false;
    expect(startQuranDownload(FONTS)).toBe(true);
    expect(started).toBeGreaterThan(0);
    expect(begun).toBeGreaterThan(5);
    unsubscribe();
  });
});
