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
