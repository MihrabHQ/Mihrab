/**
 * Which riwayat this DEVICE has, held in memory for the render path.
 *
 * ── WHY A CACHE AND NOT A `require` ───────────────────────────────────
 *
 * `pages.ts` answers "which page is 2:142 on" from inside a render, and
 * `MushafUnicodePage` asks for a page's ayahs the same way. Both are
 * synchronous and neither may become async — a reader that awaited its
 * own pagination would paint a blank page first and the right one after.
 *
 * The data itself is not in the bundle any more (`riwayahStore.ts` has
 * the reasoning: Mihrab has no right to distribute the Warsh corpus, so
 * it does not). It is on the device, which means reading it is I/O. So it
 * is read ONCE, at hydration, into these maps — and everything after that
 * is a map lookup.
 *
 * A build that has never been given a riwayah has empty maps, which is
 * exactly the old behaviour: Hafs, no toggle, nothing to turn off.
 *
 * ── WHY IT NOTIFIES ───────────────────────────────────────────────────
 *
 * Availability used to be a build-time fact. Now a reader can add a
 * muṣḥaf while the app is running, and the toggle that was hidden a
 * second ago has to appear. `useRiwayahAvailability()` is how the screens
 * find out; nothing polls.
 */
import { useSyncExternalStore } from 'react';
import { registerNamedFont } from '../native/MushafFont';
import type { MushafPageRange, SurahMeta } from './pages';
import type { ExactLinesTable, RiwayahDataset } from './riwayahImport';
import {
  eraseRiwayahDataset,
  readRiwayahDataset,
  readRiwayahLines,
  readRiwayahProvenance,
  riwayahFontPath,
  writeRiwayahDataset,
  type RiwayahExtras,
  type RiwayahProvenance,
} from './riwayahStore';
import { DEFAULT_RIWAYAH, RIWAYAT, type RiwayahId } from './riwayat';

/** One riwayah's pagination: the same shape `pages.json` has for Hafs. */
export type RiwayahPageTable = {
  pages: ReadonlyArray<MushafPageRange>;
  surahs: ReadonlyArray<SurahMeta>;
  /**
   * Ayahs per surah in THIS riwayah, indexed from 0.
   *
   * Optional because a muṣḥaf stored by 2.13 has none — that build assumed
   * every riwayah counted like Ḥafṣ. `readRiwayahDataset` derives it from
   * the stored text in that case, so this is only ever absent in memory
   * for a table built by hand in a test.
   */
  ayahCounts?: ReadonlyArray<number>;
};

/** Ayah text for a `unicode` riwayah, keyed `"surah:ayah"`. */
export type RiwayahTextTable = Record<string, string>;

const pageCache = new Map<RiwayahId, RiwayahPageTable>();
const textCache = new Map<RiwayahId, RiwayahTextTable>();
const provenanceCache = new Map<RiwayahId, RiwayahProvenance>();
/**
 * The family a downloaded font was registered under — what `fontFamily`
 * must be given. Absent until registration has succeeded, and the page
 * waits on it (`riwayahFontFamily`).
 */
const fontCache = new Map<RiwayahId, string>();
/** The print's line table, read on first use — see `readRiwayahLines`. */
const linesCache = new Map<RiwayahId, ExactLinesTable | null>();
const linesLoading = new Map<RiwayahId, Promise<void>>();

/** The family name a downloaded muṣḥaf font is registered under. */
export function riwayahFontFamilyName(id: RiwayahId): string {
  return `MihrabRiwayah_${id}`;
}

/**
 * Register a muṣḥaf's own font from the store and remember the family.
 *
 * Idempotent: a second call for the same id returns the family already
 * known. Null when there is no module (tests, old builds) or the file is
 * refused, in which case the riwayah stays unavailable — see
 * `riwayahAvailable`, which asks for the font as well as the pages.
 */
async function registerRiwayahFont(
  id: RiwayahId,
  fileName: string,
): Promise<string | null> {
  const known = fontCache.get(id);
  if (known) return known;
  const family = await registerNamedFont(
    riwayahFontFamilyName(id),
    riwayahFontPath(id, fileName),
  );
  if (family) fontCache.set(id, family);
  return family;
}

let hydrated = false;
let hydrating: Promise<void> | null = null;

const listeners = new Set<() => void>();
/** Bumped on every change, so `useSyncExternalStore` has a snapshot. */
let version = 0;

function publish(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** The riwayat that could be stored — Hafs is drawn from the bundle. */
function storable(): RiwayahId[] {
  return RIWAYAT.filter(r => r.render !== 'glyph').map(r => r.id);
}

/**
 * Read whatever this device has. Safe to call repeatedly; does the work
 * once.
 */
export function hydrateRiwayahData(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    for (const id of storable()) {
      const dataset = await readRiwayahDataset(id);
      if (!dataset) continue;
      const provenance = await readRiwayahProvenance(id);
      // No provenance means the write did not finish — see
      // `writeRiwayahDataset`. Treat it as absent rather than draw a
      // muṣḥaf nobody can account for.
      if (!provenance) continue;
      // A muṣḥaf whose face arrives with it is not drawable without the
      // face: register it before the riwayah is announced, so there is no
      // moment where the pages exist and the font does not.
      if (provenance.font) {
        const family = await registerRiwayahFont(id, provenance.font);
        if (!family) continue;
      }
      pageCache.set(id, {
        pages: dataset.pages,
        surahs: dataset.surahs,
        ayahCounts: dataset.ayahCounts,
      });
      textCache.set(id, dataset.text);
      provenanceCache.set(id, provenance);
    }
    hydrated = true;
    publish();
  })();
  return hydrating;
}

