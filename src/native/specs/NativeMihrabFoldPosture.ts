/**
 * `MihrabFoldPosture` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  read(): Promise<Object>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('MihrabFoldPosture');
