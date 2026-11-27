/**
 * `PrayerWidget` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setData(json: string): Promise<void>;
  setDataV2(json: string, v2: string): Promise<void>;
  takeLogQueue(): Promise<string | null>;
  takeTasbihQueue(): Promise<string | null>;
  setUiHints(style: string, oledBackground: boolean): Promise<void>;
  setWidgetSkySchedule(json: string | null): Promise<void>;
  getAndroidWidgetAppearance?: () => Promise<Object>;
  renderPreviews?: (widthDp: number) => Promise<Object>;
  setAndroidWidgetAppearance?: (opacity: number, highlightId: string, highlightHex: string | null, highlightDynamic: boolean, tinted: boolean) => Promise<void>;
  setAndroidWidgetSky?: (bgHex: string | null, accentHex: string | null) => Promise<void>;
  setAndroidWidgetBackground?: (mode: string, hex: string | null) => Promise<void>;
  setAndroidWidgetAppLook?: (theme: string, accentHex: string | null, highlightOwn: boolean, textAccent: boolean) => Promise<void>;
  getAndroidPrayerWidgetDisplay?: () => Promise<Object>;
  setAndroidPrayerWidgetDisplay?: (textHex: string, showLocation: boolean, showCountdown: boolean, showTable: boolean, timeScalePercent: number, sinceAdhanMinutes: number) => Promise<void>;
  setWidgetHighlightDynamic?: (enabled: boolean) => Promise<void>;
  setIosWidgetHighlightAppearance?: (highlightId: string, hex: string, dynamic: boolean, tinted: boolean) => Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('PrayerWidget');
