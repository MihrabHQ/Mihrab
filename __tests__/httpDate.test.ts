/**
 * The server's time is read off the HTTP `Date` header (clockSkew.ts). The
 * header is RFC 7231's IMF-fixdate and is read by its grammar rather than by
 * `Date.parse`, whose reading of anything but ISO 8601 is each engine's own.
 */
import { parseHttpDate } from '../src/providers/clockSkew';

describe('parseHttpDate', () => {
  it('reads the RFC 7231 example', () => {
    expect(parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT')).toBe(
      Date.UTC(1994, 10, 6, 8, 49, 37),
    );
  });

  it('reads what GitHub sends', () => {
    expect(parseHttpDate('Sat, 17 Oct 2026 18:25:03 GMT')).toBe(
      Date.UTC(2026, 9, 17, 18, 25, 3),
    );
  });

  it('does not go through Date.parse for an IMF-fixdate', () => {
    const spy = jest.spyOn(Date, 'parse');
    try {
      parseHttpDate('Thu, 01 Jan 2026 00:00:00 GMT');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses fields out of range rather than rolling them over', () => {
    expect(parseHttpDate('Tue, 31 Feb 2026 10:00:00 GMT')).toBeNaN();
    expect(parseHttpDate('Tue, 03 Feb 2026 24:00:00 GMT')).toBeNaN();
    expect(parseHttpDate('Tue, 03 Feb 2026 10:61:00 GMT')).toBeNaN();
  });

  it('falls back to Date.parse for the obsolete forms', () => {
    // RFC 850
    expect(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT')).toBe(
      Date.parse('Sunday, 06-Nov-94 08:49:37 GMT'),
    );
    expect(parseHttpDate('not a date')).toBeNaN();
  });
});
