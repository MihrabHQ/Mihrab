/**
 * File access for the renderer — what react-native-blob-util and the app's
 * SyncFolder module do on a phone, done by the main process.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { ipcMain, net } = require('electron');
const { roots, inside, readable } = require('./paths');

const downloads = new Map();

function register() {
  ipcMain.handle('fs:dirs', () => roots());
  // Read once by the preload: blob-util's `fs.dirs` is a synchronous property.
  ipcMain.on('fs:dirsSync', e => {
    e.returnValue = roots();
  });

  ipcMain.handle('fs:exists', async (_e, p) => {
    try {
      await fsp.access(readable(p));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:stat', async (_e, p) => {
    const s = await fsp.stat(readable(p));
    return {
      path: p,
      size: s.size,
      type: s.isDirectory() ? 'directory' : 'file',
      lastModified: s.mtimeMs,
      filename: path.basename(p),
    };
  });

  ipcMain.handle('fs:isDir', async (_e, p) => {
    try {
      return (await fsp.stat(readable(p))).isDirectory();
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:ls', async (_e, p) => fsp.readdir(readable(p)));

  ipcMain.handle('fs:mkdir', async (_e, p) => {
    await fsp.mkdir(inside(p), { recursive: true });
  });

  ipcMain.handle('fs:unlink', async (_e, p) => {
    await fsp.rm(inside(p), { recursive: true, force: true });
  });

  ipcMain.handle('fs:mv', async (_e, from, to) => {
    await fsp.mkdir(path.dirname(inside(to)), { recursive: true });
    await fsp.rename(inside(from), inside(to));
  });

  ipcMain.handle('fs:cp', async (_e, from, to) => {
    await fsp.mkdir(path.dirname(inside(to)), { recursive: true });
    await fsp.cp(readable(from), inside(to), { recursive: true });
  });

  ipcMain.handle('fs:readFile', async (_e, p, encoding) => {
    const buf = await fsp.readFile(readable(p));
    if (encoding === 'base64') return buf.toString('base64');
    if (encoding === 'ascii') return Array.from(buf);
    return buf.toString('utf8');
  });

  ipcMain.handle('fs:writeFile', async (_e, p, data, encoding, append) => {
    const target = inside(p);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const buf =
      encoding === 'base64'
        ? Buffer.from(data, 'base64')
        : encoding === 'ascii'
          ? Buffer.from(data)
          : Buffer.from(String(data), 'utf8');
    if (append) await fsp.appendFile(target, buf);
    else await fsp.writeFile(target, buf);
    return buf.length;
  });

  // Streamed to disk, never through the renderer: a mushaf is 180 MB and
  // a surah of audio is tens. Progress is pushed back as it arrives.
  ipcMain.handle('fs:download', async (event, id, url, dest, headers) => {
    const target = inside(dest);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const controller = new AbortController();
    downloads.set(id, controller);
    const tmp = `${target}.part`;
    try {
      const res = await net.fetch(url, { headers: headers || {}, signal: controller.signal });
      const total = Number(res.headers.get('content-length')) || -1;
      if (!res.ok || !res.body) {
        return { status: res.status, bytes: 0, headers: Object.fromEntries(res.headers) };
      }
      const out = fs.createWriteStream(tmp);
      let received = 0;
      let lastSent = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (!out.write(Buffer.from(value))) {
          await new Promise(r => out.once('drain', r));
        }
        const now = Date.now();
        if (now - lastSent > 100 && !event.sender.isDestroyed()) {
          lastSent = now;
          event.sender.send('fs:progress', id, received, total);
        }
      }
      await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
      await fsp.rename(tmp, target);
      return { status: res.status, bytes: received, headers: Object.fromEntries(res.headers) };
    } catch (e) {
      await fsp.rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    } finally {
      downloads.delete(id);
    }
  });

  ipcMain.handle('fs:cancel', (_e, id) => {
    downloads.get(id)?.abort();
  });
}

module.exports = { register };
