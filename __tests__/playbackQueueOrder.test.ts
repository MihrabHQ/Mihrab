/**
 * The queue plays in reading order, whatever the prefetch does to it.
 *
 * The gapless prefetch fetches the next few files together and swaps each
 * queue entry from its URL to the file on disk — a remove and an add at
 * the same index. Run side by side, one swap's remove landed between
 * another's remove and add, and the queue came out of order: on the
 * emulator, An-Nāziʿāt went 3 → 5 → 4.
 *
 * And the ayah buttons step by ayah: a Warsh ayah heard in two files is
 * one step, not two.
 */
import TrackPlayer, { type Track } from 'react-native-track-player';
import {
  parseTrackId,
  playFromAyah,
  skipToNextAyah,
  skipToPreviousAyah,
  stopPlayback,
} from '../src/quran/audio/playback';
import { setQuranPrefs } from '../src/quran/quranState';
import { prefetchAyahAudio } from '../src/quran/audio/audioStore';

jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => null),
  prefetchAyahAudio: jest.fn(),
}));
jest.mock('../src/native/NowPlayingState', () => ({
  setNowPlayingState: jest.fn(),
}));

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;
const tick = () => new Promise(r => setTimeout(r, 0));

/** A queue the mock actually keeps, with every call yielding first. */
function fakeQueue() {
  const q: Track[] = [];
  let active = 0;
  tp.reset.mockImplementation(async () => {
    q.length = 0;
  });
  tp.add.mockImplementation(async (t: Track | Track[], at?: number) => {
    await tick();
    const list = Array.isArray(t) ? t : [t];
    if (at == null) q.push(...list);
    else q.splice(at, 0, ...list);
  });
  tp.remove.mockImplementation(async (idx: number[]) => {
    await tick();
    for (const i of [...idx].sort((a, b) => b - a)) q.splice(i, 1);
  });
  tp.getQueue.mockImplementation(async () => [...q]);
  tp.getTrack.mockImplementation(async (i: number) => q[i]);
  tp.getActiveTrackIndex.mockImplementation(async () => active);
  tp.skip.mockImplementation(async (i: number) => {
    active = i;
  });
  return {
    q,
    setActive: (i: number) => {
      active = i;
    },
  };
}

function activeTrackListener(): (e: unknown) => void {
  const call = tp.addEventListener.mock.calls.find(
    c => c[0] === 'playback-active-track-changed',
  );
  return call![1];
}

describe('the prefetch keeps the queue in order', () => {
  beforeEach(async () => {
    await stopPlayback();
    jest.clearAllMocks();
    setQuranPrefs({ riwayah: 'hafs', reciterId: 'husary' } as never);
  });

  it('swaps three files that arrive together without moving any ayah', async () => {
    const { q, setActive } = fakeQueue();
    await playFromAyah(79, 1);
    const before = q.map(t => t.id);

    // Every file the prefetch asks for arrives at the same moment.
    let release!: () => void;
    const arrived = new Promise<void>(r => {
      release = r;
    });
    (prefetchAyahAudio as jest.Mock).mockImplementation(
      async (_r: string, s: number, a: number) => {
        await arrived;
        return `/audio/${s}-${a}.mp3`;
      },
    );

    // Playback moves to 79:2; the next three are fetched, two of them
    // far enough ahead to swap.
    setActive(1);
    activeTrackListener()({ track: q[1], index: 1 });
    for (let i = 0; i < 5; i++) await tick();
    release();
    for (let i = 0; i < 60; i++) await tick();

    expect(q.map(t => t.id)).toEqual(before);
    expect(q.slice(3, 5).map(t => t.url)).toEqual([
      'file:///audio/79-4.mp3',
      'file:///audio/79-5.mp3',
    ]);
    expect(q.map(t => parseTrackId(String(t.id))!.ayah).slice(0, 6)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('the ayah buttons step by ayah', () => {
  it('steps over both files of a Warsh ayah heard in two', async () => {
    const { q, setActive } = fakeQueue();
    // A queue as `buildTracks` makes it for Warsh 79:36–38: 37 is files
    // 37 and 38.
    q.push(
      { id: '79:36:0', url: 'x', fileAyah: 36 } as Track,
      { id: '79:37:1', url: 'x', fileAyah: 37 } as Track,
      { id: '79:37:2', url: 'x', fileAyah: 38 } as Track,
      { id: '79:38:3', url: 'x', fileAyah: 39 } as Track,
    );
    setActive(1);
    await skipToNextAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(3);

    setActive(2); // the second half of 37
    await skipToPreviousAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(0);
  });

  it('treats a repeat of an ayah as its own step', async () => {
    const { q, setActive } = fakeQueue();
    q.push(
      { id: '79:37:0', url: 'x', fileAyah: 37 } as Track,
      { id: '79:37:1', url: 'x', fileAyah: 38 } as Track,
      { id: '79:37:2', url: 'x', fileAyah: 37 } as Track,
      { id: '79:37:3', url: 'x', fileAyah: 38 } as Track,
    );
    setActive(0);
    await skipToNextAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(2);
  });
});
