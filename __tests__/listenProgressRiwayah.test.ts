/**
 * A Warsh reader's listening place, saved before #83, resumes on the right ayah.
 *
 * Until #83 the queue was numbered by the recordings, which are all cut by
 * the Ḥafṣ count, so the place a listen saved was a Ḥafṣ number whatever
 * the reader's riwayah. Warsh counts An-Nāziʿāt's 37 and 38 as one ayah:
 * a place saved as 79:40 is Warsh 79:39, and resuming at "79:40" would
 * start an ayah later. The place now keeps its riwayah, and an old one is
 * converted once, when it is read.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LISTEN_PROGRESS_KEY,
  _resetListenProgressForTests,
  getListenProgress,
  listenPlaceIn,
  loadListenProgress,
  recordListened,
} from '../src/quran/audio/listenProgress';
import { setQuranPrefs } from '../src/quran/quranState';

async function stored(): Promise<Record<string, unknown> | null> {
  const raw = await AsyncStorage.getItem(LISTEN_PROGRESS_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Wait out the debounced write. */
async function saved(): Promise<void> {
  jest.advanceTimersByTime(5000);
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('a listening place keeps its riwayah', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    _resetListenProgressForTests();
    await AsyncStorage.clear();
  });
  afterEach(() => {
    _resetListenProgressForTests();
    jest.useRealTimers();
    setQuranPrefs({ riwayah: 'hafs' } as never);
  });

  it('a place saved as Ḥafṣ 79:40 resumes at Warsh 79:39, and is converted once', async () => {
    setQuranPrefs({ riwayah: 'warsh' } as never);
    await AsyncStorage.setItem(
      LISTEN_PROGRESS_KEY,
      JSON.stringify({
        surah: 79,
        ayah: 40,
        reciterId: 'warsh-dosari',
        at: 1,
        pausedAt: null,
      }),
    );
    await loadListenProgress();
    expect(getListenProgress()).toMatchObject({
      surah: 79,
      ayah: 39,
      riwayah: 'warsh',
    });
    // Written back with its riwayah …
    await saved();
    expect(await stored()).toMatchObject({ ayah: 39, riwayah: 'warsh' });
    // … so the next launch does not convert it again.
    _resetListenProgressForTests();
    await loadListenProgress();
    expect(getListenProgress()).toMatchObject({ ayah: 39, riwayah: 'warsh' });
  });

  it('leaves a Ḥafṣ reader’s old place where it was', async () => {
    await AsyncStorage.setItem(
      LISTEN_PROGRESS_KEY,
      JSON.stringify({ surah: 79, ayah: 40, reciterId: 'husary', at: 1 }),
    );
    await loadListenProgress();
    expect(getListenProgress()).toMatchObject({
      surah: 79,
      ayah: 40,
      riwayah: 'hafs',
    });
  });

  it('is before the first difference, the same number in both counts', async () => {
    setQuranPrefs({ riwayah: 'warsh' } as never);
    await AsyncStorage.setItem(
      LISTEN_PROGRESS_KEY,
      JSON.stringify({ surah: 79, ayah: 30, reciterId: 'x', at: 1 }),
    );
    await loadListenProgress();
    expect(getListenProgress()).toMatchObject({ ayah: 30, riwayah: 'warsh' });
  });

  it('records the riwayah a listen is in', () => {
    recordListened(
      { surah: 79, ayah: 39, riwayah: 'warsh' },
      'warsh-dosari',
      5,
    );
    expect(getListenProgress()).toMatchObject({ ayah: 39, riwayah: 'warsh' });
  });

  it('converts between any two counts through the recordings’', () => {
    const warsh = {
      surah: 79,
      ayah: 39,
      reciterId: 'x',
      at: 0,
      pausedAt: null,
      riwayah: 'warsh' as const,
    };
    expect(listenPlaceIn(warsh, 'hafs').ayah).toBe(40);
    expect(listenPlaceIn(warsh, 'qalun').ayah).toBe(39);
    // Warsh 79:37 is Ḥafṣ 37 and 38: it starts at 37.
    expect(listenPlaceIn({ ...warsh, ayah: 37 }, 'hafs').ayah).toBe(37);
    expect(listenPlaceIn(warsh, 'warsh')).toBe(warsh);
  });
});
