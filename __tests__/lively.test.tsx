/**
 * The page's small motions are an arrival, not a condition: the stars'
 * twinkle and Minimal's breath run for a while after the screen comes in
 * front, then the page stands still (hooks/useLively). A loop that never
 * ended kept the render thread at half a core all night.
 */
import { readFileSync } from 'fs';
import path from 'path';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { LIVELY_MS, useLively } from '../src/hooks/useLively';

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

let seen: boolean[] = [];
function Probe({ active }: { active: boolean }) {
  seen.push(useLively(active));
  return null;
}

describe('useLively', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    seen = [];
  });
  afterEach(() => jest.useRealTimers());

  it('is true on arrival, false after the window, and true again on the next arrival', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Probe active />);
    });
    expect(seen[seen.length - 1]).toBe(true);
    act(() => {
      jest.advanceTimersByTime(LIVELY_MS - 1);
    });
    expect(seen[seen.length - 1]).toBe(true);
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(seen[seen.length - 1]).toBe(false);
    // Away, then back: the window opens again.
    act(() => tree.update(<Probe active={false} />));
    expect(seen[seen.length - 1]).toBe(false);
    act(() => tree.update(<Probe active />));
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('is never true while not active', () => {
    act(() => {
      create(<Probe active={false} />);
    });
    expect(seen.every(v => v === false)).toBe(true);
  });
});

describe('what the window gates', () => {
  it('the breath and the twinkle', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toContain('const lively = useLively(active && !posed);');
    expect(card).toContain('const breathing = minimal && lively && !reduceMotion && !posed;');
    expect(card).toContain('still={posed || !lively}');
  });

  it('and the hero moves on at the prayer’s own instant, not the watchdog’s half-minute', () => {
    const home = read('src/screens/HomeScreen.tsx');
    expect(home).toContain('const FLIP_AFTER_MS = 300;');
    expect(home).toContain('const delay = next.at.getTime() - Date.now() + FLIP_AFTER_MS;');
    expect(home).toContain('armFlip(next);');
    expect(home).toContain('if (flip) clearTimeout(flip);\n    };');
  });
});
