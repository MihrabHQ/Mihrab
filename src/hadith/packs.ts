/**
 * The Hadith packs on this device: what is here, fetching what is not,
 * and reading it.
 *
 * Nothing of the hadith ships inside the app. Every pack is downloaded,
 * by the reader's choice, through here — our copy first (the
 * `data-hadith-v1` release, `mirrors.ts`), the original source second
 * (`origin.ts`) — and kept under <Documents>/hadith/v1/<key>.json.
 * Settings → Downloads lists them and deletes them (`HadithDownloadsSection`).
 *
 * In a browser there is no file store: a pack is fetched for the session
 * and held in memory, which is what the Qur'an downloads do there too. A
 * browser cannot read a release asset either (no CORS header), so there
 * the original sources answer and the manifest's sizes are unknown.
 *
 * ── A DOWNLOAD ─────────────────────────────────────────────────────────
 *
 * Where there is a disk, our copy is fetched straight onto it
 * (`mirrorToDisk`): the bar moves as the bytes arrive, Cancel stops the
 * transfer, and a 24 MB book is never held twice in memory (it used to be
 * parsed from the response and then serialised again to be written).
 * Packs are fetched one at a time (`ensurePacks`), and Cancel stops the
 * ones still waiting their turn as well as the one in flight — it used to
 * stop only that one, and the next began at once.
 *
 * Screens that only care WHICH packs are here read `usePacksReadyKey`,
 * which changes when a pack arrives or goes and not on every tick of a
 * download's progress.
 *
 * ── A PACK WE HAVE SINCE CORRECTED ─────────────────────────────────────
 *
 * A pack on the device used to be the pack for good: an-Nawawi's 14th was
 * corrected in our copy on 2026-11-25 and the phone that already held the
 * starter set went on showing the old one until it was deleted by hand.
 * `replacePack` fetches our copy again over the one here — only our copy,
 * never the sources, and only when what arrives is the file the manifest
 * names (its SHA-256), whichever of the two ways it came. The pack stays readable throughout: it is `ready`
 * before, during and after, and a transfer that fails leaves the old file
 * where it was. When to do it is `packUpdates.ts`.
 */
import { useSyncExternalStore } from 'react';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { hadithAssetName, MIRROR_TAGS, mirrorUrl } from '../config/mirrors';
import { IS_WEB_APP } from '../config/webApp';
import { mkdirDeep } from '../quran/mushafDownload';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { quiet } from '../utils/quiet';
import { buildFromOrigin } from './origin';
import { validPack, type Manifest, type ManifestEntry, type PackFile, type PackKey } from './packTypes';

export type PackStatus =
  | { state: 'absent' }
  | { state: 'ready'; bytes: number }
  | { state: 'downloading'; progress: number }
  | { state: 'failed' };

const ROOT = () => `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/hadith/v1`;
const filePath = (key: PackKey) => `${ROOT()}/${key}.json`;
const noDisk = IS_WEB_APP;

let statuses: Record<string, PackStatus> = {};
/** The ready packs' keys, sorted and joined: changes only when one arrives, goes or is replaced. */
let readyKey = '';
/** Packs replaced in place this run. Part of `readyKey`: the same keys, other contents. */
let revision = 0;
let scanned: Promise<void> | null = null;
/** The disk has been looked at: "nothing is here" can be told from "not looked yet". */
let scanFinished = noDisk;
const listeners = new Set<() => void>();
/** Parsed packs, the most recent few: a book is megabytes of text. */
const memory = new Map<string, PackFile>();
const MEMORY = 6;
/** Session-only packs, where there is no disk. */
const webHeld = new Map<string, PackFile>();
type Job = { promise: Promise<boolean>; signal: { cancelled: boolean }; abort?: () => void };
const running = new Map<string, Job>();
/** Asked to stop: the one in flight, and the ones waiting their turn in `ensurePacks`. */
const stopped = new Set<string>();

function publish(next: Record<string, PackStatus>): void {
  statuses = next;
  const ready = Object.keys(next)
    .filter(k => next[k].state === 'ready')
    .sort()
    .join('|');
  readyKey = revision ? `${ready}#${revision}` : ready;
  for (const l of listeners) l();
}

