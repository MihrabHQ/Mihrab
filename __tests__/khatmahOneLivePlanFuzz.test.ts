/**
 * One khatmah, whatever order the devices sync in.
 *
 * Up to three plans on three devices, each device holding its own
 * (possibly stale) reading of each, some having merged each other's older
 * state before, and some having finished or abandoned the plan they show.
 * Every order of merging the three must leave the same plan live, never
 * more than one, and a result that settling or merging with itself does
 * not change. The first version of `oneLivePlan` failed the first of those
 * (it stored its choice as an abandonment); a later draft failed it once
 * devices could end their plan.
 */
import { mergeKhatmah } from '../src/sync/merge';
import {
  ayahsThroughPage,
  endSetAside,
  isLivePlan,
  oneLivePlan,
} from '../src/quran/khatmahProgress';
import { DEFAULT_RIWAYAH } from '../src/quran/riwayat';
import type { KhatmahPlan } from '../src/quran/quranTypes';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 20, 12, 0, 0, 0).getTime();

const plan = (id: string, startedAt: number, pages: number): KhatmahPlan => {
  const ayahs = ayahsThroughPage(pages, DEFAULT_RIWAYAH);
  return {
    id,
    startedAt,
    targetDays: 30,
    pagesRead: pages,
    ayahsRead: ayahs,
    completedAt: null,
    ...(ayahs > 0 ? { done: [[1, ayahs] as const] } : {}),
  };
};

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const orders = <T,>(a: T[]): T[][] =>
  a.length <= 1
    ? [a]
    : a.flatMap((x, i) =>
        orders([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]),
      );
const liveIds = (ks: KhatmahPlan[]) => ks.filter(isLivePlan).map(k => k.id);

it('leaves the same one khatmah in every order of merges', () => {
  for (let run = 0; run < 1500; run++) {
    const ids = ['p', 'q', 'r'].slice(0, 2 + Math.floor(rnd() * 2));
    const starts = new Map(ids.map(id => [id, NOW - Math.floor(rnd() * 20) * DAY]));
    const devices = [0, 1, 2].map(() => {
      let s: KhatmahPlan[] = [];
      for (const id of ids) {
        if (rnd() < 0.8) {
          s = mergeKhatmah(s, [plan(id, starts.get(id)!, Math.floor(rnd() * 40))]);
        }
      }
      return s;
    });
    if (rnd() < 0.7) devices[0] = mergeKhatmah(devices[0], devices[1]);
    if (rnd() < 0.5) devices[2] = mergeKhatmah(devices[2], devices[0]);
    devices.forEach((d, i) => {
      const shown = d.find(isLivePlan);
      if (!shown || rnd() >= 0.3) return;
      const next = d.map(k =>
        k.id !== shown.id
          ? k
          : rnd() < 0.5
            ? { ...k, abandonedAt: NOW + i }
            : { ...plan(k.id, k.startedAt, 604), completedAt: NOW + i },
      );
      devices[i] = oneLivePlan(endSetAside(d, next));
    });
    const results = orders(devices).map(o =>
      o.reduce((a, b) => mergeKhatmah(a, b), [] as KhatmahPlan[]),
    );
    for (const r of results) {
      expect(liveIds(r).length).toBeLessThanOrEqual(1);
      expect(liveIds(r)).toEqual(liveIds(results[0]));
      expect(oneLivePlan(r)).toEqual(r);
      expect(mergeKhatmah(r, r)).toEqual(r);
    }
  }
});
