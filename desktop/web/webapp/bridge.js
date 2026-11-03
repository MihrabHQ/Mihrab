/**
 * Mihrab Web's stand-in for the desktop app's bridge
 * (desktop/electron/preload.js): the same `window.mihrabDesktop`, answered
 * by the browser instead of an Electron main process.
 *
 * Files. The desktop shims already speak one file API, so the web app gives
 * them one: a read-only tree of everything preloaded (the muṣḥaf's page
 * fonts, the tajwīd colours, the riwāyāt, the hard-word meanings, the word
 * timings, the bundled Qur'an text) served beside the page under `files/`,
 * listed with sizes in `files/index.json`, and laid out exactly as the app
 * lays out its own documents folder — so the app finds everything already
 * "downloaded" and never offers to fetch it. What the app writes goes to an
 * overlay kept in IndexedDB, so a visitor's settings and place survive a
 * reload.
 *
 * Notifications fire while the tab is open (a browser keeps no schedule for
 * a closed page) and the adhan plays in the page, as on the desktop.
 */
/* global __MIHRAB_WEB_BASE__, __MIHRAB_WEB_VERSION__ */
const BASE = __MIHRAB_WEB_BASE__;
const FILES = `${BASE}/files/`;
const ROOT = '/mihrab';
const dirs = {
  data: ROOT,
  documents: `${ROOT}/Documents`,
  cache: `${ROOT}/Caches`,
  bundle: `${ROOT}/bundle`,
};

// ── The tree ───────────────────────────────────────────────────────────
/** Preloaded files: path under ROOT → size. */
let manifest = Object.create(null);
/** Every directory the preloaded tree has, as paths under ROOT. */
const manifestDirs = new Set(['']);
/** Written files: absolute path → bytes. */
const overlay = new Map();
/** Directories made by the app. */
const madeDirs = new Set();
/** Preloaded paths the app deleted (a file or a whole directory). */
const deleted = new Set();

const norm = p => {
  let s = String(p ?? '');
  if (s.startsWith('file://')) s = decodeURIComponent(s.slice(7));
  s = s.replace(/\/+/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
};
const relOf = p => (p === ROOT ? '' : p.startsWith(`${ROOT}/`) ? p.slice(ROOT.length + 1) : null);
const isDeleted = p => {
  for (let q = p; q.length >= ROOT.length; q = q.slice(0, q.lastIndexOf('/'))) {
    if (deleted.has(q)) return true;
    if (!q.includes('/')) break;
  }
  return false;
};
const enoent = p => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: 'ENOENT' });

function isFile(p) {
  if (overlay.has(p)) return true;
  const r = relOf(p);
  return r != null && manifest[r] != null && !isDeleted(p);
}
function isDir(p) {
  if (madeDirs.has(p)) return true;
  const prefix = `${p}/`;
  for (const k of overlay.keys()) if (k.startsWith(prefix)) return true;
  const r = relOf(p);
  return r != null && manifestDirs.has(r) && !isDeleted(p);
}
function list(p) {
  const names = new Set();
  const prefix = `${p}/`;
  // Written since: listed whatever was deleted under the same name before.
  const take = full => {
    if (!full.startsWith(prefix)) return;
    const name = full.slice(prefix.length).split('/')[0];
    if (name) names.add(name);
  };
  for (const k of overlay.keys()) take(k);
  for (const d of madeDirs) take(d);
  const r = relOf(p);
  if (r != null && !isDeleted(p)) {
    const rp = r ? `${r}/` : '';
    for (const k of Object.keys(manifest)) {
      if (!k.startsWith(rp)) continue;
      const name = k.slice(rp.length).split('/')[0];
      if (name && !isDeleted(`${p}/${name}`)) names.add(name);
    }
  }
  return [...names];
}

// ── Bytes ──────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const dec = new TextDecoder();
function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const encodePath = rel => rel.split('/').map(encodeURIComponent).join('/');
const remoteUrl = rel => `${FILES}${encodePath(rel)}`;

async function readBytes(p) {
  if (overlay.has(p)) return overlay.get(p);
  const r = relOf(p);
  if (r == null || manifest[r] == null || isDeleted(p)) throw enoent(p);
  const res = await fetch(remoteUrl(r));
  if (!res.ok) throw enoent(p);
  return new Uint8Array(await res.arrayBuffer());
}
function bytesFrom(data, encoding) {
  if (encoding === 'base64') return fromBase64(String(data));
  if (encoding === 'ascii') return Uint8Array.from(data);
  return enc.encode(String(data));
}

