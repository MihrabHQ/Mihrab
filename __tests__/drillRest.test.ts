/**
 * "Pause between repeats" rests — without ever pausing the player.
 *
 * The drill's gap was a paused player and a timer to start it again; a
 * paused app is one iOS suspends and Android stops waking, so it never
 * worked with the screen off, and in the end did nothing at all. The gap is
 * silent tracks in the queue now (rest.ts): the player keeps playing.
 */
import TrackPlayer, { type Track } from 'react-native-track-player';
import {
  getPlaybackStatus,
  listenFrom,
  playFromAyah,
  playRange,
  skipToNextAyah,
  skipToPreviousAyah,
  stopPlayback,
} from '../src/quran/audio/playback';
import { setQuranPrefs } from '../src/quran/quranState';
import {
  MAX_REST_SECONDS,
  isRestTrack,
  restPieces,
  spokenSeconds,
  wordsOf,
} from '../src/quran/audio/rest';
import {
  _resetRecitationEdgesForTests,
  _setRecitationTableForTests,
  spokenSecondsOf,
} from '../src/quran/audio/recitationEdges';
import {
  DEFAULT_SECONDS_PER_WORD,
  findReciter,
} from '../src/quran/audio/reciters';
import { ayahIndexOf } from '../src/quran/ayahIndex';
import {
  _resetListenProgressForTests,
  getListenProgress,
} from '../src/quran/audio/listenProgress';
import { prefetchAyahAudio } from '../src/quran/audio/audioStore';
import { hafsSpan } from '../src/quran/riwayahAudio';
import { ayahCount } from '../src/quran/ayahIndex';
import {
  _resetRiwayahDataCacheForTests,
  _setRiwayahDataForTests,
} from '../src/quran/riwayahData';

jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => null),
  prefetchAyahAudio: jest.fn(async () => null),
}));
jest.mock('../src/native/NowPlayingState', () => ({
  setNowPlayingState: jest.fn(),
}));

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;
const tick = () => new Promise(r => setTimeout(r, 0));

const queued = () =>
  tp.add.mock.calls[tp.add.mock.calls.length - 1][0] as Track[];

/** "a" for an ayah, "r" for a rest: the shape of a queue at a glance. */
const shape = (q: Track[]) => q.map(t => (isRestTrack(t) ? 'r' : 'a')).join('');

/**
 * The player's track-change handler, as registered when it was set up —
 * once, so it is caught before any test clears the mocks' calls.
 */
let onTrackChange: (e: unknown) => void;
beforeAll(async () => {
  await playFromAyah(1, 1);
  const call = tp.addEventListener.mock.calls.find(
    c => c[0] === 'playback-active-track-changed',
  );
  onTrackChange = call![1];
});
afterAll(() => _resetListenProgressForTests());
const activeTrackListener = () => onTrackChange;

/** A table as the edges tool writes it, format 3, for one folder. */
function tableWith(
  entries: Array<{
    surah: number;
    ayah: number;
    lead: number;
    tail: number;
    tenths: number;
  }>,
): { v: number; e: string; d: string } {
  const e = Buffer.alloc(6236 * 2, 0);
  const d = Buffer.alloc(6236 * 2, 0);
  for (const x of entries) {
    const n = ayahIndexOf(x.surah, x.ayah) - 1;
    e[n * 2] = x.lead;
    e[n * 2 + 1] = x.tail;
    d.writeUInt16BE(x.tenths, n * 2);
  }
  return { v: 3, e: e.toString('base64'), d: d.toString('base64') };
}

beforeEach(async () => {
  await stopPlayback();
  jest.clearAllMocks();
  _resetRecitationEdgesForTests();
  setQuranPrefs({
    riwayah: 'hafs',
    reciterId: 'husary',
    repeat: { eachAyah: 1, range: 1, pauseFactor: 0 },
  } as never);
});

