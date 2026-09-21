/**
 * Where the desktop app keeps its files, and the one rule every file IPC
 * obeys: a path the renderer names must resolve inside the app's own data
 * folder. The renderer is our code, but it also renders text from the
 * network (translations, sync envelopes), and a path check is cheap.
 */
const path = require('path');
const { app } = require('electron');

/**
 * The read-only files shipped with the app — the Qur'an text and
 * translations that the phones read from their bundle. Packaged, they sit
 * in resources/bundle; from a checkout, they are the repo's own assets/.
 */
function bundleDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bundle')
    : path.resolve(__dirname, '..', '..', 'assets');
}

function roots() {
  const data = app.getPath('userData');
  return {
    data,
    documents: path.join(data, 'Documents'),
    cache: path.join(data, 'Caches'),
    bundle: bundleDir(),
  };
}

function within(base, resolved) {
  const rel = path.relative(base, resolved);
  return !(rel.startsWith('..') || path.isAbsolute(rel));
}

/** A path the renderer may write: inside the app's data folder only. */
function inside(p) {
  if (typeof p !== 'string' || p.length === 0) throw new Error('path required');
  const resolved = path.resolve(p);
  if (!within(roots().data, resolved)) {
    throw new Error(`path outside the app's data folder: ${p}`);
  }
  return resolved;
}

/** A path the renderer may read: its data folder, or the app's own bundle. */
function readable(p) {
  if (typeof p !== 'string' || p.length === 0) throw new Error('path required');
  const resolved = path.resolve(p);
  const r = roots();
  if (!within(r.data, resolved) && !within(r.bundle, resolved)) {
    throw new Error(`path outside the app's folders: ${p}`);
  }
  return resolved;
}

module.exports = { roots, inside, readable };
