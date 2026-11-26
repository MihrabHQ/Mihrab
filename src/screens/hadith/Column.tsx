/**
 * The Hadith screens' column: `CenteredColumn`, with ONE style that holds
 * on a phone and on a wide window alike.
 *
 * `CenteredColumn` takes two — `style` for the full-width wrapper and
 * `innerStyle` for the capped column inside it — and on a phone, where
 * there is no inner column, `innerStyle` is dropped. Every Hadith screen
 * put its padding, its gaps and its row direction in `innerStyle`, so on
 * a phone the reader's six buttons stacked in a column a third of the
 * screen tall and the text ran to both edges of the glass (Pixel 10 Pro,
 * 2026-11-25). Wide windows were right, which is how it passed.
 *
 * Here the style goes to whichever view holds the children: the wrapper
 * on a phone, the capped column on a wide window. `outer` is for what
 * belongs to the full-width band whatever the width (a pinned bar's
 * background and its inset from the status bar).
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { CenteredColumn } from '../../responsive/CenteredColumn';
import { useResponsive } from '../../responsive/breakpoints';

export function Column({
  children,
  style,
  outer,
}: {
  children: ReactNode;
  /** Applied to the view that holds the children, at every width. */
  style?: StyleProp<ViewStyle>;
  /** Applied to the full-width band, at every width. */
  outer?: StyleProp<ViewStyle>;
}) {
  const { bp } = useResponsive();
  return (
    <CenteredColumn style={bp === 'compact' ? [outer, style] : outer} innerStyle={style}>
      {children}
    </CenteredColumn>
  );
}
