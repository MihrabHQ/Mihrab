/**
 * THE KHATMAH, END TO END — what a reader does, through the writers the
 * screens call, on one device and on two that sync.
 *
 * Each journey is a sequence a reader actually walks: start (a length, a
 * date, or from the page they are on), read by turning pages, mark a page
 * done by hand, press "done" for the day and be moved to the next
 * portion, switch the plan between a length and a date, step back, reset,
 * delete it, start again, finish it. After every step: there is exactly
 * one khatmah or none, and it is the one the reader is on.
 */
import {
  __resetQuranStateForTests,
  coerceQuranState,
  getQuranState,
  primeQuranState,
} from '../src/quran/quranState';
import type { QuranState } from '../src/quran/quranTypes';
import {
  activeKhatmah,
  isKhatmahPageDone,
  isLivePlan,
  khatmahCoversPage,
  khatmahReachAyah,
  KHATMAH_TOTAL_AYAHS as TOTAL,
} from '../src/quran/khatmahProgress';
import { khatmahDeadline, planDays } from '../src/quran/khatmahSchedule';
import { khatmahDay, khatmahFinishTarget } from '../src/quran/khatmahStatus';
import {
  abandonKhatmah,
  finishKhatmahPortion,
  recordKhatmahPageTurn,
  resetKhatmahAll,
  setKhatmahDeadline,
  setKhatmahDuration,
  startKhatmah,
  stepKhatmahBack,
  toggleKhatmahPageDone,
} from '../src/quran/khatmahActions';
import { mergeQuran } from '../src/sync/merge';
import { ymdIn } from './fixtures/localDays';

const DAY = 24 * 60 * 60 * 1000;
const START = new Date(2026, 8, 20, 10, 0, 0, 0).getTime();

const plan = () => activeKhatmah(getQuranState());
const livePlans = (s: QuranState = getQuranState()) => s.khatmah.filter(isLivePlan);

/** Turn pages `from` … `to - 1`, half a minute apart, as a reader does. */
function turnPages(from: number, to: number) {
  for (let p = from; p < to; p++) {
    jest.setSystemTime(Date.now() + 30_000);
    recordKhatmahPageTurn(p, p + 1);
  }
}

/** Invariant after every step: at most one live plan, and a stored copy reads the same. */
function checkOne() {
  const s = getQuranState();
  expect(livePlans(s).length).toBeLessThanOrEqual(1);
  const reread = coerceQuranState(JSON.parse(JSON.stringify(s)));
  expect(livePlans(reread).map(k => k.id)).toEqual(livePlans(s).map(k => k.id));
}

beforeEach(() => {
  jest.useFakeTimers({ now: START, doNotFake: ['performance'] });
  __resetQuranStateForTests();
});
afterEach(() => jest.useRealTimers());

describe('one device, a plan by length', () => {
  it('starts, tracks page turns, and moves on to the next portion on "done"', () => {
    startKhatmah(30);
    checkOne();
    const p = plan()!;
    expect(planDays(p)).toBe(30);
    expect(khatmahDeadline(p)).toBeNull();
    const day1 = khatmahDay(p);
    expect(day1.portion.day).toBe(1);
    expect(day1.done).toBe(false);

    // Reading: every page turned counts.
    turnPages(1, 11);
    expect(isKhatmahPageDone(plan()!, 5)).toBe(true);
    expect(khatmahReachAyah(plan()!)).toBeGreaterThan(0);
    expect(khatmahDay(plan()!).done).toBe(false);

    // "Done" finishes today's portion…
    const target = khatmahFinishTarget(plan()!);
    expect(target.day).toBe(1);
    finishKhatmahPortion();
    checkOne();
    expect(khatmahDay(plan()!).done).toBe(true);
    expect(khatmahReachAyah(plan()!)).toBe(target.to);
    // …and the button now means the next one.
    const next = khatmahFinishTarget(plan()!);
    expect(next.day).toBe(2);
    expect(next.from).toBe(target.to + 1);

    // Pressing it again reads day 2 ahead; the plan follows.
    finishKhatmahPortion();
    expect(khatmahReachAyah(plan()!)).toBe(next.to);
    expect(khatmahFinishTarget(plan()!).day).toBe(3);

    // The next morning the day in hand is the next unread portion.
    jest.setSystemTime(START + DAY);
    const tomorrow = khatmahDay(plan()!);
    expect(tomorrow.portion.day).toBe(3);
    expect(tomorrow.done).toBe(false);
  });

  it('marks a page done and not done by hand (the page marker)', () => {
    startKhatmah(30);
    toggleKhatmahPageDone(7);
    expect(isKhatmahPageDone(plan()!, 7)).toBe(true);
    expect(isKhatmahPageDone(plan()!, 6)).toBe(false);
    toggleKhatmahPageDone(7);
    expect(isKhatmahPageDone(plan()!, 7)).toBe(false);
    checkOne();
  });

  it('starts from the page the reader is on (custom start)', () => {
    startKhatmah(10, { page: 300 });
    const p = plan()!;
    // The pages behind the start are not this plan's; page 300 is its first.
    expect(khatmahCoversPage(p, 299)).toBe(false);
    expect(khatmahCoversPage(p, 300)).toBe(true);
    expect(isKhatmahPageDone(p, 300)).toBe(false);
    expect(khatmahDay(p).portion.day).toBe(1);
    // Day 1 begins at page 300, not at the start of the book.
    expect(khatmahDay(p).portion.from).toBe(khatmahReachAyah(p) + 1);
    turnPages(300, 305);
    expect(isKhatmahPageDone(plan()!, 303)).toBe(true);
    checkOne();
  });

  it('steps back after a "done" pressed by mistake, and resets', () => {
    startKhatmah(30);
    finishKhatmahPortion();
    finishKhatmahPortion();
    expect(khatmahFinishTarget(plan()!).day).toBe(3);
    stepKhatmahBack();
    expect(khatmahFinishTarget(plan()!).day).toBe(2);
    resetKhatmahAll();
    expect(khatmahReachAyah(plan()!)).toBe(0);
    expect(khatmahFinishTarget(plan()!).day).toBe(1);
    checkOne();
  });

  it('finishes the whole khatmah, and a new one can be started after', () => {
    startKhatmah(3);
    finishKhatmahPortion();
    finishKhatmahPortion();
    finishKhatmahPortion();
    expect(plan()).toBeUndefined();
    const done = getQuranState().khatmah[0];
    expect(done.completedAt).toBe(Date.now());
    expect(khatmahReachAyah(done)).toBe(TOTAL);
    checkOne();
    jest.setSystemTime(Date.now() + 60_000);
    startKhatmah(30);
    expect(plan()!.id).not.toBe(done.id);
    expect(khatmahReachAyah(plan()!)).toBe(0);
    // The finished one stays, as history, finished.
    expect(getQuranState().khatmah.find(k => k.id === done.id)!.completedAt).toBe(
      done.completedAt,
    );
    checkOne();
  });
});

