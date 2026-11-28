/**
 * Where a Library book that is a file came from: the publisher's own
 * address for it, and the book's pack as our copy has it.
 *
 * Our copy (the `data-hadith-v1` release) is asked first, always. This is
 * for when it cannot be reached: the pack is the one written here, and
 * the file is fetched from the publisher and kept only when it is the
 * same file byte for byte — the SHA-256 in that pack, which is the one
 * our copy was published with. Written by `scripts/library/pdf-origins.js`.
 */
import ORIGINS from './libraryPdfOrigins.json';
import type { LibraryFile, ManifestEntry } from './packTypes';

type Origin = { url: string; pack: LibraryFile };
const BY_ID = ORIGINS as unknown as Record<string, Origin>;

export function libraryPdfOrigin(id: string): Origin | null {
  return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null;
}

/** What a manifest would say of the book, where no manifest could be had. */
export function libraryPdfOriginEntry(id: string): ManifestEntry | null {
  const o = libraryPdfOrigin(id);
  if (!o?.pack.pdf) return null;
  return { bytes: JSON.stringify(o.pack).length, count: 0, retrieved: o.pack.asOf, pdf: o.pack.pdf };
}
