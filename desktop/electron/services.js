/**
 * The rest of what the phones do natively: encrypted storage, "share" as
 * save-to-disk, capturing a view as an image, keeping the screen awake, and
 * the user's sync folder.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { app, dialog, ipcMain, powerSaveBlocker, safeStorage } = require('electron');
const { inside, readable, roots } = require('./paths');

function jsonFile(name) {
  const file = () => path.join(app.getPath('userData'), name);
  return {
    read() {
      try {
        return JSON.parse(fs.readFileSync(file(), 'utf8'));
      } catch {
        return {};
      }
    },
    write(obj) {
      const f = file();
      fs.writeFileSync(`${f}.tmp`, JSON.stringify(obj));
      fs.renameSync(`${f}.tmp`, f);
    },
  };
}

// ── Encrypted storage ───────────────────────────────────────────────────
const secrets = jsonFile('secure-store.json');
function encrypt(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return { e: safeStorage.encryptString(String(value)).toString('base64') };
  }
  return { p: String(value) };
}
function decrypt(entry) {
  if (!entry) return null;
  if (entry.e != null) return safeStorage.decryptString(Buffer.from(entry.e, 'base64'));
  return entry.p ?? null;
}

// ── Sync folders: only ones the user picked through our dialog ──────────
const picked = jsonFile('sync-folders.json');
function grantedFolders() {
  return picked.read().folders ?? [];
}
function folder(handle) {
  const list = grantedFolders();
  if (typeof handle !== 'string' || !list.includes(handle)) throw new Error('no access to that folder');
  return handle;
}
function entry(handle, name) {
  if (typeof name !== 'string' || name.includes('/') || name.includes('\\') || name === '..') {
    throw new Error('bad file name');
  }
  return path.join(folder(handle), name);
}

function register(getWindow) {
  ipcMain.handle('secure:get', (_e, k) => decrypt(secrets.read()[k]));
  ipcMain.handle('secure:set', (_e, k, v) => {
    const all = secrets.read();
    all[k] = encrypt(v);
    secrets.write(all);
  });
  ipcMain.handle('secure:remove', (_e, k) => {
    const all = secrets.read();
    delete all[k];
    secrets.write(all);
  });
  ipcMain.handle('secure:clear', () => secrets.write({}));

  // Share → "Save as…". One file: a save dialog with the file's name.
  // Several: pick a folder and copy them all in.
  ipcMain.handle('share:saveFiles', async (_e, urls, suggested) => {
    const files = urls.map(u => readable(String(u).replace(/^file:\/\//, '')));
    const win = getWindow() ?? undefined;
    if (files.length === 1) {
      const ext = path.extname(files[0]);
      const name = suggested ? `${String(suggested).replace(/[\\/:*?"<>|]/g, '-')}${ext}` : path.basename(files[0]);
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('documents'), name),
      });
      if (canceled || !filePath) return null;
      await fsp.copyFile(files[0], filePath);
      return filePath;
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths[0]) return null;
    for (const f of files) await fsp.copyFile(f, path.join(filePaths[0], path.basename(f)));
    return filePaths[0];
  });

  ipcMain.handle('capture:rect', async (_e, rect, options) => {
    const win = getWindow();
    if (!win) throw new Error('no window');
    let image = await win.webContents.capturePage(rect);
    if (options.width && options.height) {
      image = image.resize({ width: Math.round(options.width), height: Math.round(options.height) });
    }
    const jpg = options.format === 'jpg' || options.format === 'jpeg';
    const buf = jpg ? image.toJPEG(Math.round((options.quality ?? 1) * 100)) : image.toPNG();
    if (options.result === 'base64') return buf.toString('base64');
    if (options.result === 'data-uri') return `data:image/${jpg ? 'jpeg' : 'png'};base64,${buf.toString('base64')}`;
    const dir = path.join(roots().cache, 'captures');
    await fsp.mkdir(dir, { recursive: true });
    const file = inside(path.join(dir, `capture-${Date.now()}.${jpg ? 'jpg' : 'png'}`));
    await fsp.writeFile(file, buf);
    return file;
  });

  let blocker = null;
  ipcMain.handle('power:keepAwake', (_e, on) => {
    if (on && blocker == null) blocker = powerSaveBlocker.start('prevent-display-sleep');
    if (!on && blocker != null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
  });

  ipcMain.handle('sync:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow() ?? undefined, {
      title: 'Choose a sync folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths[0]) return null;
    const handle = filePaths[0];
    const list = grantedFolders();
    if (!list.includes(handle)) picked.write({ folders: [...list, handle] });
    return { handle, label: path.basename(handle) || handle, kind: 'folder' };
  });
  ipcMain.handle('sync:hasAccess', async (_e, handle) => {
    if (!grantedFolders().includes(handle)) return false;
    try {
      await fsp.access(handle, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('sync:forget', (_e, handle) => {
    picked.write({ folders: grantedFolders().filter(f => f !== handle) });
    return true;
  });
  ipcMain.handle('sync:list', async (_e, handle) => {
    const names = await fsp.readdir(folder(handle), { withFileTypes: true });
    return names.filter(n => n.isFile()).map(n => n.name);
  });
  ipcMain.handle('sync:read', (_e, handle, name) => fsp.readFile(entry(handle, name), 'utf8'));
  ipcMain.handle('sync:write', async (_e, handle, name, contents) => {
    const f = entry(handle, name);
    await fsp.writeFile(`${f}.tmp`, String(contents), 'utf8');
    await fsp.rename(`${f}.tmp`, f);
    return true;
  });
  ipcMain.handle('sync:remove', async (_e, handle, name) => {
    await fsp.rm(entry(handle, name), { force: true });
    return true;
  });
  ipcMain.handle('sync:pickFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow() ?? undefined, {
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;
    const buf = await fsp.readFile(filePaths[0]);
    return { name: path.basename(filePaths[0]), base64: buf.toString('base64') };
  });
}

module.exports = { register };
