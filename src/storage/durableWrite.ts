/**
 * Durable EncryptedStorage write helper — task #82 hardening.
 *
 * The user's standing rule: settings, dua bookmarks, journal entries,
 * and fasting logs must never silently disappear. The native module
 * occasionally fails (Keychain locked, OS background-throttle, transient
 * I/O hiccup) — naively `.catch(e => console.warn(e))` swallows the
 * failure and the user's "I prayed Fajr" tap evaporates.
 *
 * This helper:
 *   • Retries up to N times with exponential backoff
 *   • Surfaces a final `error` to the caller so the screen can show
 *     a "couldn't save" banner instead of pretending success
 *   • Stays sync-ergonomic: the caller awaits a Promise that resolves
 *     when the write hits disk or rejects when retries are exhausted
 *
 * Storage keys to protect (and the screens that own them):
 *   • `prayerapp.location.v1`  — secureStorage.ts
 *   • `prayerapp.journal.v1`   — LogScreen.tsx
 *   • `prayerapp.fasting.v1`   — FastingScreen.tsx
 *
 * ── WHEN THERE IS NO KEYCHAIN AT ALL ──────────────────────────────────
 *
 * Retrying assumes the store works and today happens to be a bad day for
 * it. One channel breaks that assumption permanently: the Homebrew macOS
 * build is signed with a Developer ID outside Xcode and so embeds no
 * provisioning profile, and `keychain-access-groups` is a restricted
 * entitlement that macOS honours only with one. Claiming it anyway does
 * not degrade, it makes the app unlaunchable — the whole argument is in
 * ios/PrayerApp/Catalyst.entitlements, which was written after trying.
 *
 * So on that channel every call here failed, three times, forever. The
 * journal, the fasting log and the sync identity had nowhere to go and
 * the entitlements file's own comment claimed they fell back to
 * AsyncStorage. They did not; nothing here did that. Sync was the loudest
 * casualty because it cannot even start without an identity, but the
 * quiet one was worse: a logged prayer that never reached disk.
 *
 * There is a fallback, and it is honestly worse: a plaintext file in
 * the app's own folder (`unprotectedStore.ts`), kept out of every backup.
 * It buys the alternative being nothing at all — a prayer log that
 * silently evaporates — and `encryptedStoreDegraded()` /
 * `onEncryptedStoreDegraded()` exist so a screen says so out loud.
 *
 * ── WHAT NEVER FALLS BACK ─────────────────────────────────────────────
 *
 * `sensitive` keys — the sync identity's secret key, and the lists of
 * paired and removed devices — fail closed. A secret key in plaintext is
 * the key to every file the device's peers write, and a peer list in
 * plaintext is a list someone can add their own device to; losing either
 * costs a re-pairing, which is the cheaper failure by far. So for them a
 * refused write throws, a refused read answers nothing, and any plaintext
 * copy an older build left behind is moved into the encrypted store if it
 * will take it and deleted either way. Sync is then unavailable on that
 * device, and the Sync screen says why. (Reported privately against
 * 91cabca0, along with the fallback's old home in AsyncStorage, which
 * Android's cloud backup carries.)
 *
 * The fallback is drained the moment a real write succeeds, so a device
 * whose Keychain comes back does not keep a plaintext copy around.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import {
  unprotectedGet,
  unprotectedRemove,
  unprotectedSet,
} from './unprotectedStore';

/**
 * Who wants to know that something was written.
 *
 * THE STORE ANNOUNCES; IT DOES NOT DECIDE. Sync wants to hear about writes
 * to the four record stores, and the first version of that had this file
 * import the sync layer — which made every module that saves anything drag
 * in the folder transport, the merge, the widget payload and, through it,
 * i18n and the whole prayer-times stack. A storage helper cannot depend on
 * the feature that happens to be interested in it, so the dependency points
 * the other way: `recordChanged.ts` subscribes on import.
 *
 * A listener that throws is swallowed. Nothing subscribed here is allowed
 * to turn a successful write into a failed one.
 */
