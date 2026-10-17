/**
 * Shared plumbing for the end-to-end user scenarios in `__tests__/scenarios/`.
 *
 * Real settings storage, real prayer cache, real hook — only the edges are
 * stubbed: the network (`global.fetch`), the phone's zone, and the
 * first-paint latch (released at once; there is no screen to paint).
 *
 * Kept under `fixtures/` because jest treats every other file below
 * `__tests__/` as a suite.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  usePrayerDay,
  type PrayerDayState,
} from '../../src/hooks/usePrayerDay';
import type { PrayerAppSettings } from '../../src/settings/types';
import { loadSettings, saveSettings } from '../../src/settings/storage';
import { applyLocationProviders } from '../../src/settings/locationProviders';
import { markFirstPaint } from '../../src/boot/firstPaint';

/**
 * The phone's zone. Jest hands each suite its own copy of `process`, so
 * `process.env.TZ` there moves nothing; the outer process's does, and Node
 * re-reads it on assignment (Dates and Intl alike).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const realProcess = require('vm').runInThisContext('process') as NodeJS.Process;
export function setZone(zone: string): void {
  realProcess.env.TZ = zone;
}
export function currentZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export type FetchHandler = (
  url: string,
  init?: unknown,
) => Promise<unknown> | unknown;

/** Every request fails the way a phone with no network fails. */
export function goOffline(): jest.Mock {
  const f = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  (global as unknown as { fetch: unknown }).fetch = f;
  return f;
}

/** Requests answered by `handler`; anything it returns undefined for is a 404. */
export function goOnline(handler: FetchHandler): jest.Mock {
  const f = jest.fn(async (input: unknown, init?: unknown) => {
    const url =
      typeof input === 'string'
        ? input
        : String((input as { url?: string })?.url ?? input);
    const out = await handler(url, init);
    if (out === undefined) return response(404, { code: 404 });
    return out;
  });
  (global as unknown as { fetch: unknown }).fetch = f;
  return f;
}

export function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): unknown {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const h = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null },
    json: async () => JSON.parse(text),
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    clone() {
      return this;
    },
  };
}

/** Let every promise chain that is ready to run, run — `rounds` times over. */
export async function settle(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise(r => setImmediate(r));
    });
  }
}

/** Wait (real time) until `pred` holds, settling between looks. */
export async function until(
  pred: () => boolean,
  what: string,
  timeoutMs = 8000,
): Promise<void> {
  // `performance.now`, not `Date.now`: the scenarios fake the date.
  const end = performance.now() + timeoutMs;
  while (!pred()) {
    if (performance.now() > end)
      throw new Error(`timed out waiting for: ${what}`);
    // eslint-disable-next-line no-await-in-loop
    await settle(3);
  }
}

export type HookProbe = {
  /** Every state the hook published, in order. */
  states: PrayerDayState[];
  current(): PrayerDayState;
  rerender(settings: PrayerAppSettings): Promise<void>;
  unmount(): void;
};

/** Mount `usePrayerDay` the way Home does, and record what it publishes. */
export async function mountPrayerDay(
  settings: PrayerAppSettings,
): Promise<HookProbe> {
  // No screen to paint: the work held for the first frame may run now.
  markFirstPaint();
  const states: PrayerDayState[] = [];
  function Probe({ s }: { s: PrayerAppSettings }) {
    const { state } = usePrayerDay(s, true);
    if (states[states.length - 1] !== state) states.push(state);
    return null;
  }
  let root: ReactTestRenderer | undefined;
  await act(async () => {
    root = create(<Probe s={settings} />);
  });
  return {
    states,
    current: () => states[states.length - 1],
    rerender: async next => {
      await act(async () => {
        root!.update(<Probe s={next} />);
      });
    },
    unmount: () => {
      act(() => root!.unmount());
    },
  };
}

/**
 * What the app does when somebody changes a setting: the location's source
 * kept in step (`applyLocationProviders`), then the save — and the next
 * load reads back what the save wrote.
 */
export async function changeSettings(
  prev: PrayerAppSettings,
  patch: Partial<PrayerAppSettings>,
): Promise<PrayerAppSettings> {
  const next = applyLocationProviders(prev, patch);
  await saveSettings(next);
  return next;
}

/** A fresh install that has just been told where it is (onboarding's writes). */
export async function freshInstallAt(
  latitude: number,
  longitude: number,
  label: string,
): Promise<PrayerAppSettings> {
  const first = await loadSettings();
  return changeSettings(first, {
    locationMode: 'manual',
    manualLatitude: latitude,
    manualLongitude: longitude,
    manualLocationLabel: label,
    locationOnboardingComplete: true,
    onboardingComplete: true,
  });
}

/** The raw prayer-times cache blob, parsed. */
export async function readCacheBlob(): Promise<{
  caches: Record<
    string,
    {
      months: Record<string, Record<string, unknown>>;
      fallbackDays?: string[];
      clock?: string;
    }
  >;
} | null> {
  const raw = await AsyncStorage.getItem('prayer_times_cache.v2');
  return raw ? JSON.parse(raw) : null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A day the Today card can draw: the six times, each a clock reading. */
export function expectDrawableDay(
  day: Record<string, unknown> | undefined,
): void {
  expect(day).toBeDefined();
  for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    expect(String(day![k])).toMatch(HHMM);
  }
}

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * A stand-in for api.aladhan.com: a day's times built from the query so a
 * test can tell which method and school were asked (Isha moves by the
 * method id's minutes, Asr by the school), on `timezone`'s clock.
 * `seen` collects every query it was asked.
 */
export function aladhanServer(timezone: string): {
  handler: FetchHandler;
  seen: URL[];
} {
  const seen: URL[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = (d: number, method: number, school: number) => ({
    Imsak: '04:50',
    Fajr: `05:${pad(d % 30)}`,
    Sunrise: '06:40',
    Dhuhr: '12:10',
    Asr: school === 1 ? '15:40' : '15:00',
    Sunset: '18:00',
    Maghrib: '18:00',
    Isha: `19:${pad(10 + (method % 40))}`,
    Midnight: '00:05',
  });
  const handler: FetchHandler = urlStr => {
    if (!urlStr.includes('aladhan.com')) return undefined;
    const url = new URL(urlStr);
    seen.push(url);
    const method = Number(url.searchParams.get('method') ?? 3);
    const school = Number(url.searchParams.get('school') ?? 0);
    const t = /\/timings\/(\d{2})-(\d{2})-(\d{4})/.exec(url.pathname);
    if (t) {
      return response(200, {
        code: 200,
        status: 'OK',
        data: {
          timings: day(Number(t[1]), method, school),
          meta: { timezone },
        },
      });
    }
    const c = /\/calendar\/(\d{4})\/(\d{1,2})/.exec(url.pathname);
    if (c) {
      const y = Number(c[1]);
      const m = Number(c[2]);
      const dim = new Date(y, m, 0).getDate();
      const data = Array.from({ length: dim }, (_, i) => ({
        timings: Object.fromEntries(
          Object.entries(day(i + 1, method, school)).map(([k, v]) => [
            k,
            `${v} (CET)`,
          ]),
        ),
        date: { gregorian: { date: `${pad(i + 1)}-${pad(m)}-${y}` } },
        meta: { timezone },
      }));
      return response(200, { code: 200, status: 'OK', data });
    }
    return undefined;
  };
  return { handler, seen };
}
