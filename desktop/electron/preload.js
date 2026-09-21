/**
 * The only door between the page and the machine. Everything here is an
 * IPC call into the main process; the page gets no Node, no fs, no shell.
 */
const { contextBridge, ipcRenderer } = require('electron');

const progress = new Map();
const notifListeners = new Set();
ipcRenderer.on('notif:event', (_e, event) => {
  for (const fn of notifListeners) fn(event);
});
ipcRenderer.on('fs:progress', (_e, id, received, total) => {
  progress.get(id)?.(received, total);
});

let nextId = 1;
const dirs = ipcRenderer.sendSync('fs:dirsSync');
const info = ipcRenderer.sendSync('app:infoSync');

contextBridge.exposeInMainWorld('mihrabDesktop', {
  app: {
    info,
    setTrayStatus: text => ipcRenderer.send('tray:status', String(text ?? '')),
    onAdhanStop: fn => {
      const h = () => fn();
      ipcRenderer.on('adhan:stop', h);
      return () => ipcRenderer.removeListener('adhan:stop', h);
    },
    openExternal: url => ipcRenderer.invoke('app:openExternal', url),
  },
  dialog: {
    alert: (title, message, buttons, cancelId) =>
      ipcRenderer.invoke('dialog:alert', title, message, buttons, cancelId),
  },
  notifications: {
    onEvent: fn => {
      notifListeners.add(fn);
      return () => notifListeners.delete(fn);
    },
    createTrigger: (n, t) => ipcRenderer.invoke('notif:createTrigger', n, t),
    display: n => ipcRenderer.invoke('notif:display', n),
    triggers: () => ipcRenderer.invoke('notif:triggers'),
    displayed: () => ipcRenderer.invoke('notif:displayed'),
    cancelTriggers: ids => ipcRenderer.invoke('notif:cancelTriggers', ids),
    cancelDisplayed: ids => ipcRenderer.invoke('notif:cancelDisplayed', ids),
    createChannel: c => ipcRenderer.invoke('notif:createChannel', c),
    getChannel: id => ipcRenderer.invoke('notif:getChannel', id),
    getChannels: () => ipcRenderer.invoke('notif:getChannels'),
    deleteChannel: id => ipcRenderer.invoke('notif:deleteChannel', id),
    setCategories: c => ipcRenderer.invoke('notif:setCategories', c),
    getCategories: () => ipcRenderer.invoke('notif:getCategories'),
  },
  secure: {
    get: k => ipcRenderer.invoke('secure:get', k),
    set: (k, v) => ipcRenderer.invoke('secure:set', k, v),
    remove: k => ipcRenderer.invoke('secure:remove', k),
    clear: () => ipcRenderer.invoke('secure:clear'),
  },
  share: {
    saveFiles: (urls, name) => ipcRenderer.invoke('share:saveFiles', urls, name),
  },
  capture: {
    rect: (rect, options) => ipcRenderer.invoke('capture:rect', rect, options),
  },
  power: {
    keepAwake: on => ipcRenderer.invoke('power:keepAwake', on),
  },
  syncFolder: {
    pick: () => ipcRenderer.invoke('sync:pick'),
    hasAccess: h => ipcRenderer.invoke('sync:hasAccess', h),
    forget: h => ipcRenderer.invoke('sync:forget', h),
    list: h => ipcRenderer.invoke('sync:list', h),
    read: (h, n) => ipcRenderer.invoke('sync:read', h, n),
    write: (h, n, c) => ipcRenderer.invoke('sync:write', h, n, c),
    remove: (h, n) => ipcRenderer.invoke('sync:remove', h, n),
    pickFile: () => ipcRenderer.invoke('sync:pickFile'),
  },
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read'),
    write: text => ipcRenderer.invoke('clipboard:write', text),
  },
  fs: {
    dirs,
    exists: p => ipcRenderer.invoke('fs:exists', p),
    stat: p => ipcRenderer.invoke('fs:stat', p),
    isDir: p => ipcRenderer.invoke('fs:isDir', p),
    ls: p => ipcRenderer.invoke('fs:ls', p),
    mkdir: p => ipcRenderer.invoke('fs:mkdir', p),
    unlink: p => ipcRenderer.invoke('fs:unlink', p),
    mv: (a, b) => ipcRenderer.invoke('fs:mv', a, b),
    cp: (a, b) => ipcRenderer.invoke('fs:cp', a, b),
    readFile: (p, enc) => ipcRenderer.invoke('fs:readFile', p, enc),
    writeFile: (p, data, enc, append) => ipcRenderer.invoke('fs:writeFile', p, data, enc, append),
    download: (url, dest, headers, onProgress) => {
      const id = nextId++;
      if (onProgress) progress.set(id, onProgress);
      const done = ipcRenderer
        .invoke('fs:download', id, url, dest, headers)
        .finally(() => progress.delete(id));
      return { id, done, cancel: () => ipcRenderer.invoke('fs:cancel', id) };
    },
    fileUrl: p => `mihrab://files/${encodeURIComponent(p)}`,
  },
});
