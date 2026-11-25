/**
 * `Haptics` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). iPhone, iPad and Mac only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  prepare(): void;
  selectionTick(): void;
  impact(style: string): void;
}

export default TurboModuleRegistry.get<Spec>('Haptics');
