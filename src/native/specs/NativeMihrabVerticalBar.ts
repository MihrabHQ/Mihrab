/**
 * `MihrabVerticalBar` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). iPhone, iPad and Mac only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  read(): Promise<Object>;
}

export default TurboModuleRegistry.get<Spec>('MihrabVerticalBar');
