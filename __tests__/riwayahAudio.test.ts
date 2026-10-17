/**
 * A Warsh reader hears the ayah that is lit — issue #83.
 *
 * Every recording is cut and numbered by the Ḥafṣ count, Warsh's
 * included. Warsh counts An-Nāziʿāt's 37 and 38 as one ayah, so from
 * there on "Warsh ayah n" was played from "file n" — the end of the ayah
 * before the one on the page, all the way to the end of the surah.
 */
import TrackPlayer from 'react-native-track-player';
import { filesOf, hafsSpan } from '../src/quran/riwayahAudio';
import { ayahCount } from '../src/quran/ayahIndex';
import {
  _resetRiwayahDataCacheForTests,
  _setRiwayahDataForTests,
} from '../src/quran/riwayahData';
import {
  playFromAyah,
  playRange,
  stopPlayback,
} from '../src/quran/audio/playback';
import { setQuranPrefs } from '../src/quran/quranState';

jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => null),
  prefetchAyahAudio: jest.fn(async () => null),
}));
jest.mock('../src/native/NowPlayingState', () => ({
  setNowPlayingState: jest.fn(),
}));

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;

/** Warsh's ayahs per surah, read off the map itself. */
function warshCounts(): number[] {
  const out: number[] = [];
  for (let s = 1; s <= 114; s++) {
    let a = 0;
    while (hafsSpan('warsh', s, a + 1)[1] <= ayahCount(s) && a < 400) a++;
    // The last ayah is the one whose span reaches the surah's last file.
    while (a > 0 && hafsSpan('warsh', s, a)[1] > ayahCount(s)) a--;
    out.push(a);
  }
  return out;
}

describe('which files an ayah is heard in', () => {
  it('is the same number in Ḥafṣ and in Shuʿbah', () => {
    expect(filesOf('hafs', 79, 38, true)).toEqual([38]);
    expect(filesOf('shubah', 5, 121, true)).toEqual([121]);
  });

  it('follows the Madani count in An-Nāziʿāt (#83)', () => {
    expect(filesOf('warsh', 79, 17, true)).toEqual([17]);
    expect(filesOf('warsh', 79, 37, true)).toEqual([37, 38]);
    expect(filesOf('warsh', 79, 38, true)).toEqual([39]);
    expect(filesOf('warsh', 79, 45, true)).toEqual([46]);
    expect(filesOf('qalun', 79, 38, true)).toEqual([39]);
  });

  it('plays a split ayah’s shared file once, or from it when started there', () => {
    // Al-Fātiḥah: Warsh 6 and 7 are both in Ḥafṣ 7.
    expect(filesOf('warsh', 1, 6, true)).toEqual([7]);
    expect(filesOf('warsh', 1, 7, true)).toEqual([]);
    expect(filesOf('warsh', 1, 7, false)).toEqual([7]);
    // Hūd 82 shares 82 with 81 and adds 83.
    expect(filesOf('warsh', 11, 82, true)).toEqual([83]);
    expect(filesOf('warsh', 11, 82, false)).toEqual([82, 83]);
  });

  it('hears every Ḥafṣ file of every surah exactly once, in order', () => {
    const counts = warshCounts();
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6214);
    expect(counts[4]).toBe(122); // al-Māʾidah
    expect(counts[78]).toBe(45); // an-Nāziʿāt
    counts.forEach((n, i) => {
      const s = i + 1;
      const heard: number[] = [];
      for (let a = 1; a <= n; a++) heard.push(...filesOf('warsh', s, a, a > 1));
      expect(heard).toEqual(
        Array.from({ length: ayahCount(s) }, (_, k) => k + 1),
      );
    });
  });
});

describe('the queue a Warsh reader starts', () => {
  const counts = warshCounts();
  beforeAll(() => {
    _setRiwayahDataForTests('warsh', {
      pages: [{ page: 1, start: { surah: 1, ayah: 1 } }],
      surahs: [],
      ayahCounts: counts,
      text: { '1:1': 'x' },
    } as never);
    setQuranPrefs({ riwayah: 'warsh', reciterId: 'warsh-dosari' } as never);
  });
  afterAll(() => {
    setQuranPrefs({ riwayah: 'hafs' } as never);
    _resetRiwayahDataCacheForTests();
  });
  beforeEach(async () => {
    await stopPlayback();
    jest.clearAllMocks();
  });

  const queued = () =>
    tp.add.mock.calls[tp.add.mock.calls.length - 1][0] as Array<{
      id: string;
      url: string;
      title: string;
    }>;

  it('lights the Warsh ayah and plays the file it is recited in', async () => {
    await playFromAyah(79, 36);
    const q = queued();
    const pairs = q.map(t => [
      t.id.split(':').slice(0, 2).join(':'),
      t.url.slice(-10),
    ]);
    expect(pairs).toEqual([
      ['79:36', '079036.mp3'],
      ['79:37', '079037.mp3'],
      ['79:37', '079038.mp3'],
      ['79:38', '079039.mp3'],
      ['79:39', '079040.mp3'],
      ['79:40', '079041.mp3'],
      ['79:41', '079042.mp3'],
      ['79:42', '079043.mp3'],
      ['79:43', '079044.mp3'],
      ['79:44', '079045.mp3'],
      ['79:45', '079046.mp3'],
    ]);
    // Ids stay unique though one ayah is two tracks.
    expect(new Set(q.map(t => t.id)).size).toBe(q.length);
    expect(q[0].title).toMatch(/36 \/ 45$/);
  });

  it('reaches al-Māʾidah 122, which Ḥafṣ does not have', async () => {
    await playRange(
      { surah: 5, ayah: 120 },
      { surah: 5, ayah: 122 },
      { useRepeats: false },
    );
    expect(queued().map(t => t.url.slice(-10))).toEqual([
      '005118.mp3',
      '005119.mp3',
      '005120.mp3',
    ]);
  });
});
