/**
 * `BackgroundLocation` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  status(): Promise<Object>;
  setEnabled(on: boolean): Promise<Object>;
  setPlace(latitude: number, longitude: number): void;
  confirmPlace(): void;
  requestAlways?: () => Promise<Object>;
  takePending?: () => Promise<Object | null>;
  finish?: () => void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('BackgroundLocation');
