/**
 * The stored keys that never fall back to plaintext — see `sensitive` in
 * `durableWrite.ts`. Here rather than beside their owners so the launch-
 * time sweep of older builds' plaintext copies (`evictLegacyFallbacks`)
 * can name them without importing the sync layer.
 */

/** The sync identity's secret key (`sync/deviceIdentity.ts`). */
export const SYNC_SECRET_KEY = 'prayerapp.sync.secret.v1';
/** The paired devices (`sync/peers.ts`). */
export const SYNC_PEERS_KEY = 'prayerapp.sync.peers.v1';
/** The devices this one removed (`sync/removedPeers.ts`). */
export const SYNC_REMOVED_KEY = 'prayerapp.sync.removed.v1';

export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  SYNC_SECRET_KEY,
  SYNC_PEERS_KEY,
  SYNC_REMOVED_KEY,
]);
