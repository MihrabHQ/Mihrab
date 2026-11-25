/**
 * `CustomAdhan` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  pick(): Promise<Object | null>;
  pickSystemSound?: (title: string | null) => Promise<Object | null>;
  current(): Promise<Object | null>;
  remove(): Promise<void>;
  ensureChannel(channelName: string): Promise<string | null>;
  ensureAlarmChannel?: (channelId: string, channelName: string, soundResName: string | null) => Promise<string>;
  deleteChannel?: (channelId: string) => Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('CustomAdhan');
