/**
 * Notifee's trigger notifications, kept by the main process.
 *
 * The app schedules every adhan, reminder and nudge with notifee's
 * `createTriggerNotification(notification, { type: TIMESTAMP, timestamp })`.
 * On the desktop that call lands here: the trigger is written to disk and
 * checked by a clock tick rather than one long setTimeout each — timers do
 * not run while a laptop sleeps, and a tick notices on wake what fell due.
 *
 * When one fires, the system notification is shown here and the page is
 * told, so it can play the adhan (the page owns audio) and hear the event
 * the way it would from notifee.
 */
const fs = require('fs');
const path = require('path');
const { app, Notification, ipcMain, powerMonitor } = require('electron');

const TICK_MS = 15_000;
// Due longer ago than this — the machine was asleep or off — and the
// moment has passed: an adhan an hour late is worse than none.
const STALE_MS = 10 * 60_000;

const RepeatFrequency = { NONE: -1, HOURLY: 0, DAILY: 1, WEEKLY: 2 };
const REPEAT_MS = { 0: 3_600_000, 1: 86_400_000, 2: 604_800_000 };

let store = { triggers: {}, channels: {}, categories: [] };
let displayed = new Map();
let getWindow = () => null;
let file = null;
let saveTimer = null;

function load() {
  file = path.join(app.getPath('userData'), 'notifications.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    store = { triggers: raw.triggers ?? {}, channels: raw.channels ?? {}, categories: raw.categories ?? [] };
  } catch {
    // First run, or an unreadable file: start empty. The app reschedules
    // everything on launch anyway.
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, file);
  }, 200);
}

function send(channel, ...args) {
  const w = getWindow();
  if (w && !w.isDestroyed()) w.webContents.send(channel, ...args);
}

function show(notification) {
  const id = notification.id;
  const channel = store.channels[notification.android?.channelId] ?? null;
  const sound = notification.android?.sound ?? channel?.sound ?? notification.ios?.sound ?? 'default';
  // Our own sound plays in the page; only a plain notification uses the
  // system's.
  const silent = sound !== 'default';
  if (Notification.isSupported()) {
    const n = new Notification({
      title: notification.title ?? '',
      body: notification.body ?? '',
      silent,
      urgency: channel?.importance >= 4 ? 'critical' : 'normal',
      timeoutType: 'default',
    });
    n.on('click', () => {
      const w = getWindow();
      if (w) {
        w.show();
        w.focus();
      }
      send('notif:event', { type: 1 /* PRESS */, detail: { notification } });
    });
    n.on('close', () => {
      displayed.delete(id);
      send('notif:event', { type: 0 /* DISMISSED */, detail: { notification } });
    });
    n.show();
    displayed.get(id)?.close?.();
    displayed.set(id, n);
  }
  send('notif:event', { type: 3 /* DELIVERED */, detail: { notification }, sound });
}

function tick() {
  const now = Date.now();
  let changed = false;
  for (const [id, entry] of Object.entries(store.triggers)) {
    const at = entry.trigger.timestamp;
    if (at > now) continue;
    if (now - at <= STALE_MS) show(entry.notification);
    const every = REPEAT_MS[entry.trigger.repeatFrequency];
    if (every) {
      let next = at;
      while (next <= now) next += every;
      entry.trigger = { ...entry.trigger, timestamp: next };
    } else {
      delete store.triggers[id];
    }
    changed = true;
  }
  if (changed) save();
}

function register(windowGetter) {
  getWindow = windowGetter;
  load();
  setInterval(tick, TICK_MS);
  powerMonitor.on('resume', tick);
  powerMonitor.on('unlock-screen', tick);
  setTimeout(tick, 2_000);

  ipcMain.handle('notif:createTrigger', (_e, notification, trigger) => {
    const id = notification.id ?? `n${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    store.triggers[id] = { notification: { ...notification, id }, trigger };
    save();
    return id;
  });
  ipcMain.handle('notif:display', (_e, notification) => {
    const id = notification.id ?? `n${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    show({ ...notification, id });
    return id;
  });
  ipcMain.handle('notif:triggers', () =>
    Object.values(store.triggers).map(e => ({ notification: e.notification, trigger: e.trigger })),
  );
  ipcMain.handle('notif:displayed', () =>
    [...displayed.keys()].map(id => ({ id, notification: { id } })),
  );
  ipcMain.handle('notif:cancelTriggers', (_e, ids) => {
    if (ids == null) store.triggers = {};
    else for (const id of ids) delete store.triggers[id];
    save();
  });
  ipcMain.handle('notif:cancelDisplayed', (_e, ids) => {
    const list = ids == null ? [...displayed.keys()] : ids;
    for (const id of list) {
      displayed.get(id)?.close?.();
      displayed.delete(id);
    }
  });
  ipcMain.handle('notif:createChannel', (_e, channel) => {
    store.channels[channel.id] = channel;
    save();
    return channel.id;
  });
  ipcMain.handle('notif:getChannel', (_e, id) => store.channels[id] ?? null);
  ipcMain.handle('notif:getChannels', () => Object.values(store.channels));
  ipcMain.handle('notif:deleteChannel', (_e, id) => {
    delete store.channels[id];
    save();
  });
  ipcMain.handle('notif:setCategories', (_e, categories) => {
    store.categories = categories ?? [];
    save();
  });
  ipcMain.handle('notif:getCategories', () => store.categories);
  ipcMain.handle('notif:supported', () => Notification.isSupported());
}

module.exports = { register, RepeatFrequency };
