/**
 * IS THE CALCULATION CURRENT?
 *
 * Sweden's, Diyanet's, Morocco's, Algeria's and Indonesia's times are the
 * authority's method computed on the phone, with a correction list that puts
 * the method's few rounding differences back on the printed minute. The
 * list covers the dates the authority's tables did when it was made. Three
 * things can leave the phone behind, and each is said rather than hidden:
 *
 *   • 'beyond' — the day is past the list (the authority has published no
 *     more, or the newer list has not reached the phone): the method alone,
 *     on the printed minute all but rarely (99.1–99.98 %), never a minute
 *     further;
 *   • 'checking' — the authority has published tables the method is not yet
 *     certified on (MihrabHQ/mihrab-methods' certification says so);
 *   • 'update' — the method itself has moved on (a newer revision): its
 *     lists no longer fit this build, so the app must be updated.
 *
 * A newer list for the method this build computes is not a reason to update
 * the app: it is downloaded (certification.json names it; the file must
 * match what it names) and put in force within a day.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  METHODS_CERTIFICATION_POLL_MS,
  METHODS_CERTIFICATION_URL,
  METHODS_CORRECTIONS_BASE_URL,
} from '../config/datasets';
import { httpUserAgent } from '../config/httpIdentity';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { hydrateClockSkew, noteServerDate } from './clockSkew';
import { METHOD_REVISION } from './methodRevisions';
import {
  CORRECTION_AUTHORITIES,
  correctionsInForce,
  isCorrections,
  setCorrections,
  summarize,
  type CorrectionAuthority,
  type Corrections,
  type CorrectionsSummary,
} from './swedenCorrections';
import { autoMethodForCoords } from './autoMethod';
import { SWEDEN_METHOD_ID } from './swedenMethodId';
import { isCoordinateInSweden } from '../utils/swedenRegion';
import { isCoordinateInMorocco } from '../utils/moroccoRegion';
import { isCoordinateInAlgeria } from '../utils/algeriaRegion';
import { isCoordinateInIndonesia } from '../utils/indonesiaRegion';
import type { PrayerDataProviderId } from '../settings/types';

const STATE_KEY = 'methods.certification.v1';
const CHECKED_KEY = 'methods.certification.v1.checkedAt';
const LIST_KEY = (a: CorrectionAuthority) => `methods.corrections.v1.${a}`;

export type RemoteEntry = {
  certified: boolean;
  revision?: number;
  corrections?: CorrectionsSummary;
};
type Remote = Partial<Record<CorrectionAuthority, RemoteEntry>>;
let remote: Remote = {};
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(l => l());

/** Listen for a change to what is known (a list put in force, a certification read). */
export function onMethodCurrencyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const same = (a?: CorrectionsSummary, b?: CorrectionsSummary) =>
  !!a && !!b && a.from === b.from && a.to === b.to && a.entries === b.entries;

/** Take a list for this build's method that is newer than the one in force. */
function adopt(
  authority: CorrectionAuthority,
  list: Corrections,
  revision: number | undefined,
): boolean {
  if (revision !== METHOD_REVISION[authority] || !isCorrections(list))
    return false;
  const now = correctionsInForce(authority);
  const next = summarize(list);
  if (same(now, next) || next.to < now.to) return false;
  setCorrections(authority, list);
  return true;
}

function parseRemote(x: unknown): Remote | null {
  if (!x || typeof x !== 'object') return null;
  const out: Remote = {};
  for (const a of CORRECTION_AUTHORITIES) {
    const e = (x as Record<string, unknown>)[a] as RemoteEntry | undefined;
    if (!e || typeof e !== 'object' || typeof e.certified !== 'boolean')
      continue;
    const c = e.corrections;
    out[a] = {
      certified: e.certified,
      revision: typeof e.revision === 'number' ? e.revision : undefined,
      corrections:
        c &&
        typeof c.from === 'string' &&
        typeof c.to === 'string' &&
        typeof c.entries === 'number'
          ? { from: c.from, to: c.to, entries: c.entries }
          : undefined,
    };
  }
  return out;
}

/** What was last downloaded: the lists and the certification. Cheap; call at start. */
export async function loadCachedMethodCurrency(): Promise<void> {
  // And how far the phone's clock was from the server's (`clockSkew.ts`):
  // Morocco's times are written by it.
  await hydrateClockSkew();
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    remote = (raw && parseRemote(JSON.parse(raw))) || {};
    for (const a of CORRECTION_AUTHORITIES) {
      const stored = await AsyncStorage.getItem(LIST_KEY(a));
      if (!stored) continue;
      const { revision, list } = JSON.parse(stored) as {
        revision?: number;
        list: Corrections;
      };
      adopt(a, list, revision);
    }
  } catch {
    /* the bundled lists stand */
  }
  changed();
}

