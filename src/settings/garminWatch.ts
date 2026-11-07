/**
 * The Garmin watch, through Gadgetbridge — garmin/README.md.
 *
 * Android only. The phone hands Gadgetbridge the next days' prayer times
 * for the Mihrab watch face and data field (android/.../GarminWatch.kt);
 * what is kept here is the switch, the watch's Bluetooth address, which
 * the reader copies from Gadgetbridge's device page, and the face's
 * options.
 */
import type { AppAccentId } from './types';
import { legibleAccent } from './accentColors';

/**
 * What the watch face shows. The defaults are the face as it was before it
 * had options, so a watch on an older app and one on this agree.
 */
export type GarminFaceOptions = {
  /** The small seconds beside the clock. */
  seconds: boolean;
  /** The watch's weather, beside the clock or on the row above it. */
  weather: boolean;
  /** The ring round the edge, filling from the last prayer to the next. */
  ring: boolean;
  /** "05:49:12" by the second, or "5h 49m" as the Minimal page writes it. */
  countdown: 'full' | 'short';
  /** The bar under the clock: the battery in its colour, the accent line, or none. */
  battery: 'charge' | 'accent' | 'off';
  /** The row above the clock: today's steps, the heart rate, or nothing. */
  row: 'steps' | 'heartRate' | 'off';
};

export const DEFAULT_GARMIN_FACE: GarminFaceOptions = {
  seconds: true,
  weather: true,
  ring: true,
  countdown: 'full',
  battery: 'charge',
  row: 'steps',
};

export type GarminWatchSettings = {
  enabled: boolean;
  /** `AA:BB:CC:DD:EE:FF`, as Gadgetbridge shows it; empty until typed. */
  address: string;
  face: GarminFaceOptions;
};

export const DEFAULT_GARMIN_WATCH: GarminWatchSettings = {
  enabled: false,
  address: '',
  face: { ...DEFAULT_GARMIN_FACE },
};

const BATTERY_MODES = ['charge', 'accent', 'off'] as const;
const ROW_MODES = ['steps', 'heartRate', 'off'] as const;

export function coerceGarminFace(value: unknown): GarminFaceOptions {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GARMIN_FACE };
  const raw = value as Partial<Record<keyof GarminFaceOptions, unknown>>;
  return {
    seconds: raw.seconds !== false,
    weather: raw.weather !== false,
    ring: raw.ring !== false,
    countdown: raw.countdown === 'short' ? 'short' : 'full',
    battery: BATTERY_MODES.includes(raw.battery as never)
      ? (raw.battery as GarminFaceOptions['battery'])
      : 'charge',
    row: ROW_MODES.includes(raw.row as never)
      ? (raw.row as GarminFaceOptions['row'])
      : 'steps',
  };
}

/**
 * The options as the watch reads them (garmin/shared/source/Mihrab.mc,
 * `face()`): one byte, sent in the top byte of the accent. 0 is the
 * defaults. Bits: 1 no seconds, 2 no weather, 4 no ring, 8 the short
 * countdown; then the battery bar (bits 4–5) and the row (bits 6–7) as
 * their index.
 */
export function garminFaceBits(face: GarminFaceOptions): number {
  return (
    (face.seconds ? 0 : 1) |
    (face.weather ? 0 : 2) |
    (face.ring ? 0 : 4) |
    (face.countdown === 'short' ? 8 : 0) |
    (BATTERY_MODES.indexOf(face.battery) << 4) |
    (ROW_MODES.indexOf(face.row) << 6)
  );
}

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
    face: coerceGarminFace(raw.face),
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
