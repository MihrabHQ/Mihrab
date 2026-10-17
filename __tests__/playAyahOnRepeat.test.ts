/**
 * "Play on repeat" in the ayah sheet: one ayah, round and round, by the
 * player's own repeat mode — not by a timer, and not by the memorisation
 * drill's counted repeats.
 */
import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import {
  getPlaybackStatus,
  playAyahOnRepeat,
  playFromAyah,
  playRange,
  stopPlayback,
} from '../src/quran/audio/playback';
import { setQuranPrefs } from '../src/quran/quranState';

jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => null),
  prefetchAyahAudio: jest.fn(),
}));
jest.mock('../src/native/NowPlayingState', () => ({
  setNowPlayingState: jest.fn(),
}));

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('play on repeat', () => {
  it('queues the one ayah and loops the queue', async () => {
    await playAyahOnRepeat(71, 13);
    const added = tp.add.mock.calls.at(-1)![0] as Array<{ id: string }>;
    expect(added.map(t => t.id)).toEqual(['71:13:0']);
    expect(tp.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.Queue);
    expect(getPlaybackStatus()).toMatchObject({
      active: { surah: 71, ayah: 13 },
      looping: true,
      playing: true,
    });
  });

  it('is undone by anything else played, and by stop', async () => {
    await playAyahOnRepeat(71, 13);
    await playFromAyah(71, 14);
    expect(tp.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.Off);
    expect(getPlaybackStatus().looping).toBe(false);

    await playAyahOnRepeat(71, 13);
    await playRange({ surah: 71, ayah: 1 }, { surah: 71, ayah: 3 });
    expect(tp.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.Off);

    await playAyahOnRepeat(71, 13);
    await stopPlayback();
    expect(tp.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.Off);
    expect(getPlaybackStatus().looping).toBe(false);
  });

  it('plays an ayah once when asked for it once, whatever the drill says', async () => {
    setQuranPrefs({
      repeat: { eachAyah: 3, range: 1, pauseFactor: 0 },
    } as never);
    await playRange(
      { surah: 71, ayah: 13 },
      { surah: 71, ayah: 13 },
      { useRepeats: false },
    );
    const added = tp.add.mock.calls.at(-1)![0] as Array<{ id: string }>;
    expect(added.filter(t => !t.id.startsWith('rest:')).map(t => t.id)).toEqual(
      ['71:13:0'],
    );
    expect(tp.setRepeatMode).toHaveBeenLastCalledWith(RepeatMode.Off);
  });
});
