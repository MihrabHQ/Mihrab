/**
 * The palette is resolved once for the tree, not once per consumer
 * (theme/appPaletteContext.tsx).
 *
 * `useAppPalette()` has two hundred call sites and an instance per row of
 * every list. Each used to hold its own state, three native subscriptions
 * and its own copy of the palette, and — reading the whole settings
 * object — rendered again on any change to any setting. These hold the
 * three things the shared palette promises: one resolution, no render for
 * a setting the palette is not made of, and a render for one it is.
 */
import { act, memo } from 'react';
import { create } from 'react-test-renderer';
import { Appearance, AppState, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrayerSettingsProvider, usePrayerSettings } from '../src/context/PrayerSettingsContext';
import { useAppPalette } from '../src/hooks/useAppPalette';
import * as appPalette from '../src/theme/appPalette';

beforeEach(async () => {
  await (AsyncStorage as unknown as { clear?: () => Promise<void> }).clear?.();
});

async function flush() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
}

const CONSUMERS = 40;

function harness() {
  const renders = { count: 0 };
  const seen = new Set<unknown>();
  const Consumer = memo(function Consumer() {
    renders.count += 1;
    const { palette } = useAppPalette();
    seen.add(palette);
    return <Text style={{ color: palette.text }}>row</Text>;
  });
  let update: ((p: Record<string, unknown>) => void) | null = null;
  function Setter() {
    update = usePrayerSettings().updateSettings as (p: Record<string, unknown>) => void;
    return null;
  }
  const tree = (
    <PrayerSettingsProvider>
      <Setter />
      {Array.from({ length: CONSUMERS }, (_, i) => (
        <Consumer key={i} />
      ))}
    </PrayerSettingsProvider>
  );
  return { renders, seen, tree, update: (p: Record<string, unknown>) => update!(p) };
}

describe('the shared palette', () => {
  it('is resolved once however many components read it, with one set of subscriptions', async () => {
    const resolve = jest.spyOn(appPalette, 'resolveAppPalette');
    // Counted, not replaced: the setup's own stand-ins keep answering.
    const appearance = Appearance.addChangeListener as unknown as jest.Mock;
    const appState = AppState.addEventListener as unknown as jest.Mock;
    const calls = (m: jest.Mock) => (m.mock ? m.mock.calls.length : 0);
    const before = { appearance: calls(appearance), appState: calls(appState) };
    const h = harness();
    await act(async () => {
      create(h.tree);
    });
    await flush();
    // Every consumer was handed the same object…
    expect(h.seen.size).toBeLessThanOrEqual(2); // the defaults', then the stored settings' if they differ
    // …resolved by the provider alone: not forty times.
    expect(resolve.mock.calls.length).toBeLessThan(CONSUMERS / 4);
    if (appearance.mock) expect(calls(appearance) - before.appearance).toBeLessThanOrEqual(3);
    if (appState.mock) expect(calls(appState) - before.appState).toBeLessThanOrEqual(2);
    resolve.mockRestore();
  });

  it('does not render its readers for a setting it is not made of', async () => {
    const h = harness();
    await act(async () => {
      create(h.tree);
    });
    await flush();
    const before = h.renders.count;
    await act(async () => {
      h.update({ androidWidgetBackgroundOpacity: 42 });
    });
    await flush();
    expect(h.renders.count).toBe(before);
  });

  it('renders every reader when the palette changes', async () => {
    const h = harness();
    await act(async () => {
      create(h.tree);
    });
    await flush();
    const before = h.renders.count;
    const palettes = h.seen.size;
    await act(async () => {
      h.update({ appearance: 'dark', pureBlackDark: true });
    });
    await flush();
    expect(h.renders.count).toBe(before + CONSUMERS);
    expect(h.seen.size).toBe(palettes + 1);
  });
});
