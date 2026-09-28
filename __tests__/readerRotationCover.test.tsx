/**
 * A rotation must never show two pages.
 *
 * The pager's items are exactly one viewport wide and its scroll offset is
 * a multiple of that width. A rotation changes the width at once and the
 * offset a frame later (`reanchor`, in an effect), so in between a
 * landscape-wide window was showing an offset computed for a portrait-wide
 * item: two pages side by side, sliding into one. Reported as the reader
 * looking fragile, and it is — nothing about a phone muṣḥaf should ever
 * show a spread.
 */
import fs from 'fs';
import path from 'path';
import * as React from 'react';
import { act } from 'react';
import { create } from 'react-test-renderer';
import { Animated } from 'react-native';
import { useRotationFade } from '../src/quran/rotationFade';
import { VEIL_OUT_MS, VEIL_SETTLE_MS } from '../src/quran/fullscreenVeil';

import {
  phoneGeometryFits,
  phonePageGeometry,
  geometryKey,
} from '../src/quran/phonePageGeometry';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const portrait = {
  width: 390,
  height: 844,
  sideInset: 0,
  navPad: 0,
  listH: 720,
};
const landscape = { ...portrait, width: 844, height: 390, listH: 300 };

describe('a geometry knows which window it was computed for', () => {
  it('carries the item width', () => {
    expect(phonePageGeometry(portrait)!.pageWidth).toBe(390);
    expect(phonePageGeometry(landscape)!.pageWidth).toBe(844);
  });

  it('fits the window it came from, and no other', () => {
    const g = phonePageGeometry(portrait);
    expect(phoneGeometryFits(g, 390)).toBe(true);
    expect(phoneGeometryFits(g, 844)).toBe(false);
    expect(phoneGeometryFits(null, 390)).toBe(false);
  });

  // Two windows can want the same text width — landscape caps it at the
  // short side's zoom — so the width has to be part of the identity or a
  // stale geometry could pass for a fresh one.
  it('is part of what makes two geometries different', () => {
    expect(geometryKey(phonePageGeometry(portrait))).not.toBe(
      geometryKey(phonePageGeometry(landscape)),
    );
  });
});

describe('the pager is covered while the two disagree', () => {
  it.each([
    'src/quran/MushafPhoneReader.tsx',
    'src/quran/MushafSpreadReader.tsx',
  ])('%s covers it in the page colour', file => {
    const source = read(file);
    expect(source).toContain('pointerEvents="none"');
    expect(source).toMatch(
      /StyleSheet\.absoluteFill, \{ backgroundColor: pageBg \}/,
    );
  });
});

/**
 * And when they agree again, the page fades back in rather than cutting
 * in — the fullscreen veil's ending, for a rotation (`rotationFade.ts`).
 */

describe('the rotation fade', () => {
  let opacity: Animated.Value | null = null;
  function Probe({ covered }: { covered: boolean }) {
    opacity = useRotationFade(covered);
    return null;
  }
  const value = () => (opacity as unknown as { __getValue(): number }).__getValue();

  let timing: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    opacity = null;
    timing = jest.spyOn(Animated, 'timing');
  });
  afterEach(() => {
    timing.mockRestore();
    jest.useRealTimers();
  });

  it('does not fade the first page in — that is the opening, not a turn', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Probe covered />);
    });
    expect(value()).toBe(0);
    act(() => tree.update(<Probe covered={false} />));
    act(() => jest.advanceTimersByTime(VEIL_SETTLE_MS + VEIL_OUT_MS));
    expect(value()).toBe(0);
    expect(timing).not.toHaveBeenCalled();
  });

  it('is opaque while a later cover is up, and fades once it is not', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Probe covered />);
    });
    act(() => tree.update(<Probe covered={false} />));
    // The phone turns.
    act(() => tree.update(<Probe covered />));
    expect(value()).toBe(1);
    // The geometry fits again: nothing yet — the page gets its frames.
    act(() => tree.update(<Probe covered={false} />));
    act(() => jest.advanceTimersByTime(VEIL_SETTLE_MS - 1));
    expect(timing).not.toHaveBeenCalled();
    expect(value()).toBe(1);
    act(() => jest.advanceTimersByTime(1));
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1]).toMatchObject({
      toValue: 0,
      duration: VEIL_OUT_MS,
      useNativeDriver: true,
    });
  });

  it('covers again at once if the window turns back before the fade', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Probe covered />);
    });
    act(() => tree.update(<Probe covered={false} />));
    act(() => tree.update(<Probe covered />));
    act(() => tree.update(<Probe covered={false} />));
    act(() => tree.update(<Probe covered />));
    act(() => jest.advanceTimersByTime(VEIL_SETTLE_MS * 4));
    expect(timing).not.toHaveBeenCalled();
    expect(value()).toBe(1);
  });

  it.each([
    'src/quran/MushafPhoneReader.tsx',
    'src/quran/MushafSpreadReader.tsx',
  ])('%s draws it over the pager', file => {
    const source = read(file);
    expect(source).toContain('useRotationFade(');
    expect(source).toMatch(
      /StyleSheet\.absoluteFill,\s*\{ backgroundColor: pageBg, opacity: rotationFade \}/,
    );
  });
});
