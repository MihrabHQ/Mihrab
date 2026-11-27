/**
 * Typed wrapper for the MihrabPdf native module: a page of a PDF that is
 * a file on this device, drawn to a picture (the module says why, in
 * MihrabPdfModule.kt and MihrabPdf.mm).
 *
 * `null` from `pdfInfo` and `pdfPage` is "could not": a build without the
 * module (the browser, a test), a file that is not a PDF, a page that
 * would not draw. The reader turns each into a sentence and a way on; it
 * never has a rejection to catch.
 */
import NativeMihrabPdf from './specs/NativeMihrabPdf';
import { nativeModule } from './nativeModule';

export type PdfInfo = { pages: number; width: number; height: number };
export type PdfPage = { uri: string; width: number; height: number };

const native = () => nativeModule(NativeMihrabPdf, 'MihrabPdf');

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Can this build draw a PDF at all? */
export const pdfSupported = (): boolean => native() != null;

export async function pdfInfo(path: string): Promise<PdfInfo | null> {
  const m = native();
  if (!m) return null;
  try {
    const r = (await m.info(path)) as Record<string, unknown>;
    const pages = num(r?.pages);
    const width = num(r?.width);
    const height = num(r?.height);
    return pages && width && height ? { pages: Math.floor(pages), width, height } : null;
  } catch {
    return null;
  }
}

export async function pdfPage(path: string, page: number, width: number): Promise<PdfPage | null> {
  const m = native();
  if (!m) return null;
  try {
    const r = (await m.renderPage(path, page, Math.round(width))) as Record<string, unknown>;
    const w = num(r?.width);
    const h = num(r?.height);
    return typeof r?.uri === 'string' && w && h ? { uri: r.uri, width: w, height: h } : null;
  } catch {
    return null;
  }
}

export async function pdfClearCache(): Promise<void> {
  try {
    await native()?.clearCache();
  } catch {
    // Nothing to do about a cache that would not empty.
  }
}

/**
 * The width a page is drawn at, in pixels: what it is shown at, times the
 * screen's density, on a ladder of a few rungs — so that zooming a little
 * does not draw every page of the book again, and no page is drawn finer
 * than a phone can show or hold.
 */
export function pdfRenderWidth(shownWidth: number, pixelRatio: number, zoom = 1): number {
  const wanted = shownWidth * Math.min(3, Math.max(1, pixelRatio)) * zoom;
  const rungs = [720, 1080, 1440, 2160, 3000];
  return rungs.find(r => r >= wanted * 0.9) ?? rungs[rungs.length - 1];
}
