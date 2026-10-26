import { StyleSheet, type ColorValue, type ViewStyle } from 'react-native';
import type { AppPalette } from './appPalette';

/**
 * A surface the page is allowed to show through — the material the floating
 * tab bar is made of, and the band behind the system's navigation buttons on
 * the Android versions that draw no material of their own.
 *
 * ONE DEFINITION FOR BOTH, because they sit directly on top of one another at
 * the bottom of the screen: two independently-chosen alphas there would read
 * as a seam, and the whole point is that the app's chrome and the system's
 * look like one piece.
 *
 * ONLY FOR A PLAIN HEX. Under the system/dynamic themes `palette.card` is a
 * `PlatformColor` — an opaque object with no channels to reach into. Those
 * themes keep the solid surface, which is the right default for them anyway:
 * Material You and Liquid Glass both supply their own material.
 *
 * 0.88 rather than something dramatic: the tab bar carries six labels at
 * 10.5pt and they have to stay readable over whatever scrolls beneath them.
 */
export function translucentSurface(card: ColorValue): ColorValue {
  if (typeof card !== 'string') return card;
  const hex = /^#([0-9a-f]{6})$/i.exec(card);
  if (!hex) return card;
  const a = Math.round(0.88 * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${hex[1]}${a}`;
}

type ChromePalette = Pick<
  AppPalette,
  'flatChrome' | 'border' | 'accent' | 'accentBg'
> &
  Partial<Pick<AppPalette, 'isDark'>>;

/**
 * Card / boxed regions: a hairline, or nothing under flat dynamic chrome.
 *
 * The light theme used to pair a 1 px border with a soft shadow, so cards
 * read as lifted paper. Lifted paper is a surface with an edge and a
 * shadow and a fill — three things saying "card" — on pages that are
 * mostly cards. A hairline says it once; the surface's own tint does the
 * rest, in both polarities. `CARD_SHADOW` stays for the one thing that is
 * meant to float (the tab bar's pill, where it is on).
 */
export function cardEdgeStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderWidth: 0, borderColor: 'transparent' };
  }
  return { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border };
}

/** Segmented control cells: outline, or fill-only when flat. */
export function segmentChromeStyle(
  palette: ChromePalette,
  selected: boolean,
): ViewStyle {
  if (palette.flatChrome) {
    return {
      borderWidth: 0,
      borderColor: 'transparent',
      backgroundColor: selected ? palette.accentBg : 'transparent',
    };
  }
  return {
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? palette.accent : palette.border,
  };
}

/** Text fields: drop outline in flat chrome; rely on fill vs card. */
export function inputChromeStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderWidth: 0, borderColor: 'transparent' };
  }
  return { borderWidth: 1, borderColor: palette.border };
}

export function rowDividerStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderBottomWidth: 0, borderBottomColor: 'transparent' };
  }
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  };
}

/** Small banners (e.g. “applied”) — no outline in flat chrome. */
export function bannerEdgeStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderWidth: 0, borderColor: 'transparent' };
  }
  return { borderWidth: 1, borderColor: palette.accent };
}

/** Optional bottom rule between list rows (last row often cleared by caller). */
export function listRowBottomBorder(
  palette: ChromePalette,
  isLast: boolean,
): ViewStyle {
  if (isLast || palette.flatChrome) {
    return { borderBottomWidth: 0, borderBottomColor: 'transparent' };
  }
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  };
}
