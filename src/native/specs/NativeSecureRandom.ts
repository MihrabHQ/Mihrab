/**
 * `SecureRandom` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  bytes(count: number): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('SecureRandom');
