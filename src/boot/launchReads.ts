/**
 * ── THE LAUNCH'S FIRST READS, FROM A STORE THAT ANSWERS AT ONCE ──────
 *
 * A cold start reads five small records before it can draw: the
 * settings and their plaintext fallback (settings/storage.ts), the kept
 * sky (theme/skyTheme.ts), Today's settled sizes
 * (screens/home/todayLayoutMemory.ts) and the clocks' record
 * (prayer/timezoneShift.ts). They lived in AsyncStorage, which is a
 * SQLite database behind a bridge that answers one request at a time:
 * the first of them came at 45 ms, the last at 105, and the first frame
 * waited for the last — asked for together as one `multiGet` they still
 * took a hundred milliseconds (2.35; a Pixel 10 Pro, measured).
 *
 * So these five keys are kept in MMKV as well — a memory-mapped file read
 * synchronously, in a fraction of a millisecond — and `launchRead`
 * answers from it. AsyncStorage stays what it was for them, the record
 * everything else reads (the sync snapshot, the reset, the tests): every
 * write goes to both (`launchWrite`), MMKV first. A key MMKV does not
 * have yet — the first launch after this build, a phone restored from a
 * backup that carried only the database — is read from AsyncStorage the
 * old way and copied in, so the next launch has it.
 *
 * MMKV is reached lazily and defensively: where it cannot be opened (a
 * test, a broken native module) every call falls through to AsyncStorage
 * and the launch is what it was before.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** The keys read before the first frame. Each module names its own here. */
export const LAUNCH_KEYS = {
  settings: 'prayerapp.settings.v1',
  secureFallback: 'prayerapp.location.fallback.v1',
  sky: '@mihrab/skyTheme/v1',
  layout: '@mihrab/todayLayout/v1',
  clocks: 'mihrab.prayer.utcOffset.v1',
} as const;
const KEYS: ReadonlySet<string> = new Set(Object.values(LAUNCH_KEYS));

type Fast = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  contains(key: string): boolean;
};

let fast: Fast | null | undefined;
function store(): Fast | null {
  if (fast !== undefined) return fast;
  try {
    // Lazy: nothing of the native module loads until the first read.
    const { MMKV } = require('react-native-mmkv') as { MMKV: new (c: { id: string }) => Fast };
    fast = new MMKV({ id: 'mihrab.launch' });
  } catch {
    fast = null;
  }
  return fast;
}

/** The record under `key`: from the fast store, else from AsyncStorage (and copied in). */
export async function launchRead(key: string): Promise<string | null> {
  const f = KEYS.has(key) ? store() : null;
  if (f) {
    try {
      if (f.contains(key)) return f.getString(key) ?? null;
    } catch {
      // Fall through to the database.
    }
  }
  const value = await AsyncStorage.getItem(key);
  if (f && value != null) {
    try {
      f.set(key, value);
    } catch {
      // Then the next launch reads the database again.
    }
  }
  return value;
}

/** Write `value` under `key` to both stores; `null` removes it from both. */
export async function launchWrite(key: string, value: string | null): Promise<void> {
  const f = KEYS.has(key) ? store() : null;
  if (f) {
    try {
      if (value == null) f.delete(key);
      else f.set(key, value);
    } catch {
      // The database still has it.
    }
  }
  if (value == null) await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, value);
}

/** Every launch key, gone from the fast store (a reset); the database is the caller's. */
export function launchClear(): void {
  const f = store();
  if (!f) return;
  for (const k of KEYS) {
    try {
      f.delete(k);
    } catch {
      // Left for the next read to find stale and overwrite.
    }
  }
}

/** Open the fast store now, off the first read's path. */
export function primeLaunchReads(): void {
  store();
}

/** Tests. */
export function _resetLaunchReadsForTests(): void {
  const f = store();
  if (f) for (const k of KEYS) f.delete(k);
  fast = undefined;
}
