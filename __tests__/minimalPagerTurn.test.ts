/**
 * Minimal's swipe: the turn reaches the navigator when its slide has
 * landed, and a second swipe straight after the first is not lost.
 *
 * Both have regressed more than once, each time by "fixing" the other:
 * telling the navigator at the release brought the mid-swipe slowdown
 * back (a tab change lays out and renders on the UI thread under the
 * slide), and telling it late without the rest lost the second swipe
 * (the page coming in still had the navigator's `pointerEvents: 'none'`).
 * The rule and its reasons are in minimalPager.ts, "A SWIPE'S TURN".
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  _resetPagerTurnForTests,
  flushPendingTurn,
  holdPendingTurn,
  isCurrentPagerTurn,
  nextPagerTurn,
  notePagerIndex,
  pagerRowIndex,
} from '../src/navigation/minimalPager';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('a swipe’s turn', () => {
  beforeEach(() => _resetPagerTurnForTests());

  it('is held until its slide lands, then told once', () => {
    const go = jest.fn();
    holdPendingTurn(2, go);
    expect(go).not.toHaveBeenCalled();
    // A finger down mid-slide reads the row as already on the new tab.
    expect(pagerRowIndex(1)).toBe(2);
    flushPendingTurn();
    flushPendingTurn();
    expect(go).toHaveBeenCalledTimes(1);
    // Told, and the navigator not yet re-rendered: still the new tab.
    expect(pagerRowIndex(1)).toBe(2);
    // The bar hears the change and knows it for the swipe's own.
    expect(notePagerIndex(2)).toBe(true);
    expect(pagerRowIndex(2)).toBe(2);
    // A change nobody's swipe made is not taken for one.
    expect(notePagerIndex(3)).toBe(false);
  });

  it('lets a newer turn retire an older one’s callback', () => {
    const first = nextPagerTurn();
    const second = nextPagerTurn();
    expect(isCurrentPagerTurn(first)).toBe(false);
    expect(isCurrentPagerTurn(second)).toBe(true);
  });
});

describe('what keeps it from coming back', () => {
  const swipe = read('src/navigation/MinimalSwipe.tsx');
  const screens = read('src/navigation/MinimalScreens.tsx');

  it('never tells the navigator at the release', () => {
    // The only navigate in the swipe is the held turn's.
    expect(swipe.match(/navigation\.navigate\(/g)).toHaveLength(1);
    expect(swipe).toContain('holdPendingTurn(i + step, () => navigation.navigate(next.name as never));');
    // …told when the slide lands, or when a new finger takes the row over.
    expect(swipe).toMatch(/if \(isCurrentPagerTurn\(mine\)\) \{[\s\S]{0,300}flushPendingTurn\(\);/);
    expect(swipe).toMatch(/finishPagerBase\(\);\s*flushPendingTurn\(\);/);
  });

  it('keeps the turn on the row, not in one page', () => {
    // A finger may come down on the page coming in: its own refs would
    // know nothing of the turn the page going out started.
    expect(swipe).not.toMatch(/const (turn|settling|fingerDown) = useRef/);
    expect(swipe).toContain('const i = pagerRowIndex(live.current.index);');
  });

  it('lets the page coming in take a finger', () => {
    expect(screens).toContain('pointerEvents="box-none"');
    expect(screens).not.toMatch(/pointerEvents=\{pointerEvents\}/);
  });
});
