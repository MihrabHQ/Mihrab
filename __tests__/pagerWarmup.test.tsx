/**
 * Minimal's far pages mount one at a time after the first page is up
 * (minimalPager.ts, `pagerWarmth`) — and never under a finger: a step
 * mounts a whole page on the JS thread the swipe needs, so while a turn
 * is under way the warm-up waits and looks again.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  _resetPagerWarmthForTests,
  setPagerEngaged,
  startPagerWarmup,
  usePagerWarmth,
} from '../src/navigation/minimalPager';

let seen = 0;
function Probe() {
  seen = usePagerWarmth();
  return null;
}

describe('the pager warm-up', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _resetPagerWarmthForTests();
    setPagerEngaged(false);
  });
  afterEach(() => {
    _resetPagerWarmthForTests();
    jest.useRealTimers();
  });

  it('steps out a tab at a time once started', () => {
    act(() => {
      create(<Probe />);
    });
    expect(seen).toBe(0);
    act(() => startPagerWarmup());
    act(() => jest.advanceTimersByTime(2500));
    expect(seen).toBe(1);
    act(() => jest.advanceTimersByTime(600));
    expect(seen).toBe(2);
  });

  it('holds still while a finger is turning a page, and goes on after', () => {
    act(() => {
      create(<Probe />);
    });
    act(() => startPagerWarmup());
    act(() => jest.advanceTimersByTime(2500));
    expect(seen).toBe(1);
    act(() => setPagerEngaged(true));
    act(() => jest.advanceTimersByTime(600 * 4));
    expect(seen).toBe(1);
    act(() => setPagerEngaged(false));
    act(() => jest.advanceTimersByTime(600));
    expect(seen).toBe(2);
  });
});