describe('one device, a plan by date, and switching between the two', () => {
  it('paces a plan to a date and moves on to the next portion on "done"', () => {
    const by = ymdIn(9, START); // ten days including today
    startKhatmah(10, undefined, by);
    const p = plan()!;
    expect(khatmahDeadline(p)).toBe(by);
    const today = khatmahDay(p);
    expect(today.done).toBe(false);
    const first = khatmahFinishTarget(p);
    finishKhatmahPortion();
    expect(khatmahDay(plan()!).done).toBe(true);
    const second = khatmahFinishTarget(plan()!);
    expect(second.from).toBe(first.to + 1);
    finishKhatmahPortion();
    expect(khatmahReachAyah(plan()!)).toBe(second.to);
    // Reading ahead on a date plan shows as extra, today stays today's.
    expect(khatmahDay(plan()!).extra).toBeGreaterThan(0);
    checkOne();
  });

  it('switches a length plan to a date and back, keeping the reading', () => {
    startKhatmah(30);
    turnPages(1, 21);
    const read = khatmahReachAyah(plan()!);
    const id = plan()!.id;

    const by = ymdIn(14, START);
    setKhatmahDeadline(by);
    expect(plan()!.id).toBe(id);
    expect(khatmahDeadline(plan()!)).toBe(by);
    expect(khatmahReachAyah(plan()!)).toBe(read);
    finishKhatmahPortion();
    const afterDate = khatmahReachAyah(plan()!);
    expect(afterDate).toBeGreaterThanOrEqual(read);

    setKhatmahDuration(20);
    expect(plan()!.id).toBe(id);
    expect(khatmahDeadline(plan()!)).toBeNull();
    expect(khatmahReachAyah(plan()!)).toBe(afterDate);
    const before = khatmahFinishTarget(plan()!);
    finishKhatmahPortion();
    expect(khatmahReachAyah(plan()!)).toBeGreaterThanOrEqual(before.to);
    checkOne();
  });
});

describe('one device, deleting and starting again', () => {
  it('deletes the khatmah, and a new one starts clean and stays the only one', () => {
    startKhatmah(30);
    turnPages(1, 41);
    const old = plan()!;
    abandonKhatmah(old.id);
    expect(plan()).toBeUndefined();
    checkOne();

    jest.setSystemTime(Date.now() + 60_000);
    startKhatmah(15);
    const fresh = plan()!;
    expect(fresh.id).not.toBe(old.id);
    expect(khatmahReachAyah(fresh)).toBe(0);
    expect(planDays(fresh)).toBe(15);
    checkOne();

    // The app restarts: the stored blob reads back the same.
    const stored = JSON.parse(JSON.stringify(getQuranState()));
    __resetQuranStateForTests();
    primeQuranState(stored);
    expect(plan()!.id).toBe(fresh.id);
    expect(livePlans()).toHaveLength(1);
  });

  it('starting a new khatmah over a live one replaces it', () => {
    startKhatmah(30);
    turnPages(1, 11);
    const old = plan()!;
    jest.setSystemTime(Date.now() + 60_000);
    startKhatmah(20, undefined, ymdIn(19, Date.now()));
    expect(plan()!.id).not.toBe(old.id);
    expect(getQuranState().khatmah.find(k => k.id === old.id)!.abandonedAt).toBe(
      Date.now(),
    );
    checkOne();
  });
});

