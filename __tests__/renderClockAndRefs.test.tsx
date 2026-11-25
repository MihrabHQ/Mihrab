/**
 * The three small hooks the compiled components lean on
 * (src/hooks/useRenderClock.ts, useLatest.ts, useConst.ts).
 */
import React, { useRef } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { onDayChange, useRenderClock } from '../src/hooks/useRenderClock';
import { useKeepLatest } from '../src/hooks/useLatest';
import { useConst } from '../src/hooks/useConst';

describe('the day turning', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 23, 59, 30));
  });
  afterEach(() => jest.useRealTimers());

  it('tells its listeners just after midnight, once, and again the next night', () => {
    const heard = jest.fn();
    const off = onDayChange(heard);
    jest.advanceTimersByTime(20_000);
    expect(heard).not.toHaveBeenCalled();
    jest.advanceTimersByTime(15_000); // 00:00:05
    expect(heard).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60 * 60_000);
    expect(heard).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(23 * 60 * 60_000 + 10_000);
    expect(heard).toHaveBeenCalledTimes(2);
    off();
  });

  it('and on the return to the foreground, if the day turned while the app was away', () => {
    let onChange: (state: string) => void = () => {};
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      onChange = cb;
      return { remove: jest.fn() };
    }) as never);
    const heard = jest.fn();
    const off = onDayChange(heard);
    onChange('active');
    expect(heard).not.toHaveBeenCalled(); // the same day
    jest.setSystemTime(new Date(2026, 10, 26, 7, 0, 0)); // suspended overnight: no timer ran
    onChange('active');
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    spy.mockRestore();
  });

  it('a component that reads the render clock renders again when the day turns, with the new time', () => {
    const seen: number[] = [];
    function Probe() {
      seen.push(new Date(useRenderClock()).getDate());
      return null;
    }
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Probe />);
    });
    expect(seen).toEqual([25]);
    act(() => {
      jest.advanceTimersByTime(40_000);
    });
    expect(seen[seen.length - 1]).toBe(26);
    act(() => tree!.unmount());
  });
});

describe('a ref kept at the newest value', () => {
  it('holds the value of the render that was committed, by the time anything after it runs', () => {
    const read: number[] = [];
    function Probe({ n }: { n: number }) {
      const latest = useRef(n);
      useKeepLatest(latest, n);
      React.useLayoutEffect(() => {
        read.push(latest.current);
      });
      return null;
    }
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Probe n={1} />);
    });
    act(() => tree!.update(<Probe n={2} />));
    expect(read).toEqual([1, 2]);
  });
});

describe('a value made once', () => {
  it('is made on the first render and never again', () => {
    const make = jest.fn(() => ({}));
    const got: object[] = [];
    function Probe({ n }: { n: number }) {
      got.push(useConst(make));
      return <>{n}</>;
    }
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Probe n={1} />);
    });
    act(() => tree!.update(<Probe n={2} />));
    expect(make).toHaveBeenCalledTimes(1);
    expect(got[0]).toBe(got[1]);
  });
});
