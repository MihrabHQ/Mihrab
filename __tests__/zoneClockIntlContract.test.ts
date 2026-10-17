/**
 * The "HH:mm" strings a place's clock writes are stored and parsed back —
 * by `extractClock`, by the cache, by the widgets' readers — and every one
 * of those reads Latin digits only. So whatever the phone's language, and
 * whatever the JS engine's Intl does, a time written on a zone's clock is
 * "05:05", never "٠٥:٠٥"; and where Intl cannot answer at all (an engine
 * without it, a zone it does not know) the times fall back to the phone's
 * clock rather than to garbage or a throw.
 *
 * Hermes on Android and iOS formats through the platform's ICU/Foundation,
 * and an Arabic, Urdu or Bengali phone's default numbering system is not
 * Latin; the formatters here name an English locale explicitly so that the
 * phone's default never decides the digits. These tests stand in an engine
 * that DOES follow the phone's numbering wherever it is let to.
 */
import {
  civilInZone,
  instantOnZoneClock,
  zoneOffsetMinutes,
  deviceZone,
} from '../src/utils/zoneClock';
import {
  clockFor,
  formatInZone,
  MOROCCO_CLOCK,
  placeCivilDay,
} from '../src/providers/locationClock';
import {
  combineLocalDateAndTime,
  extractClock,
  formatLocalTime,
  onClock,
} from '../src/utils/prayerTimes';

const RealDTF = Intl.DateTimeFormat;
const at = new Date(Date.UTC(2026, 9, 16, 5, 5)); // 05:05 GMT
const ASCII_HHMM = /^[0-9]{2}:[0-9]{2}$/;

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const toArabicIndic = (s: string) =>
  s.replace(/[0-9]/g, d => ARABIC_INDIC[Number(d)]);

/**
 * Replace Intl.DateTimeFormat with one whose parts go through `digits`
 * whenever `decides(locale, options)` says the phone's numbering applies.
 */
function engine(
  decides: (
    locale: string | string[] | undefined,
    options: Intl.DateTimeFormatOptions | undefined,
  ) => boolean,
): () => void {
  function Fake(
    this: unknown,
    locale?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    const real = new RealDTF(locale, options);
    const native = decides(locale, options);
    const map = (s: string) => (native ? toArabicIndic(s) : s);
    return {
      format: (d?: Date | number) => map(real.format(d)),
      formatToParts: (d?: Date | number) =>
        real.formatToParts(d).map(p => ({ ...p, value: map(p.value) })),
      resolvedOptions: () => real.resolvedOptions(),
    };
  }
  (Intl as { DateTimeFormat: unknown }).DateTimeFormat = Fake;
  return () => {
    (Intl as { DateTimeFormat: unknown }).DateTimeFormat = RealDTF;
  };
}

afterEach(() => {
  (Intl as { DateTimeFormat: unknown }).DateTimeFormat = RealDTF;
});

describe('on an Arabic phone, whose default numbering is not Latin', () => {
  // Native digits wherever the locale is left to the phone, or is not an
  // English one with Latin digits.
  const arabicPhone = (locale: string | string[] | undefined) => {
    const tag = Array.isArray(locale) ? locale[0] : locale;
    return !tag || !/^en(-|$)/.test(tag) || /-u-.*nu-/.test(tag);
  };

  it('writes a place’s times in Latin digits', () => {
    const restore = engine(arabicPhone);
    try {
      for (const zone of [
        'Europe/Stockholm',
        'Asia/Jakarta',
        'Asia/Jayapura',
      ]) {
        const s = formatInZone(at, zone);
        expect(s).toMatch(ASCII_HHMM);
        expect(() => extractClock(s)).not.toThrow();
      }
      expect(formatInZone(at, 'Asia/Jayapura')).toBe('14:05');
    } finally {
      restore();
    }
  });

  it('reads a zone’s civil date and offset as numbers', () => {
    const restore = engine(arabicPhone);
    try {
      expect(civilInZone(at, 'Asia/Jayapura', true)).toEqual({
        y: 2026,
        m: 10,
        d: 16,
        h: 14,
        min: 5,
      });
      expect(zoneOffsetMinutes('Asia/Jayapura', at)).toBe(9 * 60);
      expect(
        instantOnZoneClock('Asia/Jayapura', 2026, 9, 16, 14, 5)?.getTime(),
      ).toBe(at.getTime());
    } finally {
      restore();
    }
  });

  it('rewrites a day onto another clock in Latin digits', () => {
    const restore = engine(arabicPhone);
    try {
      const day = { Fajr: '04:12', Dhuhr: '11:40', Isha: '18:55' };
      const out = onClock(
        day,
        new Date(2026, 9, 16),
        'device',
        'Asia/Jayapura',
      );
      for (const v of Object.values(out)) expect(v).toMatch(ASCII_HHMM);
    } finally {
      restore();
    }
  });
});

