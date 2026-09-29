/**
 * The khatmah sync rules, fuzzed the way the store actually writes (review,
 * 2026-09-29): every local write through `keepReadersPlan` and
 * `endSetAside` as `updateQuranState` applies them, every sync pairwise
 * between devices and through the JSON-and-coerce round trip a sealed file
 * takes. Starts, reading, rewinds, abandons and syncs at random on three
 * devices; after each step no device holds two live plans, and after a
 * full gossip every device holds the same plans and the same live one.
 *
 * Seeded, so a failure reproduces.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { mergeKhatmah } from '../src/sync/merge';
import { coerceQuranState } from '../src/quran/quranState';
import {
  ayahsThroughPage,
  endSetAside,
  isLivePlan,
  keepReadersPlan,
  oneLivePlan,
} from '../src/quran/khatmahProgress';
import { DEFAULT_RIWAYAH } from '../src/quran/riwayat';
import type { KhatmahPlan } from '../src/quran/quranTypes';

const NOW = new Date(2026, 8, 20, 12).getTime();
let seed = 11;
const rnd = () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const wire = (ks: KhatmahPlan[]) =>
  coerceQuranState({ version: 1, khatmah: JSON.parse(JSON.stringify(ks)) })
    .khatmah;
const withPages = (k: KhatmahPlan, pages: number): KhatmahPlan => {
  const a = ayahsThroughPage(pages, DEFAULT_RIWAYAH);
  const { done, ...rest } = k;
  return {
    ...rest,
    pagesRead: pages,
    ayahsRead: a,
    ...(a > 0 ? { done: [[1, a] as const] } : {}),
  } as KhatmahPlan;
};
const write = (prev: KhatmahPlan[], next: KhatmahPlan[], t: number) =>
  keepReadersPlan(prev, oneLivePlan(endSetAside(prev, next)), t);
it('three devices, random writes and syncs through the wire: one live plan, and they agree', () => {
  let bad = 0;
  const examples: string[] = [];
  for (let run = 0; run < 3000; run++) {
    let t = NOW;
    let nid = 0;
    const devs: KhatmahPlan[][] = [[], [], []];
    const log: string[] = [];
    for (let step = 0; step < 14; step++) {
      t += 1000 + Math.floor(rnd() * 5000);
      const i = Math.floor(rnd() * 3);
      const d = devs[i];
      const live = d.find(isLivePlan);
      const r = rnd();
      if (r < 0.15 || (!live && r < 0.3)) {
        const id = `p${nid++}`;
        log.push(`${i}:start ${id}`);
        devs[i] = write(
          d,
          [
            ...d.map(k =>
              k.completedAt == null && k.abandonedAt == null
                ? { ...k, abandonedAt: t }
                : k,
            ),
            withPages(
              {
                id,
                startedAt: t,
                targetDays: 30,
                pagesRead: 0,
                completedAt: null,
              },
              0,
            ),
          ],
          t,
        );
      } else if (r < 0.5 && live) {
        const pg = Math.min(604, live.pagesRead + 1 + Math.floor(rnd() * 30));
        log.push(`${i}:read ${live.id}->${pg}`);
        devs[i] = write(
          d,
          d.map(k =>
            k.id === live.id
              ? { ...withPages(k, pg), completedAt: pg >= 604 ? t : null }
              : k,
          ),
          t,
        );
      } else if (r < 0.6 && live) {
        const pg = Math.max(0, live.pagesRead - Math.floor(rnd() * 20));
        log.push(`${i}:rewind ${live.id}->${pg}`);
        devs[i] = write(
          d,
          d.map(k => (k.id === live.id ? withPages(k, pg) : k)),
          t,
        );
      } else if (r < 0.65 && live) {
        log.push(`${i}:abandon ${live.id}`);
        devs[i] = write(
          d,
          d.map(k => (k.id === live.id ? { ...k, abandonedAt: t } : k)),
          t,
        );
      } else {
        const j = Math.floor(rnd() * 3);
        if (j === i) continue;
        log.push(`${i}<-${j}`);
        devs[i] = wire(mergeKhatmah(devs[i], wire(devs[j])));
      }
      if (devs[i].filter(isLivePlan).length > 1) {
        bad++;
        examples.push('multi live ' + log.join(' '));
      }
    }
    // full gossip
    for (let round = 0; round < 3; round++)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          if (i !== j) devs[i] = wire(mergeKhatmah(devs[i], wire(devs[j])));
    const ids = devs.map(d =>
      d
        .filter(isLivePlan)
        .map(k => k.id)
        .join(','),
    );
    const js = devs.map(d =>
      JSON.stringify(
        d.map(k => {
          const { dayStartDate, dayStartAyahsRead, dayStartPagesRead, ...r } =
            k as any;
          return r;
        }),
      ),
    );
    if (new Set(ids).size > 1 || new Set(js).size > 1) {
      bad++;
      if (examples.length < 3)
        examples.push('diverge ' + ids.join('|') + ' :: ' + log.join(' '));
    }
  }
  expect(examples.slice(0, 3)).toEqual([]);
  expect(bad).toBe(0);
});
