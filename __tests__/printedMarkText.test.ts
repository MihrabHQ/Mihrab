/**
 * Every printed ayah-end mark is drawn right to left — see
 * `printedMarkText`. Android 10–12's shapers build a numbered medallion
 * with a sign after it only right to left, and the bidi algorithm lays
 * Arabic Numbers out left to right.
 */
import { printedMarkText } from '../src/quran/MushafUnicodePage';

const RLO = '‮';
const PDF = '‬';

describe('printedMarkText', () => {
  it('wraps a medallion with a sign after its number (al-Baqarah 7, 8)', () => {
    expect(printedMarkText('۝٧ࣖ')).toBe(`${RLO}۝٧ࣖ${PDF}`);
    expect(printedMarkText('۝٨ۘ')).toBe(`${RLO}۝٨ۘ${PDF}`);
  });

  it('wraps the plain and the many-digit medallions the same way', () => {
    expect(printedMarkText('۝٥')).toBe(`${RLO}۝٥${PDF}`);
    expect(printedMarkText('۝٢٨٦')).toBe(`${RLO}۝٢٨٦${PDF}`);
  });

  it('wraps the disputed end, digit first (al-Fātiḥah 6)', () => {
    expect(printedMarkText('٦࣢ۙ')).toBe(`${RLO}٦࣢ۙ${PDF}`);
  });

  it('leaves anything else as it is', () => {
    expect(printedMarkText('ۙ')).toBe('ۙ');
  });
});
