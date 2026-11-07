/**
 * Where a record goes when the encrypted store will not take it, and why
 * that is no longer AsyncStorage.
 *
 * `durableWrite.ts` and `secureStorage.ts` keep a plaintext copy of a
 * record the Keychain / Keystore refused, because a prayer log that
 * silently evaporates is worse than one stored without encryption. That
 * copy used to sit in AsyncStorage — and on Android the AsyncStorage
 * database (RKStorage) is exactly what the app's backup rules hand to
 * Google's cloud backup and to device-to-device transfer, and on iOS it
 * lives under Application Support, which iCloud backs up. So a degraded
 * Keystore did not only leave a journal unencrypted on the phone; it
 * could carry it, unencrypted, into a backup. (Reported privately against
 * 91cabca0.)
 *
 * Here it is one small file per key in a folder no backup takes:
 *   • Android: the app's files directory, which backup_rules.xml and
 *     data_extraction_rules.xml do not include — only RKStorage and the
 *     shared preferences are.
 *   • iOS / Mac: Library (never the Documents folder the Files app shows),
 *     each file marked excluded from backup.
 *   • Desktop: the app's data folder.
 *
 * Still plaintext, still inside the app's own sandbox. The sync identity
 * and the paired-device list never come here at all — see `sensitive` in
 * `durableWrite.ts`.
 */
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

function folder(): string {
  const dirs = ReactNativeBlobUtil.fs.dirs as { LibraryDir?: string; DocumentDir: string };
  // Library on Apple platforms: Documents is what the Files app shows.
  const base = Platform.OS === 'ios' && dirs.LibraryDir ? dirs.LibraryDir : dirs.DocumentDir;
  return `${base}/unprotected`;
}

function pathFor(key: string): string {
  return `${folder()}/${encodeURIComponent(key)}`;
}

/** The plaintext copy of a key, or null. Never throws. */
export async function unprotectedGet(key: string): Promise<string | null> {
  try {
    const path = pathFor(key);
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return null;
    return await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Keep a plaintext copy. Throws if the file cannot be written. */
export async function unprotectedSet(key: string, value: string): Promise<void> {
  const dir = folder();
  if (!(await ReactNativeBlobUtil.fs.exists(dir))) {
    await ReactNativeBlobUtil.fs.mkdir(dir);
  }
  const path = pathFor(key);
  await ReactNativeBlobUtil.fs.writeFile(path, value, 'utf8');
  if (Platform.OS === 'ios') {
    const ios = (ReactNativeBlobUtil as { ios?: { excludeFromBackupKey?: (p: string) => Promise<void> } }).ios;
    try {
      await ios?.excludeFromBackupKey?.(path);
    } catch {
      /* Library is the right place either way; the flag is belt and braces */
    }
  }
}

/** Drop the plaintext copy, if there is one. Never throws. */
export async function unprotectedRemove(key: string): Promise<void> {
  try {
    const path = pathFor(key);
    if (await ReactNativeBlobUtil.fs.exists(path)) {
      await ReactNativeBlobUtil.fs.unlink(path);
    }
  } catch {
    /* a copy that will not go is stale, not wrong: the real store wins on read */
  }
}
