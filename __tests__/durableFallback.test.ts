/**
 * What happens when there is no Keychain at all.
 *
 * Not a hypothetical: the Homebrew macOS build cannot claim
 * `keychain-access-groups` — it is a restricted entitlement and a
 * Developer ID build signed outside Xcode embeds no profile to authorise
 * it, and claiming it anyway makes the app unlaunchable rather than
 * degraded. So on that one channel every encrypted read and write fails,
 * permanently, and retrying is not a strategy.
 *
 * These pin what follows: a record still lands somewhere — a plaintext
 * file kept out of every backup, never AsyncStorage, which Android's
 * cloud backup carries — the module says out loud that it had to, and
 * the sync identity and peer list never land in plaintext at all.
 * (Reported privately against 91cabca0.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  durableEncryptedGet,
  durableEncryptedSet,
  encryptedStoreDegraded,
  evictLegacyFallbacks,
  onEncryptedStoreDegraded,
  resetEncryptedStoreDegraded,
  resetEncryptedWitnesses,
} from '../src/storage/durableWrite';
import { SENSITIVE_KEYS, SYNC_SECRET_KEY } from '../src/storage/sensitiveKeys';

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const enc = EncryptedStorage as jest.Mocked<typeof EncryptedStorage>;
const REFUSED = new Error('RNEncryptedStorageError: -34018');

/** The file the fallback writes for a key, in the mocked file system. */
const fileFor = (key: string) =>
  `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/unprotected/${encodeURIComponent(key)}`;
const fileHolds = async (key: string): Promise<string | null> =>
  (await ReactNativeBlobUtil.fs.exists(fileFor(key)))
    ? ReactNativeBlobUtil.fs.readFile(fileFor(key), 'utf8')
    : null;
const LEGACY = (key: string) => `prayerapp.unprotected.${key}`;

beforeEach(async () => {
  jest.clearAllMocks();
  resetEncryptedStoreDegraded();
  resetEncryptedWitnesses();
  await AsyncStorage.clear();
  for (const key of ['prayerapp.journal.v1', SYNC_SECRET_KEY, 'prayerapp.sync.peers.v1']) {
    if (await ReactNativeBlobUtil.fs.exists(fileFor(key))) {
      await ReactNativeBlobUtil.fs.unlink(fileFor(key));
    }
  }
});

