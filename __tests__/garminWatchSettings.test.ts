import {
  DEFAULT_GARMIN_FACE,
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
    expect(coerceGarminWatch({ enabled: 'yes', address: 7 })).toEqual({
      enabled: false,
      address: '',
      face: DEFAULT_GARMIN_FACE,
    });
    expect(coerceGarminWatch({ enabled: true, address: 'D4:3A:2C:11:22:FF' })).toEqual({
      enabled: true,
      address: 'D4:3A:2C:11:22:FF',
      face: DEFAULT_GARMIN_FACE,
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

describe('the watch face options', () => {
  const {
    coerceGarminFace,
    garminFaceBits,
  } = require('../src/settings/garminWatch');

  it('are the face as it was, 0 to the watch, until changed', () => {
    expect(coerceGarminFace(undefined)).toEqual(DEFAULT_GARMIN_FACE);
    expect(garminFaceBits(DEFAULT_GARMIN_FACE)).toBe(0);
    // A setting stored before there were options keeps the face as it was.
    expect(coerceGarminWatch({ enabled: true, address: '' }).face).toEqual(DEFAULT_GARMIN_FACE);
  });

  it('coerce junk to the defaults, one field at a time', () => {
    expect(coerceGarminFace({ seconds: false, battery: 'neon', row: 'heartRate', countdown: 'x' })).toEqual({
      ...DEFAULT_GARMIN_FACE,
      seconds: false,
      row: 'heartRate',
    });
  });

  // garmin/shared/source/MihrabTests.mc reads the same byte back.
  it('pack into the byte the watch reads', () => {
    const bits = garminFaceBits({
      seconds: false,
      weather: true,
      ring: false,
      countdown: 'short',
      battery: 'accent',
      row: 'off',
    });
    expect(bits).toBe(0x9d);
    expect(garminFaceBits({ ...DEFAULT_GARMIN_FACE, weather: false })).toBe(2);
    expect(garminFaceBits({ ...DEFAULT_GARMIN_FACE, battery: 'off' })).toBe(0x20);
    expect(garminFaceBits({ ...DEFAULT_GARMIN_FACE, row: 'heartRate' })).toBe(0x40);
    expect(bits).toBeLessThan(256);
  });
});