let inFlight: Promise<boolean> | null = null;
/**
 * Read the certification (at most every twelve hours; forced: now) and take
 * any newer list for this build's methods. True when a list was put in force.
 */
export function refreshMethodCurrency(force = false): Promise<boolean> {
  if (!inFlight) {
    inFlight = refresh(force).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

const headers = {
  headers: { 'User-Agent': httpUserAgent('Islamic prayer app; methods') },
};
const retry = { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 8000 };

async function refresh(force: boolean): Promise<boolean> {
  try {
    if (!force) {
      const age = Date.now() - Number(await AsyncStorage.getItem(CHECKED_KEY));
      if (
        Number.isFinite(age) &&
        age >= 0 &&
        age < METHODS_CERTIFICATION_POLL_MS
      )
        return false;
    }
    const res = await fetchWithRetry(METHODS_CERTIFICATION_URL, headers, retry);
    // The server's time, for a phone whose clock was set by hand (`clockSkew.ts`).
    noteServerDate(res);
    await AsyncStorage.setItem(CHECKED_KEY, String(Date.now()));
    if (!res.ok) return false;
    const next = parseRemote(await res.json());
    if (!next) return false;
    remote = next;
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
    let adopted = false;
    for (const a of CORRECTION_AUTHORITIES) {
      const e = next[a];
      if (!e?.certified || e.revision !== METHOD_REVISION[a] || !e.corrections)
        continue;
      const now = correctionsInForce(a);
      if (same(now, e.corrections) || e.corrections.to < now.to) continue;
      const lr = await fetchWithRetry(
        `${METHODS_CORRECTIONS_BASE_URL}/${a}.json`,
        headers,
        retry,
      );
      if (!lr.ok) continue;
      const list = (await lr.json()) as Corrections;
      // The file must be the list the certification names, or it is not taken.
      if (!isCorrections(list) || !same(summarize(list), e.corrections))
        continue;
      if (adopt(a, list, e.revision)) {
        adopted = true;
        await AsyncStorage.setItem(
          LIST_KEY(a),
          JSON.stringify({ revision: e.revision, list }),
        );
      }
    }
    changed();
    return adopted;
  } catch {
    return false;
  }
}

/** Which authority's method answers for a source, a method and a place; null for the rest. */
export function methodAuthorityFor(
  provider: PrayerDataProviderId,
  calculationMethod: number | 'auto',
  latitude: number,
  longitude: number,
): CorrectionAuthority | null {
  switch (provider) {
    case 'islamiska_forbundet':
      return 'sweden';
    case 'diyanet':
      return isCoordinateInSweden(latitude, longitude) ? 'sweden' : 'diyanet';
    case 'habous':
      return isCoordinateInAlgeria(latitude, longitude) ? 'algeria' : 'morocco';
    case 'marw':
      return 'algeria';
    case 'kemenag':
      return 'indonesia';
    case 'aladhan': {
      // A ministry's method by hand, or Automatic's, has its list only inside the country.
      const m =
        calculationMethod === 'auto'
          ? autoMethodForCoords(latitude, longitude)
          : calculationMethod;
      if (m === SWEDEN_METHOD_ID)
        return isCoordinateInSweden(latitude, longitude) ? 'sweden' : null;
      if (m === 13) return 'diyanet';
      if (m === 21)
        return isCoordinateInMorocco(latitude, longitude) &&
          !isCoordinateInAlgeria(latitude, longitude)
          ? 'morocco'
          : null;
      if (m === 19)
        return isCoordinateInAlgeria(latitude, longitude) ? 'algeria' : null;
      if (m === 20)
        return isCoordinateInIndonesia(latitude, longitude)
          ? 'indonesia'
          : null;
      return null;
    }
    default:
      return null;
  }
}

export type MethodCurrency =
  | { state: 'current' }
  | { state: 'beyond'; to: string }
  | { state: 'checking' }
  | { state: 'update' };

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

/** Is this authority's calculation current for the day? */
export function methodCurrency(
  authority: CorrectionAuthority,
  date: Date = new Date(),
): MethodCurrency {
  const r = remote[authority];
  if (r?.revision !== undefined && r.revision > METHOD_REVISION[authority])
    return { state: 'update' };
  if (r && !r.certified) return { state: 'checking' };
  const list = correctionsInForce(authority);
  const day = dateKey(date);
  if (day > list.to || day < list.from) return { state: 'beyond', to: list.to };
  return { state: 'current' };
}

/** Tests. */
export function _resetMethodCurrencyForTests(): void {
  remote = {};
  inFlight = null;
}
