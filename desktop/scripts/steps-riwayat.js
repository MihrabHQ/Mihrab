// From an onboarded profile: download the IndoPak print and Warsh, and say
// where the reading tradition is chosen. Fails on any page error.
module.exports = async ({ page, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  const tap = async (re, w = 2000) => {
    const e = page.getByText(re);
    for (let i = (await e.count()) - 1; i >= 0; i--) {
      if (await e.nth(i).isVisible()) { await e.nth(i).click(); await page.waitForTimeout(w); return true; }
    }
    log('missing', String(re));
    return false;
  };
  await page.waitForTimeout(4000);
  if (await page.getByText(/^What.s new$/).count()) await tap(/^Close$/, 1200);
  await tap(/^Quran$/);
  await tap(/^Reading traditions/);
  // The rows in order: IndoPak, Warsh, Qalun, Shu'bah — download the first two.
  for (let k = 0; k < 2; k++) {
    const dl = page.getByText(/^Download$/).first();
    if (await dl.count()) { await dl.click(); await page.waitForTimeout(12000); }
  }
  const t = await page.evaluate(() => document.body.innerText);
  const i = t.indexOf('Reading traditions');
  log('after', t.slice(i, i + 700).replace(/\n+/g, ' | '));
  await shot('97-riwayat-downloaded');
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
