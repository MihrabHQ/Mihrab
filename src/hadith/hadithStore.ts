/**
 * The reader's hadith record, kept encrypted at rest beside the journal
 * (`durableEncryptedSet`), held in memory while the app runs, and synced
 * as its own category (`sync/snapshot.ts`, `hadith`).
 *
 * Writes go through one queue, each writing the whole record as it stands
 * when its turn comes, so two quick taps cannot land out of order.
 */
import { useSyncExternalStore } from 'react';
import { durableEncryptedGet, durableEncryptedSet } from '../storage/durableWrite';
import { quiet } from '../utils/quiet';
import {
  coerceHadithRecord,
  EMPTY_HADITH_RECORD,
  HADITH_KEY,
  type HadithRecord,
} from './hadithRecord';

let state: HadithRecord = EMPTY_HADITH_RECORD;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
let queue: Promise<void> = Promise.resolve();

function emit(): void {
  for (const l of listeners) l();
}

/** Read the record from disk, once (again after `reloadHadithRecord`). */
export function hydrateHadithRecord(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = (async () => {
      try {
        const raw = await durableEncryptedGet(HADITH_KEY);
        state = raw ? coerceHadithRecord(JSON.parse(raw)) : EMPTY_HADITH_RECORD;
      } catch (e) {
        quiet('hadith/store', e);
      } finally {
        hydrated = true;
        hydrating = null;
        emit();
      }
    })();
  }
  return hydrating;
}

/** A sync wrote the key behind the store's back: read it again. */
export function reloadHadithRecord(): Promise<void> {
  hydrated = false;
  return hydrateHadithRecord();
}

export function getHadithRecord(): HadithRecord {
  return state;
}

export function isHadithRecordHydrated(): boolean {
  return hydrated;
}

/**
 * Change the record and persist it. Resolves once it is on disk. Waits for
 * the record to be read first: a change applied to the empty record a
 * moment before the disk's arrived would be overwritten by it.
 */
export async function updateHadithRecord(change: (rec: HadithRecord) => HadithRecord): Promise<void> {
  if (!hydrated) await hydrateHadithRecord();
  state = change(state);
  emit();
  queue = queue.then(async () => {
    try {
      await durableEncryptedSet(HADITH_KEY, JSON.stringify(state));
    } catch (e) {
      quiet('hadith/store', e);
    }
  });
  return queue;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (!hydrated) void hydrateHadithRecord();
  return () => listeners.delete(l);
}

export function useHadithRecord(): HadithRecord {
  return useSyncExternalStore(subscribe, getHadithRecord, getHadithRecord);
}

/** Tests. */
export function _resetHadithStoreForTests(): void {
  state = EMPTY_HADITH_RECORD;
  hydrated = false;
  hydrating = null;
  listeners.clear();
  queue = Promise.resolve();
}