type WriteListener = (key: string) => void;
const writeListeners = new Set<WriteListener>();

export function onDurableWrite(listener: WriteListener): () => void {
  writeListeners.add(listener);
  return () => {
    writeListeners.delete(listener);
  };
}

function announceWrite(key: string): void {
  for (const listener of writeListeners) {
    try {
      listener(key);
    } catch {
      /* a listener's problem is not the write's problem */
    }
  }
}

const DEFAULT_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 120;

/**
 * Where older builds put a value the encrypted store would not take: in
 * AsyncStorage, under this prefix. Read once more so nothing is lost,
 * moved out, and deleted — AsyncStorage is what Android's cloud backup
 * carries. New copies go to `unprotectedStore.ts`.
 */
const LEGACY_FALLBACK_PREFIX = 'prayerapp.unprotected.';

const legacyFallbackKey = (key: string) => `${LEGACY_FALLBACK_PREFIX}${key}`;

/**
 * ── THE WITNESS, and why a failed read is not an empty one ────────────
 *
 * Every writer of an encrypted record does the same thing: read the blob,
 * add one entry, write the blob back. When the read FAILS — a Keystore
 * that is wedged for a second, a Keychain still locked, a native module
 * mid-hiccup — `durableEncryptedGet` used to answer `null`, which is also
 * the honest answer on a first launch. The writer could not tell the two
 * apart, treated the journal as empty, and wrote back a journal of one
 * entry. A year of someone's record, replaced by the prayer they had just
 * tapped (issue #38).
 *
 * The two ARE distinguishable, with one plaintext bit: has this key ever
 * been written to the encrypted store on this device? Written here on
 * every successful encrypted write, never removed. A failed read of a key
 * that was witnessed is a read of data that EXISTS and cannot be reached
 * right now; a failed read of a key nobody ever wrote is a first launch.
 * `strict` readers get the difference as a thrown error, and a writer that
 * cannot read must not write. The Homebrew macOS channel, whose Keychain
 * never works, never witnesses anything (its writes land in the fallback
 * and its reads come from there), so nothing changes for it.
 *
 * The witness carries no data — not a length, not a hash — so a storage
 * dump learns only that the app has been used.
 */
const WITNESS_PREFIX = 'prayerapp.witness.';
const witnessKey = (key: string) => `${WITNESS_PREFIX}${key}`;
/** Keys witnessed this session, so the bit is written once, not per save. */
const witnessed = new Set<string>();

const ENCRYPTED_READ_ERROR = 'EncryptedReadError';

/**
 * True for the error a strict `durableEncryptedGet` throws when the store
 * holds a value it cannot hand over. Checked by name, not by class: a
 * subclass of Error does not survive every transpiler's `instanceof`.
 */
export function isEncryptedReadError(e: unknown): boolean {
  return e instanceof Error && e.name === ENCRYPTED_READ_ERROR;
}

