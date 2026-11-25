/**
 * `SystemTheme` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android only.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  restartApp(): void;
  setNavigationBarStyle(isDark: boolean): void;
  resolveAccentHex(): string;
  getColorScheme(): string | null;
  isButtonNavigation(): boolean | null;
  buttonNavigationHeight(): number;
}

export default TurboModuleRegistry.get<Spec>('SystemTheme');