describe('how long a rest is', () => {
  it('is made of the silent pieces, longest first, to the nearest half second', () => {
    expect(restPieces(7.3)).toEqual([4000, 2000, 1000, 500]);
    expect(restPieces(1)).toEqual([1000]);
    expect(restPieces(0.3)).toEqual([500]);
    expect(restPieces(0.2)).toEqual([]);
    expect(restPieces(0)).toEqual([]);
    expect(restPieces(NaN)).toEqual([]);
  });

  it('is never longer than thirty seconds', () => {
    expect(MAX_REST_SECONDS).toBe(30);
    const pieces = restPieces(95);
    expect(pieces).toEqual([8000, 8000, 8000, 4000, 2000]);
    expect(pieces.reduce((a, b) => a + b, 0)).toBe(30_000);
  });

  it('is the recited length, measured: the file less its two silences', () => {
    // 79:20 — a 7.4 s file with 0.5 s before the first sound and 0.8 s after.
    _setRecitationTableForTests(
      'Husary_64kbps',
      tableWith([{ surah: 79, ayah: 20, lead: 25, tail: 40, tenths: 74 }]),
    );
    expect(spokenSecondsOf('Husary_64kbps', 79, 20)).toBeCloseTo(6.1, 2);
    // Not measured: no answer, rather than a guess.
    expect(spokenSecondsOf('Husary_64kbps', 79, 21)).toBeUndefined();
  });

  it('reads the tables measured before lengths were added, and trims them as before', () => {
    // The shipped tables are format 2: edges, no lengths.
    expect(spokenSecondsOf('Husary_64kbps', 79, 20)).toBeUndefined();
  });

  it('is estimated from the words and the reciter’s pace when the length was not measured', async () => {
    const husary = findReciter('husary');
    // 79:19, "wa-ahdiyaka ilā rabbika fa-takhshā": four words.
    expect(await spokenSeconds(husary, 79, [19])).toBeCloseTo(
      4 * DEFAULT_SECONDS_PER_WORD,
      5,
    );
    // A mujawwad recitation is slower, and says so.
    const mujawwad = findReciter('husary-mujawwad');
    expect(mujawwad.secondsPerWord).toBeGreaterThan(DEFAULT_SECONDS_PER_WORD);
    expect(await spokenSeconds(mujawwad, 79, [19])).toBeCloseTo(
      4 * mujawwad.secondsPerWord!,
      5,
    );
    // An ayah heard in two files is both of them.
    expect(await spokenSeconds(husary, 79, [37, 38])).toBeCloseTo(
      (await spokenSeconds(husary, 79, [37]))! +
        (await spokenSeconds(husary, 79, [38]))!,
      5,
    );
  });

  it('does not count the basmalah the text puts before a surah’s first ayah', () => {
    const basmalah = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
    expect(wordsOf(`${basmalah} وَٱلنَّٰزِعَٰتِ غَرْقًۭا`, 79, 1)).toBe(2);
    // Al-Fātiḥah's first ayah IS the basmalah.
    expect(wordsOf(basmalah, 1, 1)).toBe(4);
    // A pause mark is not a word.
    expect(
      wordsOf('ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًۭى', 2, 2),
    ).toBe(6);
  });
});

describe('the queue of a drill', () => {
  it('rests after every ayah: ayah, rest, ayah, rest … and ends on the ayah', async () => {
    setQuranPrefs({
      repeat: { eachAyah: 2, range: 1, pauseFactor: 1 },
    } as never);
    await playRange({ surah: 79, ayah: 19 }, { surah: 79, ayah: 20 });
    const q = queued();
    // Each rest is one or more silent pieces; collapse them to read the shape.
    expect(shape(q).replace(/r+/g, 'r')).toBe('ar'.repeat(3) + 'a');
    expect(tp.pause).not.toHaveBeenCalled();
  });

  it('rests for the recited length × the factor', async () => {
    _setRecitationTableForTests(
      'Husary_64kbps',
      tableWith([
        { surah: 79, ayah: 19, lead: 25, tail: 25, tenths: 50 }, // 4 s recited
        { surah: 79, ayah: 20, lead: 25, tail: 25, tenths: 80 }, // 7 s
      ]),
    );
    setQuranPrefs({
      repeat: { eachAyah: 1, range: 2, pauseFactor: 2 },
    } as never);
    await playRange({ surah: 79, ayah: 19 }, { surah: 79, ayah: 20 });
    const q = queued();
    const rests: number[] = [];
    let run = -1;
    for (const t of q) {
      if (isRestTrack(t)) {
        if (run < 0) run = rests.push(0) - 1;
        rests[run] += 1;
      } else run = -1;
    }
    // 19, rest 8 s; 20, rest 14 s; 19, rest 8 s; 20 — the last ayah ends it.
    expect(shape(q).replace(/r+/g, 'r')).toBe('ar'.repeat(3) + 'a');
    expect(rests).toEqual([1, 3, 1]); // 8 | 8+4+2 | 8
  });

  it('gives a rest the ayah’s own title and reciter, no trims, and an id that is not an ayah', async () => {
    setQuranPrefs({
      repeat: { eachAyah: 2, range: 1, pauseFactor: 1 },
    } as never);
    await playRange({ surah: 79, ayah: 20 }, { surah: 79, ayah: 20 });
    const q = queued();
    const rest = q.find(t => isRestTrack(t))!;
    expect(rest.title).toBe(q[0].title);
    expect(rest.artist).toBe(q[0].artist);
    expect(rest.trimStart).toBeUndefined();
    expect(rest.trimEnd).toBeUndefined();
    expect(String(rest.id)).toMatch(/^rest:79:20:\d+$/);
    // Ids stay unique across the whole queue.
    expect(new Set(q.map(t => t.id)).size).toBe(q.length);
  });

  it('never rests in a plain listen, whatever the setting', async () => {
    setQuranPrefs({
      repeat: { eachAyah: 3, range: 2, pauseFactor: 2 },
    } as never);
    await playFromAyah(79, 19);
    expect(queued().some(isRestTrack)).toBe(false);
    await listenFrom(79, 19);
    expect(queued().some(isRestTrack)).toBe(false);
    await playRange(
      { surah: 79, ayah: 19 },
      { surah: 79, ayah: 21 },
      { useRepeats: false },
    );
    expect(queued().some(isRestTrack)).toBe(false);
  });

  it('never rests in a range heard once, nor with the pause set to none', async () => {
    setQuranPrefs({
      repeat: { eachAyah: 1, range: 1, pauseFactor: 2 },
    } as never);
    await playRange({ surah: 79, ayah: 19 }, { surah: 79, ayah: 21 });
    expect(queued().some(isRestTrack)).toBe(false);
    setQuranPrefs({
      repeat: { eachAyah: 3, range: 1, pauseFactor: 0 },
    } as never);
    await playRange({ surah: 79, ayah: 19 }, { surah: 79, ayah: 21 });
    expect(queued().some(isRestTrack)).toBe(false);
  });
});

