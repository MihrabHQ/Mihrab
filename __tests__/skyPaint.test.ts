/**
 * The sky's native gradients (skyPaint.ts) must be read by React Native's
 * own parser the way they are meant: a halo is a CIRCLE of the given
 * radius AT the body, not an ellipse filling the view from its middle —
 * which is what an unparsed or half-parsed string silently falls back to.
 */
// React Native's own parser for `backgroundImage`, untyped in its package.
const processBackgroundImage: (s: string) => unknown = require('react-native/Libraries/StyleSheet/processBackgroundImage').default;
import { linearDown, radialGlow, withAlpha } from '../src/screens/home/skyPaint';

describe('skyPaint', () => {
  it('writes a colour at an alpha', () => {
    expect(withAlpha('#FAF7F2', 0)).toBe('rgba(250, 247, 242, 0)');
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });

  it('is a linear gradient React Native reads, top to bottom, every stop where it was put', () => {
    const out = processBackgroundImage(linearDown([['#000000', 0], ['#112233', 0.42], ['#ffffff', 1]])) as any[];
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('linear-gradient');
    expect(out[0].colorStops).toHaveLength(3);
  });

  it('never asks the parser for a size and a place together, which it misreads', () => {
    // RN 0.87 reads `circle 140px at 312px 88px` as a circle the size of
    // the place's numbers, at the view's middle: the halo in the middle of
    // the screen. Pinned here so the day the parser is fixed is noticed.
    const broken = processBackgroundImage('radial-gradient(circle 140px at 312px 88px, red 0%, blue 100%)') as any[];
    expect(broken[0].position).toEqual({ top: '50%', left: '50%' });
    // What the sky asks for instead: a square view at the body, filled.
    const s = radialGlow('#FFEECC', 0.6);
    expect(s).toMatch(/^radial-gradient\(circle closest-side at 50% 50%, /);
    const out = processBackgroundImage(s) as any[];
    expect(out[0]).toMatchObject({ type: 'radial-gradient', shape: 'circle', size: 'closest-side', position: { top: '50%', left: '50%' } });
  });

  it('fills a square view with the run’s halo', () => {
    const out = processBackgroundImage(radialGlow('#FFEECC', 1)) as any[];
    expect(out[0].type).toBe('radial-gradient');
    expect(out[0].shape).toBe('circle');
  });
});
