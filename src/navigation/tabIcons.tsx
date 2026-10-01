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
  DuaHandsIcon,
  MihrabLogoIcon,
  PenIcon,
  QuranBookIcon,
  SettingsGearIcon,
  TasbihIcon,
} from '../theme/icons';
import { desktopSize } from '../responsive/desktop';
import { useRef, type ReactNode } from 'react';
import { View, type HostInstance } from 'react-native';
import { registerIconBand } from './tabBarPress';

type TabIconProps = { color: string; size: number };

/**
 * The navigator hands down a size tuned for a touch target. On Mac
 * Catalyst that arrives ~23% smaller than drawn (responsive/desktop.ts),
 * which is what made the bar read as a strip of specks.
 */
const iconSize = (size: number) => desktopSize(size);

/**
 * Tells the tab bar's pill where the icons sit (`registerIconBand`), so it
 * centres on the glyph rather than on the tab's box, label and all.
 */
function IconAnchor({ children }: { children: ReactNode }) {
  const ref = useRef<HostInstance>(null);
  return (
    <View
      ref={ref}
      onLayout={() =>
        ref.current?.measureInWindow((_x, y, _w, height) => registerIconBand(y, height))
      }>
      {children}
    </View>
  );
}

/**
 * The wordmark's own logo, not the plain arch. The header says "⌂ Mihrab"
 * with one mark and the tab said "Today" with a different one, so the two
 * places that name the same screen disagreed about what it looks like.
 */
export const TabHomeIcon = ({ color, size }: TabIconProps) => (
  <IconAnchor>
    <MihrabLogoIcon color={color} size={iconSize(size)} />
  </IconAnchor>
);

export const TabBookIcon = ({ color, size }: TabIconProps) => (
  <IconAnchor>
    <QuranBookIcon color={color} size={iconSize(size)} />
  </IconAnchor>
);

export const TabTasbihIcon = ({ color, size }: TabIconProps) => (
  <IconAnchor>
    <TasbihIcon color={color} size={iconSize(size)} />
  </IconAnchor>
);

export const TabDuasIcon = ({ color, size }: TabIconProps) => (
  <IconAnchor>
    <DuaHandsIcon color={color} size={iconSize(size)} />
  </IconAnchor>
);

export const TabLogIcon = ({ color, size }: TabIconProps) => (
  <IconAnchor>
    <PenIcon color={color} size={iconSize(size)} />
  </IconAnchor>
);

/**
 * The same cog the Home header used to carry. The tab previously drew a
 * ring with eight radial ticks, which at 22pt reads as a sun or a
 * brightness control before it reads as settings — and it no longer had a
 * gear anywhere else in the app to be consistent with.
 *
 * Stroke 1.8 rather than the icon's own 2: the tab bar sets these smaller
 * than the header chip did, and a 2pt stroke fills the cog's teeth in.
 */
export const TabSettingsIcon = ({ color, size }: TabIconProps) => (
  <IconAnchor>
    <SettingsGearIcon color={color} size={iconSize(size)} strokeWidth={1.8} />
  </IconAnchor>
);
