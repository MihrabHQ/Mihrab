import {
  DEFAULT_GARMIN_WATCH,
  coerceGarminWatch,
  normalizeWatchAddress,
} from '../src/settings/garminWatch';

describe('the Garmin watch setting', () => {
  it('reads a Bluetooth address as Gadgetbridge shows it, or refuses it', () => {
    expect(normalizeWatchAddress('d4:3a:2c:11:22:ff')).toBe('D4:3A:2C:11:22:FF');
    expect(normalizeWatchAddress(' D4-3A-2C-11-22-FF ')).toBe('D4:3A:2C:11:22:FF');
    expect(normalizeWatchAddress('D4:3A:2C:11:22')).toBeNull();
    expect(normalizeWatchAddress('not an address')).toBeNull();
    expect(normalizeWatchAddress('')).toBeNull();
  });

  it('coerces a stored blob to off and empty, never undefined', () => {
    expect(coerceGarminWatch(undefined)).toEqual(DEFAULT_GARMIN_WATCH);
    expect(coerceGarminWatch({ enabled: 'yes', address: 7 })).toEqual({ enabled: false, address: '' });
    expect(coerceGarminWatch({ enabled: true, address: 'D4:3A:2C:11:22:FF' })).toEqual({
      enabled: true,
      address: 'D4:3A:2C:11:22:FF',
    });
  });
});

describe('garminAccentHex', () => {
  const { garminAccentHex, GARMIN_PRESET_ACCENTS } = require('../src/settings/garminWatch');
  const palette = /^#(00|55|AA|FF){3}$/;

  it('gives every preset a colour the watch screen shows as it is', () => {
    for (const hex of Object.values(GARMIN_PRESET_ACCENTS) as string[]) {
      expect(hex).toMatch(palette);
    }
    expect(garminAccentHex('green', '')).toBe('#00AA55');
    expect(garminAccentHex('amber', '')).toBe('#FFAA00');
  });

  it('makes a custom colour legible on black', () => {
    const hex = garminAccentHex('custom', '#101010');
    expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(hex.toLowerCase()).not.toBe('#101010');
  });
});
