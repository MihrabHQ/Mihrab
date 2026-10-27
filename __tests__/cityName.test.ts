import { cityOf } from '../src/settings/cityName';

describe('the city alone, out of a place’s full name', () => {
  it('keeps the first part of a search name', () => {
    expect(cityOf('Rinkeby, Stockholm, Stockholms län, Sweden')).toBe('Rinkeby');
    expect(cityOf('Stockholm, Sweden')).toBe('Stockholm');
    expect(cityOf('مكة المكرمة، السعودية')).toBe('مكة المكرمة');
  });
  it('leaves a plain name and a pair of coordinates whole', () => {
    expect(cityOf('Stockholm')).toBe('Stockholm');
    expect(cityOf('  Makkah ')).toBe('Makkah');
    expect(cityOf('59.33°, 18.07°')).toBe('59.33°, 18.07°');
    expect(cityOf('')).toBe('');
  });
  it('is what the minimal Today says', () => {
    const home = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'), 'utf8');
    expect(home).toContain("[cityOf(locationLabel), getHijriDate(0)]");
    expect(home).toContain('placeLabel={minimal && locationLabel ? cityOf(locationLabel) : undefined}');
  });
});
