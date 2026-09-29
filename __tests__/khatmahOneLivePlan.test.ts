/**
 * Two devices, two khatmahs, one reader.
 *
 * Each device started a plan before it had heard of the other's. The merge
 * used to keep both live and every screen showed the one started first,
 * hiding the other and everything read in it. The rule now (Hassan,
 * 2026-09-29): the plan with more reading stays, even if it was started
 * later; with equal reading, the one started last. The other is set
 * aside (`supersededBy`), and the choice is made again from the merged
 * plans on every merge, so devices that saw each other's reading at
 * different times still end up with the same one — never with none.
 */
import {
  __resetQuranStateForTests,
  adoptQuranState,
  coerceQuranState,
  getQuranState,
} from '../src/quran/quranState';
import {
  activeKhatmah,
  ayahsThroughPage,
  isLivePlan,
  oneLivePlan,
} from '../src/quran/khatmahProgress';
import { abandonKhatmah, startKhatmah } from '../src/quran/khatmahActions';
import { mergeKhatmah } from '../src/sync/merge';
import { DEFAULT_RIWAYAH } from '../src/quran/riwayat';
import type { KhatmahPlan } from '../src/quran/quranTypes';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 20, 12, 0, 0, 0).getTime();

/** A plan begun at `startedAt` with its first `pages` pages read. */
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

/** Merged both ways round — they must agree — and the one that stays live. */
const settle = (phone: KhatmahPlan[], mac: KhatmahPlan[]) => {
  const here = mergeKhatmah(phone, mac);
  const there = mergeKhatmah(mac, phone);
  expect(here).toEqual(there);
  const live = here.filter(isLivePlan);
  expect(live).toHaveLength(1);
  return { plans: here, kept: live[0] };
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['performance'] });
  __resetQuranStateForTests();
});
afterEach(() => jest.useRealTimers());

describe('two plans started on two devices', () => {
  it('keep the one with more reading, even when it was started later', () => {
    const phone = plan('phone', NOW - 10 * DAY, 5);
    const mac = plan('mac', NOW - 2 * DAY, 40);
    const { plans, kept } = settle([phone], [mac]);
    expect(kept.id).toBe('mac');
    // The other is set aside behind it — not dropped, and not abandoned.
    const other = plans.find(p => p.id === 'phone')!;
    expect(other.supersededBy).toBe('mac');
    expect(other.abandonedAt).toBeUndefined();
  });

  it('keep the earlier one when it is the one with more reading', () => {
    const phone = plan('phone', NOW - 10 * DAY, 40);
    const mac = plan('mac', NOW - 2 * DAY, 5);
    expect(settle([phone], [mac]).kept.id).toBe('phone');
  });

  it('keep the one started last when neither has more reading', () => {
    const phone = plan('phone', NOW - 10 * DAY, 0);
    const mac = plan('mac', NOW - 2 * DAY, 0);
    expect(settle([phone], [mac]).kept.id).toBe('mac');
    const both = plan('both', NOW - 20 * DAY, 12);
    const later = plan('later', NOW - DAY, 12);
    expect(settle([later], [both]).kept.id).toBe('later');
  });

  it('count reading inside each plan, not the pages a plan began after', () => {
    // Begun at page 300: its first 299 pages were never read in it.
    const skipped = { ...plan('skipped', NOW - 2 * DAY, 299), fromPage: 299 };
    delete (skipped as { done?: unknown }).done;
    const read = plan('read', NOW - 10 * DAY, 20);
    expect(settle([skipped], [read]).kept.id).toBe('read');
  });

  it('and the decision holds when the losing plan arrives again, still live', () => {
    const phone = plan('phone', NOW - 10 * DAY, 5);
    const mac = plan('mac', NOW - 2 * DAY, 40);
    const merged = mergeKhatmah([phone], [mac]);
    // A third device that only ever had the phone's plan.
    const again = settle(merged, [phone]);
    expect(again.kept.id).toBe('mac');
    expect(mergeKhatmah(merged, merged)).toEqual(merged);
  });

  it('leave finished and abandoned plans alone', () => {
    const done = {
      ...plan('done', NOW - 90 * DAY, 604),
      completedAt: NOW - 30 * DAY,
    };
    const gone = {
      ...plan('gone', NOW - 60 * DAY, 100),
      abandonedAt: NOW - 40 * DAY,
    };
    const live = plan('live', NOW - DAY, 3);
    const plans = [done, gone, live];
    expect(oneLivePlan(plans)).toBe(plans);
  });
});

