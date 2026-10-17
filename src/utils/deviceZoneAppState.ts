/**
 * Forget the phone's resolved zone each time the app comes back to the
 * foreground (`deviceZone` in zoneClock.ts keeps it between asks). Apart
 * from zoneClock.ts because that file is a leaf the build tools run under
 * plain Node, where `react-native` cannot be loaded. Imported for its side
 * effect from index.js.
 */
import { AppState } from 'react-native';
import { invalidateDeviceZone } from './zoneClock';

AppState.addEventListener('change', state => {
  if (state === 'active') invalidateDeviceZone();
});
