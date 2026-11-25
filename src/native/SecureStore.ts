/**
 * The device's encrypted store: the Keychain on iPhone, iPad and Mac, the
 * Android Keystore's encrypted preferences on Android, the OS keyring on
 * Windows and Linux. It holds what must not sit in plain storage — the
 * saved place, the prayer journal, the fasting log, this device's sync
 * identity.
 *
 * The native halves are the app's own (ios/PrayerApp/SecureStore.m,
 * android/…/SecureStoreModule.kt), in place of
 * react-native-encrypted-storage, which is no longer maintained. They open
 * the very items and the very file that library wrote, so a copy of the
 * app that stored its journal through the library finds it here unmoved.
 * On Windows, Linux and the web the build swaps this file for
 * desktop/web/shims/encrypted-storage.js.
 *
 * A read that FAILS rejects; only a key that is not there resolves null.
 * src/storage/durableWrite.ts depends on telling the two apart.
 */
import NativeMihrabSecureStore from './specs/NativeMihrabSecureStore';
import { nativeModule } from './nativeModule';

type NativeSecureStore = {
  setItem(key: string, value: string): Promise<null>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<null>;
};

function native(): NativeSecureStore {
  const m = nativeModule(NativeMihrabSecureStore, 'MihrabSecureStore') as NativeSecureStore | undefined;
  if (!m) throw new Error('MihrabSecureStore is not linked into this build');
  return m;
}

const SecureStore = {
  async setItem(key: string, value: string): Promise<void> {
    await native().setItem(key, value);
  },
  async getItem(key: string): Promise<string | null> {
    return (await native().getItem(key)) ?? null;
  },
  async removeItem(key: string): Promise<void> {
    await native().removeItem(key);
  },
};

export default SecureStore;
