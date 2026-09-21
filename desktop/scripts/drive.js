#!/usr/bin/env node
/**
 * Drive the desktop app from a script — for checking a build without a
 * person at the keyboard.
 *
 *   node scripts/drive.js <steps.js> [--profile <dir>] [--keep]
 *
 * <steps.js> exports `async ({ page, shot, app, log }) => { … }`. Each
 * `shot(name)` saves build/shots/<name>.png. The page's console is echoed.
 * A fresh profile is used unless --profile names one (reuse it to continue
 * from where a previous run left the app).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron: electron } = require('playwright-core');

async function main() {
  const args = process.argv.slice(2);
  const stepsFile = args.find(a => !a.startsWith('--'));
  if (!stepsFile) throw new Error('usage: drive.js <steps.js> [--profile dir]');
  const pi = args.indexOf('--profile');
  const profile = pi >= 0 ? path.resolve(args[pi + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'mihrab-'));
  const shots = path.join(__dirname, '..', 'build', 'shots');
  fs.mkdirSync(shots, { recursive: true });

  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, MIHRAB_USER_DATA: profile, NODE_ENV: '' },
  });
  const page = await app.firstWindow();
  page.on('console', m => {
    const t = m.text();
    if (/direction|shadow\*|pointerEvents is deprecated|useNativeDriver|React does not recognize/.test(t)) return;
    console.log(`[page:${m.type()}] ${t.slice(0, 400)}`);
  });
  page.on('pageerror', e => console.log(`[page:uncaught] ${e.message}`));
  await page.waitForLoadState('domcontentloaded');
  const shot = async name => {
    const file = path.join(shots, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`[shot] ${file}`);
  };
  const log = (...a) => console.log('[drive]', ...a);
  try {
    await require(path.resolve(stepsFile))({ page, shot, app, log, profile });
  } finally {
    if (!args.includes('--keep')) await app.close();
  }
  console.log(`[drive] profile: ${profile}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
