/**
 * The last memorisation drill that ran to its end (#121).
 *
 * A range played with repeats is a drill: somebody is learning those
 * ayahs. When it finishes, the ayah sheet and the Qur'an tab's Hifz row
 * offer to mark the range as memorised — the drill is where memorising
 * happens, the tracker is where it is kept, and this is the one step
 * between them. Held in memory only: an offer, not a record. It expires
 * on its own, and goes when taken up or when the range is marked by any
 * other way.
 */
import { useSyncExternalStore } from 'react';

export type FinishedDrill = {
  surah: number;
  from: number;
  to: number;
  /** Epoch ms the drill ended. */
  at: number;
};

/** An offer older than this is stale: the reader moved on. */
const DRILL_OFFER_MS = 12 * 60 * 60 * 1000;

let last: FinishedDrill | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** A drill of `surah` `from`–`to` just finished. */
export function noteDrillFinished(d: Omit<FinishedDrill, 'at'>, now = Date.now()): void {
  last = { ...d, at: now };
  emit();
}

/** The offer was taken up, or is no longer wanted. */
export function clearDrillOffer(): void {
  if (!last) return;
  last = null;
  emit();
}

/** The drill to offer, if there is one and it is recent. */
export function lastDrill(now = Date.now()): FinishedDrill | null {
  if (last && now - last.at > DRILL_OFFER_MS) last = null;
  return last;
}

export function useLastDrill(): FinishedDrill | null {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => lastDrill(),
    () => null,
  );
}

/** Test seam. */
export function __resetDrillForTests(): void {
  last = null;
  listeners.clear();
}
