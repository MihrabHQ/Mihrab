/**
 * @react-native-community/geolocation on the desktop: the browser's own
 * geolocation. It works where the OS offers a location service to apps;
 * where it does not (many Linux sessions), it fails with the ordinary
 * "position unavailable" error and the app offers its city search, as it
 * does on a phone with location turned off.
 */
const api = () => (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);

const Geolocation = {
  setRNConfiguration() {},
  requestAuthorization(success) {
    success?.();
  },
  getCurrentPosition(success, error, options) {
    const g = api();
    if (!g) {
      error?.({ code: 2, message: 'Location is not available on this computer.', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      return;
    }
    g.getCurrentPosition(success, error, options);
  },
  watchPosition(success, error, options) {
    return api()?.watchPosition(success, error, options) ?? -1;
  },
  clearWatch(id) {
    api()?.clearWatch(id);
  },
  stopObserving() {},
};

export default Geolocation;
