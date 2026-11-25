/**
 * `WordPlayer` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  play(path: string, startMs: number, endMs: number): Promise<boolean>;
  stop(): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('WordPlayer');
