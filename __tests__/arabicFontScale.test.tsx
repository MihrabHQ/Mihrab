/**
 * Arabic keeps its leading at every system text size on Android
 * (src/theme/arabicFontScale.ts). A Play review from a Redmi Note 14 Pro
 * on Android 16: the Arabic cut off and run into the shadda. Android 14+
 * scales a font size and a line height through a non-linear `sp`, so the
 * line height, the larger number, fell behind the letters it spaces.
 */
import { ARABIC_FACES, arabicScaledMetrics } from '../src/theme/arabicFontScale';
import { FONTS } from '../src/theme/typography';

const DUA = { fontFamily: 'AmiriQuran', fontSize: 22, lineHeight: 44 };

describe('arabicScaledMetrics', () => {
  it('scales the size and the leading by the same factor, keeping the ratio', () => {
    expect(arabicScaledMetrics(DUA, 1.3)).toEqual({ fontSize: 29, lineHeight: 58 });
    for (const s of [1.15, 1.3, 1.5, 1.8, 2]) {
      const m = arabicScaledMetrics(DUA, s)!;
      expect(m.lineHeight / m.fontSize).toBeCloseTo(2, 1);
    }
  });

  it('leaves the Arabic alone at the default size or smaller, where Android is linear', () => {
    expect(arabicScaledMetrics(DUA, 1)).toBeNull();
    expect(arabicScaledMetrics(DUA, 0.85)).toBeNull();
  });

  it('only for the app’s Arabic faces, with a line height of their own, scaling on', () => {
    expect(arabicScaledMetrics({ ...DUA, fontFamily: 'Roboto' }, 1.3)).toBeNull();
    expect(arabicScaledMetrics({ fontFamily: 'Amiri', fontSize: 22 }, 1.3)).toBeNull();
    expect(arabicScaledMetrics(DUA, 1.3, { allowFontScaling: false })).toBeNull();
    expect(arabicScaledMetrics(undefined, 1.3)).toBeNull();
  });

  it('honours maxFontSizeMultiplier as the cap', () => {
    expect(arabicScaledMetrics(DUA, 2, { maxFontSizeMultiplier: 1.5 })).toEqual({ fontSize: 33, lineHeight: 66 });
  });

  it('knows the faces the app sets Arabic in on Android', () => {
    // FONTS resolves per platform; Android's names are the asset files'.
    expect(ARABIC_FACES.has(FONTS.arabicBody)).toBe(true);
    expect(ARABIC_FACES.has('AmiriQuran')).toBe(true);
  });
});

describe('the Android Text wrapper applies it', () => {
  function render(os: 'android' | 'ios', fontScale: number, props: object) {
    jest.resetModules();
    jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
      __esModule: true,
      default: { OS: os, select: (o: Record<string, unknown>) => o[os] ?? o.default },
    }));
    const RN = require('react-native') as typeof import('react-native');
    jest.spyOn(RN.PixelRatio, 'getFontScale').mockReturnValue(fontScale);
    require('../src/theme/androidUiFont');
    const React = require('react') as typeof import('react');
    const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer');
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(React.createElement(RN.Text, props, 'ٱللَّهُ'));
    });
    const json = tree!.toJSON() as unknown as { props: { style: unknown; allowFontScaling?: boolean } };
    return { flat: RN.StyleSheet.flatten(json.props.style as never) as Record<string, unknown>, json };
  }

  it('draws a du’a line at 1.3× with its leading scaled too, and Android’s scaling off', () => {
    const { flat, json } = render('android', 1.3, { style: DUA });
    expect(flat).toMatchObject({ fontFamily: 'AmiriQuran', fontSize: 29, lineHeight: 58 });
    expect(json.props.allowFontScaling).toBe(false);
  });

  it('changes nothing at the default size, for Latin, or on iOS', () => {
    expect(render('android', 1, { style: DUA }).flat).toMatchObject(DUA);
    expect(render('android', 1.3, { style: { fontSize: 15, lineHeight: 22 } }).flat).toMatchObject({ fontSize: 15, lineHeight: 22 });
    const ios = render('ios', 1.3, { style: DUA });
    expect(ios.flat).toMatchObject(DUA);
    expect(ios.json.props.allowFontScaling).toBeUndefined();
  });
});
