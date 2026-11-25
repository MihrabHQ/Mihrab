/**
 * `MihrabKeyCommands` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). iPhone, iPad and Mac only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setArrowPriority(on: boolean): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('MihrabKeyCommands');
