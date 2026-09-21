/**
 * Installs the desktop implementations of the app's own native modules
 * onto react-native-web's NativeModules, before any app module reads them.
 *
 * Modules that are simply absent here (widgets, Live Activities, the
 * compass, haptics, QR scanning) are left absent: every wrapper in
 * src/native already treats a missing module as "this device cannot".
 */
import { NativeModules } from 'react-native-web/dist/index';
import './fonts';
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
  SyncFolder,
  SystemClock,
});
