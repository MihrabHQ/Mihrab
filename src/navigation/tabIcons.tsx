/**
 * Tab-bar icons (design review 2e).
 *
 * Thin wrappers over the app's existing icon set so `MainTabs` can pass
 * them straight to `tabBarIcon` — which hands back `{ color, size }` and
 * expects an element. Defined at module scope, not inline in the navigator's
 * options: an arrow function there is a new component type on every render,
 * which throws away the icon's own state each time the tab bar re-renders.
 *
 */
import {
  HadithBooksIcon,
  MihrabLogoIcon,
  PenIcon,
  QuranBookIcon,
  TasbihIcon,
} from '../theme/icons';
import { desktopSize } from '../responsive/desktop';
import { useTabHoverTint } from './tabBarPress';

type TabIconProps = { color: string; size: number; focused?: boolean };

/**
 * The navigator hands down a size tuned for a touch target. On Mac
 * Catalyst that arrives ~23% smaller than drawn (responsive/desktop.ts),
 * which is what made the bar read as a strip of specks.
 */
const iconSize = (size: number) => desktopSize(size);

/**
 * The wordmark's own logo, not the plain arch. The header says "⌂ Mihrab"
 * with one mark and the tab said "Today" with a different one, so the two
 * places that name the same screen disagreed about what it looks like.
 */
export const TabHomeIcon = ({ color, size, focused }: TabIconProps) => (
  <MihrabLogoIcon color={useTabHoverTint('TodayTab', color, focused ?? false)} size={iconSize(size)} />
);

export const TabBookIcon = ({ color, size, focused }: TabIconProps) => (
  <QuranBookIcon color={useTabHoverTint('QuranTab', color, focused ?? false)} size={iconSize(size)} />
);

export const TabHadithIcon = ({ color, size, focused }: TabIconProps) => (
  <HadithBooksIcon color={useTabHoverTint('HadithTab', color, focused ?? false)} size={iconSize(size)} />
);

/** The beads: the tab opens on the counter, and Duas is a page of it. */
export const TabDhikrIcon = ({ color, size, focused }: TabIconProps) => (
  <TasbihIcon color={useTabHoverTint('DhikrTab', color, focused ?? false)} size={iconSize(size)} />
);

export const TabLogIcon = ({ color, size, focused }: TabIconProps) => (
  <PenIcon color={useTabHoverTint('LogTab', color, focused ?? false)} size={iconSize(size)} />
);