describe('two devices', () => {
  const snapshot = (): QuranState => JSON.parse(JSON.stringify(getQuranState()));
  /** Become a device: load its state. */
  const on = (s: QuranState) => primeQuranState(s);
  /** This device merges the peer's file and adopts the result — `applySnapshot`. */
  const syncFrom = (peer: QuranState) =>
    primeQuranState(mergeQuran(getQuranState(), peer));

  it('carry one khatmah through reading, "done", a type change and a delete', () => {
    // Phone starts and reads.
    startKhatmah(30);
    const id = plan()!.id;
    turnPages(1, 11);
    let phone = snapshot();

    // The Mac, empty, syncs: same plan, same reading.
    __resetQuranStateForTests();
    syncFrom(phone);
    expect(plan()!.id).toBe(id);
    expect(isKhatmahPageDone(plan()!, 10)).toBe(true);
    // The Mac presses "done" and switches to a date.
    jest.setSystemTime(Date.now() + 60_000);
    finishKhatmahPortion();
    const reachMac = khatmahReachAyah(plan()!);
    jest.setSystemTime(Date.now() + 60_000);
    setKhatmahDeadline(ymdIn(20, Date.now()));
    let mac = snapshot();

    // The phone syncs: the Mac's reading and the date arrive.
    on(phone);
    syncFrom(mac);
    expect(plan()!.id).toBe(id);
    expect(khatmahReachAyah(plan()!)).toBe(reachMac);
    expect(khatmahDeadline(plan()!)).toBe(ymdIn(20, Date.now()));
    // …and the next "done" on the phone moves past the Mac's.
    const next = khatmahFinishTarget(plan()!);
    expect(next.from).toBeGreaterThan(reachMac);
    finishKhatmahPortion();
    phone = snapshot();

    // Both agree after a round.
    on(mac);
    syncFrom(phone);
    mac = snapshot();
    expect(khatmahReachAyah(plan()!)).toBe(next.to);

    // The phone deletes it; the Mac's copy cannot bring it back.
    on(phone);
    jest.setSystemTime(Date.now() + 60_000);
    abandonKhatmah(id);
    phone = snapshot();
    on(mac);
    syncFrom(phone);
    expect(plan()).toBeUndefined();
    mac = snapshot();
    on(phone);
    syncFrom(mac);
    expect(plan()).toBeUndefined();

    // The Mac starts a new one; the phone takes it, and it is the only one.
    on(mac);
    jest.setSystemTime(Date.now() + 60_000);
    startKhatmah(20);
    const second = plan()!.id;
    mac = snapshot();
    on(phone);
    syncFrom(mac);
    expect(plan()!.id).toBe(second);
    expect(livePlans()).toHaveLength(1);
    checkOne();
  });

  it('two khatmahs started apart become one, and reading goes on in it on both', () => {
    // Phone: 30 days, reads 5 pages. Mac: 20 days, reads 30 pages.
    startKhatmah(30);
    turnPages(1, 6);
    let phone = snapshot();
    __resetQuranStateForTests();
    jest.setSystemTime(Date.now() + 60_000);
    startKhatmah(20);
    const macId = plan()!.id;
    turnPages(1, 31);
    let mac = snapshot();

    on(phone);
    syncFrom(mac);
    expect(plan()!.id).toBe(macId);
    expect(livePlans()).toHaveLength(1);
    // The phone reads on in the kept plan, and the Mac sees it.
    const before = khatmahReachAyah(plan()!);
    turnPages(31, 36);
    expect(khatmahReachAyah(plan()!)).toBeGreaterThan(before);
    finishKhatmahPortion();
    phone = snapshot();
    on(mac);
    syncFrom(phone);
    expect(plan()!.id).toBe(macId);
    expect(khatmahReachAyah(plan()!)).toBe(
      khatmahReachAyah(activeKhatmah(phone)!),
    );
    mac = snapshot();

    // Deleting it on either device leaves none — the phone's own old plan
    // does not surface.
    abandonKhatmah(macId);
    expect(plan()).toBeUndefined();
    mac = snapshot();
    on(phone);
    syncFrom(mac);
    expect(plan()).toBeUndefined();
    checkOne();
  });

  it('when neither has read anything, the one started last is kept', () => {
    startKhatmah(30);
    const phone = snapshot();
    __resetQuranStateForTests();
    jest.setSystemTime(Date.now() + 60_000);
    startKhatmah(10);
    const later = plan()!.id;
    const mac = snapshot();
    on(phone);
    syncFrom(mac);
    expect(plan()!.id).toBe(later);
    on(mac);
    syncFrom(phone);
    expect(plan()!.id).toBe(later);
  });
});
