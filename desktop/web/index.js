/**
 * Desktop entry. Native modules first — app modules read NativeModules at
 * import time — then the app's own index.js, which registers the root
 * component exactly as on the phones, then run it into #root.
 */
import './native/install';
import { AppRegistry } from 'react-native';
import '../../index';

AppRegistry.runApplication('PrayerApp', {
  rootTag: document.getElementById('root'),
});
