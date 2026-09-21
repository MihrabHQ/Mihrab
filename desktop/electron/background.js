/**
 * Staying alive for the adhan.
 *
 * On a phone the OS wakes the app at prayer time. A desktop does no such
 * thing: the adhan plays only if Mihrab is running. So:
 *
 *  - Closing the window hides it; Mihrab keeps running in the tray (the
 *    notification area on Windows, the status area on Linux) until Quit.
 *  - It can start at login, hidden — on by default the first time the app
 *    runs, and a tray menu checkbox to turn off.
 *  - The first time the window is closed, one notification says where it
 *    went, so a user who wanted it gone knows to Quit.
 */
const fs = require('fs');
const path = require('path');
const { app, Menu, Notification, Tray, nativeImage } = require('electron');

const HIDDEN_ARG = '--hidden';
let tray = null;
let quitting = false;

function statePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}
function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return {};
  }
}
function writeState(patch) {
  const next = { ...readState(), ...patch };
  fs.writeFileSync(statePath(), JSON.stringify(next));
  return next;
}

// ── Start at login ──────────────────────────────────────────────────────
// Windows (and macOS) have an API; Linux has the XDG autostart folder.
function linuxAutostartFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
  return path.join(base, 'autostart', 'mihrab.desktop');
}

function launchCommand() {
  // An AppImage runs from a temporary mount; the file to launch is the
  // AppImage itself, which it names in $APPIMAGE.
  const exe = process.env.APPIMAGE || process.execPath;
  const q = s => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const args = app.isPackaged ? [] : [path.resolve(__dirname, '..')];
  return [exe, ...args].map(q).join(' ');
}

function getOpenAtLogin() {
  if (process.platform === 'linux') return fs.existsSync(linuxAutostartFile());
  return app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin;
}

function setOpenAtLogin(on) {
  if (process.platform === 'linux') {
    const file = linuxAutostartFile();
    if (on) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        [
          '[Desktop Entry]',
          'Type=Application',
          'Name=Mihrab',
          'Comment=Prayer times and the adhan',
          `Exec=${launchCommand()} ${HIDDEN_ARG}`,
          'Icon=mihrab',
          'X-GNOME-Autostart-enabled=true',
          'NoDisplay=false',
          '',
        ].join('\n'),
      );
    } else {
      fs.rmSync(file, { force: true });
    }
    return;
  }
  app.setLoginItemSettings({ openAtLogin: on, args: [HIDDEN_ARG] });
}

// ── Tray ────────────────────────────────────────────────────────────────
function icon() {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'resources', 'tray.png'));
  const hi = path.join(__dirname, '..', 'resources', 'tray@2x.png');
  if (fs.existsSync(hi)) img.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(hi) });
  return img;
}

function buildMenu(getWindow, send) {
  return Menu.buildFromTemplate([
    { label: 'Open Mihrab', click: () => showWindow(getWindow) },
    { label: 'Stop the adhan', click: () => send('adhan:stop') },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: getOpenAtLogin(),
      click: item => {
        setOpenAtLogin(item.checked);
        writeState({ autostartChosen: true });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Mihrab',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function showWindow(getWindow) {
  const w = getWindow();
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

function startedHidden() {
  return process.argv.includes(HIDDEN_ARG);
}

function register(getWindow) {
  const send = (channel, ...args) => {
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(channel, ...args);
  };

  // First run: start at login unless the user has ever said otherwise.
  // The adhan is the point of the app, and it cannot sound from an app
  // that is not running.
  const state = readState();
  if (!state.autostartChosen && !process.env.MIHRAB_USER_DATA) {
    try {
      setOpenAtLogin(true);
    } catch (e) {
      console.warn('[mihrab] could not enable start at login', e);
    }
    writeState({ autostartChosen: true });
  }

  tray = new Tray(icon());
  tray.setToolTip('Mihrab');
  const refresh = () => tray.setContextMenu(buildMenu(getWindow, send));
  refresh();
  tray.on('click', () => showWindow(getWindow));

  app.on('before-quit', () => {
    quitting = true;
  });

  return {
    /** Wire a window: its close button hides it instead of quitting. */
    attach(win) {
      win.on('close', e => {
        if (quitting) return;
        e.preventDefault();
        win.hide();
        if (!readState().toldAboutTray && Notification.isSupported()) {
          writeState({ toldAboutTray: true });
          new Notification({
            title: 'Mihrab is still running',
            body: 'It stays in the tray so the adhan can play. Quit from the tray icon to close it completely.',
            silent: true,
          }).show();
        }
      });
      win.on('show', refresh);
    },
    /** The tray tooltip, kept current by the page (next prayer and time). */
    setStatus(text) {
      if (tray && typeof text === 'string') tray.setToolTip(text ? `Mihrab — ${text}` : 'Mihrab');
    },
    startedHidden,
    show: () => showWindow(getWindow),
  };
}

module.exports = { register };
