// Visit every tab and the main sub-screens; report errors and shoot each.
module.exports = async ({ page, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  const tap = async (re, wait = 1800) => {
    const els = page.getByText(re);
    const n = await els.count();
    for (let i = n - 1; i >= 0; i--) { if (await els.nth(i).isVisible()) { await els.nth(i).click(); await page.waitForTimeout(wait); return true; } }
    log('missing', String(re)); return false;
  };
  const back = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(1200); };
  await page.waitForTimeout(4000);
  const visit = async (name, re, subs = []) => {
    if (!(await tap(re))) return;
    await shot(`80-${name}`);
    for (const [sname, sre] of subs) {
      if (await tap(sre)) { await shot(`81-${name}-${sname}`); await back(); }
    }
  };
  await visit('today', /^Today$/, [['month', /^Nov(ember)? 2026$|Month/]]);
  await visit('tasbih', /^Tasbih$/);
  await visit('duas', /^Duas$/);
  await visit('log', /^Log$/);
  await visit('settings', /^Settings$/, [
    ['prayer', /^Prayer times$/], ['notifications', /^Notifications$|^Adhan/], ['quran', /^Quran$/],
    ['appearance', /^Appearance$|^Look$/], ['widgets', /^Widgets$/], ['sync', /^Sync$|Sync between/], ['backup', /^Backup$|Back up/],
    ['language', /^Language$/], ['about', /^About$|^About Mihrab$/],
  ]);
  await visit('quran', /^Quran$/, [['tilawah', /^Tilawah$|^Tilāwah$/]]);
  const found = [...new Set(errors)];
  log('ERRORS', JSON.stringify(found.slice(0, 30), null, 1));
  if (found.length) throw new Error(found.length + ' page error(s)');
};
