/**
 * A place's times are written on its own clock, as its authority's table
 * prints them — also when the phone is in another zone (a saved Rabat on a
 * phone in Stockholm reads the ministry's 05:05, not 07:05).
 */
import { clockFormatter, formatInZone, MOROCCO_CLOCK } from '../src/providers/locationClock';

const at = new Date(Date.UTC(2026, 9, 16, 5, 5)); // 05:05 GMT

it('writes an instant on a zone’s clock', () => {
  expect(formatInZone(at, 'Etc/GMT')).toBe('05:05');
  expect(formatInZone(at, 'Europe/Stockholm')).toBe('07:05');
  expect(formatInZone(at, 'Asia/Jayapura')).toBe('14:05');
});

it('writes Morocco’s on the ministry’s GMT when the phone is elsewhere', () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone === 'Africa/Casablanca') return;
  expect(clockFormatter(MOROCCO_CLOCK)(at)).toBe('05:05');
});

it('writes on the phone’s clock when no place clock is given', () => {
  const local = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  expect(clockFormatter(undefined)(at)).toBe(local);
});
