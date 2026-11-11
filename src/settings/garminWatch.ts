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

/** The watch face's date row: the calendar's date, the Hijri date, or both. */
export type GarminFaceDate = 'gregorian' | 'hijri' | 'both';

export type GarminWatchSettings = {
  enabled: boolean;
  /** `AA:BB:CC:DD:EE:FF`, as Gadgetbridge shows it; empty until typed. */
  address: string;
  /**
   * What the watch shows. The defaults are the face as it was before
   * there was a choice, which is also what a watch app older than the
   * choice goes on showing whatever these say.
   */
  faceDate: GarminFaceDate;
  faceSteps: boolean;
  faceWeather: boolean;
  faceBattery: boolean;
  faceSeconds: boolean;
  /** The data field: a bar from the last prayer to the next. */
  fieldProgress: boolean;
};

export const DEFAULT_GARMIN_WATCH: GarminWatchSettings = {
  enabled: false,
  address: '',
  faceDate: 'gregorian',
  faceSteps: true,
  faceWeather: true,
  faceBattery: true,
  faceSeconds: true,
  fieldProgress: false,
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
    faceDate: raw.faceDate === 'hijri' || raw.faceDate === 'both' ? raw.faceDate : 'gregorian',
    // On unless turned off: a blob from before the choice has none of these.
    faceSteps: raw.faceSteps !== false,
    faceWeather: raw.faceWeather !== false,
    faceBattery: raw.faceBattery !== false,
    faceSeconds: raw.faceSeconds !== false,
    fieldProgress: raw.fieldProgress === true,
  };
}

/**
 * The same choices as the watch reads them: the `OPT_` bits of
 * garmin/shared/source/Mihrab.mc. Set bits take away from, or add to, the
 * face as it was before there was a choice, so the defaults are 0 — what
 * a watch that was never told shows.
 */
export const GARMIN_OPT = {
  noSteps: 1,
  noWeather: 2,
  noSeconds: 4,
  dateShift: 3,
  fieldProgress: 32,
  noBattery: 64,
} as const;

export function garminOptionFlags(watch: GarminWatchSettings): number {
  const date = watch.faceDate === 'hijri' ? 1 : watch.faceDate === 'both' ? 2 : 0;
  return (
    (watch.faceSteps ? 0 : GARMIN_OPT.noSteps) |
    (watch.faceWeather ? 0 : GARMIN_OPT.noWeather) |
    (watch.faceSeconds ? 0 : GARMIN_OPT.noSeconds) |
    (date << GARMIN_OPT.dateShift) |
    (watch.fieldProgress ? GARMIN_OPT.fieldProgress : 0) |
    (watch.faceBattery ? 0 : GARMIN_OPT.noBattery)
  );
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
