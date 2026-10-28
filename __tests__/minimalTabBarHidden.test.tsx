/**
 * Minimal's bar, hidden under a pushed screen.
 *
 * The tab icons call hooks (`useTabHoverTint`). The bar used to call each
 * icon as a plain function, which made those hooks the bar's own — and a
 * pushed screen (a dua, opened from the Duas tab) hides the bar, which
 * returns before drawing the dots, so the bar rendered fewer hooks than
 * the time before and the app closed: "Rendered fewer hooks than expected".
 */
import React, { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MinimalTabBar } from '../src/navigation/MinimalTabBar';
import { hideTabBar, resetTabBarVisibility, showTabBar } from '../src/navigation/tabBarVisibility';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({ isDark: false, palette: { bg: '#ffffff', textSolid: '#000000' } }),
}));

jest.mock('../src/navigation/tabBarInset', () => ({
  ...jest.requireActual('../src/navigation/tabBarInset'),
  useTabBarBottom: () => 0,
}));

/** An icon with a hook in it, as every real tab icon has. */
const HookIcon = ({ color }: { color: string; size: number; focused: boolean }) => {
  const [tint] = useState(color);
  return <>{tint}</>;
};

const names = ['TodayTab', 'QuranTab', 'TasbihTab', 'DuasTab', 'LogTab', 'SettingsTab'];
const routes = names.map(name => ({ key: `${name}-k`, name, params: undefined }));
const descriptors = Object.fromEntries(
  routes.map(r => [r.key, { options: { title: r.name, tabBarIcon: HookIcon } }]),
);
const props = {
  state: { index: 3, routes, key: 'tabs', routeNames: names, type: 'tab', stale: false, history: [] },
  descriptors,
  navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
} as unknown as React.ComponentProps<typeof MinimalTabBar>;

describe('the Minimal bar under a pushed screen', () => {
  afterEach(() => resetTabBarVisibility());

  it('hides and comes back without changing its hooks', () => {
    let tree: ReactTestRenderer | null = null;
    act(() => {
      tree = create(<MinimalTabBar {...props} />);
    });
    // Opening a dua: the bar goes.
    expect(() => act(() => hideTabBar())).not.toThrow();
    expect(tree!.toJSON()).toBeNull();
    // Back on the list: it returns, icons and all.
    expect(() => act(() => showTabBar())).not.toThrow();
    expect(tree!.toJSON()).not.toBeNull();
    act(() => tree!.unmount());
  });
});
