/**
 * The checker that proves the app's methods against the authorities'
 * tables (tools/verify-methods): Singapore's and Malaysia's in this
 * checkout, the computed authorities' in the reference tables
 * (MIHRAB_TABLES; skipped where they are not there).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

jest.unmock('adhan');

import { AUTHORITIES, indonesiaZone } from '../tools/verify-methods/authorities';
import { describe as describeReport, verifyAuthority, type Accepted } from '../tools/verify-methods/verify';

const byId = (id: string) => AUTHORITIES.find(a => a.id === id)!;
const haveTable = (id: string) =>
  fs.existsSync(path.join(byId(id).root ?? path.join(__dirname, '..', 'data', 'prayer-times', byId(id).folder), 'v1', 'index.json'));

describe('verify-methods', () => {
  it('finds Singapore on the ministry’s minute', () => {
    if (!haveTable('muis')) return;
    const r = verifyAuthority(byId('muis'), []);
    expect(r.times).toBeGreaterThan(0);
    expect(r.within / r.times).toBeGreaterThan(0.99);
    expect(r.misplaced).toHaveLength(0);
    expect(r.alarm).toBe(false);
  });

  it('finds Algeria within a minute, the far south’s Asr included', () => {
    if (!haveTable('marw')) return;
    const r = verifyAuthority(byId('marw'), []);
    expect(r.within / r.times).toBeGreaterThan(0.99);
    for (const p of ['Fajr', 'Sunrise', 'Dhuhr', 'Maghrib', 'Isha'] as const) {
      expect(r.perPrayer[p].maxAbs).toBeLessThanOrEqual(1);
    }
    expect(r.perPrayer.Asr.maxAbs).toBeLessThanOrEqual(2);
    expect(r.alarm).toBe(false);
  });

  it('finds Morocco on the minute, hill towns at their height', () => {
    if (!haveTable('habous')) return;
    const r = verifyAuthority(byId('habous'), []);
    expect(r.within / r.times).toBeGreaterThan(0.98);
    expect(r.perPrayer.Dhuhr.maxAbs).toBeLessThanOrEqual(2);
  });

  it('tells a place the authority computes elsewhere from a wrong method', () => {
    if (!haveTable('kemenag')) return;
    // Every regency is at the ministry's own point now, so one is moved a
    // degree east: it is off by a constant four minutes, and says so; the
    // method is not.
    const k = byId('kemenag');
    const moved = { ...k, places: () => k.places().map(p => (p.file === '242.json' ? { ...p, lon: p.lon + 1 } : p)) };
    const r = verifyAuthority(moved, []);
    expect(r.misplaced.length).toBeGreaterThan(0);
    expect(r.alarmReasons.join(' ')).toMatch(/coordinates/);
    expect(r.within / r.times).toBeGreaterThan(0.95);
    // The entries set the whole place aside.
    const accepted: Accepted[] = r.misplaced.map(m => ({ authority: 'kemenag', place: m.place, note: 'test' }));
    const after = verifyAuthority(moved, accepted);
    expect(after.misplaced).toHaveLength(0);
    expect(after.accepted).toBeGreaterThan(0);
  });

  it('sets an accepted difference aside', () => {
    if (!haveTable('jakim')) return;
    const before = verifyAuthority(byId('jakim'), []);
    const worst = before.worst[0];
    if (!worst) return;
    const accepted: Accepted[] = [
      { authority: 'jakim', place: worst.place, prayer: worst.prayer, maxAbs: 20, note: 'test' },
    ];
    const after = verifyAuthority(byId('jakim'), accepted);
    expect(after.accepted).toBeGreaterThan(0);
    expect(after.worst.some(w => w.place === worst.place && w.prayer === worst.prayer)).toBe(false);
    // An entry for another authority changes nothing.
    const other = verifyAuthority(byId('jakim'), [{ ...accepted[0], authority: 'muis' }]);
    expect(other.accepted).toBe(0);
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
