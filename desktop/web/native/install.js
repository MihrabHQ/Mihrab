/**
 * Installs the desktop implementations of the app's own native modules
 * onto react-native-web's NativeModules, before any app module reads them.
 *
 * Modules that are simply absent here (widgets, Live Activities, the
 * compass, haptics, QR scanning) are left absent: every wrapper in
 * src/native already treats a missing module as "this device cannot".
 */
import { desktop } from '../shims/desktop';
import { NativeModules } from 'react-native-web/dist/index';
import './fonts';
import './network';
import { MushafFont } from './mushafFont';
import { MihrabKeyCommands } from './keys';
import {
  AdhanPlayer,
  AppVersion,
  I18nManager,
  MihrabClipboard,
  PrayerBuildInfo,
  RateApp,
  SecureRandom,
  SystemClock,
} from './basics';
import { SyncFolder } from './syncFolder';
import { WordPlayer } from './wordPlayer';

Object.assign(NativeModules, {
  AdhanPlayer,
  AppVersion,
  MihrabKeyCommands,
  I18nManager,
  MihrabClipboard,
  MushafFont,
  PrayerBuildInfo,
  RateApp,
  SecureRandom,
  // Mihrab Web has no folders to sync through: without the module the app
  // offers no sync at all (`hasFolderPicker`), rather than a page that fails.
  ...(desktop()?.syncFolder ? { SyncFolder } : null),
  SystemClock,
  // The word reader's player (hold a word on the page to hear it).
  WordPlayer,
});
