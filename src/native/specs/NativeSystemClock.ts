/**
 * `SystemClock` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getConstants(): { is24Hour: boolean; timeZone: string };
  readIs24Hour(): Promise<boolean>;
  readNetworkCountryIso?: () => Promise<string | null>;
  readTimeZone?: () => Promise<Object>;
}

export default TurboModuleRegistry.get<Spec>('SystemClock');