/** The registered family of a downloaded muṣḥaf font, or null until it is. */
export function loadedRiwayahFontFamily(id: RiwayahId): string | null {
  return fontCache.get(id) ?? null;
}

/**
 * The print's own line table, or null while it is still being read or
 * the muṣḥaf has none.
 *
 * Synchronous, like every other lookup here, because the page asks from
 * inside a render; the first ask starts the read and the table arrives
 * by `useRiwayahAvailability`, which bumps when it lands. Until then a
 * page is reflowed rather than blank.
 */
export function loadRiwayahLines(id: RiwayahId): ExactLinesTable | null {
  if (linesCache.has(id)) return linesCache.get(id) ?? null;
  if (!linesLoading.has(id) && provenanceCache.has(id)) {
    linesLoading.set(
      id,
      readRiwayahLines(id)
        .then(table => {
          linesCache.set(id, table);
          publish();
        })
        .catch(() => {
          linesCache.set(id, null);
        })
        .finally(() => {
          linesLoading.delete(id);
        }),
    );
  }
  return null;
}

/** Has the store been read yet? Screens use it to avoid flashing "none". */
export function riwayahDataHydrated(): boolean {
  return hydrated;
}

/**
 * The pagination for a riwayah, or null when this device lacks it.
 *
 * Hafs is not handled here — it has `pages.ts` and always exists.
 */
export function loadRiwayahPages(id: RiwayahId): RiwayahPageTable | null {
  return pageCache.get(id) ?? null;
}

/** The ayah text for a `unicode` riwayah, or null when absent. */
export function loadRiwayahText(id: RiwayahId): RiwayahTextTable | null {
  return textCache.get(id) ?? null;
}

/**
 * One ayah in the riwayah the reader is READING, or null for Ḥafṣ.
 *
 * Null is the answer for Ḥafṣ deliberately: its text is bundled and
 * belongs to `quran.ts`, so a caller that gets null here goes there.
 * Null is also the answer for an `image` riwayah, which has pages but no
 * ayah text of its own, and for a dataset that has not hydrated yet.
 *
 * Exists because every ayah-level surface other than the page itself
 * asked for the bundled text and got Ḥafṣ — so a Warsh reader tapping a
 * word on a Warsh page was shown, and shared, the Ḥafṣ wording (#46).
 */
export function riwayahAyahText(
  id: RiwayahId,
  surah: number,
  ayah: number,
): string | null {
  if (id === DEFAULT_RIWAYAH) return null;
  return loadRiwayahText(id)?.[`${surah}:${ayah}`] ?? null;
}

/** Where this device's copy came from, or null when it has none. */
export function riwayahProvenance(id: RiwayahId): RiwayahProvenance | null {
  return provenanceCache.get(id) ?? null;
}

/**
 * Store a VERIFIED dataset and make it live.
 *
 * Verified is the caller's job and there is exactly one way to do it —
 * `verifyRiwayahDataset`. This function does not re-check, because a
 * second implementation of the checks is how the two drift apart; it
 * takes the type that only that function can produce.
 */
export async function installRiwayahDataset(
  id: RiwayahId,
  dataset: RiwayahDataset,
  from: string,
  extras: RiwayahExtras = {},
): Promise<RiwayahProvenance> {
  // The font first: a muṣḥaf whose face the platform refuses is not
  // installed, and the caller hears why before anything is written.
  if (extras.font) {
    fontCache.delete(id);
    const family = await registerRiwayahFont(id, extras.font);
    if (!family) throw new Error(`the font ${extras.font} could not be registered`);
  }
  const provenance = await writeRiwayahDataset(id, dataset, from, extras);
  pageCache.set(id, {
    pages: dataset.pages,
    surahs: dataset.surahs,
    ayahCounts: dataset.ayahCounts,
  });
  textCache.set(id, dataset.text);
  if (dataset.lines) linesCache.set(id, dataset.lines);
  else linesCache.delete(id);
  provenanceCache.set(id, provenance);
  publish();
  return provenance;
}

/** Remove a riwayah from this device. */
export async function uninstallRiwayah(id: RiwayahId): Promise<void> {
  await eraseRiwayahDataset(id);
  pageCache.delete(id);
  textCache.delete(id);
  linesCache.delete(id);
  fontCache.delete(id);
  provenanceCache.delete(id);
  publish();
}

/**
 * Re-render when what this device carries changes.
 *
 * Returns the version rather than a list: the list would be a new array
 * every call and `useSyncExternalStore` would loop. Callers ask
 * `availableRiwayat()` for the answer once this tells them it moved.
 */
export function useRiwayahAvailability(): number {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => version,
  );
}

/** Tests only — the caches are process-lifetime otherwise. */
export function _resetRiwayahDataCacheForTests(): void {
  pageCache.clear();
  textCache.clear();
  provenanceCache.clear();
  fontCache.clear();
  linesCache.clear();
  linesLoading.clear();
  hydrated = false;
  hydrating = null;
  version = 0;
}

/** Tests only — install without touching the filesystem. */
export function _setRiwayahDataForTests(
  id: RiwayahId,
  dataset: RiwayahDataset,
  /** The family a downloaded font would have been registered as. */
  fontFamily?: string,
): void {
  pageCache.set(id, {
    pages: dataset.pages,
    surahs: dataset.surahs,
    ayahCounts: dataset.ayahCounts,
  });
  textCache.set(id, dataset.text);
  if (dataset.lines) linesCache.set(id, dataset.lines);
  if (fontFamily) fontCache.set(id, fontFamily);
  provenanceCache.set(id, {
    from: 'test',
    at: new Date(0).toISOString(),
    ayahs: Object.keys(dataset.text).length,
    pages: dataset.pages.length,
    bytes: 0,
  });
  hydrated = true;
  publish();
}
