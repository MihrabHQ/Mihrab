/**
 * Is there room for a download, before it starts?
 *
 * A reciter is up to 1.4 GB. Without this, a phone short of space found
 * out file by file: hundreds of writes failing, a run that ended "N ayahs
 * still missing" with nothing to say why, and a storage-full warning from
 * the system on top. Asking first turns that into one honest sentence.
 *
 * Best-effort in both directions: a platform that will not say how much is
 * free (`df` failing, or answering nothing usable) lets the download go
 * ahead, because refusing on a guess would be worse than the old way.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * Room the system needs for itself. A download that leaves a phone with
 * zero bytes free has broken the phone, not finished.
 */
export const SPACE_MARGIN_BYTES = 200 * 1024 * 1024;

/** Free bytes where the app keeps its files, or null when unknown. */
export async function freeDiskBytes(): Promise<number | null> {
  try {
    const df = (await ReactNativeBlobUtil.fs.df()) as {
      free?: number | string;
      internal_free?: number | string;
    };
    // iOS answers `free`; Android `internal_free` (the app's documents
    // live on internal storage), as a string.
    const n = Number(df?.free ?? df?.internal_free);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * The device's storage, total and free, or null when it will not say.
 * For the bar on Settings → Downloads.
 */
export async function deviceStorage(): Promise<{ total: number; free: number } | null> {
  try {
    const df = (await ReactNativeBlobUtil.fs.df()) as {
      free?: number | string;
      total?: number | string;
      internal_free?: number | string;
      internal_total?: number | string;
    };
    const free = Number(df?.free ?? df?.internal_free);
    const total = Number(df?.total ?? df?.internal_total);
    if (!Number.isFinite(free) || !Number.isFinite(total) || total <= 0 || free < 0) {
      return null;
    }
    return { total, free: Math.min(free, total) };
  } catch {
    return null;
  }
}

/**
 * How many more bytes are needed than are free, or 0 when it fits (or
 * when nobody can say). `needBytes` is what is still to come — what is
 * already on disk is not asked for again.
 */
export async function spaceShortfall(needBytes: number): Promise<number> {
  if (!(needBytes > 0)) return 0;
  const free = await freeDiskBytes();
  if (free == null) return 0;
  const want = needBytes + SPACE_MARGIN_BYTES;
  return free >= want ? 0 : want - free;
}

/** "1.2 GB", "350 MB" — for the one sentence this produces. */
export function sizeLabel(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}
