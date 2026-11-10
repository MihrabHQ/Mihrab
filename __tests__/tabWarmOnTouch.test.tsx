/**
 * A tab's page is built from touch down, not from the lift
 * (navigation/tabBarPress.ts, "Warming a tab under the finger").
 *
 * Run through the real navigator: a lazy tab that has never been opened
 * must have rendered by the time the finger is down, without the tab on
 * show changing; must not be built twice; and must keep the params it was
 * handed before it was ever opened.
 */
import React, { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { CommonActions, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TabBarButton } from '../src/navigation/TabBarButton';
import { _resetTabBarPress, noteTabOpened, warmTab } from '../src/navigation/tabBarPress';

jest.mock('../src/polish/haptics', () => ({
  hapticScrubStart: jest.fn(),
  hapticScrubTick: jest.fn(),
}));

type Tabs = { One: undefined; Two: { from?: string } | undefined };
const Tab = createBottomTabNavigator<Tabs>();
const ref = createNavigationContainerRef<Tabs>();

let twoRenders = 0;
let twoParams: unknown;
let preloads = 0;

function One() {
  return <Text>one</Text>;
}
function Two({ route }: { route: { params?: unknown } }) {
  twoRenders += 1;
  twoParams = route.params;
  return <Text>two</Text>;
}

async function mount(): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <NavigationContainer ref={ref}>
        <Tab.Navigator
          screenOptions={({ route, navigation }) => ({
            tabBarButton: props => (
              <TabBarButton
                {...props}
                name={route.name}
                onWarm={() => {
                  preloads += 1;
                  navigation.dispatch(CommonActions.preload(route.name, route.params));
                }}
              />
            ),
          })}>
          <Tab.Screen name="One" component={One} />
          <Tab.Screen name="Two" component={Two as never} />
        </Tab.Navigator>
      </NavigationContainer>,
    );
  });
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
  return root;
}

function button(root: ReactTestRenderer, name: string): ReactTestInstance {
  return root.root.findAll(n => n.type === TabBarButton && n.props.name === name)[0];
}

/** The Pressable's own touch-start, as the finger coming down. */
async function touchDown(root: ReactTestRenderer, name: string): Promise<void> {
  const host = button(root, name).findAll(n => typeof n.props.onTouchStart === 'function')[0];
  await act(async () => {
    host.props.onTouchStart({ nativeEvent: { pageX: 0 } });
  });
}

beforeEach(() => {
  _resetTabBarPress();
  twoRenders = 0;
  twoParams = undefined;
  preloads = 0;
});

describe('warming a tab under the finger', () => {
  it('builds a never-opened tab at touch down, and leaves the tab on show alone', async () => {
    const root = await mount();
    expect(twoRenders).toBe(0); // lazy: a launch builds the first tab only
    await touchDown(root, 'Two');
    expect(twoRenders).toBeGreaterThan(0);
    expect(preloads).toBe(1);
    expect(ref.getCurrentRoute()?.name).toBe('One');
    await act(async () => root.unmount());
  });

  it('warms a tab once, and never the one on show', async () => {
    const root = await mount();
    await touchDown(root, 'One');
    expect(preloads).toBe(0);
    await touchDown(root, 'Two');
    await touchDown(root, 'Two');
    expect(preloads).toBe(1);
    await act(async () => root.unmount());
  });

  it('does not warm a tab that has been opened', async () => {
    const root = await mount();
    await act(async () => {
      ref.navigate('Two');
    });
    await act(async () => {
      ref.navigate('One');
    });
    await touchDown(root, 'Two');
    expect(preloads).toBe(0);
    await act(async () => root.unmount());
  });

  it('keeps the params a tab was handed before it was opened', async () => {
    const root = await mount();
    await act(async () => {
      // The tabs are the root navigator here: its second route is Two.
      ref.dispatch({ ...CommonActions.setParams({ from: 'link' }), source: ref.getRootState().routes[1].key });
    });
    await touchDown(root, 'Two');
    expect(twoParams).toEqual({ from: 'link' });
    await act(async () => root.unmount());
  });
});

describe('the store', () => {
  it('builds nothing without a builder, and nothing for a tab with a page', () => {
    const build = jest.fn();
    warmTab('LogTab', undefined);
    warmTab('LogTab', build);
    expect(build).toHaveBeenCalledTimes(1);
    warmTab('LogTab', build);
    expect(build).toHaveBeenCalledTimes(1);
    noteTabOpened('QuranTab');
    warmTab('QuranTab', build);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
