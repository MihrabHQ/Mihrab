/**
 * ── IS "MY LOCATION" WHERE THE PHONE IS NOW? ──────────────────────────
 *
 * The rule this file keeps: the app never shows a place as "My location"
 * without knowing it is current, and says so when it cannot tell.
 *
 * It did not. A reader travelled from Sweden to Germany (Nov 2026) and the
 * app showed "Stockholm · Auto" at every launch and every pull to refresh:
 * the first fix after a flight took longer than the app listened, and
 * nothing on the screen said that the place under the times was only the
 * last one known. The position is now asked of everything the phone has
 * (`getPosition.ts`, the patch to the location library); this is the other
 * half — knowing when that still has not answered, and saying it.
 *
 * TWO THINGS ARE KEPT.
 *
 * The STATUS of the last request for "My location":
 *   searching   asked, nothing fresh yet
 *   slow        the quick request ended without a fresh position; the
 *               precise one is still listening
 *   notUpdated  the request ended without one: the place on screen is the
 *               last one known (the chip says "Not updated")
 *   ok          a fresh position was found — or the location is a place
 *               the reader chose, which needs none
 *
 * And whether the phone seems to have TRAVELLED since its last fresh
 * position — known without any position at all, from two things the phone
 * has the moment it lands:
 *   - the country of the mobile network it is registered on (Android);
 *   - its time zone.
 * Each is compared with what it was at the last fresh position (`anchor`),
 * like with like: no geography, no lookup, nothing sent anywhere. Neither
 * is fine enough to set a prayer time by — Germany is half an hour of
 * Maghrib wide — so they only ever say "the place on screen is probably
 * not where you are", and Today's notice says exactly that
 * (`PermissionBanners`, `locationNote`) while the search goes on.
 *
 * NOT the IP address: abroad, mobile data is routed through the home
 * operator and says "Sweden"; behind a VPN it says anything; and asking a
 * server costs the reader their address. A source that is confidently
 * wrong costs more trust than it earns.
 */
import AsyncStorage from '../storage/appStorage';
import { useSyncExternalStore } from 'react';
import { networkCountry, systemTimeZone } from '../native/SystemClock';
import { confirmBackgroundPlace } from '../native/BackgroundLocation';
import { deviceZone } from '../utils/zoneClock';

export type LocationStatus = 'ok' | 'searching' | 'slow' | 'notUpdated';
export type LocationFreshness = { status: LocationStatus; moved: boolean };

/**
 * How old a position may be and still count as where the phone is. A
 * quarter of an hour: a city's times do not change within it on foot or by
 * car, and a request whose wait ran out is answered with the phone's last
 * position (Android), which is "fresh" only if it is this recent.
 */
export const FRESH_FIX_MS = 15 * 60_000;
/** The quick request's wait, and a little: past it with nothing fresh, the search is "slow". */
export const SLOW_AFTER_MS = 10_000;

/** A position with no time of its own (a platform that gives none) is taken as just measured. */
export function isFreshFix(
  timestamp: number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (timestamp == null || !Number.isFinite(timestamp)) return true;
  return now - timestamp <= FRESH_FIX_MS;
}

/** What the phone's surroundings were at the last fresh position. */
export type TravelAnchor = {
  /** The phone's time zone then (IANA id), and its offset from UTC in minutes. */
  zone: string | null;
  offset: number;
  /** The mobile network's country then, or null (no SIM, iOS, desktop). */
  country: string | null;
};

/**
 * Has the phone travelled since `anchor`? Another network country, or
 * another time zone — its id AND its offset, so the clocks changing at
 * home (same zone, new offset) and a zone renamed by an update (new id,
 * same offset) are not journeys. With nothing to compare, no.
 */
export function hasTravelled(
  anchor: TravelAnchor | null,
  now: TravelAnchor,
): boolean {
  if (!anchor) return false;
  if (anchor.country && now.country && anchor.country !== now.country)
    return true;
  return (
    anchor.zone != null &&
    now.zone != null &&
    anchor.zone !== now.zone &&
    anchor.offset !== now.offset
  );
}

