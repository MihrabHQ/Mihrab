/**
 * `GarminWatch` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  configure(enabled: boolean, address: string | null): Promise<Object>;
  setFahrenheit(fahrenheit: boolean): Promise<void>;
  setAccent(hex: string): Promise<void>;
  installFace(): Promise<Object>;
  installApp(kind: string): Promise<Object>;
  setOptions(flags: number): Promise<void>;
  sendNow(): Promise<Object>;
  status(): Promise<Object>;
  pairedDevices(): Promise<Array<Object>>;
}

export default TurboModuleRegistry.get<Spec>('GarminWatch');