describe('with no keychain', () => {
  it('keeps a record in a backup-excluded file rather than losing it, and says it is degraded', async () => {
    enc.setItem.mockRejectedValue(REFUSED);
    enc.getItem.mockRejectedValue(REFUSED);
    const heard = jest.fn();
    onEncryptedStoreDegraded(heard);

    // No throw: the alternative to a worse store is no store.
    await durableEncryptedSet('prayerapp.journal.v1', '[1]');
    expect(encryptedStoreDegraded()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(await fileHolds('prayerapp.journal.v1')).toBe('[1]');
    // And NOT in AsyncStorage, which the backup rules carry.
    expect(await AsyncStorage.getItem(LEGACY('prayerapp.journal.v1'))).toBeNull();
  });

  it('reads back what it wrote, so a record survives a restart', async () => {
    enc.setItem.mockRejectedValue(REFUSED);
    enc.getItem.mockRejectedValue(REFUSED);

    await durableEncryptedSet('prayerapp.journal.v1', '[1]');
    expect(await durableEncryptedGet('prayerapp.journal.v1')).toBe('[1]');
  });

  it('refuses to keep the sync secret key in plaintext', async () => {
    enc.setItem.mockRejectedValue(REFUSED);
    enc.getItem.mockRejectedValue(REFUSED);

    await expect(
      durableEncryptedSet(SYNC_SECRET_KEY, 'aGVsbG8=', { sensitive: true }),
    ).rejects.toThrow();
    expect(encryptedStoreDegraded()).toBe(true);
    expect(await fileHolds(SYNC_SECRET_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY(SYNC_SECRET_KEY))).toBeNull();
    // Nothing to read back, either: no identity rather than a plaintext one.
    await expect(
      durableEncryptedGet(SYNC_SECRET_KEY, { sensitive: true }),
    ).resolves.toBeNull();
  });

  it('reports a key nobody has ever written as absent, not as an error', async () => {
    // Throwing here is what left sync unable to start: getDeviceIdentity
    // rejected on first launch and there was no first launch to get past.
    enc.getItem.mockRejectedValue(REFUSED);
    await expect(durableEncryptedGet('prayerapp.sync.peers.v1')).resolves.toBeNull();
  });
});

describe('with a working keychain', () => {
  it('writes nothing in plaintext and stays undegraded', async () => {
    enc.setItem.mockResolvedValue(undefined);
    enc.getItem.mockResolvedValue('kept');

    await durableEncryptedSet('prayerapp.journal.v1', 'kept');
    expect(encryptedStoreDegraded()).toBe(false);
    expect(await fileHolds('prayerapp.journal.v1')).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY('prayerapp.journal.v1'))).toBeNull();
    expect(await durableEncryptedGet('prayerapp.journal.v1')).toBe('kept');
  });

  it('picks up what the fallback holds when the store comes back empty', async () => {
    // A device that spent a release without a Keychain has its whole
    // history in the plaintext copy. Answering "nothing here" would read
    // as a first launch and start the user over.
    await ReactNativeBlobUtil.fs.writeFile(fileFor('prayerapp.journal.v1'), 'older', 'utf8');
    enc.getItem.mockResolvedValue(null);

    expect(await durableEncryptedGet('prayerapp.journal.v1')).toBe('older');
  });

  it('moves a copy an older build left in AsyncStorage out of it on the way past', async () => {
    await AsyncStorage.setItem(LEGACY('prayerapp.journal.v1'), 'older');
    enc.getItem.mockResolvedValue(null);

    expect(await durableEncryptedGet('prayerapp.journal.v1')).toBe('older');
    expect(await AsyncStorage.getItem(LEGACY('prayerapp.journal.v1'))).toBeNull();
    expect(await fileHolds('prayerapp.journal.v1')).toBe('older');
  });

  it('drains the plaintext copies once a real write lands', async () => {
    await AsyncStorage.setItem(LEGACY('prayerapp.journal.v1'), 'older');
    await ReactNativeBlobUtil.fs.writeFile(fileFor('prayerapp.journal.v1'), 'older', 'utf8');
    enc.setItem.mockResolvedValue(undefined);

    await durableEncryptedSet('prayerapp.journal.v1', 'newer');
    expect(await AsyncStorage.getItem(LEGACY('prayerapp.journal.v1'))).toBeNull();
    expect(await fileHolds('prayerapp.journal.v1')).toBeNull();
  });

  it('takes a secret key an older build left in plaintext into the store, and deletes the copy', async () => {
    await AsyncStorage.setItem(LEGACY(SYNC_SECRET_KEY), 'aGVsbG8=');
    enc.getItem.mockResolvedValue(null);
    enc.setItem.mockResolvedValue(undefined);

    expect(await durableEncryptedGet(SYNC_SECRET_KEY, { sensitive: true })).toBe('aGVsbG8=');
    expect(enc.setItem).toHaveBeenCalledWith(SYNC_SECRET_KEY, 'aGVsbG8=');
    expect(await AsyncStorage.getItem(LEGACY(SYNC_SECRET_KEY))).toBeNull();
    expect(await fileHolds(SYNC_SECRET_KEY)).toBeNull();
  });

  it('sweeps every legacy copy at launch, the sensitive ones into the store', async () => {
    await AsyncStorage.setItem(LEGACY('prayerapp.journal.v1'), '[1]');
    await AsyncStorage.setItem(LEGACY(SYNC_SECRET_KEY), 'aGVsbG8=');
    enc.getItem.mockResolvedValue(null);
    enc.setItem.mockResolvedValue(undefined);

    await evictLegacyFallbacks(SENSITIVE_KEYS);
    expect(await AsyncStorage.getItem(LEGACY('prayerapp.journal.v1'))).toBeNull();
    expect(await fileHolds('prayerapp.journal.v1')).toBe('[1]');
    expect(await AsyncStorage.getItem(LEGACY(SYNC_SECRET_KEY))).toBeNull();
    expect(await fileHolds(SYNC_SECRET_KEY)).toBeNull();
    expect(enc.setItem).toHaveBeenCalledWith(SYNC_SECRET_KEY, 'aGVsbG8=');
  });

  it('still retries a flaky write before giving up on the store', async () => {
    enc.setItem
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce(undefined);

    await durableEncryptedSet('prayerapp.journal.v1', 'kept');
    expect(enc.setItem).toHaveBeenCalledTimes(2);
    expect(encryptedStoreDegraded()).toBe(false);
  });
});
