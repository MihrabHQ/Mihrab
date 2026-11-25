/**
 * ── THE APP'S PLAIN STORAGE ──────────────────────────────────────────
 *
 * Everything the app keeps that is not secret — settings, the Qur'an
 * marks and khatmah, the tasbih, the prayer-times cache, what was offered
 * and when — goes through here. The API is AsyncStorage's, so a caller
 * changes its import and nothing else.
 *
 * WHERE IT IS KEPT. On Android, iPhone, iPad and Mac: MMKV, a
 * memory-mapped file read without a bridge or a database (store
 * `mihrab.app`). It was AsyncStorage — SQLite on Android, a manifest and
 * files on iOS, behind a queue that answers one request at a time.
 * Elsewhere (the browser, Windows and Linux, and under Jest, where MMKV
 * does not exist) it still is, unchanged.
 *
 * THE MOVE, ONCE. The first time this build runs, everything AsyncStorage
 * holds is copied into MMKV and a marker is written last. Until the marker
 * is there MMKV is not believed: a copy cut short (the app killed, the
 * disk full) leaves no marker, this run goes on using AsyncStorage as
 * before, and the next launch copies everything again, over whatever the
 * cut-short copy left. So there is no moment at which a half-moved store
 * is read. AsyncStorage is NOT emptied afterwards: it stays as it was at
 * the move, which costs some disk and means a move that somehow went
 * wrong has lost nothing.
 *
 * WHAT STAYS BEHIND. The prayer-time datasets (namazvakti's tiles and
 * cities, the national tables and their live days) are megabytes that can
 * be downloaded again and are read a city at a time; a memory-mapped
 * store is the wrong place for them. Keys of theirs (`isBulkKey`) are
 * always AsyncStorage's, whoever asks.
 *
 * The launch's first reads have their own small store on top of this one
 * (boot/launchReads.ts); it is unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

type Fast = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
};

/** Written last by the move; MMKV is the store only once it is there. */
export const MOVED_MARKER = '@mihrab/appStorage/movedFromAsyncStorage.v1';
const STORE_ID = 'mihrab.app';
/** Keys copied per request: large enough to be quick, small enough for the bridge. */
const CHUNK = 40;

/** Bulky, re-downloadable prayer-time data: kept in AsyncStorage. See the note above. */
export function isBulkKey(key: string): boolean {
  return (
    key.startsWith('namazvakti.') ||
    key.includes('.dataset.v1.city.') ||
    key.includes('.live.v1.')
  );
}

let opened: Fast | null | undefined;
function open(): Fast | null {
  if (opened !== undefined) return opened;
  try {
    // Asked for here and not imported at the top: this module is also read
    // outside the app — the feed for earlier versions is built by Node from
    // the providers (tools/compat-feed), which reach it through the clock's
    // record — and React Native's own entry file is not something Node can
    // read. There, as under Jest, this throws and the store is AsyncStorage.
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS === 'web') return (opened = null);
    const { MMKV } = require('react-native-mmkv') as { MMKV: new (c: { id: string }) => Fast };
    opened = new MMKV({ id: STORE_ID });
  } catch {
    opened = null;
  }
  return opened;
}

/** Copy everything AsyncStorage holds (bar the bulk) into `fast`, then mark it. */
async function move(fast: Fast): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(k => !isBulkKey(k));
  for (let i = 0; i < keys.length; i += CHUNK) {
    const pairs = await AsyncStorage.multiGet(keys.slice(i, i + CHUNK));
    for (const [key, value] of pairs) {
      // Over whatever a cut-short copy left: until the marker is written,
      // AsyncStorage is the truth and may have changed since.
      if (value != null) fast.set(key, value);
      else fast.delete(key);
    }
  }
  fast.set(MOVED_MARKER, String(Date.now()));
  if (!fast.contains(MOVED_MARKER)) throw new Error('the marker did not hold');
}

/** This run's store once known: MMKV, or null for AsyncStorage. */
let chosen: Fast | null | undefined;
let deciding: Promise<Fast | null> | null = null;
/** The store for this run: MMKV once moved, else null (AsyncStorage). Decided once. */
function backend(): Promise<Fast | null> {
  if (deciding) return deciding;
  deciding = (async () => {
    const fast = open();
    if (!fast) return (chosen = null);
    try {
      if (!fast.contains(MOVED_MARKER)) await move(fast);
      return (chosen = fast);
    } catch (e) {
      // This run stays on AsyncStorage, whole; the next launch tries again.
      console.warn('appStorage: the move to MMKV did not finish; using AsyncStorage this run', e);
      return (chosen = null);
    }
  })();
  return deciding;
}

/**
 * Run `cold` against AsyncStorage or `hot` against MMKV. Where there is no
 * MMKV at all the call goes straight through, in the same tick, exactly as
 * if the caller had imported AsyncStorage.
 */
function via<T>(cold: () => Promise<T>, hot: (fast: Fast) => T | Promise<T>): Promise<T> {
  if (open() === null || chosen === null) return cold();
  if (chosen) return Promise.resolve(hot(chosen));
  return backend().then(fast => (fast ? hot(fast) : cold()));
}

function getItem(key: string): Promise<string | null> {
  if (isBulkKey(key)) return AsyncStorage.getItem(key);
  return via(
    () => AsyncStorage.getItem(key),
    fast => fast.getString(key) ?? null,
  );
}

function setItem(key: string, value: string): Promise<void> {
  if (isBulkKey(key)) return AsyncStorage.setItem(key, value);
  return via(
    () => AsyncStorage.setItem(key, value),
    fast => fast.set(key, value),
  );
}

function removeItem(key: string): Promise<void> {
  if (isBulkKey(key)) return AsyncStorage.removeItem(key);
  return via(
    () => AsyncStorage.removeItem(key),
    fast => fast.delete(key),
  );
}

function multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
  return via(
    async () => (await AsyncStorage.multiGet(keys as string[])) as [string, string | null][],
    async () => {
      const out: [string, string | null][] = [];
      for (const key of keys) out.push([key, await getItem(key)]);
      return out;
    },
  );
}

function multiSet(pairs: readonly (readonly [string, string])[]): Promise<void> {
  return via(
    () => AsyncStorage.multiSet(pairs as [string, string][]),
    async () => {
      for (const [key, value] of pairs) await setItem(key, value);
    },
  );
}

function multiRemove(keys: readonly string[]): Promise<void> {
  return via(
    () => AsyncStorage.multiRemove(keys as string[]),
    async () => {
      for (const key of keys) await removeItem(key);
    },
  );
}

/** Every key in either place (the marker is this file's own and is left out). */
function getAllKeys(): Promise<string[]> {
  return via(
    async () => [...(await AsyncStorage.getAllKeys())],
    async fast => {
      const keys = new Set(fast.getAllKeys());
      keys.delete(MOVED_MARKER);
      for (const k of await AsyncStorage.getAllKeys()) if (isBulkKey(k)) keys.add(k);
      return [...keys];
    },
  );
}

/**
 * AsyncStorage's API, for the calls the app makes. Functions are looked up
 * on this object at call time, so a test may still replace one.
 */
const appStorage = { getItem, setItem, removeItem, multiGet, multiSet, multiRemove, getAllKeys };
export default appStorage;

/** Tests: forget which store was chosen, and inject one (or none). */
export function _setAppStorageBackendForTests(fast: Fast | null | undefined): void {
  opened = fast;
  chosen = undefined;
  deciding = null;
}
