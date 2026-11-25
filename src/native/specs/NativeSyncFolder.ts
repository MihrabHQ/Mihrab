/**
 * `SyncFolder` as JavaScript sees it — the contract the native module is
 * generated against (README.md in this folder). Android, iPhone, iPad and Mac.
 * A method marked `?` exists on one platform only.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  defaultFolder(): Promise<Object | null>;
  pick(): Promise<Object | null>;
  pickFile(): Promise<Object | null>;
  saveFile?: (fileName: string, contents: string, mime: string) => Promise<boolean>;
  hasAccess(handle: string): Promise<boolean>;
  forget(handle: string): Promise<void>;
  list(handle: string): Promise<Array<Object>>;
  read(handle: string, name: string): Promise<string | null>;
  write(handle: string, name: string, contents: string): Promise<void>;
  remove(handle: string, name: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('SyncFolder');
