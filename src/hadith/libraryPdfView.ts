/**
 * How a reader likes a PDF's pages, kept on the device: the colour of
 * the paper (for every book: it is about the reader's eyes and the room,
 * not the book) and the zoom each book was left at (a book set in small
 * type is zoomed every time it is opened, otherwise).
 *
 * Conveniences, lost with nothing else: not in the record that backup and
 * sync carry.
 */
import AsyncStorage from '../storage/appStorage';

export const PDF_TONES = ['paper', 'sepia', 'night'] as const;
export type PdfTone = (typeof PDF_TONES)[number];
const TONE_KEY = 'mihrab.library.pdfTone.v1';
const ZOOM_KEY = 'mihrab.library.pdfZoom.v1';

export const nextPdfTone = (t: PdfTone): PdfTone => PDF_TONES[(PDF_TONES.indexOf(t) + 1) % PDF_TONES.length];

export async function pdfTone(): Promise<PdfTone> {
  try {
    const v = await AsyncStorage.getItem(TONE_KEY);
    return (PDF_TONES as readonly string[]).includes(v ?? '') ? (v as PdfTone) : 'paper';
  } catch {
    return 'paper';
  }
}

export async function setPdfTone(t: PdfTone): Promise<void> {
  await AsyncStorage.setItem(TONE_KEY, t).catch(() => undefined);
}

/** A zoom worth keeping: between a page as wide as the screen and four times it. Anything else is no zoom. */
export function validPdfZoom(z: unknown): z is number {
  return typeof z === 'number' && Number.isFinite(z) && z >= 1 && z <= 4;
}

async function zooms(): Promise<Record<string, number>> {
  try {
    const v: unknown = JSON.parse((await AsyncStorage.getItem(ZOOM_KEY)) ?? '{}');
    const out: Record<string, number> = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, z] of Object.entries(v)) if (validPdfZoom(z)) out[k] = z;
    return out;
  } catch {
    return {};
  }
}

/** The zoom a book was left at; 1 where none was kept. */
export async function pdfZoomOf(id: string): Promise<number> {
  return (await zooms())[id] ?? 1;
}

export async function setPdfZoom(id: string, z: number): Promise<void> {
  if (!validPdfZoom(z)) return;
  const all = await zooms();
  const kept = Math.round(z * 20) / 20;
  if (all[id] === kept || (kept === 1 && all[id] == null)) return;
  if (kept === 1) delete all[id];
  else all[id] = kept;
  await AsyncStorage.setItem(ZOOM_KEY, JSON.stringify(all)).catch(() => undefined);
}
