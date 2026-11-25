/**
 * `PrayerSilence` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  hasAccess(): Promise<boolean>;
  requestAccess(): Promise<boolean>;
  setWindows(windows: Array<Object>, endLabel: string, channelName: string): Promise<number>;
  clear(): Promise<void>;
  isActive(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('PrayerSilence');
