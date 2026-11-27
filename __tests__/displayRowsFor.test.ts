/**
 * A night mark sits where its hour puts it: after 00:00 above Fajr, in the
 * evening under Isha.
 */
import { DISPLAY_ORDER, displayRowsFor } from '../src/types/prayer';

const DAY = { Fajr: '05:35', Sunrise: '08:01', Dhuhr: '11:40', Asr: '12:52', Maghrib: '15:09', Isha: '17:19' };

describe('displayRowsFor', () => {
  it('Stockholm in November: midnight is tonight, and goes under Isha after the first third', () => {
    const rows = displayRowsFor({ ...DAY, Midnight: '22:23', Lastthird: '00:46', Firstthird: '19:58' });
    expect(rows).toEqual(['Lastthird', 'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Firstthird', 'Midnight']);
  });

  it('both marks after 00:00: the order every card had', () => {
    const t = { ...DAY, Midnight: '00:47', Lastthird: '02:48', Firstthird: '22:10' };
    expect(displayRowsFor(t)).toEqual(DISPLAY_ORDER.filter(k => (t as Record<string, string>)[k]));
  });

  it('both marks in the evening', () => {
    const rows = displayRowsFor({ ...DAY, Fajr: '06:40', Midnight: '21:50', Lastthird: '23:55', Firstthird: '19:40' });
    expect(rows.slice(-4)).toEqual(['Isha', 'Firstthird', 'Midnight', 'Lastthird']);
    expect(rows[0]).toBe('Fajr');
  });

  it('only what the day has, and nothing moved without a Fajr to judge by', () => {
    expect(displayRowsFor(DAY)).toEqual(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    expect(displayRowsFor({ Midnight: '22:23', Isha: '17:19' })).toEqual(['Midnight', 'Isha']);
  });
});
