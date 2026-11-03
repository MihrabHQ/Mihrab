/**
 * Mihrab Web's first guess at where the visitor is: the city their
 * internet connection is registered to.
 *
 * Only the web app asks, and only to offer the answer back as a question
 * ("Are you in Stockholm?") — nothing is set until the visitor says yes,
 * and "No" leads to the same search, GPS and coordinates the apps have.
 * A browser cannot ask for a precise position without a permission
 * prompt on load, which is a worse first second than one line to confirm.
 *
 * GeoJS first (free, no key, answers a browser), ipapi.co if it does not
 * answer. Each lookup sends the visitor's IP address to that service and
 * nothing else: no coordinates, no settings, no identifier of ours.
 */
import { fetchWithRetry } from '../utils/fetchWithRetry';

export type IpPlace = {
  latitude: number;
  longitude: number;
  /** "City, Country", or whichever of the two the service knew. */
  label: string;
};

const TIMEOUT_MS = 4000;

type Lookup = {
  url: string;
  read: (body: Record<string, unknown>) => {
    lat: unknown;
    lng: unknown;
    city: unknown;
    region: unknown;
    country: unknown;
  };
};

const LOOKUPS: readonly Lookup[] = [
  {
    url: 'https://get.geojs.io/v1/ip/geo.json',
    read: b => ({ lat: b.latitude, lng: b.longitude, city: b.city, region: b.region, country: b.country }),
  },
  {
    url: 'https://ipapi.co/json/',
    read: b => ({ lat: b.latitude, lng: b.longitude, city: b.city, region: b.region, country: b.country_name }),
  },
];

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** A service's answer as a place, or null when it is not one. Pure, for the tests. */
export function placeFromAnswer(raw: ReturnType<Lookup['read']>): IpPlace | null {
  const latitude = typeof raw.lat === 'number' ? raw.lat : parseFloat(String(raw.lat));
  const longitude = typeof raw.lng === 'number' ? raw.lng : parseFloat(String(raw.lng));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  // 0,0 is a service's way of saying it does not know.
  if (latitude === 0 && longitude === 0) return null;
  const place = text(raw.city) ?? text(raw.region);
  const country = text(raw.country);
  const label = [place, country].filter(Boolean).join(', ');
  if (!label) return null;
  return { latitude, longitude, label };
}

export async function guessPlaceFromIp(): Promise<IpPlace | null> {
  for (const lookup of LOOKUPS) {
    try {
      const res = await fetchWithRetry(lookup.url, undefined, {
        maxAttempts: 1,
        timeoutMs: TIMEOUT_MS,
      });
      if (!res.ok) continue;
      const place = placeFromAnswer(lookup.read((await res.json()) as Record<string, unknown>));
      if (place) return place;
    } catch {
      // The next service, or no guess: the visitor picks the place instead.
    }
  }
  return null;
}