// ── Persistence (IndexedDB) ────────────────────────────────────────────
let db = null;
function openDb() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('mihrab-web', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('files');
        req.result.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
function idb(store, mode, fn) {
  if (!db) return Promise.resolve(undefined);
  return new Promise(resolve => {
    try {
      const tx = db.transaction(store, mode);
      const out = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}
const persistFile = (p, bytes) =>
  idb('files', 'readwrite', s => (bytes ? s.put(bytes, p) : s.delete(p)));
const persistMeta = () =>
  idb('meta', 'readwrite', s => {
    s.put([...deleted], 'deleted');
    s.put([...madeDirs], 'dirs');
  });

function writeBytes(p, bytes) {
  overlay.set(p, bytes);
  urlCache.delete(p);
  if (deleted.delete(p)) void persistMeta();
  void persistFile(p, bytes);
}
function remove(p) {
  const prefix = `${p}/`;
  for (const k of [...overlay.keys()]) {
    if (k === p || k.startsWith(prefix)) {
      overlay.delete(k);
      urlCache.delete(k);
      void persistFile(k, null);
    }
  }
  for (const d of [...madeDirs]) if (d === p || d.startsWith(prefix)) madeDirs.delete(d);
  const r = relOf(p);
  if (r != null && (manifest[r] != null || manifestDirs.has(r))) deleted.add(p);
  void persistMeta();
}

/** Every path under p (files only), from both layers. */
function walk(p) {
  const out = [];
  if (isFile(p)) return [p];
  for (const name of list(p)) out.push(...walk(`${p}/${name}`));
  return out;
}

// ── fileUrl: synchronous, as on the desktop ────────────────────────────
const urlCache = new Map();
function fileUrl(raw) {
  const p = norm(raw);
  if (overlay.has(p)) {
    let u = urlCache.get(p);
    if (!u) {
      u = URL.createObjectURL(new Blob([overlay.get(p)]));
      urlCache.set(p, u);
    }
    return u;
  }
  const r = relOf(p);
  return r != null ? remoteUrl(r) : raw;
}

// ── Notifications (while the tab is open) ──────────────────────────────
const notifListeners = new Set();
const NKEY = 'mihrab.web.notifications';
const REPEAT_MS = { 0: 3_600_000, 1: 86_400_000, 2: 604_800_000 };
const STALE_MS = 10 * 60_000;
let nstore = { triggers: {}, channels: {}, categories: [] };
try {
  nstore = { ...nstore, ...JSON.parse(localStorage.getItem(NKEY) || '{}') };
} catch {
  /* a private window: memory only */
}
const nsave = () => {
  try {
    localStorage.setItem(NKEY, JSON.stringify(nstore));
  } catch {
    /* memory only */
  }
};
const displayed = new Map();
// What the browser said when it was last asked; its `permission` property is
// read otherwise. (Some browsers report the property late.)
let answered = null;
function notificationPermission() {
  if (typeof Notification === 'undefined') return 'denied';
  return answered ?? Notification.permission;
}
const emit = event => notifListeners.forEach(fn => fn(event));
const newId = () => `n${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
function show(notification) {
  const channel = nstore.channels[notification.android?.channelId] ?? null;
  const sound = notification.android?.sound ?? channel?.sound ?? notification.ios?.sound ?? 'default';
  if (notificationPermission() === 'granted') {
    try {
      const n = new Notification(notification.title ?? 'Mihrab', { body: notification.body ?? '', silent: sound !== 'default' });
      n.onclick = () => {
        window.focus();
        emit({ type: 1, detail: { notification } });
      };
      displayed.set(notification.id, n);
    } catch {
      /* not allowed here */
    }
  }
  emit({ type: 3, detail: { notification }, sound });
}
function tick() {
  const now = Date.now();
  let changed = false;
  for (const [id, entry] of Object.entries(nstore.triggers)) {
    const at = entry.trigger.timestamp;
    if (at > now) continue;
    if (now - at <= STALE_MS) show(entry.notification);
    const every = REPEAT_MS[entry.trigger.repeatFrequency];
    if (every) {
      let next = at;
      while (next <= now) next += every;
      entry.trigger = { ...entry.trigger, timestamp: next };
    } else delete nstore.triggers[id];
    changed = true;
  }
  if (changed) nsave();
}
setInterval(tick, 15_000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());

// ── The bridge ─────────────────────────────────────────────────────────
let nextDl = 1;
const SECURE = 'mihrab.web.secure.';
let wakeLock = null;

window.mihrabDesktop = {
  web: true,
  app: {
    info: {
      version: __MIHRAB_WEB_VERSION__,
      platform: 'web',
      arch: '',
      locale: navigator.language,
      preferredLanguages: [...(navigator.languages || [navigator.language])],
      name: 'Mihrab',
      hostname: 'Web',
    },
    setTrayStatus: () => undefined,
    onAdhanStop: () => () => undefined,
    openExternal: async url => {
      if (typeof url !== 'string' || !/^(https?|mailto|geo|tel):/.test(url)) return false;
      window.open(url, '_blank', 'noopener');
      return true;
    },
  },
  dialog: {
    // The app's Alert: the labels, and the index of the one pressed.
    alert: async (title, message, buttons, cancelId) => {
      const text = [title, message].filter(Boolean).join('\n\n');
      const labels = Array.isArray(buttons) ? buttons : [];
      if (labels.length <= 1) {
        window.alert(text);
        return 0;
      }
      const cancel = cancelId ?? -1;
      const action = labels.findIndex((_, i) => i !== cancel);
      return window.confirm(text) ? action : cancel >= 0 ? cancel : labels.length - 1;
    },
  },
  notifications: {
    // The browser's own permission, which the desktop app does not have: the
    // notifee shim asks here when it is answered, and assumes yes otherwise.
    permission: notificationPermission,
    requestPermission: async () => {
      if (typeof Notification === 'undefined') return 'denied';
      try {
        // Asked even when already answered: a browser that has an answer
        // gives it back without showing anything.
        answered = await Notification.requestPermission();
      } catch {
        answered = 'denied';
      }
      return answered;
    },
    onEvent: fn => {
      notifListeners.add(fn);
      return () => notifListeners.delete(fn);
    },
    createTrigger: async (n, t) => {
      const id = n.id ?? newId();
      nstore.triggers[id] = { notification: { ...n, id }, trigger: t };
      nsave();
      return id;
    },
    display: async n => {
      const id = n.id ?? newId();
      show({ ...n, id });
      return id;
    },
    triggers: async () => Object.values(nstore.triggers),
    displayed: async () => [...displayed.keys()].map(id => ({ id, notification: { id } })),
    cancelTriggers: async ids => {
      if (ids == null) nstore.triggers = {};
      else for (const id of ids) delete nstore.triggers[id];
      nsave();
    },
    cancelDisplayed: async ids => {
      for (const id of ids ?? [...displayed.keys()]) {
        displayed.get(id)?.close?.();
        displayed.delete(id);
      }
    },
    createChannel: async c => {
      nstore.channels[c.id] = c;
      nsave();
      return c.id;
    },
    getChannel: async id => nstore.channels[id] ?? null,
    getChannels: async () => Object.values(nstore.channels),
    deleteChannel: async id => {
      delete nstore.channels[id];
      nsave();
    },
    setCategories: async c => {
      nstore.categories = c ?? [];
      nsave();
    },
    getCategories: async () => nstore.categories,
  },
  secure: {
    get: async k => {
      try {
        return localStorage.getItem(SECURE + k);
      } catch {
        return null;
      }
    },
    set: async (k, v) => {
      try {
        localStorage.setItem(SECURE + k, String(v));
      } catch {
        /* private window */
      }
    },
    remove: async k => {
      try {
        localStorage.removeItem(SECURE + k);
      } catch {
        /* private window */
      }
    },
    clear: async () => {
      try {
        Object.keys(localStorage).filter(k => k.startsWith(SECURE)).forEach(k => localStorage.removeItem(k));
      } catch {
        /* private window */
      }
    },
  },
  share: {
    saveFiles: async (urls, name) => {
      for (const [i, u] of (urls || []).entries()) {
        const a = document.createElement('a');
        a.href = String(u).startsWith('/') ? fileUrl(u) : u;
        a.download = name ? `${name}${urls.length > 1 ? `-${i + 1}` : ''}` : '';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return true;
    },
  },
  capture: {
    rect: async () => {
      throw new Error('Saving a picture of the page is not part of the web app.');
    },
  },
  power: {
    keepAwake: async on => {
      try {
        if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
        if (!on && wakeLock) {
          await wakeLock.release();
          wakeLock = null;
        }
      } catch {
        /* not offered by this browser */
      }
    },
  },
  syncFolder: {
    pick: async () => null,
    hasAccess: async () => false,
    forget: async () => undefined,
    list: async () => [],
    read: async () => {
      throw new Error('Sync is not part of the web app.');
    },
    write: async () => {
      throw new Error('Sync is not part of the web app.');
    },
    remove: async () => undefined,
    pickFile: async () => null,
  },
  clipboard: {
    read: () => navigator.clipboard?.readText?.() ?? Promise.resolve(''),
    write: text => navigator.clipboard?.writeText?.(String(text ?? '')) ?? Promise.resolve(),
  },
  fs: {
    dirs,
    exists: async raw => {
      const p = norm(raw);
      return isFile(p) || isDir(p);
    },
    stat: async raw => {
      const p = norm(raw);
      const name = p.slice(p.lastIndexOf('/') + 1);
      if (isFile(p)) {
        const size = overlay.has(p) ? overlay.get(p).length : manifest[relOf(p)];
        return { path: raw, size, type: 'file', lastModified: 0, filename: name };
      }
      if (isDir(p)) return { path: raw, size: 0, type: 'directory', lastModified: 0, filename: name };
      throw enoent(p);
    },
    isDir: async raw => isDir(norm(raw)),
    ls: async raw => {
      const p = norm(raw);
      if (!isDir(p)) throw enoent(p);
      return list(p);
    },
    mkdir: async raw => {
      const p = norm(raw);
      for (let q = p; q.length > ROOT.length; q = q.slice(0, q.lastIndexOf('/'))) {
        madeDirs.add(q);
        deleted.delete(q);
      }
      void persistMeta();
    },
    unlink: async raw => remove(norm(raw)),
    mv: async (a, b) => {
      const from = norm(a);
      const to = norm(b);
      for (const f of walk(from)) writeBytes(to + f.slice(from.length), await readBytes(f));
      remove(from);
    },
    cp: async (a, b) => {
      const from = norm(a);
      const to = norm(b);
      for (const f of walk(from)) writeBytes(to + f.slice(from.length), await readBytes(f));
    },
    readFile: async (raw, encoding) => {
      const bytes = await readBytes(norm(raw));
      if (encoding === 'base64') return toBase64(bytes);
      if (encoding === 'ascii') return Array.from(bytes);
      return dec.decode(bytes);
    },
    writeFile: async (raw, data, encoding, append) => {
      const p = norm(raw);
      let bytes = bytesFrom(data, encoding);
      if (append && isFile(p)) {
        const before = await readBytes(p);
        const joined = new Uint8Array(before.length + bytes.length);
        joined.set(before);
        joined.set(bytes, before.length);
        bytes = joined;
      }
      writeBytes(p, bytes);
      return bytes.length;
    },
    slice: async (from, to, start, end) => {
      const bytes = await readBytes(norm(from));
      const a = Math.max(0, Math.min(Number(start) || 0, bytes.length));
      const b = Math.max(a, Math.min(end == null ? bytes.length : Number(end), bytes.length));
      writeBytes(norm(to), bytes.slice(a, b));
      return to;
    },
    hash: async (raw, algorithm) => {
      const name = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[algorithm] ?? 'SHA-256';
      const digest = await crypto.subtle.digest(name, await readBytes(norm(raw)));
      return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    },
    df: async () => {
      try {
        const { quota = 0, usage = 0 } = (await navigator.storage?.estimate?.()) ?? {};
        return { free: Math.max(0, quota - usage), total: quota };
      } catch {
        return { free: 0, total: 0 };
      }
    },
    // The app's downloads: into the overlay. Nothing in the web app should
    // need one — it is all preloaded — but a tafsir fetched on demand does.
    download: (url, dest, headers, onProgress) => {
      const id = nextDl++;
      const controller = new AbortController();
      const done = (async () => {
        const res = await fetch(url, { headers: headers || {}, signal: controller.signal });
        const total = Number(res.headers.get('content-length')) || -1;
        const head = Object.fromEntries(res.headers);
        if (!res.ok || !res.body) return { status: res.status, bytes: 0, headers: head };
        const reader = res.body.getReader();
        const parts = [];
        let received = 0;
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          parts.push(value);
          received += value.length;
          onProgress?.(received, total);
        }
        const bytes = new Uint8Array(received);
        let at = 0;
        for (const part of parts) {
          bytes.set(part, at);
          at += part.length;
        }
        writeBytes(norm(dest), bytes);
        return { status: res.status, bytes: received, headers: head };
      })();
      return { id, done, cancel: async () => controller.abort() };
    },
    fileUrl,
  },
};

/** Resolves once the preloaded tree is known and the overlay restored. */
export const ready = (async () => {
  const [index, opened] = await Promise.all([
    fetch(`${FILES}index.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    openDb(),
  ]);
  manifest = Object.assign(Object.create(null), index);
  for (const k of Object.keys(manifest)) {
    const parts = k.split('/');
    for (let i = 1; i < parts.length; i++) manifestDirs.add(parts.slice(0, i).join('/'));
  }
  db = opened;
  if (db) {
    await new Promise(resolve => {
      try {
        const tx = db.transaction(['files', 'meta'], 'readonly');
        const files = tx.objectStore('files');
        const cursor = files.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            overlay.set(String(c.key), new Uint8Array(c.value));
            c.continue();
          }
        };
        const meta = tx.objectStore('meta');
        const del = meta.get('deleted');
        del.onsuccess = () => (del.result || []).forEach(p => deleted.add(p));
        const made = meta.get('dirs');
        made.onsuccess = () => (made.result || []).forEach(p => madeDirs.add(p));
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      } catch {
        resolve();
      }
    });
  }
  setTimeout(tick, 2000);
})();