describe('devices that saw each other\'s reading at different times', () => {
  const liveIds = (plans: KhatmahPlan[]) =>
    plans.filter(isLivePlan).map(k => k.id);

  it('never leave both plans set aside', () => {
    // The phone merges an old copy of the Mac's file (Q at 5 pages) and
    // keeps P; the Mac, 15 pages further on in Q, merges the phone's file
    // and keeps Q. Each made its choice from what it could see.
    const P = plan('P', NOW - 5 * DAY, 10);
    const Qold = plan('Q', NOW - 4 * DAY, 5);
    const Qnew = plan('Q', NOW - 4 * DAY, 20);
    const onPhone = mergeKhatmah([P], [Qold]);
    const onMac = mergeKhatmah([Qnew], [P]);
    expect(liveIds(onPhone)).toEqual(['P']);
    expect(liveIds(onMac)).toEqual(['Q']);
    // The next exchange settles on the plan with more reading, both ways.
    expect(liveIds(mergeKhatmah(onPhone, onMac))).toEqual(['Q']);
    expect(liveIds(mergeKhatmah(onMac, onPhone))).toEqual(['Q']);
  });

  it('choose the same plan whatever order the merges came in', () => {
    const P = plan('P', NOW - 5 * DAY, 10);
    const Qold = plan('Q', NOW - 4 * DAY, 5);
    const Qnew = plan('Q', NOW - 4 * DAY, 20);
    const left = mergeKhatmah(mergeKhatmah([P], [Qold]), [Qnew]);
    const right = mergeKhatmah([P], mergeKhatmah([Qold], [Qnew]));
    expect(left).toEqual(right);
    expect(liveIds(left)).toEqual(['Q']);
  });

  it('keep a plan set aside however old both plans are', () => {
    // Past the tombstone limit: an abandonment dated at the starts would
    // have been pruned on the next read and never reached the other device.
    const a = plan('a', NOW - 200 * DAY, 100);
    const b = plan('b', NOW - 120 * DAY, 50);
    const merged = mergeKhatmah([a], [b]);
    const once = coerceQuranState({ version: 1, khatmah: merged });
    const twice = coerceQuranState({ version: 1, khatmah: once.khatmah });
    expect(once.khatmah).toEqual(twice.khatmah);
    expect(twice.khatmah.map(k => k.id)).toEqual(['a', 'b']);
    expect(liveIds(twice.khatmah)).toEqual(['a']);
  });
});

describe('the store', () => {
  it('shows the kept plan after a sync, on the device whose plan lost', () => {
    startKhatmah(30);
    jest.setSystemTime(NOW + 1000);
    const mine = activeKhatmah(getQuranState())!;
    const theirs = plan('mac', NOW - 2 * DAY, 40);
    adoptQuranState({
      ...getQuranState(),
      khatmah: mergeKhatmah(getQuranState().khatmah, [theirs]),
    });
    expect(activeKhatmah(getQuranState())!.id).toBe('mac');
    expect(
      getQuranState().khatmah.find(k => k.id === mine.id)!.supersededBy,
    ).toBe('mac');
  });

  it('reads a stored blob with two live plans the way a sync would leave it', () => {
    const s = coerceQuranState({
      version: 1,
      khatmah: [
        plan('phone', NOW - 10 * DAY, 5),
        plan('mac', NOW - 2 * DAY, 40),
      ],
    });
    expect(s.khatmah.filter(isLivePlan).map(k => k.id)).toEqual(['mac']);
  });

  it('abandons a live plan a new one replaces, so it cannot come back and win', () => {
    // Replaced on this device; the other device still has it, and it has
    // more reading than the new plan ever will on its first day.
    const old = plan('old', NOW - 30 * DAY, 200);
    adoptQuranState({ ...getQuranState(), khatmah: [old] });
    startKhatmah(30);
    const fresh = activeKhatmah(getQuranState())!;
    expect(getQuranState().khatmah.find(k => k.id === 'old')!.abandonedAt).toBe(
      NOW,
    );
    const afterSync = mergeKhatmah(getQuranState().khatmah, [old]);
    expect(afterSync.filter(isLivePlan).map(k => k.id)).toEqual([fresh.id]);
  });

  it('brings a plan set aside back when the kept one is abandoned', () => {
    const merged = mergeKhatmah(
      [plan('phone', NOW - 10 * DAY, 5)],
      [plan('mac', NOW - 2 * DAY, 40)],
    );
    adoptQuranState({ ...getQuranState(), khatmah: merged });
    expect(activeKhatmah(getQuranState())!.id).toBe('mac');
    abandonKhatmah('mac');
    // Its reading was waiting, not lost — and it is live at once, not
    // only after the next sync or restart.
    expect(activeKhatmah(getQuranState())!.id).toBe('phone');
    expect(getQuranState().khatmah.find(k => k.id === 'phone')!.supersededBy)
      .toBeUndefined();
  });

  it('ends a plan set aside, too, when a new one is started', () => {
    const merged = mergeKhatmah(
      [plan('phone', NOW - 10 * DAY, 5)],
      [plan('mac', NOW - 2 * DAY, 40)],
    );
    adoptQuranState({ ...getQuranState(), khatmah: merged });
    startKhatmah(30);
    const fresh = activeKhatmah(getQuranState())!;
    const ended = getQuranState().khatmah.filter(k => k.id !== fresh.id);
    expect(ended.map(k => k.abandonedAt)).toEqual([NOW, NOW]);
    expect(ended.every(k => k.supersededBy === undefined)).toBe(true);
    // And neither comes back from the other device, which still has both.
    const afterSync = mergeKhatmah(getQuranState().khatmah, merged);
    expect(afterSync.filter(isLivePlan).map(k => k.id)).toEqual([fresh.id]);
  });
});
