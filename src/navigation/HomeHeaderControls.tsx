/**
 * Home header controls (the location chip and the Settings cog) — v2.7.41,
 * reduced in v2.8.5, the cog back since Settings left the tab bar.
 *
 * Extracted from RootNavigator so the same row can render in two places:
 *
 *  • iOS/Android — inside the native navigation header (`headerRight`),
 *    exactly as before.
 *  • Mac Catalyst — as the FIRST ROW OF HOME CONTENT instead. On Catalyst
 *    the transparent navigation bar sits inside the window's title-bar
 *    DRAG REGION, so clicks on header buttons were intermittently
 *    swallowed as window drags ("the settings gear sometimes works").
 *    Content rows live below the drag region, so clicks always land.
 */
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View, Platform } from 'react-native';
import { LocationChip } from '../screens/home/LocationChip';
import { SettingsChip } from '../screens/home/SettingsChip';
import { SPACING } from '../theme/tokens';
import type { MainTabParamList, RootStackParamList } from './types';

export function HomeHeaderControls() {
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        BottomTabNavigationProp<MainTabParamList>,
        NativeStackNavigationProp<RootStackParamList>
      >
    >();
  return (
    // The pin renders for users on manual location (with or without saved
    // presets) and shows the current location label; tapping it opens the
    // preset switcher when presets exist, otherwise Settings.
    //
    // The gear left this row in v2.8.5 because it duplicated the Settings
    // tab. There is no tab now, so the cog is the one way in, here as on
    // the phone's hero (SettingsChip) — one gear, still.
    <View style={styles.row}>
      <LocationChip
        compactHeader
        // Straight to the page the saved locations are on, rather than
        // to the Settings index and a scroll: since the settings became an
        // index of sections there is a destination for this, and landing
        // on it is the whole of what "Add new location" promised.
        onAddLocation={() =>
          navigation.navigate('SettingsLocation', {
            highlight: 'savedLocations',
            activateOnAdd: true,
          })
        }
      />
      <SettingsChip onPress={() => navigation.navigate('Settings')} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Shrinks into the header's right container, the place first. And off
  // the edge on Android: the JS header gives its right container no inset,
  // and the cog's ring — the only control here with a border — was drawn
  // flush with the screen's edge and cut by it (Android 16 tablet emulator,
  // 2026-11-27). iOS's native bar insets its items itself.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 1,
    minWidth: 0,
    marginEnd: Platform.OS === 'android' ? SPACING.md : 0,
  },
});