function setStatus(key: PackKey, s: PackStatus): void {
  publish({ ...statuses, [key]: s });
}

/** A string's size as the file it is written to: UTF-8 bytes, not characters. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

function remember(key: string, file: PackFile): void {
  memory.delete(key);
  memory.set(key, file);
  while (memory.size > MEMORY) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/** Find what is already on disk. Once per process; `refreshPacks` again. */
export function scanPacks(): Promise<void> {
  if (!scanned) {
    scanned = refreshPacks().finally(() => {
      scanFinished = true;
      for (const l of listeners) l();
    });
  }
  return scanned;
}

export async function refreshPacks(): Promise<void> {
  if (noDisk) return;
  const found: Record<string, PackStatus> = {};
  const walk = async (dir: string, prefix: string) => {
    let entries: Awaited<ReturnType<typeof ReactNativeBlobUtil.fs.lstat>> = [];
    try {
      entries = await ReactNativeBlobUtil.fs.lstat(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const name = String(e.filename);
      if (e.type === 'directory') await walk(`${dir}/${name}`, `${prefix}${name}/`);
      else if (name.endsWith('.json')) {
        found[`${prefix}${name.slice(0, -5)}`] = { state: 'ready', bytes: Number(e.size) || 0 };
      }
    }
  };
  await walk(ROOT(), '');
  const next = { ...statuses };
  for (const [k, s] of Object.entries(next)) if (s.state === 'ready' && !found[k]) delete next[k];
  publish({ ...next, ...found });
}

export function packStatus(key: PackKey): PackStatus {
  return statuses[key] ?? { state: 'absent' };
}

export const isPackReady = (key: PackKey) => packStatus(key).state === 'ready';

/** The packs on this device. */
export function readyPackKeys(): PackKey[] {
  return Object.keys(statuses).filter(k => statuses[k].state === 'ready') as PackKey[];
}

/**
 * How many packs were replaced in place this run. What is built from the
 * packs and kept (`library.ts`'s index) is keyed on it with their names.
 */
export const packsRevision = () => revision;

function subscribe(l: () => void): () => void {
  listeners.add(l);
  void scanPacks();
  return () => listeners.delete(l);
}
const snapshot = () => statuses;

/** Every pack's status; re-renders when any changes, a download's progress included. */
export function usePackStatuses(): Record<string, PackStatus> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

const readySnapshot = () => readyKey;
const scannedSnapshot = () => scanFinished;

/**
 * False until the device's packs have been looked for. Before that every
 * pack reads as absent, and a page that shows a first-time download
 * prompt when nothing is here would flash it at each launch.
 */
export function usePacksScanned(): boolean {
  return useSyncExternalStore(subscribe, scannedSnapshot, scannedSnapshot);
}

/**
 * Which packs are on the device, as one string. For effects that read the
 * packs: it is the same string through a whole download and changes when
 * the pack lands, where `usePackStatuses` changes on every progress tick.
 */
export function usePacksReadyKey(): string {
  return useSyncExternalStore(subscribe, readySnapshot, readySnapshot);
}

/** A pack's contents, or null when it is not here. */
export async function loadPack<T extends PackFile>(key: PackKey): Promise<T | null> {
  const hit = memory.get(key) ?? webHeld.get(key);
  if (hit) {
    remember(key, hit);
    return hit as T;
  }
  if (noDisk) return null;
  try {
    const path = filePath(key);
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return null;
    const parsed = JSON.parse(String(await ReactNativeBlobUtil.fs.readFile(path, 'utf8')));
    if (!validPack(key, parsed)) return null;
    remember(key, parsed);
    return parsed as T;
  } catch (e) {
    quiet('hadith/packs', e);
    return null;
  }
}

export const hadithMirrorUrl = (asset: string) => mirrorUrl(MIRROR_TAGS.hadith, asset);

const mirrorTimeout = (key: PackKey) => (key.startsWith('books/') ? 180_000 : 60_000);

type Fetched = { file: PackFile; /** Set when it is already in its place on disk. */ bytes?: number };

/** A file's SHA-256 as the manifest writes it, or null when it cannot be read. */
async function sha256Of(path: string): Promise<string | null> {
  try {
    return String(await ReactNativeBlobUtil.fs.hash(path, 'sha256')).toLowerCase();
  } catch {
    return null;
  }
}

/** The SHA-256 of the pack on this device, or null when it is not here. */
export function packSha256(key: PackKey): Promise<string | null> {
  return noDisk ? Promise.resolve(null) : sha256Of(filePath(key));
}

/**
 * What came down, into the pack's place. Null — and the file already
 * there untouched — when it is not the pack.
 *
 * `replacing` is the SHA-256 the manifest gives a pack that is already
 * here: the file in place is only given up for exactly that one, and not
 * at all once the reader has deleted the pack meanwhile.
 */
async function moveIntoPlace(key: PackKey, job: Job, tmp: string, replacing?: string): Promise<Fetched | null> {
  if (replacing && (await sha256Of(tmp)) !== replacing) return null;
  const text = String(await ReactNativeBlobUtil.fs.readFile(tmp, 'utf8'));
  const parsed = JSON.parse(text);
  if (!validPack(key, parsed)) return null;
  if (replacing && (job.signal.cancelled || !isPackReady(key))) return null;
  const path = filePath(key);
  if (await ReactNativeBlobUtil.fs.exists(path)) await ReactNativeBlobUtil.fs.unlink(path);
  await ReactNativeBlobUtil.fs.mv(tmp, path);
  remember(key, parsed as PackFile);
  return { file: parsed as PackFile, bytes: utf8Length(text) };
}

/**
 * Our copy, straight onto the disk. Null when the release has no such
 * asset or what came is not the pack; throws when the transfer itself
 * failed, so the caller can try the plain request before giving up on us.
 *
 * With `replacing` (see `moveIntoPlace`) nothing is said of a download on
 * the way: the pack is `ready` and stays so.
 */
async function mirrorToDisk(key: PackKey, job: Job, replacing?: string): Promise<Fetched | null> {
  const path = filePath(key);
  const tmp = `${path}.dl`;
  await mkdirDeep(path.slice(0, path.lastIndexOf('/')));
  const task = ReactNativeBlobUtil.config({ path: tmp, timeout: mirrorTimeout(key) }).fetch(
    'GET',
    hadithMirrorUrl(hadithAssetName(key)),
  );
  job.abort = () => {
    void task.cancel?.();
  };
  task.progress?.({ interval: 250 }, (received, total) => {
    const all = Number(total);
    if (all > 0 && !job.signal.cancelled && !replacing) {
      setStatus(key, { state: 'downloading', progress: Math.min(1, Number(received) / all) });
    }
  });
  try {
    const res = await task;
    if (job.signal.cancelled || res.info().status !== 200) return null;
    return await moveIntoPlace(key, job, tmp, replacing);
  } finally {
    job.abort = undefined;
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
  }
}

/** Our copy, by a plain request: where the disk transfer is not to be had. */
async function mirrorByRequest(key: PackKey, job: Job): Promise<Fetched | null> {
  const controller = new AbortController();
  job.abort = () => controller.abort();
  try {
    const res = await fetchWithRetry(
      hadithMirrorUrl(hadithAssetName(key)),
      { signal: controller.signal },
      { maxAttempts: 2, baseDelayMs: 600, timeoutMs: mirrorTimeout(key) },
    );
    if (!res.ok) return null;
    const parsed = await res.json();
    return validPack(key, parsed) ? { file: parsed as PackFile } : null;
  } finally {
    job.abort = undefined;
  }
}

/**
 * A replacement by a plain request, where the transfer onto the disk is
 * not to be had (the emulator's NAT again — and it is not known to be the
 * only network that does it). The text is written beside the pack so the
 * same SHA-256 is asked of it as of a transfer: a pack is JSON we wrote,
 * and its text written back as UTF-8 is the file byte for byte.
 */
async function replacementByRequest(key: PackKey, job: Job, replacing: string): Promise<Fetched | null> {
  const controller = new AbortController();
  job.abort = () => controller.abort();
  const tmp = `${filePath(key)}.dl`;
  try {
    const res = await fetchWithRetry(
      hadithMirrorUrl(hadithAssetName(key)),
      { signal: controller.signal },
      { maxAttempts: 2, baseDelayMs: 600, timeoutMs: mirrorTimeout(key) },
    );
    if (!res.ok || job.signal.cancelled) return null;
    await ReactNativeBlobUtil.fs.writeFile(tmp, await res.text(), 'utf8');
    return await moveIntoPlace(key, job, tmp, replacing);
  } finally {
    job.abort = undefined;
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
  }
}

async function fromMirror(key: PackKey, job: Job): Promise<Fetched | null> {
  if (IS_WEB_APP) return null;
  if (!noDisk) {
    try {
      return await mirrorToDisk(key, job);
    } catch (e) {
      // An emulator's NAT cuts long streamed transfers ("Download
      // interrupted."), and a plain request gets through where it does.
      quiet('hadith/packs', e);
    }
    if (job.signal.cancelled) return null;
  }
  try {
    return await mirrorByRequest(key, job);
  } catch (e) {
    quiet('hadith/packs', e);
    return null;
  }
}

async function keep(key: PackKey, file: PackFile): Promise<number> {
  const json = JSON.stringify(file);
  if (noDisk) {
    webHeld.set(key, file);
    return utf8Length(json);
  }
  const path = filePath(key);
  await mkdirDeep(path.slice(0, path.lastIndexOf('/')));
  // Written aside and moved into place, so a pack is whole or absent.
  await ReactNativeBlobUtil.fs.writeFile(`${path}.part`, json, 'utf8');
  if (await ReactNativeBlobUtil.fs.exists(path)) await ReactNativeBlobUtil.fs.unlink(path);
  await ReactNativeBlobUtil.fs.mv(`${path}.part`, path);
  remember(key, file);
  return utf8Length(json);
}

/** Fetch one pack. Resolves true when it is on the device. */
export function downloadPack(key: PackKey): Promise<boolean> {
  const already = running.get(key);
  if (already) return already.promise;
  stopped.delete(key);
  const signal = { cancelled: false };
  const job: Job = { promise: Promise.resolve(false), signal };
  job.promise = (async () => {
    setStatus(key, { state: 'downloading', progress: 0 });
    try {
      let got = await fromMirror(key, job);
      if (!got && !signal.cancelled) {
        const file = await buildFromOrigin(
          key,
          (done, total) => {
            if (!signal.cancelled) setStatus(key, { state: 'downloading', progress: total > 0 ? done / total : 0 });
          },
          signal,
        );
        got = validPack(key, file) ? { file } : null;
      }
      if (signal.cancelled) {
        setStatus(key, { state: 'absent' });
        return false;
      }
      if (!got) throw new Error('no source answered');
      const bytes = got.bytes ?? (await keep(key, got.file));
      setStatus(key, { state: 'ready', bytes });
      return true;
    } catch (e) {
      quiet('hadith/packs', e);
      setStatus(key, signal.cancelled ? { state: 'absent' } : { state: 'failed' });
      return false;
    } finally {
      running.delete(key);
    }
  })();
  running.set(key, job);
  return job.promise;
}

export type Replaced =
  /** The file here is now the one the manifest names. */
  | 'replaced'
  /** Our copy answered, and what it sent is not that file (or the pack was deleted meanwhile). */
  | 'refused'
  /** The transfer did not finish: worth another try before long. */
  | 'failed';

/**
 * Fetch our copy of a pack that is already here, over it. See the header:
 * our copy only, the file the manifest names only, and the old one stays
 * in place — and readable — until the new one is whole beside it.
 */
export function replacePack(key: PackKey, sha256: string): Promise<Replaced> {
  if (noDisk || !isPackReady(key) || running.has(key)) return Promise.resolve('refused');
  const signal = { cancelled: false };
  const job: Job = { promise: Promise.resolve(false), signal };
  const outcome = (async (): Promise<Replaced> => {
    try {
      let got: Fetched | null;
      try {
        got = await mirrorToDisk(key, job, sha256);
      } catch (e) {
        quiet('hadith/packs', e);
        if (signal.cancelled) return 'refused';
        got = await replacementByRequest(key, job, sha256);
      }
      if (!got || got.bytes == null) return 'refused';
      revision++;
      setStatus(key, { state: 'ready', bytes: got.bytes });
      return 'replaced';
    } catch (e) {
      quiet('hadith/packs', e);
      return signal.cancelled ? 'refused' : 'failed';
    } finally {
      running.delete(key);
    }
  })();
  job.promise = outcome.then(o => o === 'replaced');
  running.set(key, job);
  return outcome;
}

/** Fetch every pack not yet here, one after another. True when all are. */
export async function ensurePacks(keys: readonly PackKey[]): Promise<boolean> {
  // Asking again is the reader changing their mind about an earlier Cancel.
  for (const key of keys) stopped.delete(key);
  await scanPacks();
  let ok = true;
  for (const key of keys) {
    if (isPackReady(key)) continue;
    // Cancelled while an earlier pack of this list was coming down.
    if (stopped.has(key)) {
      ok = false;
      continue;
    }
    if (!(await downloadPack(key))) ok = false;
  }
  return ok;
}

/** Stop a pack: the transfer if it is in flight, its turn if it is waiting for one. */
export function cancelPack(key: PackKey): void {
  stopped.add(key);
  const job = running.get(key);
  if (job) {
    job.signal.cancelled = true;
    job.abort?.();
  }
}

export async function deletePack(key: PackKey): Promise<void> {
  // A replacement on its way would put the file back after it was removed.
  const job = running.get(key);
  if (job) {
    job.signal.cancelled = true;
    job.abort?.();
    await job.promise.catch(() => false);
  }
  memory.delete(key);
  webHeld.delete(key);
  if (!noDisk) {
    try {
      const path = filePath(key);
      if (await ReactNativeBlobUtil.fs.exists(path)) await ReactNativeBlobUtil.fs.unlink(path);
    } catch (e) {
      quiet('hadith/packs', e);
    }
  }
  setStatus(key, { state: 'absent' });
}

// ── The manifest: what each pack weighs, before it is fetched ──────────

let manifest: Promise<Manifest | null> | null = null;

/**
 * Our copy's manifest, once per process — or again when `fresh`, which is
 * the update check asking what we publish NOW. Null offline or in a
 * browser: sizes are then unknown.
 */
export function fetchManifest(fresh = false): Promise<Manifest | null> {
  if (IS_WEB_APP) return Promise.resolve(null);
  if (fresh) manifest = null;
  if (!manifest) {
    manifest = (async () => {
      try {
        const res = await fetchWithRetry(hadithMirrorUrl('manifest.json'), undefined, {
          maxAttempts: 2,
          timeoutMs: 15_000,
        });
        return res.ok ? ((await res.json()) as Manifest) : null;
      } catch {
        manifest = null;
        return null;
      }
    })();
  }
  return manifest;
}

/** What the manifest says of `key`, or null when it does not name it. */
export function manifestEntry(m: Manifest | null, key: PackKey): ManifestEntry | null {
  if (!m) return null;
  const [kind, a, b] = key.split('/');
  if (kind === 'henc') return m.henc?.[a]?.langs?.[b] ?? null;
  if (kind === 'categories') return m.categories?.[a] ?? null;
  if (kind === 'nawawi') return m.nawawi ?? null;
  return m.books?.[a] ?? null;
}

/** What `key` will cost, from the manifest, or null when it does not say. */
export function manifestBytes(m: Manifest | null, key: PackKey): number | null {
  return manifestEntry(m, key)?.bytes ?? null;
}

/** Tests. */
export function _resetPacksForTests(): void {
  statuses = {};
  readyKey = '';
  revision = 0;
  stopped.clear();
  scanned = null;
  memory.clear();
  webHeld.clear();
  running.clear();
  manifest = null;
}
