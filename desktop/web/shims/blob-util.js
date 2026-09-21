/**
 * react-native-blob-util on the desktop: the same `fs` surface and
 * `config({ path }).fetch()` download, done by the main process so a
 * 180 MB muṣḥaf never passes through the page.
 *
 * Without Electron (a plain browser, for layout work) every call fails the
 * way a missing file fails, which the app already handles.
 */
import { desktop } from './desktop';

const d = desktop();
const dirs = d
  ? {
      DocumentDir: d.fs.dirs.documents,
      CacheDir: d.fs.dirs.cache,
      MainBundleDir: d.fs.dirs.bundle,
      LibraryDir: d.fs.dirs.data,
      DownloadDir: d.fs.dirs.documents,
    }
  : { DocumentDir: '/documents', CacheDir: '/cache', MainBundleDir: '/bundle', LibraryDir: '/data', DownloadDir: '/documents' };

const need = () => {
  if (!d) throw new Error('file access needs the desktop app');
  return d.fs;
};
const strip = p => (typeof p === 'string' && p.startsWith('file://') ? decodeURIComponent(p.slice(7)) : p);

const fs = {
  dirs,
  exists: async p => (d ? d.fs.exists(strip(p)) : false),
  isDir: async p => (d ? d.fs.isDir(strip(p)) : false),
  stat: async p => need().stat(strip(p)),
  lstat: async p => {
    const f = need();
    const dir = strip(p);
    const names = await f.ls(dir);
    return Promise.all(names.map(n => f.stat(`${dir}/${n}`)));
  },
  ls: async p => need().ls(strip(p)),
  mkdir: async p => need().mkdir(strip(p)),
  unlink: async p => need().unlink(strip(p)),
  mv: async (a, b) => need().mv(strip(a), strip(b)),
  cp: async (a, b) => need().cp(strip(a), strip(b)),
  readFile: async (p, encoding = 'utf8') => need().readFile(strip(p), encoding),
  writeFile: async (p, data, encoding = 'utf8') => need().writeFile(strip(p), data, encoding, false),
  appendFile: async (p, data, encoding = 'utf8') => need().writeFile(strip(p), data, encoding, true),
  // Android's `bundle-assets://` has no meaning here; the bundle is a folder.
  asset: file => `${dirs.MainBundleDir}/${file}`,
  df: async () => ({ free: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER }),
};

function response(status, headers, path, bytes) {
  return {
    path: () => path,
    info: () => ({ status, headers, respType: 'blob', state: '2', taskId: '' }),
    respInfo: { status, headers },
    data: path,
    bytes,
    text: async () => (path ? need().readFile(path, 'utf8') : ''),
    json: async () => JSON.parse(path ? await need().readFile(path, 'utf8') : 'null'),
    base64: async () => (path ? need().readFile(path, 'base64') : ''),
    flush: async () => (path ? need().unlink(path) : undefined),
  };
}

function config(options = {}) {
  return {
    fetch(method, url, headers) {
      let onProgress = null;
      let handle = null;
      let cancelled = false;
      const task = (async () => {
        if (String(method).toUpperCase() !== 'GET') {
          throw new Error('desktop blob-util: only GET downloads are supported');
        }
        const target = options.path ?? `${dirs.CacheDir}/blob-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        handle = need().download(url, strip(target), headers, (received, total) =>
          onProgress?.(received, total),
        );
        if (cancelled) void handle.cancel();
        const r = await handle.done;
        return response(r.status, r.headers, r.status >= 200 && r.status < 300 ? target : null, r.bytes);
      })();
      task.progress = (a, b) => {
        onProgress = typeof a === 'function' ? a : b;
        return task;
      };
      task.uploadProgress = () => task;
      task.expire = () => task;
      task.stateChange = () => task;
      task.cancel = cb => {
        cancelled = true;
        if (handle) void handle.cancel();
        cb?.();
      };
      return task;
    },
  };
}

const ReactNativeBlobUtil = {
  fs,
  config,
  fetch: (method, url, headers) => config().fetch(method, url, headers),
  wrap: p => `RNFetchBlob-file://${p}`,
  base64: {
    encode: s => btoa(unescape(encodeURIComponent(s))),
    decode: s => decodeURIComponent(escape(atob(s))),
  },
};

export default ReactNativeBlobUtil;
