/**
 * namazvakti.com's years in the mirror's compact form (`namazvaktiPack.ts`):
 * what is packed comes back as the site wrote it, every kept column, held
 * nights and all.
 */
import fs from 'fs';
import path from 'path';
import { packYear, unpackYear, PACK_COLUMNS } from '../src/providers/namazvaktiPack';
import { clockOf, parseNamazvaktiXml, timingsFromRow } from '../src/providers/namazvaktiParser';

const FIX = path.join(__dirname, 'fixtures/namazvakti');
const YEARS = ['cologne-5887.xml', 'istanbul-16741.xml', 'stockholm-16258.xml'].map(f =>
  parseNamazvaktiXml(fs.readFileSync(path.join(FIX, f), 'utf8'), 2026, '2026-10-14T00:00:00.000Z'),
);

describe('the mirror’s form of a year', () => {
  it.each(YEARS.map(y => [y.cityId, y] as const))('gives city %s back as the site wrote it', (_id, year) => {
    const back = unpackYear(packYear(year), year.cityId, year.city);
    expect(Object.keys(back.days).sort()).toEqual(Object.keys(year.days).sort());
    for (const [date, row] of Object.entries(year.days)) {
      for (const col of PACK_COLUMNS) {
        expect(clockOf(back.days[date][col])).toBe(clockOf(row[col]));
        expect(back.days[date][col].startsWith('*')).toBe(row[col].trim().startsWith('*'));
      }
      expect(timingsFromRow(back.days[date], 0)).toEqual(timingsFromRow(row, 0));
      expect(timingsFromRow(back.days[date], 1)).toEqual(timingsFromRow(row, 1));
    }
    expect(back.year).toBe(year.year);
    expect(back.cityId).toBe(year.cityId);
  });

  it('is small: under five kilobytes a city before compression', () => {
    for (const year of YEARS) expect(JSON.stringify(packYear(year)).length).toBeLessThan(5000);
  });

  it('keeps Stockholm’s held summer nights as held', () => {
    const sthlm = YEARS[2];
    const held = Object.values(sthlm.days).filter(r => r[0].startsWith('*')).length;
    expect(held).toBeGreaterThan(50);
    const back = unpackYear(packYear(sthlm), sthlm.cityId);
    expect(Object.values(back.days).filter(r => r[0].startsWith('*')).length).toBe(held);
  });
});