describe('a Warsh ayah heard in two files', () => {
  /** Warsh's ayahs per surah, read off the map itself. */
  function warshCounts(): number[] {
    const out: number[] = [];
    for (let s = 1; s <= 114; s++) {
      let a = 0;
      while (hafsSpan('warsh', s, a + 1)[1] <= ayahCount(s) && a < 400) a++;
      while (a > 0 && hafsSpan('warsh', s, a)[1] > ayahCount(s)) a--;
      out.push(a);
    }
    return out;
  }
  beforeAll(() => {
    _setRiwayahDataForTests('warsh', {
      pages: [{ page: 1, start: { surah: 1, ayah: 1 } }],
      surahs: [],
      ayahCounts: warshCounts(),
      text: { '1:1': 'x' },
    } as never);
  });
  afterAll(() => {
    _resetRiwayahDataCacheForTests();
  });

  it('rests once, after both', async () => {
    setQuranPrefs({
      riwayah: 'warsh',
      reciterId: 'warsh-dosari',
      repeat: { eachAyah: 2, range: 1, pauseFactor: 1 },
    } as never);
    // Warsh 79:37 is Ḥafṣ 37 and 38.
    await playRange({ surah: 79, ayah: 37 }, { surah: 79, ayah: 37 });
    const q = queued();
    expect(shape(q).replace(/r+/g, 'r')).toBe('aaraa');
    expect(q.filter(t => !isRestTrack(t)).map(t => t.fileAyah)).toEqual([
      37, 38, 37, 38,
    ]);
    setQuranPrefs({ riwayah: 'hafs', reciterId: 'husary' } as never);
  });
});

