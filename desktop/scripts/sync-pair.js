#!/usr/bin/env node
/**
 * Two copies of the desktop app syncing through one folder — the check that
 * folder sync works on Windows and Linux, run on whichever of them this is.
 *
 *   node scripts/sync-pair.js            # after `npm run build`
 *
 * Two profiles (two "devices"), one shared folder. The folder dialog is
 * answered from the main process, since nobody is there to click it. Each
 * device chooses the folder and pairs with the other's code; device A logs
 * a prayer and syncs; device B syncs and must show it logged. Exits 1 if it
 * does not.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron: electron } = require('playwright-core');

const root = process.env.SYNC_PAIR_DIR
  ? (fs.mkdirSync(process.env.SYNC_PAIR_DIR, { recursive: true }), process.env.SYNC_PAIR_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'mihrab-sync-'));
const folder = path.join(root, 'shared');
fs.mkdirSync(folder);

async function open(name) {
  const profile = path.join(root, name);
  const app = await electron.launch({
    // Linux CI runs the unpackaged Electron, whose sandbox helper is not
    // set up; the packaged app's is (see the deb's postinst).
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.join(__dirname, '..')],
    env: { ...process.env, MIHRAB_USER_DATA: profile, NODE_ENV: '' },
  });
  // The folder dialog, answered.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, folder);
  const page = await app.firstWindow();
  // Early afternoon today, so there are prayers already in to log.
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
  return { app, page, say, click };
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

async function openSync(d) {
  await d.click(/^Settings$/);
  await d.click(/^About$/);
  await d.click(/^Sync between devices$/, 2500);
}

async function code(d) {
  const text = await d.page.evaluate(() => document.body.innerText);
  const m = text.match(/MHRB-[A-Z0-9-]{6,}/);
  if (!m) throw new Error('no pairing code on the sync page');
  return m[0];
}

async function pairWith(d, other) {
  const input = d.page.getByPlaceholder(/MHRB/).first();
  await input.fill(other);
  await d.click(/^Pair$/, 1500);
  await d.click(/^Pair$/, 2500); // the confirmation
}

// Put away anything over the page — an alert's OK, a sheet's Not now, or
// Esc — until "Sync now" can be clicked, without leaving the Sync page.
async function clear(d) {
  for (let i = 0; i < 4; i++) {
    const target = d.page.getByText(/^Sync now$/).first();
    if (await target.count()) {
      try {
        await target.click({ trial: true, timeout: 1500 });
        return;
      } catch {}
    }
    if (!(await d.click(/^(OK|Not now|Close|Done|Maybe later)$/, 800))) {
      await d.page.keyboard.press('Escape');
      await d.page.waitForTimeout(800);
    }
  }
  if (!(await d.page.getByText(/^Sync now$/).count())) await openSync(d);
}

// Back out of Sync and About (Esc is the app's back), to Today.
async function home(d) {
  for (let i = 0; i < 2; i++) {
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
  try {
    await onboard(a);
    await onboard(b);
    await openSync(a);
    await openSync(b);
    await a.click(/^Choose a folder$/, 2000);
    await b.click(/^Choose a folder$/, 2000);
    const codeA = await code(a);
    const codeB = await code(b);
    a.say('code', codeA);
    b.say('code', codeB);
    await pairWith(a, codeB);
    await pairWith(b, codeA);
    a.say('folder after pairing', fs.readdirSync(folder).join(', '));

    // A logs the last prayer that has come in today, and syncs.
    await home(a);
    const mark = a.page.getByRole('checkbox', { name: /^Mark .* as prayed$/ }).last();
    if (!(await mark.count())) throw new Error('no prayer to log on A yet today');
    const which = await mark.getAttribute('aria-label');
    await mark.click();
    await a.page.waitForTimeout(1500);
    a.say('logged', which, JSON.stringify(await loggedChecks(a)));
    await openSync(a);
    await a.click(/^Sync now$/, 4000);
    a.say('sync now:', (await a.page.evaluate(() => document.body.innerText)).match(/Synced|Nothing new|didn’t finish[^\n]*/)?.[0]);
    a.say('folder after A synced', fs.readdirSync(folder).join(', '));

    // B syncs, and the log has to be there. Whatever B was left showing
    // after pairing (a sheet, an alert) is put away first.
    await b.page.screenshot({ path: path.join(root, 'B-before-sync.png') });
    b.say('before sync now:', (await b.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
    await clear(b);
    await b.click(/^Sync now$/, 4000);
    await b.page.screenshot({ path: path.join(root, 'B-synced.png') });
    b.say('after sync now:', (await b.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
    await b.click(/^OK$/, 800);
    await home(b);
    await b.page.screenshot({ path: path.join(root, 'B-today.png') });
    const onB = await loggedChecks(b);
    b.say('logged on B', JSON.stringify(onB));
    const ok = onB.some(l => which && l.startsWith(which.replace(/^Mark (.*) as prayed$/, '$1')));
    console.log(ok ? 'SYNC OK' : 'SYNC FAILED');
    process.exitCode = ok ? 0 : 1;
  } finally {
    await a.page.screenshot({ path: path.join(root, 'A.png') }).catch(() => undefined);
    await b.page.screenshot({ path: path.join(root, 'B.png') }).catch(() => undefined);
    console.log('screens and folder in', root);
    await a.app.close();
    await b.app.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
