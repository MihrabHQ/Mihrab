/**
 * Checks `criteria.ts` against month starts the two bodies announced.
 * Usage: npx tsx tools/hijri-calendars/calibrate.ts
 */
import { conjunctions, khgtStart, mabimsStart, addDaysYmd, type AltMode } from './criteria';

/**
 * 1 <month> by the Indonesian government: announced in the sidang isbat
 * (Ramadan, Syawal, Zulhijah), or implied by a national holiday fixed in the
 * government's own calendar (SKB) — 1 Muharram; Maulid on 12 Rabiulawal;
 * Isra Mi'raj on 27 Rajab.
 */
export const GOVERNMENT: [string, string][] = [
  ['1445-01', '2023-07-19'], // holiday 1 Muharram, 19 Jul 2023
  ['1445-03', '2023-09-17'], // Maulid 28 Sep 2023
  ['1445-07', '2024-01-13'], // Isra Mi'raj 8 Feb 2024
  ['1446-01', '2024-07-07'], // holiday 1 Muharram, 7 Jul 2024
  ['1446-03', '2024-09-05'], // Maulid 16 Sep 2024
  ['1446-07', '2025-01-01'], // Isra Mi'raj 27 Jan 2025
  ['1447-03', '2025-08-25'], // Maulid 5 Sep 2025
  ['1447-07', '2025-12-21'], // Isra Mi'raj 16 Jan 2026
  ['1448-01', '2026-06-16'], // holiday 1 Muharram, 16 Jun 2026
  ['1448-03', '2026-08-14'], // Maulid 25 Aug 2026
  ['1444-09', '2023-03-23'],
  ['1444-10', '2023-04-22'],
  ['1444-12', '2023-06-20'],
  ['1445-09', '2024-03-12'],
  ['1445-10', '2024-04-10'],
  ['1445-12', '2024-06-08'],
  ['1446-09', '2025-03-01'],
  ['1446-10', '2025-03-31'],
  ['1446-12', '2025-05-28'],
  ['1447-01', '2025-06-27'],
  ['1447-09', '2026-02-19'],
  ['1447-10', '2026-03-21'],
  ['1447-12', '2026-05-18'],
];

/** 1 <month> as published by Muhammadiyah's KHGT. */
export const MUHAMMADIYAH: [string, string][] = [
  ['1447-01', '2025-06-26'],
  ['1447-09', '2026-02-18'],
  ['1447-10', '2026-03-20'],
  ['1447-12', '2026-05-18'],
  ['1448-01', '2026-06-16'],
  ['1448-03', '2026-08-14'],
  ['1448-07', '2026-12-10'],
  ['1448-09', '2027-02-08'],
  ['1448-10', '2027-03-09'],
  ['1448-12', '2027-05-07'],
];

/** The conjunction that precedes a known month start. */
function conjBefore(conj: number[], start: string): number {
  const t = Date.parse(`${start}T00:00:00Z`);
  return conj.filter(c => c < t).pop()!;
}

const conj = conjunctions(Date.parse('2023-02-01T00:00:00Z'), 60);
const which = process.argv[2] ?? 'both';
for (const mode of ['topo', 'geo'] as AltMode[]) {
  if (which === 'both' || which === 'mabims') {
    let ok = 0;
    for (const [m, want] of GOVERNMENT) {
      const got = mabimsStart(conjBefore(conj, addDaysYmd(want, 2)), mode);
      if (got === want) ok++;
      else console.log(`mabims/${mode} ${m}: want ${want} got ${got}`);
    }
    console.log(`MABIMS ${mode}: ${ok}/${GOVERNMENT.length}`);
  }
  if (which === 'both' || which === 'khgt') {
    let ok = 0;
    for (const [m, want] of MUHAMMADIYAH) {
      const got = khgtStart(conjBefore(conj, addDaysYmd(want, 2)), mode);
      if (got === want) ok++;
      else console.log(`khgt/${mode} ${m}: want ${want} got ${got}`);
    }
    console.log(`KHGT ${mode}: ${ok}/${MUHAMMADIYAH.length}`);
  }
}
