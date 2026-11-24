/**
 * The plain storage's move from AsyncStorage to MMKV (src/storage/
 * appStorage.ts). Under Jest there is no MMKV and the app's storage is
 * AsyncStorage, as it always was — which is what every other suite runs
 * on. Here a stand-in MMKV is put in, and the move itself is held to its
 * promises: everything arrives, nothing half-moved is ever read, the
 * bulky datasets stay behind, and AsyncStorage is left as it was.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import appStorage, { MOVED_MARKER, _setAppStorageBackendForTests, isBulkKey } from '../src/storage/appStorage';

class FakeMMKV {
  data = new Map<string, string>();
  failAfter = Infinity;
  private sets = 0;
  getString(key: string) {
    return this.data.get(key);
  }
  set(key: string, value: string) {
    if (++this.sets > this.failAfter) throw new Error('disk full');
    this.data.set(key, value);
  }
  delete(key: string) {
    this.data.delete(key);
  }
  contains(key: string) {
    return this.data.has(key);
  }
  getAllKeys() {
    return [...this.data.keys()];
  }
}

const seed = async (pairs: Record<string, string>) => {
  for (const [k, v] of Object.entries(pairs)) await AsyncStorage.setItem(k, v);
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});
afterEach(() => _setAppStorageBackendForTests(undefined));

describe('without MMKV', () => {
  it('is AsyncStorage, call for call', async () => {
    _setAppStorageBackendForTests(null);
    await appStorage.setItem('a', '1');
    expect(await AsyncStorage.getItem('a')).toBe('1');
    await AsyncStorage.setItem('b', '2');
    expect(await appStorage.getItem('b')).toBe('2');
    expect((await appStorage.getAllKeys()).sort()).toEqual(['a', 'b']);
    await appStorage.multiRemove(['a', 'b']);
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

describe('the move', () => {
  it('brings every key over, marks it last, and leaves AsyncStorage as it was', async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 95; i++) many[`k${i}`] = `v${i}`; // more than two chunks
    await seed({ ...many, 'mihrab.quran.v1': '{"marks":[1,2,3]}', 'prayerapp.settings.v1': '{"lang":"ar"}' });
    const fast = new FakeMMKV();
    _setAppStorageBackendForTests(fast);

    expect(await appStorage.getItem('mihrab.quran.v1')).toBe('{"marks":[1,2,3]}');
    expect(fast.data.get('prayerapp.settings.v1')).toBe('{"lang":"ar"}');
    for (let i = 0; i < 95; i++) expect(fast.data.get(`k${i}`)).toBe(`v${i}`);
    expect(fast.contains(MOVED_MARKER)).toBe(true);
    expect([...fast.data.keys()].pop()).toBe(MOVED_MARKER);
    // The old store is not emptied: a move gone wrong has lost nothing.
    expect(await AsyncStorage.getItem('mihrab.quran.v1')).toBe('{"marks":[1,2,3]}');
    expect((await AsyncStorage.getAllKeys()).length).toBe(97);
  });

  it('afterwards reads and writes MMKV, not AsyncStorage', async () => {
    await seed({ a: 'old' });
    const fast = new FakeMMKV();
    _setAppStorageBackendForTests(fast);
    await appStorage.setItem('a', 'new');
    await appStorage.setItem('b', 'made after');
    expect(await appStorage.getItem('a')).toBe('new');
    expect(await AsyncStorage.getItem('a')).toBe('old');
    expect(await AsyncStorage.getItem('b')).toBeNull();
    await appStorage.removeItem('a');
    expect(await appStorage.getItem('a')).toBeNull();
    expect(await appStorage.multiGet(['a', 'b'])).toEqual([['a', null], ['b', 'made after']]);
    await appStorage.multiSet([['c', '3'], ['d', '4']]);
    expect((await appStorage.getAllKeys()).sort()).toEqual(['b', 'c', 'd']);
  });

  it('is not done twice: a second launch does not ask AsyncStorage for anything', async () => {
    await seed({ a: '1' });
    const fast = new FakeMMKV();
    _setAppStorageBackendForTests(fast);
    await appStorage.getItem('a');
    await appStorage.setItem('a', '2');
    // The next launch: the same file, a fresh process.
    _setAppStorageBackendForTests(fast);
    const all = jest.spyOn(AsyncStorage, 'getAllKeys');
    all.mockClear();
    expect(await appStorage.getItem('a')).toBe('2');
    expect(all).not.toHaveBeenCalled();
  });

  it('cut short, is not believed: this run stays on AsyncStorage and the next copies again', async () => {
    await seed({ a: '1', b: '2', c: '3' });
    const fast = new FakeMMKV();
    fast.failAfter = 2; // two keys in, then the disk is full
    _setAppStorageBackendForTests(fast);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await appStorage.getItem('c')).toBe('3');
    expect(fast.contains(MOVED_MARKER)).toBe(false);
    // The whole run is AsyncStorage's, including what it writes.
    await appStorage.setItem('a', 'changed while on the old store');
    expect(await AsyncStorage.getItem('a')).toBe('changed while on the old store');

    // The next launch, with room again: the stale half-copy is written over.
    fast.failAfter = Infinity;
    _setAppStorageBackendForTests(fast);
    expect(await appStorage.getItem('a')).toBe('changed while on the old store');
    expect(await appStorage.getItem('b')).toBe('2');
    expect(fast.contains(MOVED_MARKER)).toBe(true);
  });

  it('a failing AsyncStorage at the move loses nothing either', async () => {
    await seed({ a: '1' });
    const fast = new FakeMMKV();
    _setAppStorageBackendForTests(fast);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValueOnce(new Error('database is locked'));
    expect(await appStorage.getItem('a')).toBe('1');
    expect(fast.contains(MOVED_MARKER)).toBe(false);
  });

  it('answers callers that arrive during it only once it is whole', async () => {
    await seed({ a: '1', b: '2' });
    const fast = new FakeMMKV();
    _setAppStorageBackendForTests(fast);
    const [a, b, keys] = await Promise.all([appStorage.getItem('a'), appStorage.getItem('b'), appStorage.getAllKeys()]);
    expect([a, b]).toEqual(['1', '2']);
    expect(keys.sort()).toEqual(['a', 'b']);
  });
});

describe('the bulky prayer-time data', () => {
  const bulk = ['namazvakti.tile.v1.10_20', 'namazvakti.city.v1.9541', 'muis.dataset.v1.city.SG', 'jakim.live.v1.WLY01'];

  it('is recognised by its keys', () => {
    for (const k of bulk) expect([k, isBulkKey(k)]).toEqual([k, true]);
    for (const k of ['mihrab.quran.v1', 'prayerapp.settings.v1', 'prayer_times_cache.v2', 'methods.certification.v1']) {
      expect([k, isBulkKey(k)]).toEqual([k, false]);
    }
  });

  it('is not moved, and is still read and written where it lies', async () => {
    await seed({ [bulk[0]]: 'tile', [bulk[2]]: 'table', small: 's' });
    const fast = new FakeMMKV();
    _setAppStorageBackendForTests(fast);
    expect(await appStorage.getItem(bulk[0])).toBe('tile');
    expect(fast.contains(bulk[0])).toBe(false);
    expect(fast.contains(bulk[2])).toBe(false);
    await appStorage.setItem(bulk[1], 'city');
    expect(await AsyncStorage.getItem(bulk[1])).toBe('city');
    expect((await appStorage.getAllKeys()).sort()).toEqual([bulk[2], bulk[1], bulk[0], 'small'].sort());
    await appStorage.multiRemove([bulk[0], 'small']);
    expect(await AsyncStorage.getItem(bulk[0])).toBeNull();
    expect(await appStorage.getItem('small')).toBeNull();
  });
});

describe('who uses it', () => {
  it('everything in src/ but the two dataset providers and this file itself', () => {
    const { execSync } = require('child_process');
    const out = execSync("grep -rl \"from '@react-native-async-storage/async-storage'\" src", {
      cwd: require('path').join(__dirname, '..'),
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .sort();
    expect(out).toEqual(['src/providers/namazvakti.ts', 'src/providers/nationalTable.ts', 'src/storage/appStorage.ts']);
  });
});
