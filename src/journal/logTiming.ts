/**
 * On time or late, by the clock — issue #74. An opt-in, off by default.
 *
 * A prayer logged from outside the app — the notification's "Log prayer",
 * the full-screen alarm's Log button, or a Log Today widget — has always
 * been recorded `on-time`: the press happens while the alert is up, and
 * anything else would be the app inventing a claim. With
 * `logLateByClock` on, the reader has asked for the clock's answer
 * instead: a log made in the first half of the prayer's window is
 * `on-time`, one made in the second half or after it has closed is `late`.
 * Logs made in the app itself are untouched — there the reader picks the
 * status, or is asked.
 *
 * ── WHY THE WINDOWS ARE STORED, AND THE SETTING WITH THEM ─────────────
 *
 * The writers run in a notification's background handler or while the
 * widget's queue drains, and the writer deliberately does not import the
 * settings or the prayer-times stack (`prayerLogAction` says why). So the
 * Today screen, which holds a week of times, writes the windows and the
 * switch to one small key, and the writer reads that key alone. A window
 * the key does not hold — a widget tapped after a week with the app
 * closed — is answered `on-time`, as before: no window, no claim.
 *
 * The window is the one the snooze menu and `quickLog` use: Fajr to
 * sunrise, Dhuhr to Asr, Asr to Maghrib, Maghrib to Isha, Isha to the next
 * day's Fajr.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { JournalPrayer } from './journal';

export const LOG_TIMING_KEY = '@mihrab/logTiming/v1';

/** The share of the window after which a log counts as late. */
export const LATE_AFTER_FRACTION = 0.5;

/** How long a stored window is kept after it closes. */
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

const SALAH: readonly string[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export type PrayerWindow = {
  /** Local YYYY-MM-DD the prayer belongs to (the day it begins). */
  d: string;
  p: JournalPrayer;
  /** Start and end, epoch ms. */
  s: number;
  e: number;
};

type Stored = { on: boolean; windows: PrayerWindow[] };

function ymd(at: number): string {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Each prayer's window from the day's edges (`snoozeWindow.windowEdges`):
 * from its own edge to the next one, whichever that is. A prayer whose
 * next edge is not in the list (Isha on the last day held) has no window.
 */
export function windowsFromEdges(
  edges: readonly { name: string; at: number }[],
): PrayerWindow[] {
  const sorted = [...edges].sort((a, b) => a.at - b.at);
  const out: PrayerWindow[] = [];
  sorted.forEach((edge, i) => {
    if (!SALAH.includes(edge.name)) return;
    const next = sorted[i + 1];
    if (!next || next.at <= edge.at) return;
    out.push({ d: ymd(edge.at), p: edge.name as JournalPrayer, s: edge.at, e: next.at });
  });
  return out;
}

/**
 * The clock's answer for a log made at `nowMs` in `win`. Before the window
 * opens, or with no usable window, it is `on-time`: the clock has nothing
 * to say against it.
 */
export function statusByClock(
  win: { s: number; e: number } | null | undefined,
  nowMs: number,
): 'on-time' | 'late' {
  if (!win || !Number.isFinite(win.s) || !Number.isFinite(win.e) || win.e <= win.s) {
    return 'on-time';
  }
  if (nowMs < win.s) return 'on-time';
  const share = (nowMs - win.s) / (win.e - win.s);
  return share < LATE_AFTER_FRACTION ? 'on-time' : 'late';
}

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(LOG_TIMING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    const windows = Array.isArray(v.windows)
      ? v.windows.filter(
          (w): w is PrayerWindow =>
            !!w &&
            typeof w.d === 'string' &&
            SALAH.includes(w.p as string) &&
            Number.isFinite(w.s) &&
            Number.isFinite(w.e),
        )
      : [];
    return { on: v.on === true, windows };
  } catch {
    return null;
  }
}

/**
 * Store the switch and the windows the Today screen holds. Merged with what
 * is already stored — a newer window for the same prayer and day replaces
 * the older one — and pruned two weeks after each window closes.
 */
export async function rememberLogTiming(
  on: boolean,
  windows: readonly PrayerWindow[],
  nowMs: number = Date.now(),
): Promise<void> {
  const prev = (await readStored()) ?? { on: false, windows: [] };
  const byKey = new Map<string, PrayerWindow>();
  for (const w of [...prev.windows, ...windows]) byKey.set(`${w.d}|${w.p}`, w);
  const kept = [...byKey.values()]
    .filter(w => nowMs - w.e < KEEP_MS)
    .sort((a, b) => a.s - b.s);
  await AsyncStorage.setItem(LOG_TIMING_KEY, JSON.stringify({ on, windows: kept }));
}

/**
 * What a log made outside the app records for `prayer` on `date` at
 * `nowMs`. `on-time` unless the switch is on and a window is known. `hint`
 * is the window the caller already has (a notification carries its own
 * start and end), and wins over the stored one.
 */
export async function statusForExternalLog(
  date: string,
  prayer: JournalPrayer,
  nowMs: number,
  hint?: { s?: number; e?: number } | null,
): Promise<'on-time' | 'late'> {
  const stored = await readStored();
  if (!stored?.on) return 'on-time';
  if (hint && Number.isFinite(hint.s) && Number.isFinite(hint.e)) {
    return statusByClock({ s: hint.s as number, e: hint.e as number }, nowMs);
  }
  const win = stored.windows.find(w => w.d === date && w.p === prayer);
  return statusByClock(win, nowMs);
}
