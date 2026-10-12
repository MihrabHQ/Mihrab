/**
 * @format
 */

import './src/i18n';
import './src/config/geolocationInit';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigationRoot } from './src/AppNavigationRoot';
import { PrayerSettingsProvider } from './src/context/PrayerSettingsContext';
import { bootMark } from './src/boot/bootTimeline';
import { beginLaunchWindow } from './src/boot/launchWarp';
import { WindowSizeProvider } from './src/responsive/windowSize';

function App() {
  bootMark('app');
  // Once per mount of the root, before anything below renders: the root
  // mounts once per window, and a window is a launch (src/boot/launchWarp.ts,
  // "A window, not a process").
  useState(beginLaunchWindow);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <WindowSizeProvider>
          <PrayerSettingsProvider>
            <AppNavigationRoot />
          </PrayerSettingsProvider>
        </WindowSizeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