describe('while a rest plays', () => {
  it('keeps the ayah just heard lit, and comes back from the rest to the next', async () => {
    setQuranPrefs({
      repeat: { eachAyah: 2, range: 1, pauseFactor: 1 },
    } as never);
    await playRange({ surah: 79, ayah: 19 }, { surah: 79, ayah: 20 });
    const q = queued();
    const on = activeTrackListener();
    const firstRest = q.findIndex(isRestTrack);

    on({ track: q[0], index: 0 });
    expect(getPlaybackStatus().active).toEqual({ surah: 79, ayah: 19 });
    expect(getPlaybackStatus().resting).toBe(false);

    on({ track: q[firstRest], index: firstRest });
    expect(getPlaybackStatus().active).toEqual({ surah: 79, ayah: 19 });
    expect(getPlaybackStatus().resting).toBe(true);

    const next = q.findIndex((t, i) => i > firstRest && !isRestTrack(t));
    on({ track: q[next], index: next });
    expect(getPlaybackStatus().resting).toBe(false);
    expect(getPlaybackStatus().active).toEqual({ surah: 79, ayah: 19 });
  });

  it('does not move the listening place', async () => {
    _resetListenProgressForTests();
    await listenFrom(79, 19);
    const placed = getListenProgress();
    activeTrackListener()({
      track: { id: 'rest:79:30:999', url: 1 },
      index: 0,
    });
    expect(getListenProgress()).toEqual(placed);
    expect(getPlaybackStatus().active).toEqual({ surah: 79, ayah: 19 });
  });

  it('does not ask for a rest to be downloaded, and still fetches the next three files', async () => {
    const q: Track[] = [
      { id: '79:19:0', url: 'http://x/079019.mp3', fileAyah: 19 } as Track,
      { id: 'rest:79:19:1', url: 1 as unknown as string } as Track,
      {
        id: 'rest:79:19:2',
        url: 'http://localhost:8081/assets/silence.mp3',
      } as Track,
      { id: '79:19:3', url: 'http://x/079019.mp3', fileAyah: 19 } as Track,
      { id: 'rest:79:19:4', url: 1 as unknown as string } as Track,
      { id: '79:20:5', url: 'http://x/079020.mp3', fileAyah: 20 } as Track,
      { id: 'rest:79:20:6', url: 1 as unknown as string } as Track,
      { id: '79:20:7', url: 'http://x/079020.mp3', fileAyah: 20 } as Track,
      { id: '79:21:8', url: 'http://x/079021.mp3', fileAyah: 21 } as Track,
    ];
    await playFromAyah(79, 19); // sets the player up
    jest.clearAllMocks();
    tp.getQueue.mockImplementation(async () => q);
    tp.getActiveTrackIndex.mockImplementation(async () => 0);
    activeTrackListener()({ track: q[0], index: 0 });
    for (let i = 0; i < 10; i++) await tick();
    const asked = (prefetchAyahAudio as jest.Mock).mock.calls.map(c => c[2]);
    // 19 again, 20, 20 — three files, the rests between them not counted.
    expect(asked).toEqual([19, 20]);
    tp.getQueue.mockReset().mockImplementation(async () => []);
    tp.getActiveTrackIndex.mockReset().mockImplementation(async () => 0);
  });
});

describe('the ayah buttons step over a rest', () => {
  function fakeQueue(q: Track[]) {
    let active = 0;
    tp.getQueue.mockImplementation(async () => [...q]);
    tp.getActiveTrackIndex.mockImplementation(async () => active);
    tp.skip.mockImplementation(async (i: number) => {
      active = i;
    });
    return (i: number) => {
      active = i;
    };
  }
  const drill: Track[] = [
    { id: '79:19:0', url: 'x', fileAyah: 19 } as Track,
    { id: 'rest:79:19:1', url: 'r' } as Track,
    { id: 'rest:79:19:2', url: 'r' } as Track,
    { id: '79:19:3', url: 'x', fileAyah: 19 } as Track,
    { id: 'rest:79:19:4', url: 'r' } as Track,
    { id: '79:20:5', url: 'x', fileAyah: 20 } as Track,
  ];
  afterEach(() => {
    tp.getQueue.mockReset().mockImplementation(async () => []);
    tp.getActiveTrackIndex.mockReset().mockImplementation(async () => 0);
    tp.skip.mockReset().mockImplementation(async () => {});
  });

  it('goes from an ayah to the next ayah, not to the silence after it', async () => {
    const setActive = fakeQueue(drill);
    setActive(0);
    await skipToNextAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(3);
    // From inside a rest, too.
    setActive(4);
    await skipToNextAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(5);
  });

  it('goes back to the ayah before, a rest counting as the ayah it follows', async () => {
    const setActive = fakeQueue(drill);
    setActive(5);
    await skipToPreviousAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(3);
    setActive(4); // resting after the second 19
    await skipToPreviousAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(0);
    tp.skip.mockClear();
    setActive(2); // resting after the first: nothing before it
    await skipToPreviousAyah();
    expect(tp.skip).not.toHaveBeenCalled();
  });

  it('still steps over both files of an ayah heard in two, with a rest after', async () => {
    const setActive = fakeQueue([
      { id: '79:37:0', url: 'x', fileAyah: 37 } as Track,
      { id: '79:37:1', url: 'x', fileAyah: 38 } as Track,
      { id: 'rest:79:37:2', url: 'r' } as Track,
      { id: '79:37:3', url: 'x', fileAyah: 37 } as Track,
      { id: '79:37:4', url: 'x', fileAyah: 38 } as Track,
    ]);
    setActive(0);
    await skipToNextAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(3);
    setActive(4);
    await skipToPreviousAyah();
    expect(tp.skip).toHaveBeenLastCalledWith(0);
  });
});
