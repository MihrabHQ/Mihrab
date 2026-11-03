import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

// An in-memory MMKV, so the fast path runs here (jest.setup.js makes the real
// module refuse to open, which is what every other test wants).
const mockFastStore = new Map<string, string>();
let mockOpenings = 0;
jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    constructor() {
      mockOpenings += 1;
    }
    getString(k: string) {
      return mockFastStore.get(k);
    }
    set(k: string, v: string) {
      mockFastStore.set(k, v);
    }
    delete(k: string) {
      mockFastStore.delete(k);
    }
    contains(k: string) {
      return mockFastStore.has(k);
    }
  },
}));

import {
  LAUNCH_KEYS,
  _resetLaunchReadsForTests,
  launchClear,
  launchRead,
  launchWrite,
  primeLaunchReads,
} from '../src/boot/launchReads';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

beforeEach(async () => {
  _resetLaunchReadsForTests();
  mockFastStore.clear();
  mockOpenings = 0;
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('launchReads', () => {
  it('opens the fast store once, and answers from it without touching the database', async () => {
    primeLaunchReads();
    primeLaunchReads();
    mockFastStore.set(LAUNCH_KEYS.settings, 'a');
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    expect(await launchRead(LAUNCH_KEYS.settings)).toBe('a');
    expect(getItem).not.toHaveBeenCalled();
    expect(mockOpenings).toBe(1);
  });

  it('falls back to the database for a key the fast store lacks, and copies it in', async () => {
    await AsyncStorage.setItem(LAUNCH_KEYS.sky, 'b');
    expect(await launchRead(LAUNCH_KEYS.sky)).toBe('b');
    expect(mockFastStore.get(LAUNCH_KEYS.sky)).toBe('b');
    expect(await launchRead(LAUNCH_KEYS.layout)).toBeNull();
    expect(mockFastStore.has(LAUNCH_KEYS.layout)).toBe(false);
  });

  it('writes both stores, and removes from both', async () => {
    await launchWrite(LAUNCH_KEYS.clocks, 'k');
    expect(mockFastStore.get(LAUNCH_KEYS.clocks)).toBe('k');
    expect(await AsyncStorage.getItem(LAUNCH_KEYS.clocks)).toBe('k');
    await launchWrite(LAUNCH_KEYS.clocks, null);
    expect(mockFastStore.has(LAUNCH_KEYS.clocks)).toBe(false);
    expect(await AsyncStorage.getItem(LAUNCH_KEYS.clocks)).toBeNull();
  });

  it('keeps an empty string as a value, not an absence', async () => {
    await launchWrite(LAUNCH_KEYS.layout, '');
    expect(await launchRead(LAUNCH_KEYS.layout)).toBe('');
  });

  it('leaves keys that are not launch keys to the database alone', async () => {
    await launchWrite('other', 'o');
    expect(mockFastStore.has('other')).toBe(false);
    expect(await AsyncStorage.getItem('other')).toBe('o');
    expect(await launchRead('other')).toBe('o');
  });

  it('a reset empties the fast store so a stale record cannot outlive the database', async () => {
    await launchWrite(LAUNCH_KEYS.settings, 'z');
    launchClear();
    await AsyncStorage.removeItem(LAUNCH_KEYS.settings);
    expect(mockFastStore.size).toBe(0);
    expect(await launchRead(LAUNCH_KEYS.settings)).toBeNull();
  });

  it('survives a fast store that cannot be opened', async () => {
    jest.resetModules();
    jest.doMock('react-native-mmkv', () => ({
      MMKV: class {
        constructor() {
          throw new Error('no native module');
        }
      },
    }));
    const asm = require('@react-native-async-storage/async-storage');
    const AS = asm.default ?? asm;
    const m = require('../src/boot/launchReads');
    await AS.setItem(m.LAUNCH_KEYS.settings, 's');
    expect(await m.launchRead(m.LAUNCH_KEYS.settings)).toBe('s');
    await m.launchWrite(m.LAUNCH_KEYS.settings, 't');
    expect(await AS.getItem(m.LAUNCH_KEYS.settings)).toBe('t');
    expect(() => m.launchClear()).not.toThrow();
  });
});

describe('the launch reads go through the fast store', () => {
  it('every launch key is read and written through launchReads, never AsyncStorage directly', () => {
    expect(read('src/context/PrayerSettingsContext.tsx')).toMatch(/primeLaunchReads\(\);\s*primeTimezoneShift\(\);/);
    expect(read('src/settings/storage.ts')).toMatch(/launchRead\(KEY\)/);
    expect(read('src/settings/storage.ts').match(/launchWrite\(KEY,/g)?.length).toBe(2);
    expect(read('src/settings/storage.ts')).toMatch(/launchClear\(\);\s*try \{\s*await AsyncStorage\.multiRemove/);
    expect(read('src/settings/secureStorage.ts')).toMatch(/launchRead\(SECURE_FALLBACK_KEY\)/);
    expect(read('src/settings/secureStorage.ts').match(/launchWrite\(SECURE_FALLBACK_KEY,/g)?.length).toBe(2);
    expect(read('src/theme/skyTheme.ts')).toMatch(/restored = launchRead\(STORAGE_KEY\)/);
    expect(read('src/theme/skyTheme.ts')).toMatch(/launchWrite\(STORAGE_KEY,/);
    expect(read('src/screens/home/todayLayoutMemory.ts')).toMatch(/primed = launchRead\(STORAGE_KEY\)/);
    expect(read('src/screens/home/todayLayoutMemory.ts')).toMatch(/launchWrite\(STORAGE_KEY,/);
    expect(read('src/screens/home/dayWordsMemory.ts')).toMatch(/primed = launchRead\(STORAGE_KEY\)/);
    expect(read('src/screens/home/dayWordsMemory.ts')).toMatch(/launchWrite\(STORAGE_KEY,/);
    expect(read('src/prayer/timezoneShift.ts')).toMatch(/launchRead\(KEY\)/);
    expect(read('src/prayer/timezoneShift.ts')).toMatch(/launchWrite\(KEY,/);
    expect(read('src/sync/snapshotStore.ts')).toMatch(/launchWrite\(SETTINGS_KEY,/);
    for (const f of [
      'src/settings/secureStorage.ts',
      'src/theme/skyTheme.ts',
      'src/screens/home/todayLayoutMemory.ts',
      'src/screens/home/dayWordsMemory.ts',
      'src/prayer/timezoneShift.ts',
    ]) {
      expect(read(f)).not.toMatch(/AsyncStorage\.(set|get|remove)Item/);
    }
  });

  it('the keys the fast store knows are the ones those modules use', () => {
    expect(read('src/settings/storage.ts')).toContain(`'${LAUNCH_KEYS.settings}'`);
    expect(read('src/settings/secureStorage.ts')).toContain(`'${LAUNCH_KEYS.secureFallback}'`);
    expect(read('src/theme/skyTheme.ts')).toContain(`'${LAUNCH_KEYS.sky}'`);
    expect(read('src/screens/home/todayLayoutMemory.ts')).toContain(`'${LAUNCH_KEYS.layout}'`);
    expect(read('src/screens/home/dayWordsMemory.ts')).toContain(`'${LAUNCH_KEYS.words}'`);
    expect(read('src/prayer/timezoneShift.ts')).toContain(`'${LAUNCH_KEYS.clocks}'`);
    expect(read('src/sync/snapshotStore.ts')).toContain(`'${LAUNCH_KEYS.settings}'`);
  });
});
