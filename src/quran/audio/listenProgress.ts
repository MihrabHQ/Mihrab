/**
 * WHERE THE LISTENING GOT TO — its own place, not the reading marker.
 *
 * Tilāwah used to start from `lastRead`, the reading marker: press play on
 * an idle player and it picked up from wherever the muṣḥaf was last left
 * open. That tied the two together in both directions. Someone halfway
 * through listening to Al-Baqarah who opened the muṣḥaf to read Yā-Sīn
 * came back to a player that wanted to start Yā-Sīn; and with the muṣḥaf
 * open while a listen played, the page followed the recitation and every
 * page it turned moved the reading marker to wherever the reciter was.
 *
 * They are two different places. This is the listening one: the last ayah
 * a continuous listen (`listenFrom`) reached, kept on its own, written as
 * the recitation moves and never by the reader. The reader's marker is
 * kept from the other side — see `mushafReaderCore`, where a page turned
 * by a listen's follow does not count as reading.
 *
 * Also when it was last heard and whether it was left paused, so the
 * player can tell a pause of a moment from a session that has gone
 * stale: after a while the listening page offers to pick it up again, to
 * start something new, or what is recommended now.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ListenProgress = {
  surah: number;
  ayah: number;
  reciterId: string;
  /** When this ayah was reached, ms. */
  at: number;
  /** When the listen was paused, ms; null while it plays or once stopped. */
  pausedAt: number | null;
};

export const LISTEN_PROGRESS_KEY = 'mihrab.listenProgress.v1';

/**
 * How long a pause lasts before the session counts as stale and the
 * player offers a fresh start beside the resume. Long enough that a
 * phone call or a prayer does not count; short enough that "this morning"
 * does.
 */
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** Writes wait this long, so an ayah every few seconds is one write. */
const SAVE_DELAY_MS = 2000;

let current: ListenProgress | null = null;
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const value = current;
    void (value
      ? AsyncStorage.setItem(LISTEN_PROGRESS_KEY, JSON.stringify(value))
      : AsyncStorage.removeItem(LISTEN_PROGRESS_KEY)
    ).catch(() => undefined);
  }, SAVE_DELAY_MS);
}

/** A stored value, or null for anything that is not one. */
export function coerceListenProgress(raw: unknown): ListenProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const surah = Number(r.surah);
  const ayah = Number(r.ayah);
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
  if (!Number.isInteger(ayah) || ayah < 1) return null;
  const at = Number(r.at);
  const pausedAt = r.pausedAt == null ? null : Number(r.pausedAt);
  return {
    surah,
    ayah,
    reciterId: typeof r.reciterId === 'string' ? r.reciterId : '',
    at: Number.isFinite(at) ? at : 0,
    pausedAt: pausedAt != null && Number.isFinite(pausedAt) ? pausedAt : null,
  };
}

/** Read what was stored, once. Safe to call again; later calls do nothing. */
export async function loadListenProgress(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(LISTEN_PROGRESS_KEY);
    // A listen that started while this was loading wins over the stored one.
    if (raw && !current) {
      current = coerceListenProgress(JSON.parse(raw));
      emit();
    }
  } catch {
    /* nothing stored, or unreadable: no listening place yet */
  }
}

export function getListenProgress(): ListenProgress | null {
  return current;
}

export function useListenProgress(): ListenProgress | null {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      void loadListenProgress();
      return () => listeners.delete(l);
    },
    getListenProgress,
    getListenProgress,
  );
}

/** A listen reached this ayah. */
export function recordListened(
  ref: { surah: number; ayah: number },
  reciterId: string,
  now: number = Date.now(),
): void {
  if (
    current &&
    current.surah === ref.surah &&
    current.ayah === ref.ayah &&
    current.pausedAt == null
  ) {
    return;
  }
  current = { surah: ref.surah, ayah: ref.ayah, reciterId, at: now, pausedAt: null };
  emit();
  scheduleSave();
}

/** The listen was paused (`true`) or is playing again (`false`). */
export function noteListenPaused(paused: boolean, now: number = Date.now()): void {
  if (!current) return;
  const pausedAt = paused ? current.pausedAt ?? now : null;
  if (pausedAt === current.pausedAt) return;
  current = { ...current, pausedAt };
  emit();
  scheduleSave();
}

/**
 * Has the session gone stale — paused, or simply not heard, for longer
 * than `STALE_AFTER_MS`?
 */
export function isListenStale(
  p: ListenProgress | null,
  now: number = Date.now(),
): boolean {
  if (!p) return false;
  const since = p.pausedAt ?? p.at;
  return now - since >= STALE_AFTER_MS;
}

/** For tests. */
export function _resetListenProgressForTests(): void {
  current = null;
  loaded = false;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  listeners.clear();
}
