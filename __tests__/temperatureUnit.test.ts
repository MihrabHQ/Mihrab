import { usesFahrenheitAt } from '../src/utils/temperatureUnit';

describe('usesFahrenheitAt', () => {
  it.each([
    ['Stockholm', 59.3293, 18.0686, false],
    ['New York', 40.7128, -74.006, true],
    ['Miami Beach', 25.7907, -80.13, true],
    ['Honolulu', 21.3069, -157.8583, true],
    ['Anchorage', 61.2181, -149.9003, true],
    ['San Juan', 18.4655, -66.1057, true],
    ['Monrovia', 6.3156, -10.8074, true],
    ['Nassau', 25.0443, -77.3504, true],
    ['Belize City', 17.5046, -88.1962, true],
    ['Detroit', 42.3314, -83.0458, true],
    ['Windsor', 42.3149, -83.0364, false],
    ['San Diego', 32.7157, -117.1611, true],
    ['Tijuana', 32.5149, -117.0382, false],
    ['Toronto', 43.6532, -79.3832, false],
    ['Havana', 23.1136, -82.3666, false],
    ['Freetown', 8.4657, -13.2317, false],
    ['Mecca', 21.3891, 39.8579, false],
    ['London', 51.5072, -0.1276, false],
  ])('%s', (_name, lat, lon, expected) => {
    expect(usesFahrenheitAt(lat, lon)).toBe(expected);
  });

  it('is Celsius for no place', () => {
    expect(usesFahrenheitAt(NaN, 0)).toBe(false);
  });
});
