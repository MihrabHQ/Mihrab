/**
 * The recitation runs on from ayah to ayah, with a breath, not a stop.
 *
 * EveryAyah's files for some reciters carry silence at both ends — about a
 * second at every join for Husary, the default — so a continuous listen
 * stopped between every ayah. The measured silence is skipped at each end
 * (recitationEdges.ts), and the player keeps the join (natively on
 * Android, seams.ts elsewhere).
 */
import TrackPlayer, { State, type Track } from 'react-native-track-player';
import {
  LEAD_KEEP,
  TAIL_KEEP,
  _resetRecitationEdgesForTests,
  hasEdges,
  trimFor,
} from '../src/quran/audio/recitationEdges';
import * as seams from '../src/quran/audio/seams';
import { playRange, stopPlayback } from '../src/quran/audio/playback';
import { setQuranPrefs } from '../src/quran/quranState';

jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => null),
  prefetchAyahAudio: jest.fn(async () => null),
}));
jest.mock('../src/native/NowPlayingState', () => ({
  setNowPlayingState: jest.fn(),
}));

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('the measured silence', () => {
  beforeEach(() => _resetRecitationEdgesForTests());

  it('is known for Husary and trimmed to a breath at each end', () => {
    expect(hasEdges('Husary_64kbps')).toBe(true);
    // Measured on the file: 79:20 has 0.58 s before its first sound (a
    // click at 0.12 s is not a sound) and 0.82 s after its last.
    const t = trimFor('Husary_64kbps', 79, 20);
    expect(t.trimStart).toBeCloseTo(0.58 - LEAD_KEEP, 2);
    expect(t.trimEnd).toBeCloseTo(0.82 - TAIL_KEEP, 2);
    // 79:19 starts on its first word: nothing to cut there.
    expect(trimFor('Husary_64kbps', 79, 19).trimStart).toBeUndefined();
  });

  it('never trims less than is worth a seek, nor guesses for a reciter it has not measured', () => {
    expect(trimFor('Alafasy_128kbps', 1, 1)).toEqual({});
    expect(hasEdges('Husary_Muallim_128kbps')).toBe(false);
  });

  it('leaves at least the breath at every end of every Husary file', () => {
    const counts = { lead: 0, tail: 0 };
    for (let s = 1; s <= 114; s++) {
      for (let a = 1; a <= 3; a++) {
        const t = trimFor('Husary_64kbps', s, a);
        if (t.trimStart != null) counts.lead++;
        if (t.trimEnd != null) {
          counts.tail++;
          expect(t.trimEnd).toBeGreaterThan(0);
        }
      }
    }
    // Most joins have something to trim; the numbers are the data's.
    expect(counts.lead + counts.tail).toBeGreaterThan(50);
    expect(TAIL_KEEP).toBeGreaterThan(LEAD_KEEP);
  });
});

describe('the queue carries the joins', () => {
  beforeEach(async () => {
    await stopPlayback();
    jest.clearAllMocks();
    setQuranPrefs({
      riwayah: 'hafs',
      reciterId: 'husary',
      repeat: { eachAyah: 1, range: 1, pauseFactor: 1 },
    } as never);
  });
  const queued = () =>
    tp.add.mock.calls[tp.add.mock.calls.length - 1][0] as Array<
      Record<string, unknown>
    >;

  it('trims Husary', async () => {
    await playRange({ surah: 79, ayah: 19 }, { surah: 79, ayah: 21 });
    const q = queued();
    expect(q[1].trimStart).toBeCloseTo(0.48, 2);
    expect(q[1].trimEnd).toBeCloseTo(0.57, 2);
  });

  it('never pauses the player: no track asks for a rest, drill or not', async () => {
    // A rest is a paused player waiting on a timer, and a paused app is
    // one iOS suspends and Android stops waking: the drill would stop
    // after its first ayah with the screen off.
    setQuranPrefs({
      repeat: { eachAyah: 3, range: 1, pauseFactor: 0.5 },
    } as never);
    await playRange({ surah: 79, ayah: 19 }, { surah: 79, ayah: 20 });
    const q = queued();
    expect(q).toHaveLength(6);
    expect(q.some(t => 'restFactor' in t)).toBe(false);
  });
});

describe('keeping the join (iOS and the Mac)', () => {
  const track = (extra: Record<string, unknown>) =>
    ({ id: '79:20:1', url: 'x', ...extra } as unknown as Track);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    seams._resetSeamsForTests();
  });
  afterEach(() => jest.useRealTimers());

  it('starts a file just before its first sound', async () => {
    tp.getProgress.mockResolvedValue({ position: 0, duration: 7, buffered: 0 });
    tp.getPlaybackState.mockResolvedValue({ state: State.Playing });
    await seams.onTrackChanged({ track: track({ trimStart: 0.44 }) });
    expect(tp.seekTo).toHaveBeenCalledWith(0.44);
  });

  it('moves on just after the last sound, not at the end of the file', async () => {
    tp.getActiveTrack.mockResolvedValue(track({ trimEnd: 0.6 }));
    tp.getPlaybackState.mockResolvedValue({ state: State.Playing });
    tp.getRate.mockResolvedValue(1);
    tp.getActiveTrackIndex.mockResolvedValue(0);
    tp.getTrack.mockResolvedValue(track({}));
    tp.getProgress.mockResolvedValue({ position: 5, duration: 7, buffered: 7 });
    await seams.watchSeam();
    // 1.4 s to go: re-aimed within a second, nothing skipped yet.
    expect(tp.skipToNext).not.toHaveBeenCalled();
    tp.getProgress.mockResolvedValue({
      position: 6.4,
      duration: 7,
      buffered: 7,
    });
    jest.advanceTimersByTime(1000);
    await flush();
    expect(tp.skipToNext).toHaveBeenCalledTimes(1);
  });

  it('lets the last ayah of the queue end as recorded', async () => {
    tp.getActiveTrack.mockResolvedValue(track({ trimEnd: 0.6 }));
    tp.getPlaybackState.mockResolvedValue({ state: State.Playing });
    tp.getActiveTrackIndex.mockResolvedValue(4);
    tp.getTrack.mockResolvedValue(undefined);
    tp.getProgress.mockResolvedValue({
      position: 6.5,
      duration: 7,
      buffered: 7,
    });
    await seams.watchSeam();
    expect(tp.skipToNext).not.toHaveBeenCalled();
  });

  it('does nothing for a reset, which reports no track', async () => {
    tp.getProgress.mockResolvedValue({ position: 0, duration: 7, buffered: 0 });
    await seams.onTrackChanged({ track: null });
    expect(tp.seekTo).not.toHaveBeenCalled();
    expect(tp.pause).not.toHaveBeenCalled();
  });
});
