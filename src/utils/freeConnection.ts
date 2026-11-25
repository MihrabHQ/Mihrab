/**
 * Is this connection one a download may use without being asked?
 *
 * `isConnectionExpensive` is the question that means "this costs money",
 * and it is answered `null` on plenty of devices. A null is not a promise
 * that the connection is free, so the type has to be Wi-Fi (or a cable) as
 * well: both, or nothing happens automatically.
 *
 * Here, and not beside the Qur'an downloads it was written for
 * (`quran/quranDownloadResume.ts`), so the Hadith packs' update check can
 * ask the same question without bringing the Qur'an's download manager
 * with it.
 */
import type { NetInfoState } from '@react-native-community/netinfo';

/** Unmetered, and known to be: see the header on the null. */
export function isFreeConnection(state: NetInfoState | null): boolean {
  if (!state?.isConnected) return false;
  if (state.type !== 'wifi' && state.type !== 'ethernet') return false;
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  return details?.isConnectionExpensive !== true;
}