/**
 * A position that is NOT fresh — the phone's last, after a wait ran out —
 * has moved "My location". Does it answer the journey the phone shows?
 *
 * Only where it can be checked: the journey is a change of network country
 * and the position lies in the country the phone is in now (`fixCountry`,
 * from naming the town). A reader who flew Stockholm → Berlin and whose
 * phone last had a position in Berlin half an hour ago is in Berlin, and
 * the notice has nothing left to say. A last position in the airport
 * changed at on the way — another country — is not where the phone is,
 * and neither can a change of time zone alone be checked (one country,
 * several zones): the notice stays until a fresh position is found.
 */
export function staleFixAnswersJourney(
  anchor: TravelAnchor | null,
  now: TravelAnchor,
  fixCountry: string | null | undefined,
): boolean {
  if (!hasTravelled(anchor, now)) return true;
  const countryChanged =
    !!anchor?.country && !!now.country && anchor.country !== now.country;
  if (!countryChanged) return false;
  return !!fixCountry && fixCountry.toUpperCase() === now.country;
}

/** Today's notice is up: travelled, and the quick request has ended with nothing fresh. */
export function showsTravelNotice(f: LocationFreshness): boolean {
  return f.moved && (f.status === 'slow' || f.status === 'notUpdated');
}

// ── The store ────────────────────────────────────────────────────────────

const OK: LocationFreshness = { status: 'ok', moved: false };
let current: LocationFreshness = OK;
const listeners = new Set<() => void>();

export function getLocationFreshness(): LocationFreshness {
  return current;
}

export function setLocationFreshness(patch: Partial<LocationFreshness>): void {
  const next = { ...current, ...patch };
  if (next.status === current.status && next.moved === current.moved) return;
  current = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The freshness of "My location", for the chip and Today's notice. */
export function useLocationFreshness(): LocationFreshness {
  return useSyncExternalStore(
    subscribe,
    getLocationFreshness,
    getLocationFreshness,
  );
}

// ── The anchor ───────────────────────────────────────────────────────────

export const ANCHOR_KEY = 'mihrab.locationAnchor.v1';

async function surroundings(): Promise<TravelAnchor> {
  // The system's own zone where it can be asked (Android): this app's idea
  // of it can lag in a process that lived through a change, and an anchor
  // kept under the old zone reads as a second journey once it catches up.
  const [system, country] = await Promise.all([
    systemTimeZone(),
    networkCountry(),
  ]);
  return {
    zone: system?.zone ?? deviceZone() ?? null,
    offset: system?.offset ?? -new Date().getTimezoneOffset(),
    country,
  };
}

/** A fresh position was found: this is where the phone is, remember its surroundings. */
export async function recordFreshFix(): Promise<void> {
  // The background watcher (optional) measures a later position against
  // the place as of NOW, and takes these surroundings as the place's.
  confirmBackgroundPlace();
  try {
    await AsyncStorage.setItem(ANCHOR_KEY, JSON.stringify(await surroundings()));
  } catch {
    // Best effort: without an anchor there is simply no sign of travel.
  }
}

async function readAnchor(): Promise<TravelAnchor | null> {
  const raw = await AsyncStorage.getItem(ANCHOR_KEY);
  if (!raw) return null;
  const a = JSON.parse(raw) as Partial<TravelAnchor> | null;
  if (!a || typeof a.offset !== 'number') return null;
  return {
    zone: typeof a.zone === 'string' ? a.zone : null,
    offset: a.offset,
    country: typeof a.country === 'string' ? a.country : null,
  };
}

/** Does the phone seem to have travelled since its last fresh position? */
export async function seemsToHaveTravelled(): Promise<boolean> {
  try {
    return hasTravelled(await readAnchor(), await surroundings());
  } catch {
    return false;
  }
}

/**
 * "My location" has just followed a position that is not fresh, in the
 * country `fixCountry`: is the place on screen where the phone is, as far
 * as the phone can tell (`staleFixAnswersJourney`)? Unknown reads as no.
 */
export async function staleFixSettlesJourney(
  fixCountry: string | null | undefined,
): Promise<boolean> {
  try {
    return staleFixAnswersJourney(
      await readAnchor(),
      await surroundings(),
      fixCountry,
    );
  } catch {
    return false;
  }
}

/** Tests only. */
export function _resetLocationFreshnessForTests(): void {
  current = OK;
  listeners.clear();
}
