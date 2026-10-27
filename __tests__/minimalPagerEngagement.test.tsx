/**
 * Minimal's pager (minimalPager.ts): the position the pages and the dots
 * read, and the engagement they share — who holds it, and how it lets go.
 */
import React from 'react';
import { Animated, I18nManager } from 'react-native';
import { act, create } from 'react-test-renderer';
import {
  _resetPagerEngagementForTests,
  EDGE_GIVE,
  engagePagerFor,
  finishPagerBase,
  pagerBase,
  pagerDragRaw,
  pagerHeldByFinger,
  pagerHold,
  pagerPosition,
  setPagerEngaged,
  settlePagerBase,
  usePagerEngaged,
  usePagerReachAll,
} from '../src/navigation/minimalPager';

const W = 400;
const COUNT = 6;

const valueOf = (node: Animated.AnimatedInterpolation<number>): number =>
  (node as unknown as { __getValue: () => number }).__getValue();

function place(base: number, dragPx: number, hold = 0, rtl = false): number {
  pagerBase.setValue(base);
  pagerDragRaw.setValue(dragPx);
  pagerHold.setValue(hold);
  return valueOf(pagerPosition(W, COUNT, rtl));
}

describe('the position', () => {
  afterEach(() => {
    pagerBase.setValue(0);
    pagerDragRaw.setValue(0);
    pagerHold.setValue(0);
    I18nManager.isRTL = false;
  });

  it('is the settled tab, the drag as a fraction of a page, and the hold, summed', () => {
    expect(place(2, 0)).toBeCloseTo(2);
    // A drag left reveals the page on the right: the next tab.
    expect(place(2, -0.35 * W)).toBeCloseTo(2.35);
    expect(place(2, 0.35 * W)).toBeCloseTo(1.65);
    expect(place(2, 0, 1.5)).toBeCloseTo(3.5);
    // A page at most.
    expect(place(2, -3 * W)).toBeCloseTo(3);
  });

  it('gives only a fraction past either end of the row, whichever tab the drag began on', () => {
    // The same translation that is a page in the middle is the give at the end…
    expect(place(4, -0.35 * W)).toBeCloseTo(4.35);
    expect(place(5, -0.35 * W)).toBeCloseTo(5 + 0.35 * EDGE_GIVE);
    expect(place(0, 0.35 * W)).toBeCloseTo(-0.35 * EDGE_GIVE);
    // …and the number does not depend on which tab is current: the node
    // is built for the row, not for the tab, so a turn rebuilds nothing.
    // Mid-turn — the settled tab sliding 4 → 5 while the drag runs back —
    // the sum runs on from where the finger left it, with no recoil.
    pagerBase.setValue(4.5);
    pagerDragRaw.setValue(-0.175 * W);
    expect(valueOf(pagerPosition(W, COUNT))).toBeCloseTo(4.675);
    pagerBase.setValue(5);
    pagerDragRaw.setValue(0);
    expect(valueOf(pagerPosition(W, COUNT))).toBeCloseTo(5);
  });

  it('is mirrored in a right-to-left language: the next page is on the left', () => {
    expect(place(2, -0.35 * W, 0, true)).toBeCloseTo(1.65);
    expect(place(2, 0.35 * W, 0, true)).toBeCloseTo(2.35);
  });

  it('follows the app’s direction, not the device’s', () => {
    // An Arabic app on an English phone: I18nManager says left to right,
    // the page is mirrored, and the swipe must be too.
    I18nManager.isRTL = false;
    expect(place(2, 0.35 * W, 0, true)).toBeCloseTo(2.35);
  });

  it('can be finished where it was going, for a finger that comes down mid-slide', () => {
    pagerBase.setValue(1);
    settlePagerBase(2);
    finishPagerBase();
    expect(valueOf(pagerBase as unknown as Animated.AnimatedInterpolation<number>)).toBe(2);
  });
});

let engaged = false;
let reach = false;
function Probe() {
  engaged = usePagerEngaged();
  reach = usePagerReachAll();
  return null;
}

describe('the engagement', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _resetPagerEngagementForTests();
    act(() => {
      create(<Probe />);
    });
  });
  afterEach(() => {
    _resetPagerEngagementForTests();
    jest.useRealTimers();
  });

  it('is held while any finger holds it, and let go only when every one has', () => {
    act(() => setPagerEngaged(true));
    expect(engaged).toBe(true);
    expect(pagerHeldByFinger()).toBe(true);
    act(() => setPagerEngaged(true));
    act(() => setPagerEngaged(false));
    // One finger still down.
    expect(engaged).toBe(true);
    act(() => setPagerEngaged(false));
    expect(engaged).toBe(false);
    expect(pagerHeldByFinger()).toBe(false);
    // A release with nothing held is nothing.
    act(() => setPagerEngaged(false));
    expect(engaged).toBe(false);
  });

  it('puts every page in reach for a hold on the dots, not for a swipe', () => {
    act(() => setPagerEngaged(true));
    expect(engaged).toBe(true);
    expect(reach).toBe(false);
    act(() => setPagerEngaged(true, true));
    expect(reach).toBe(true);
    act(() => setPagerEngaged(false, true));
    expect(reach).toBe(false);
    expect(engaged).toBe(true);
    act(() => setPagerEngaged(false));
    expect(engaged).toBe(false);
  });

  it('runs for a while after a change no finger made, and does not take a finger’s hold with it', () => {
    act(() => engagePagerFor(300));
    expect(engaged).toBe(true);
    expect(reach).toBe(true);
    expect(pagerHeldByFinger()).toBe(false);
    act(() => jest.advanceTimersByTime(299));
    expect(engaged).toBe(true);
    act(() => jest.advanceTimersByTime(2));
    expect(engaged).toBe(false);
    expect(reach).toBe(false);
    // A finger down inside the slide's window keeps it past the window.
    act(() => engagePagerFor(300));
    act(() => setPagerEngaged(true));
    act(() => jest.advanceTimersByTime(400));
    expect(engaged).toBe(true);
    expect(reach).toBe(false);
    act(() => setPagerEngaged(false));
    expect(engaged).toBe(false);
  });
});
