/**
 * react-native-encrypted-storage on the desktop: Electron's safeStorage,
 * which encrypts with the OS keychain (Windows DPAPI, the Linux secret
 * service / kwallet). Where no keyring exists — a bare Linux session —
 * the main process says so and the values are stored unencrypted in the
 * app's data folder, the same as any other app setting there.
 */
import { desktop } from './desktop';

const d = desktop();
const mem = new Map();

const EncryptedStorage = {
  setItem: async (k, v) => (d ? d.secure.set(k, v) : void mem.set(k, v)),
  getItem: async k => (d ? d.secure.get(k) : mem.get(k) ?? null),
  removeItem: async k => (d ? d.secure.remove(k) : void mem.delete(k)),
  clear: async () => (d ? d.secure.clear() : mem.clear()),
};

export default EncryptedStorage;
