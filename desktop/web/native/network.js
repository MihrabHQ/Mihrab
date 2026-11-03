/**
 * The connection's kind, as a phone would report it.
 *
 * NetInfo on the web reads `navigator.connection.type`, which desktop
 * Chromium does not have — so a connected PC reports 'other', and the app
 * holds every background download (the tajwīd pages, a reciter's surahs)
 * for an unmetered connection that never comes. The Mac reports Wi-Fi or
 * Ethernet, and so does this: a connected desktop is 'ethernet', unmetered
 * unless the browser's own data saver says otherwise (NetInfo reads that
 * as `isConnectionExpensive`).
 */
const connection = typeof navigator !== 'undefined' ? navigator.connection : undefined;

if (connection && !connection.type) {
  Object.defineProperty(connection, 'type', {
    configurable: true,
    get: () => (navigator.onLine ? 'ethernet' : 'none'),
  });
}