describe('an engine that writes native digits whatever it is asked', () => {
  const always = () => true;

  it('falls back to the phone’s clock rather than store "١٤:٠٥"', () => {
    const restore = engine(always);
    try {
      const s = formatInZone(at, 'Asia/Jayapura');
      expect(s).toMatch(ASCII_HHMM);
      expect(s).toBe(formatLocalTime(at));
      // Read back: the zone cannot be read either, so the phone's clock.
      expect(civilInZone(at, 'Asia/Jayapura')).toBeNull();
      expect(zoneOffsetMinutes('Asia/Jayapura', at)).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('an engine without a usable Intl', () => {
  const throwing = () => {
    (Intl as { DateTimeFormat: unknown }).DateTimeFormat = function () {
      throw new RangeError('Intl unavailable');
    };
  };

  it('knows no zone, and says so instead of throwing', () => {
    throwing();
    expect(deviceZone()).toBeUndefined();
    expect(civilInZone(at, 'Europe/Stockholm')).toBeNull();
    expect(zoneOffsetMinutes('Europe/Stockholm', at)).toBeNull();
    expect(
      instantOnZoneClock('Europe/Stockholm', 2026, 9, 16, 7, 5),
    ).toBeNull();
  });

  it('writes and reads on the phone’s clock', () => {
    throwing();
    expect(formatInZone(at, 'Asia/Jakarta')).toBe(formatLocalTime(at));
    const day = new Date(2026, 9, 16);
    const local = new Date(2026, 9, 16, 5, 5);
    expect(
      combineLocalDateAndTime(day, '05:05', 'Asia/Jakarta').getTime(),
    ).toBe(local.getTime());
    expect(placeCivilDay(day, { zone: 'Asia/Jakarta' })).toEqual({
      y: 2026,
      m: 9,
      d: 16,
    });
  });

  it('still writes GMT, which is arithmetic', () => {
    throwing();
    expect(formatInZone(at, 'Etc/GMT')).toBe('05:05');
    expect(civilInZone(at, 'Etc/GMT', true)).toEqual({
      y: 2026,
      m: 10,
      d: 16,
      h: 5,
      min: 5,
    });
    // Morocco away from Morocco: the ministry's GMT, with no zone lookup.
    expect(clockFor(MOROCCO_CLOCK).format(at)).toBe('05:05');
  });
});

it('writes midnight as 00, where an engine gives the hour as 24', () => {
  function Fake(locale?: string, options?: Intl.DateTimeFormatOptions) {
    const real = new RealDTF(locale, options);
    return {
      formatToParts: (d?: Date | number) =>
        real
          .formatToParts(d)
          .map(p =>
            p.type === 'hour' && p.value === '00' ? { ...p, value: '24' } : p,
          ),
      resolvedOptions: () => real.resolvedOptions(),
    };
  }
  (Intl as { DateTimeFormat: unknown }).DateTimeFormat = Fake;
  const midnight = new Date(Date.UTC(2026, 9, 15, 15, 0)); // 00:00 in Jayapura
  expect(formatInZone(midnight, 'Asia/Jayapura')).toBe('00:00');
  expect(civilInZone(midnight, 'Asia/Jayapura', true)?.h).toBe(0);
});
