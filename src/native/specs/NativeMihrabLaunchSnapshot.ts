/**
 * `MihrabLaunchSnapshot` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setEligible(value: boolean): void;
  setLookKey(key: string, nightMatters: boolean): void;
  hide(): void;
  captureNow(heroFile: string | null, x: number, y: number): void;
  crossfade(durationMs: number): void;
  setHeroState(targetAt: number, fromAt: number, posed: boolean): void;
  getShownState(): string;
}

export default TurboModuleRegistry.get<Spec>('MihrabLaunchSnapshot');
