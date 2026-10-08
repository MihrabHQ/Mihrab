/**
 * ANNOUNCED HIJRI MONTH STARTS, from the server.
 *
 * The Indonesian government's calendar in the app is a prediction (MABIMS),
 * and the sidang isbat can overrule it. When it does, the announced date is
 * added to data/hijri/v1/overrides.json in the repository, and every phone
 * picks it up within a day — no release needed. The same file can correct
 * Muhammadiyah's months, though those come from its own published calendar.
 *
 * Three copies, newest wins by `updated`: the one bundled with this build
 * (applied by `calendar.ts` itself), the last one downloaded (AsyncStorage),
 * and the server's. A file that does not validate is ignored whole, so a
 * typo on the server cannot move a date.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HIJRI_OVERRIDES_URL, HIJRI_OVERRIDES_POLL_MS } from '../config/datasets';
import { httpUserAgent } from '../config/httpIdentity';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { hijriOverridesUpdated, setHijriOverrides } from './calendar';
import { parseOverrides, updatedMs, type OverridesFile } from './overridesFile';

const CACHE_KEY = 'hijri.overrides.v1';
const CHECKED_KEY = 'hijri.overrides.v1.checkedAt';

/** Adopt a file newer than the one in force (the bundled copy, at first). */
function adopt(file: OverridesFile | null): boolean {
  if (!file) return false;
  // Strictly newer, as a moment: a second correction on the same day needs
  // a time in `updated` (yyyy-mm-ddThh:mm:ssZ).
  const inForce = hijriOverridesUpdated();
  if (inForce && updatedMs(file.updated) <= updatedMs(inForce)) return false;
  setHijriOverrides({ mabims: file.mabims, khgt: file.khgt }, file.updated);
  return true;
}

/** The downloaded copy, if newer than the bundled one. Cheap; call at start. */
export async function loadCachedHijriOverrides(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) adopt(parseOverrides(JSON.parse(raw)));
  } catch {
    /* the bundled copy stands */
  }
}

let inFlight: Promise<boolean> | null = null;

/**
 * Ask the server, at most once per poll interval (forced: now). Resolves to
 * true when a newer file was adopted. Calls that overlap share one request.
 */
export function refreshHijriOverrides(force = false): Promise<boolean> {
  if (!inFlight) {
    inFlight = refresh(force).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function refresh(force: boolean): Promise<boolean> {
  try {
    if (!force) {
      const last = Number(await AsyncStorage.getItem(CHECKED_KEY));
      const age = Date.now() - last;
      // A clock set back (age < 0) asks now rather than waiting it out.
      if (Number.isFinite(age) && age >= 0 && age < HIJRI_OVERRIDES_POLL_MS) return false;
    }
    const res = await fetchWithRetry(
      HIJRI_OVERRIDES_URL,
      { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; hijri') } },
      { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 7000 },
    );
    await AsyncStorage.setItem(CHECKED_KEY, String(Date.now()));
    if (!res.ok) return false;
    const file = parseOverrides(await res.json());
    if (!file) return false;
    const adopted = adopt(file);
    if (adopted) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(file));
    return adopted;
  } catch {
    return false;
  }
}
