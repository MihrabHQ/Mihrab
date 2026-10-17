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

it('writes GMT without Intl, which Hermes on iOS may not resolve for Etc/ zones', () => {
  const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
    throw new RangeError('Invalid time zone specified: Etc/GMT');
  });
  try {
    expect(formatInZone(at, 'Etc/GMT')).toBe('05:05');
  } finally {
    spy.mockRestore();
  }
});

it('keeps the phone’s clock for Morocco on a phone in Africa/Casablanca', () => {
  // A phone there with zone data from before 2026 runs its clock at +1 and
  // reads the strings back on it: written on GMT, every alert would come an
  // hour early. Written on its own clock, they come at the right moment.
  const spy = jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({ timeZone: 'Africa/Casablanca' } as Intl.ResolvedDateTimeFormatOptions);
  try {
    const local = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    expect(clockFormatter(MOROCCO_CLOCK)(at)).toBe(local);
  } finally {
    spy.mockRestore();
  }
});
