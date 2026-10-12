/**
 * @format
 */

import './src/i18n';
import './src/config/geolocationInit';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigationRoot } from './src/AppNavigationRoot';
import { PrayerSettingsProvider } from './src/context/PrayerSettingsContext';
import { bootMark } from './src/boot/bootTimeline';
import { WindowSizeProvider } from './src/responsive/windowSize';

function App() {
  bootMark('app');
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
