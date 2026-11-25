/**
 * `MihrabLiveActivity` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  display(payloadJson: string): Promise<boolean>;
  displayV2(liveActivityJson: string): Promise<boolean>;
  clearAlertOverride(): Promise<void>;
  promotionStatus(): Promise<Object>;
  openPromotionSettings(): Promise<boolean>;
  cancel(): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('MihrabLiveActivity');
