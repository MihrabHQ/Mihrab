import NetInfo from '@react-native-community/netinfo';
import { ready } from './bridge';

// NetInfo's browser check fetches the origin's root; ask this page instead,
// wherever it is served.
NetInfo.configure({ reachabilityUrl: `${__MIHRAB_WEB_BASE__}/` });

// Chrome and Edge offer to install the page once, early — before the app has
// mounted anything that could listen. Keep the offer for the bookmark sheet.
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  window.__mihrabInstallPrompt = event;
});
window.addEventListener('appinstalled', () => {
  window.__mihrabInstallPrompt = null;
});

ready.then(() => import(/* webpackMode: "eager" */ '../index'));
