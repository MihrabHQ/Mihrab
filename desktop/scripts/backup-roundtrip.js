#!/usr/bin/env node
/**
 * A backup out of one copy of the desktop app and into another — the check
 * that export and import work on Windows and Linux, run on whichever of them
 * this is.
 *
 *   node scripts/backup-roundtrip.js     # after `npm run build`
 *
 * Two profiles. A logs a prayer and exports a backup; the save dialog is
 * answered from the main process, and the name it suggested has to be a
 * plain `.json`. B imports that file through the open dialog and must then
 * show the prayer logged. Exits 1 if anything along the way does not hold.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron: electron } = require('playwright-core');

const root = process.env.BACKUP_DIR
  ? (fs.mkdirSync(process.env.BACKUP_DIR, { recursive: true }), process.env.BACKUP_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'mihrab-backup-'));
const target = path.join(root, 'out', 'backup.json');
fs.mkdirSync(path.dirname(target), { recursive: true });

async function open(name) {
  const profile = path.join(root, name);
  const app = await electron.launch({
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.join(__dirname, '..')],
    env: { ...process.env, MIHRAB_USER_DATA: profile, NODE_ENV: '' },
  });
  // Both dialogs answered; the save dialog's suggestion is kept to check.
  await app.evaluate(({ dialog }, file) => {
    global.__suggested = [];
    dialog.showSaveDialog = async (...args) => {
      const opts = args[args.length - 1] || {};
      global.__suggested.push(opts.defaultPath || '');
      return { canceled: false, filePath: file };
    };
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    // Alerts are native message boxes; their titles are kept, and OK pressed.
    global.__alerts = [];
    dialog.showMessageBox = async (...args) => {
      const opts = args[args.length - 1] || {};
      global.__alerts.push([opts.title, opts.message, opts.detail].filter(Boolean).join(' | '));
      return { response: 0, checkboxChecked: false };
    };
  }, target);
  const page = await app.firstWindow();
  const noon = new Date();
  noon.setHours(14, 0, 0, 0);
  await page.clock.install({ time: noon });
  await page.reload();
  page.on('pageerror', e => console.log(`[${name}:uncaught] ${e.message}`));
  await page.waitForLoadState('domcontentloaded');
  const say = (...a) => console.log(`[${name}]`, ...a);
  const click = async (re, wait = 1500) => {
    const els = page.getByText(re);
    for (let i = (await els.count()) - 1; i >= 0; i--) {
      if (await els.nth(i).isVisible()) {
        await els.nth(i).click();
        await page.waitForTimeout(wait);
        return true;
      }
    }
    say('missing', String(re));
    return false;
  };
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  return { app, page, say, click, text };
}

async function onboard(d) {
  await d.page.waitForTimeout(3000);
  await d.click(/^Continue$/);
  await d.click(/^Search or enter coordinates$/);
  await d.page.locator('input').first().fill('Stockholm');
  await d.page.waitForTimeout(2500);
  await d.click(/^Stockholm, Stockholm Municipality$/, 2500);
  for (let i = 0; i < 10; i++) {
    if (!(await d.click(/^(Continue|Next|Skip|Not now|Get started|Done|Maybe later|Start)$/))) break;
  }
  await d.page.waitForTimeout(2500);
}

async function openBackup(d) {
  await d.click(/^Settings$/);
  await d.click(/^About$/);
  if (!(await d.click(/^Backup$/, 2500))) throw new Error('no Backup row under About');
}

async function home(d) {
  for (let i = 0; i < 3; i++) {
    await d.page.keyboard.press('Escape');
    await d.page.waitForTimeout(800);
  }
  const tab = d.page.getByRole('tab', { name: /Today/ }).first();
  if (await tab.count()) await tab.click();
  else await d.click(/^Today$/);
  await d.page.waitForTimeout(2500);
}

const loggedChecks = d =>
  d.page.evaluate(() =>
    [...document.querySelectorAll('[role=checkbox]')]
      .map(e => e.getAttribute('aria-label') || '')
      .filter(l => /logged/i.test(l)),
  );

(async () => {
  const a = await open('A');
  const b = await open('B');
  const fail = msg => {
    throw new Error(msg);
  };
  try {
    await onboard(a);
    await onboard(b);

    // A logs a prayer, then exports.
    const mark = a.page.getByRole('checkbox', { name: /^Mark .* as prayed$/ }).last();
    if (!(await mark.count())) fail('no prayer to log on A yet today');
    const which = (await mark.getAttribute('aria-label')).replace(/^Mark (.*) as prayed$/, '$1');
    await mark.click();
    await a.page.waitForTimeout(1500);
    a.say('logged', which);
    await openBackup(a);
    if (!(await a.click(/^Export to a file$/, 3000))) fail('no Export button');
    const suggested = await a.app.evaluate(() => global.__suggested);
    a.say('save dialog suggested', JSON.stringify(suggested));
    if (!suggested.length) fail('the save dialog never opened');
    const name = path.basename(suggested[0].replace(/\\/g, '/'));
    if (!/^mihrab-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)) fail(`suggested name ${name}`);
    if (!fs.existsSync(target)) fail('nothing was written where the dialog said');
    const snap = JSON.parse(fs.readFileSync(target, 'utf8'));
    a.say('file', fs.statSync(target).size, 'bytes, keys', Object.keys(snap).join(','));
    const savedAlerts = await a.app.evaluate(() => global.__alerts);
    a.say('alerts', JSON.stringify(savedAlerts));
    if (!savedAlerts.some(t => /^Saved/.test(t))) fail('no Saved confirmation');

    // B imports it.
    await openBackup(b);
    if (!(await b.click(/^Choose a backup file$/, 2500))) fail('no Choose button');
    if (!(await b.page.getByText(/^Import into this device$/).count())) {
      b.say('after choosing:', (await b.text()).slice(0, 400));
    }
    if (!(await b.click(/^Import into this device$/, 3000))) fail('the file was not taken');
    const importAlerts = await b.app.evaluate(() => global.__alerts);
    b.say('alerts', JSON.stringify(importAlerts));
    if (!importAlerts.some(t => /^Imported/.test(t))) fail('no Imported confirmation');
    await home(b);
    const onB = await loggedChecks(b);
    b.say('logged on B', JSON.stringify(onB));
    const ok = onB.some(l => l.startsWith(which));
    console.log(ok ? 'BACKUP OK' : 'BACKUP FAILED');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.log('BACKUP FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await a.page.screenshot({ path: path.join(root, 'A.png') }).catch(() => undefined);
    await b.page.screenshot({ path: path.join(root, 'B.png') }).catch(() => undefined);
    console.log('screens and file in', root);
    await a.app.close();
    await b.app.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