function encryptedReadError(key: string, cause: unknown): Error {
  const err = new Error(
    `${key} is stored but could not be read: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
  );
  err.name = ENCRYPTED_READ_ERROR;
  return err;
}

async function markWitnessed(key: string): Promise<void> {
  if (witnessed.has(key)) return;
  try {
    await AsyncStorage.setItem(witnessKey(key), '1');
    witnessed.add(key);
  } catch {
    /* best effort: without the bit a failed read degrades to the old
       behaviour, which is no worse than before it existed */
  }
}

async function wasWitnessed(key: string): Promise<boolean> {
  if (witnessed.has(key)) return true;
  try {
    return (await AsyncStorage.getItem(witnessKey(key))) != null;
  } catch {
    return false;
  }
}

/** Tests only: forget which keys this session has seen written. */
export function resetEncryptedWitnesses(): void {
  witnessed.clear();
}

/** True once anything has had to go to the plaintext fallback. */
let degraded = false;
const degradedListeners = new Set<() => void>();

/**
 * Has the encrypted store refused a value this session?
 *
 * For screens that want to tell the truth about where a record is
 * sitting. False is not a promise that the Keychain works — it is only
 * "nothing has needed the fallback yet".
 */
export function encryptedStoreDegraded(): boolean {
  return degraded;
}

/**
 * Say that the encrypted store has refused something. Exported for
 * `secureStorage.ts`, whose location fallback is the same kind of event.
 */
export function markEncryptedStoreDegraded(): void {
  if (degraded) return;
  degraded = true;
  for (const listener of degradedListeners) {
    try {
      listener();
    } catch {
      /* a screen's problem is not the store's */
    }
  }
}

/** Hear the moment the store first degrades. Returns the unsubscribe. */
export function onEncryptedStoreDegraded(listener: () => void): () => void {
  degradedListeners.add(listener);
  return () => {
    degradedListeners.delete(listener);
  };
}

/** Tests only. */
export function resetEncryptedStoreDegraded(): void {
  degraded = false;
}

/** Sleep helper. */
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Write a value to EncryptedStorage with retry-on-failure. Resolves when
 * the write succeeds; rejects with the last error after all attempts
 * fail. The caller is responsible for surfacing that error to the user.
 */
export async function durableEncryptedSet(
  key: string,
  value: string,
  options: { attempts?: number; sensitive?: boolean } = {},
): Promise<void> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await EncryptedStorage.setItem(key, value);
      await markWitnessed(key);
      // Drain any plaintext copy the moment the real store takes a value,
      // so a Keychain that comes back does not leave one behind.
      await dropPlaintext(key);
      announceWrite(key);
      return;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        // Exponential backoff: 120ms, 240ms, 480ms ...
        await sleep(BASE_BACKOFF_MS * Math.pow(2, i));
      }
    }
  }

  // Every attempt failed. Somewhere worse beats nowhere — except for a
  // key whose plaintext copy would be worse than losing it.
  if (options.sensitive) {
    markEncryptedStoreDegraded();
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Failed to persist ${key} after ${attempts} attempts`);
  }
  try {
    await unprotectedSet(key, value);
    markEncryptedStoreDegraded();
    // The value landed somewhere, so the record HAS changed and the other
    // devices should hear about it. A degraded store is a reason to sync
    // harder, not to go quiet.
    announceWrite(key);
    return;
  } catch {
    /* fall through to the original error — that one is the real story */
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to persist ${key} after ${attempts} attempts`);
}

/**
 * Same retry semantics for reads. Distinguishes "key absent" (returns
 * null on first try) from "I/O failed". Absent keys are not retried —
 * a missing key is a valid "first launch" state.
 *
 * `strict` is for READERS THAT ARE ABOUT TO WRITE. When every attempt
 * fails, there is no plaintext copy, and the key has been written before
 * (see the witness above), a strict read throws instead of answering
 * null — because null would be taken for "nothing here", and the write
 * that follows would replace the record with one entry. A plain read
 * keeps the old contract: it never throws, and a store that will not
 * answer reads as absent.
 */
export async function durableEncryptedGet(
  key: string,
  options: { attempts?: number; strict?: boolean; sensitive?: boolean } = {},
): Promise<string | null> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await EncryptedStorage.getItem(key);
      // A present value wins outright. An absent one still has to ask the
      // fallback: a device whose Keychain has just started working has its
      // history in the plaintext copy and nowhere else, and answering
      // "nothing here" would read as a first launch and start it over.
      if (value !== null && value !== undefined) {
        if (options.sensitive) await dropPlaintext(key);
        return value;
      }
      if (options.sensitive) return await adoptPlaintext(key);
      return await readFallback(key);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, i));
      }
    }
  }

  // The store is not answering. A sensitive key has no plaintext account
  // to fall back on, and any an older build left is deleted, not read.
  if (options.sensitive) {
    await dropPlaintext(key);
    markEncryptedStoreDegraded();
    if (options.strict && lastErr && (await wasWitnessed(key))) {
      throw encryptedReadError(key, lastErr);
    }
    return null;
  }

  // If a plaintext copy exists it is the best account of this key that
  // anyone has.
  const stored = await readFallback(key);
  if (stored !== null) {
    markEncryptedStoreDegraded();
    return stored;
  }

  // Nothing anywhere. For a strict reader that is the end of the road IF
  // the key has been written before: the value exists and cannot be read,
  // and the caller must not overwrite what it could not see.
  if (options.strict && lastErr && (await wasWitnessed(key))) {
    markEncryptedStoreDegraded();
    throw encryptedReadError(key, lastErr);
  }

  // Otherwise reported as absent rather than thrown, because every plain
  // caller already treats a failed read as absent and because the platform
  // this happens on has no Keychain to come back to — throwing forever is
  // how sync ended up unable to start at all. The cost is that a Keychain
  // that is merely wedged looks empty; the retries above are what make
  // that unlikely, and `degraded` is what says it happened.
  markEncryptedStoreDegraded();
  if (lastErr) {
    console.warn(`durableEncryptedGet(${key}) fell through to absent:`, lastErr);
  }
  return null;
}

/**
 * The plaintext copy of a key, or null. Never throws.
 *
 * A copy an older build left in AsyncStorage is moved to the
 * backup-excluded store on the way past, and deleted from AsyncStorage.
 */
async function readFallback(key: string): Promise<string | null> {
  const current = await unprotectedGet(key);
  if (current !== null) return current;
  let legacy: string | null = null;
  try {
    legacy = await AsyncStorage.getItem(legacyFallbackKey(key));
  } catch {
    return null;
  }
  if (legacy === null) return null;
  try {
    await unprotectedSet(key, legacy);
    await AsyncStorage.removeItem(legacyFallbackKey(key));
  } catch {
    /* left where it was: better in a backup than gone */
  }
  return legacy;
}

/** Delete every plaintext copy of a key, old home and new. Never throws. */
async function dropPlaintext(key: string): Promise<void> {
  await unprotectedRemove(key);
  try {
    await AsyncStorage.removeItem(legacyFallbackKey(key));
  } catch {
    /* stale; the encrypted value wins on read */
  }
}

/**
 * A sensitive key the encrypted store has nothing for, but an older build
 * may have left in plaintext: moved into the encrypted store if it will
 * take it, deleted either way. Answers the value only once it is
 * encrypted.
 */
async function adoptPlaintext(key: string): Promise<string | null> {
  let plain = await unprotectedGet(key);
  if (plain === null) {
    try {
      plain = await AsyncStorage.getItem(legacyFallbackKey(key));
    } catch {
      plain = null;
    }
  }
  if (plain === null) return null;
  let moved = false;
  try {
    await EncryptedStorage.setItem(key, plain);
    await markWitnessed(key);
    moved = true;
  } catch {
    markEncryptedStoreDegraded();
  }
  await dropPlaintext(key);
  return moved ? plain : null;
}

/**
 * Move every plaintext copy older builds left in AsyncStorage out of it,
 * once, at launch: AsyncStorage is what Android's backups carry, and a
 * record nobody happens to read this session would otherwise ride along
 * in the next one. `sensitive` names the keys that are not moved but
 * adopted into the encrypted store or deleted. Never throws.
 */
export async function evictLegacyFallbacks(sensitive: ReadonlySet<string>): Promise<void> {
  let keys: readonly string[] = [];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return;
  }
  for (const stored of keys) {
    if (!stored.startsWith(LEGACY_FALLBACK_PREFIX)) continue;
    const key = stored.slice(LEGACY_FALLBACK_PREFIX.length);
    try {
      if (sensitive.has(key)) {
        let present: string | null = null;
        try {
          present = await EncryptedStorage.getItem(key);
        } catch {
          present = null;
        }
        if (present) await dropPlaintext(key);
        else await adoptPlaintext(key);
      } else {
        await readFallback(key);
      }
    } catch {
      /* next launch tries again */
    }
  }
}
