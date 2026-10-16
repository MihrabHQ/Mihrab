/**
 * Whether this device can draw the tajwīd colours — Ḥafṣ's are inside the
 * page fonts, and not every Android can draw a colour font.
 *
 * The Ḥafṣ colours are the QPC V4 tajwīd fonts' own: COLR v0 layers over a
 * CPAL palette (scripts/mushaf/build_tajweed_assets.py). Android draws those
 * from Android 10 (API 29). Before that it draws each word's plain outline
 * and nothing else, so the switch turned on, 170 MB arrived, and the page
 * stayed in one colour — reported from an Android 9 phone as "tajweed
 * cannot apply". There the switch says so instead, and nothing downloads.
 * (Android 10 to 12 draw the colours but paint the ink layers black; the
 * night page's file is patched for them when it is loaded —
 * TajweedInkPatch.kt.)
 *
 * Warsh's colours are the text's own colour, run by run, which every
 * platform draws; it is unaffected.
 */
import { Platform } from 'react-native';
import { riwayahById, type RiwayahId } from '../riwayat';
import { riwayahHasTajweed } from './rules';

/** The first Android that draws a COLR font's colours. */
export const COLOUR_FONT_MIN_ANDROID_API = 29;

/** Whether this device draws colour fonts at all. */
export const COLOUR_FONTS_DRAWN: boolean = !(
  Platform.OS === 'android' && Number(Platform.Version) < COLOUR_FONT_MIN_ANDROID_API
);

/**
 * Why the colours cannot be shown for this muṣḥaf here, or null when they
 * can: 'riwayah' — this muṣḥaf has none; 'device' — they are in a colour
 * font this Android cannot draw.
 */
export function tajweedUnavailable(
  riwayah: RiwayahId,
  drawn: boolean = COLOUR_FONTS_DRAWN,
): 'riwayah' | 'device' | null {
  if (!riwayahHasTajweed(riwayah)) return 'riwayah';
  if (riwayahById(riwayah).render === 'unicode') return null;
  return drawn ? null : 'device';
}

/**
 * Whether the colours are on the page here: switched on, for a muṣḥaf that
 * has them, on a device that draws them. The switch itself is kept as it
 * was set — it syncs, and the same reader's other phone may draw them —
 * so everything that colours a page asks this, not the switch.
 */
export function tajweedColoursShown(
  riwayah: RiwayahId,
  switchedOn: boolean,
  drawn: boolean = COLOUR_FONTS_DRAWN,
): boolean {
  return switchedOn && tajweedUnavailable(riwayah, drawn) === null;
}
