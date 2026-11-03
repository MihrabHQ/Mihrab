// From an onboarded profile: turn prayer alerts on in Settings and check
// that the next prayers are scheduled with the desktop's notifications.
module.exports = async ({ page, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  const tap = async (re, wait = 1800) => {
    const els = page.getByText(re);
    for (let i = (await els.count()) - 1; i >= 0; i--) {
      if (await els.nth(i).isVisible()) { await els.nth(i).click(); await page.waitForTimeout(wait); return true; }
    }
    log('missing', String(re));
    return false;
  };
  const triggers = () => page.evaluate(() =>
    window.mihrabDesktop.notifications.triggers().then(t => t.map(x => ({ title: x.notification.title, at: new Date(x.trigger.timestamp).toISOString() }))));
  await page.waitForTimeout(4000);
  if (await page.getByText(/^What.s new$/).count()) await tap(/^Close$/, 1200);
  await tap(/^Settings$/);
  log('widgets row', await page.getByText(/^Widgets$/).count());
  await tap(/^Notifications$/);
  const before = await triggers();
  // The switch beside "Prayer alerts".
  // On a profile where they are already on, leave them on.
  const sw = page.getByRole('switch').first();
  if (!before.length) {
    if (await sw.count()) { await sw.click(); await page.waitForTimeout(2000); } else log('no switch');
  }
  // The schedule is written by Today (as on a phone, where an inactive tab
  // is frozen): go back to it, and it lands a few seconds on.
  await page.mouse.click(5, 5);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await tap(/^Today$/, 1500);
  let after = await triggers();
  for (let i = 0; i < 15 && !after.length; i++) { await page.waitForTimeout(2000); after = await triggers(); }
  log('scheduled before', before.length, 'after', after.length);
  log('next', JSON.stringify(after.slice(0, 6)));
  await shot('93-alerts');
  if (!after.length) errors.push('no prayer alerts scheduled');
  if (await page.getByText(/^Widgets$/).count()) errors.push('Widgets row shown on Windows/Linux');
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
