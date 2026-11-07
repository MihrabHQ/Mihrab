/**
 * The Garmin watch, through Gadgetbridge — garmin/README.md.
 *
 * Android only. The phone hands Gadgetbridge the next days' prayer times
 * for the Mihrab watch face and data field (android/.../GarminWatch.kt);
 * what is kept here is the switch and the watch's Bluetooth address, which
 * the reader copies from Gadgetbridge's device page.
 */
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
