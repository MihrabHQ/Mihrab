/**
 * Mihrab desktop — Electron main process.
 *
 * The window renders the same React Native app as the phones, through
 * react-native-web. Everything the phones do natively (files, downloads,
 * notifications, the adhan) is done here and reached over IPC from the
 * preload's `window.mihrabDesktop`.
 *
 * Pages load from the `mihrab://` scheme rather than file://:
 *   mihrab://app/…     the renderer bundle (desktop/build/renderer)
 *   mihrab://files/<p> a file in the app's data folder — the page fonts,
 *                      downloaded recitation — so the page can use it as a
 *                      font or audio source under a strict CSP.
 */
const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} = require('electron');
const { pathToFileURL } = require('url');
const fsIpc = require('./fsIpc');
const notifications = require('./notifications');
const services = require('./services');
const background = require('./background');

let bg = null;
const { readable } = require('./paths');

const RENDERER = path.join(__dirname, '..', 'build', 'renderer');

// A throwaway profile for automated runs (scripts/drive.js), so a test
// never touches the real one.
if (process.env.MIHRAB_USER_DATA) app.setPath('userData', process.env.MIHRAB_USER_DATA);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mihrab',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

let win = null;

function serveScheme() {
  protocol.handle('mihrab', request => {
    const url = new URL(request.url);
    if (url.host === 'app') {
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(RENDERER, rel);
      if (path.relative(RENDERER, file).startsWith('..')) {
        return new Response('forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(file).toString());
    }
    if (url.host === 'files') {
      try {
        const file = readable(decodeURIComponent(url.pathname.replace(/^\/+/, '')));
        if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
        // Range requests pass through, so audio can seek.
        return net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
      } catch {
        return new Response('forbidden', { status: 403 });
      }
    }
    return new Response('not found', { status: 404 });
  });
}

/**
 * The phones make plain HTTP requests; a page is held to CORS, and most of
 * the APIs the app reads (the prayer-time providers, GitHub releases, the
 * recitation hosts) send no CORS headers because no browser was ever meant
 * to call them. For requests from our own page only, answer preflights and
 * mark responses readable — which is what the phones' requests already are.
 */
function allowAppRequests() {
  const fromApp = details =>
    details.webContentsId != null &&
    win &&
    !win.isDestroyed() &&
    details.webContentsId === win.webContents.id &&
    /^https?:/.test(details.url);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!fromApp(details)) return callback({});
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) {
      if (/^access-control-allow-/i.test(k)) delete headers[k];
    }
    headers['Access-Control-Allow-Origin'] = ['mihrab://app'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Allow-Methods'] = ['GET, POST, HEAD, OPTIONS'];
    headers['Access-Control-Expose-Headers'] = ['*'];
    const preflight = details.method === 'OPTIONS';
    callback({
      responseHeaders: headers,
      ...(preflight ? { statusLine: 'HTTP/1.1 204 No Content' } : {}),
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    show: false,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    width: 1100,
    height: 800,
    minWidth: 380,
    minHeight: 560,
    title: 'Mihrab',
    backgroundColor: '#0f3d33',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  // Links out of the app open in the system browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('mihrab://app/')) e.preventDefault();
  });
  void win.loadURL('mihrab://app/index.html');
  // Started at login: run in the tray, window unshown, until asked for.
  win.once('ready-to-show', () => {
    if (!bg?.startedHidden()) win.show();
  });
  bg?.attach(win);
  debugHooks(win);
  win.on('closed', () => {
    win = null;
  });
}

/**
 * Development aid, off unless MIHRAB_DEBUG is set: the page's console goes
 * to stdout, and MIHRAB_SNAPSHOT=<file.png> saves what the window shows a
 * few seconds after load, then quits — enough to check a build from a
 * terminal without looking at it.
 */
function debugHooks(w) {
  if (!process.env.MIHRAB_DEBUG) return;
  w.webContents.on('console-message', e => {
    process.stdout.write(`[page:${e.level}] ${e.message}\n`);
  });
  w.webContents.on('render-process-gone', (_e, d) => process.stdout.write(`[page] gone: ${d.reason}\n`));
  const snap = process.env.MIHRAB_SNAPSHOT;
  if (snap) {
    w.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await w.webContents.capturePage();
        fs.writeFileSync(snap, img.toPNG());
        process.stdout.write(`[debug] snapshot -> ${snap}\n`);
        app.exit(0);
      }, Number(process.env.MIHRAB_SNAPSHOT_DELAY || 6000));
    });
  }
}

function registerIpc() {
  fsIpc.register();
  notifications.register(() => win);
  services.register(() => win);

  const info = () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale(),
    preferredLanguages: app.getPreferredSystemLanguages(),
    name: app.getName(),
    hostname: require('os').hostname().replace(/\.local$/, ''),
  });
  ipcMain.handle('app:info', info);
  // Native module constants are synchronous on the phones; the preload reads
  // these once so the page can answer the same way.
  ipcMain.on('app:infoSync', e => {
    e.returnValue = info();
  });

  ipcMain.handle('app:openExternal', async (_e, url) => {
    if (typeof url !== 'string' || !/^(https?|mailto|geo|tel):/.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  // Alert.alert: title, message and up to three buttons; resolves with the
  // index pressed, or the cancel button's when the dialog is dismissed.
  ipcMain.handle('dialog:alert', async (_e, title, message, buttons, cancelId) => {
    const labels = buttons && buttons.length ? buttons : ['OK'];
    const { response } = await dialog.showMessageBox(win ?? undefined, {
      type: 'none',
      title: title || 'Mihrab',
      message: title || '',
      detail: message || undefined,
      buttons: labels,
      cancelId: cancelId ?? -1,
      defaultId: Math.max(0, labels.length - 1),
      noLink: true,
    });
    return response;
  });

  ipcMain.on('tray:status', (_e, text) => bg?.setStatus(text));
  ipcMain.handle('clipboard:read', () => clipboard.readText());
  ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text ?? '')));
}

// One instance: a second launch focuses the first, so two copies never
// schedule the same adhan twice.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => bg?.show());
  app.whenReady().then(() => {
    serveScheme();
    registerIpc();
    allowAppRequests();
    // No tray in automated runs: they must be able to close the window.
    if (!process.env.MIHRAB_USER_DATA) bg = background.register(() => win);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  // With the tray, closing the window never gets here; without it (an
  // automated run), closing the window ends the app.
  app.on('window-all-closed', () => {
    if (!bg) app.quit();
  });
}
