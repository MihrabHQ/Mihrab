import NetInfo from '@react-native-community/netinfo';
import { ready } from './bridge';

// NetInfo's browser check fetches the origin's root, which on GitHub Pages
// is another site (and a 404). Ask the demo's own page instead.
NetInfo.configure({ reachabilityUrl: `${__MIHRAB_DEMO_BASE__}/` });

ready.then(() => import(/* webpackMode: "eager" */ '../index'));
