/**
 * Minimal's pager without a finger on the page: a tap on a dot slides the
 * row first and tells the navigator when it lands, as a swipe does — the
 * stutter of a tap on the page beside the one on show was the navigator's
 * render, and every page laid out, under the slide (minimalPager.ts,
 * `turnPagerTo`). And a swipe's release leaves at the finger's speed.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  _resetPagerEngagementForTests,
  _resetPagerTurnForTests,
  pagerBase,
  pagerRowIndex,
  RELEASE_MAX_MS,
  RELEASE_MIN_MS,
  releaseDuration,
  turnPagerTo,
  usePagerReachAll,
} from '../src/navigation/minimalPager';

let reach = false;
function Probe() {
  reach = usePagerReachAll();
  return null;
}

describe('a tap on a dot', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _resetPagerEngagementForTests();
    _resetPagerTurnForTests();
    pagerBase.setValue(0);
    act(() => {
      create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    _resetPagerEngagementForTests();
    _resetPagerTurnForTests();
    jest.useRealTimers();
  });

  it('beside the page on show lays nothing out and tells the navigator when the slide lands', () => {
    const go = jest.fn();
    act(() => turnPagerTo(1, 0, go));
    expect(go).not.toHaveBeenCalled();
    expect(reach).toBe(false);
    // The row counts the turn as made: a second tap on it starts nothing.
    expect(pagerRowIndex(0)).toBe(1);
    act(() => jest.advanceTimersByTime(1000));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('further along lays out the pages between before the row moves', () => {
    const go = jest.fn();
    act(() => turnPagerTo(4, 0, go));
    expect(reach).toBe(true);
    expect(go).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1000));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('tapped again on another dot mid-slide, tells only the last', () => {
    const first = jest.fn();
    const second = jest.fn();
    act(() => turnPagerTo(1, 0, first));
    act(() => turnPagerTo(2, pagerRowIndex(0), second));
    act(() => jest.advanceTimersByTime(1000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('a swipe released', () => {
  it('leaves at the finger’s speed, within bounds', () => {
    // 280 points left at 3000 pt/s: the curve's start (3× its average) matches.
    expect(releaseDuration(280, 3000)).toBe(280);
    expect(releaseDuration(280, -3000)).toBe(280);
    // A flick is not a jump; a slow release does not crawl.
    expect(releaseDuration(100, 20000)).toBe(RELEASE_MIN_MS);
    expect(releaseDuration(300, 100)).toBe(RELEASE_MAX_MS);
    expect(releaseDuration(300, 0)).toBe(RELEASE_MAX_MS);
  });
});
