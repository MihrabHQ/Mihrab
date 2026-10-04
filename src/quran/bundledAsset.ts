/**
 * Where a file the app ships in its bundle lives, for ReactNativeBlobUtil.
 *
 * Android reads the APK's assets by name. iOS keeps resources at the root
 * of the app bundle, which is where `MainBundleDir` points. A Mac
 * (Catalyst) bundle is laid out the macOS way — `Mihrab.app/Contents/
 * Resources/…` — while `MainBundleDir` there is still `Mihrab.app`, so
 * the same path found nothing: the tajwīd rules, the translations and the
 * sūrah files all read as missing on the Mac.
 */
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { isMacCatalyst } from '../responsive/breakpoints';

export function bundledAssetPath(file: string): string {
  if (Platform.OS === 'android') return ReactNativeBlobUtil.fs.asset(file);
  const root = ReactNativeBlobUtil.fs.dirs.MainBundleDir;
  return isMacCatalyst ? `${root}/Contents/Resources/${file}` : `${root}/${file}`;
}
