/**
 * The Garmin watch, through Gadgetbridge — garmin/README.md.
 *
 * Android only. The phone hands Gadgetbridge the next days' prayer times
 * for the Mihrab watch face and data field (android/.../GarminWatch.kt);
 * what is kept here is the switch and the watch's Bluetooth address, which
 * the reader copies from Gadgetbridge's device page.
 */
import type { AppAccentId } from './types';
import { legibleAccent } from './accentColors';

export type GarminWatchSettings = {
  enabled: boolean;
  /** `AA:BB:CC:DD:EE:FF`, as Gadgetbridge shows it; empty until typed. */
  address: string;
};

export const DEFAULT_GARMIN_WATCH: GarminWatchSettings = {
  enabled: false,
  address: '',
};

const ADDRESS = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/** Upper case with colons, or null when it is not a Bluetooth address. */
export function normalizeWatchAddress(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/-/g, ':');
  return ADDRESS.test(s) ? s : null;
}

export function coerceGarminWatch(value: unknown): GarminWatchSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GARMIN_WATCH };
  const raw = value as Partial<Record<keyof GarminWatchSettings, unknown>>;
  return {
    enabled: raw.enabled === true,
    address: typeof raw.address === 'string' ? raw.address : '',
  };
}

/**
 * The accent the watch face wears, as the colour its screen shows: a
 * memory-in-pixel screen has 64 colours, each channel one of 00, 55, AA
 * or FF, and dithers any other into a speckle. The presets are matched by
 * eye to their dark-mode swatches; a custom colour is made legible on
 * black and snapped by the phone (GarminWatch.kt).
 */
// tokens-ok: the watch screen's palette, not the app's
export const GARMIN_PRESET_ACCENTS: Record<Exclude<AppAccentId, 'custom'>, string> = {
  green: '#00AA55',
  teal: '#55FFAA',
  blue: '#55AAFF',
  amber: '#FFAA00',
  rose: '#FF55AA',
  violet: '#AAAAFF',
};

export function garminAccentHex(
  accentId: AppAccentId,
  customHex: string,
): string {
  if (accentId === 'custom') return legibleAccent(customHex, '#000000'); // tokens-ok-line: the watch face's black ground
  return GARMIN_PRESET_ACCENTS[accentId] ?? GARMIN_PRESET_ACCENTS.green;
}
