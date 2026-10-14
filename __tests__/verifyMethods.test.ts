/**
 * The checker that proves the app's methods against the authorities'
 * tables (tools/verify-methods). Run on the tables in this checkout —
 * the ones the builders fetch and the workflow verifies weekly.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

jest.unmock('adhan');

import { AUTHORITIES, indonesiaZone } from '../tools/verify-methods/authorities';
import { describe as describeReport, verifyAuthority, type Accepted } from '../tools/verify-methods/verify';

const byId = (id: string) => AUTHORITIES.find(a => a.id === id)!;
const haveTable = (id: string) =>
  fs.existsSync(path.join(__dirname, '..', 'data', 'prayer-times', byId(id).folder, 'v1', 'index.json'));

describe('verify-methods', () => {
  it('finds Singapore on the ministry’s minute', () => {
    if (!haveTable('muis')) return;
    const r = verifyAuthority(byId('muis'), []);
    expect(r.times).toBeGreaterThan(0);
    expect(r.within / r.times).toBeGreaterThan(0.99);
    expect(r.misplaced).toHaveLength(0);
    expect(r.alarm).toBe(false);
  });

  it('finds Algeria within a minute, bar the far south’s Asr', () => {
    if (!haveTable('marw')) return;
    const r = verifyAuthority(byId('marw'), []);
    expect(r.within / r.times).toBeGreaterThan(0.99);
    for (const p of ['Fajr', 'Sunrise', 'Dhuhr', 'Maghrib', 'Isha'] as const) {
      expect(r.perPrayer[p].maxAbs).toBeLessThanOrEqual(1);
    }
  });

  it('tells a misplaced town from a wrong method', () => {
    if (!haveTable('habous')) return;
    const r = verifyAuthority(byId('habous'), []);
    // The far south of the ministry's list sits tens of minutes off in
    // every prayer: coordinates. The method itself is on the minute.
    expect(r.misplaced.length).toBeGreaterThan(0);
    expect(Math.abs(r.misplaced[0].median.Dhuhr)).toBeGreaterThanOrEqual(3);
    expect(r.perPrayer.Dhuhr.maxAbs).toBeLessThanOrEqual(2);
    expect(r.alarmReasons.join(' ')).toMatch(/coordinates/);
  });

  it('sets an accepted difference aside', () => {
    if (!haveTable('marw')) return;
    const before = verifyAuthority(byId('marw'), []);
    const worst = before.worst[0];
    if (!worst) return;
    const accepted: Accepted[] = [
      { authority: 'marw', place: worst.place, prayer: worst.prayer, maxAbs: 20, note: 'test' },
    ];
    const after = verifyAuthority(byId('marw'), accepted);
    expect(after.accepted).toBeGreaterThan(0);
    expect(after.worst.some(w => w.place === worst.place && w.prayer === worst.prayer)).toBe(false);
    // An entry for another authority changes nothing.
    const other = verifyAuthority(byId('marw'), [{ ...accepted[0], authority: 'muis' }]);
    expect(other.accepted).toBe(0);
  });

  it('reports only, without a fitted method', () => {
    if (!haveTable('ifis')) return;
    const r = verifyAuthority(byId('ifis'), []);
    expect(r.method).toBe('auto');
    expect(r.alarm).toBe(false);
    expect(r.misplaced).toHaveLength(0);
    expect(describeReport(r)).toMatch(/none fitted yet/);
  });

  it('knows which clock each Indonesian province keeps', () => {
    expect(indonesiaZone('DKI Jakarta')).toBe('Asia/Jakarta');
    expect(indonesiaZone('Kalimantan Barat')).toBe('Asia/Jakarta');
    expect(indonesiaZone('Kalimantan Timur')).toBe('Asia/Makassar');
    expect(indonesiaZone('Bali')).toBe('Asia/Makassar');
    expect(indonesiaZone('Papua')).toBe('Asia/Jayapura');
  });

  it('writes a section the workflow can post', () => {
    if (!haveTable('muis')) return;
    const md = describeReport(verifyAuthority(byId('muis'), []));
    expect(md).toMatch(/^### ✅ Singapore/);
    expect(md).toMatch(/\| Fajr \|/);
  });
});
