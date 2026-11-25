/**
 * `PrayerLiveActivity` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). iPhone, iPad and Mac only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  start(json: string): Promise<boolean>;
  startV2(json: string): Promise<boolean>;
  update(json: string): Promise<boolean>;
  stop(): Promise<void>;
  reassert(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('PrayerLiveActivity');
