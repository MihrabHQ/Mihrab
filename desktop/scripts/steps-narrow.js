// The app at narrow windows: Today, Quran and Settings at each width, a
// screenshot of each, and a check that nothing runs off the window's sides.
module.exports = async ({ page, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  const cdp = await page.context().newCDPSession(page);
  await page.waitForTimeout(4000);
  const close = page.getByText(/^Close$/);
  if (await close.count()) { await close.last().click(); await page.waitForTimeout(800); }
  const tab = async re => {
    const els = page.getByText(re);
    for (let i = (await els.count()) - 1; i >= 0; i--) if (await els.nth(i).isVisible()) { await els.nth(i).click(); await page.waitForTimeout(1500); return true; }
    log('missing', String(re));
    return false;
  };
  // A mark on the page: a tab switch that reloads the app wipes it. Tabs
  // were links the browser followed, and every switch booted the app again.
  await page.evaluate(() => { window.__sameDocument = true; });
  const widths = (process.env.MIHRAB_WIDTHS || '380,480,600,700').split(',').map(Number);
  for (const w of widths) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 820, deviceScaleFactor: 0, mobile: false });
    await page.waitForTimeout(1500);
    for (const name of ['Today', 'Quran', 'Settings']) {
      await tab(new RegExp(`^${name}$`));
      await page.waitForTimeout(800);
      const over = await page.evaluate(() => {
        const out = [];
        for (const e of document.querySelectorAll('#root div')) {
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const cs = getComputedStyle(e);
          if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
          if (!e.children.length && e.textContent.trim() && (r.left < -1 || r.right > innerWidth + 1)) out.push(`${e.textContent.trim().slice(0, 30)} [${Math.round(r.left)},${Math.round(r.right)}]`);
        }
        return { scrollX: document.documentElement.scrollWidth > innerWidth + 1, out: out.slice(0, 6) };
      });
      log(`${w}px ${name}`, JSON.stringify(over));
      await shot(`96-narrow-${w}-${name.toLowerCase()}`);
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  if (!(await page.evaluate(() => window.__sameDocument === true))) errors.push('a tab switch reloaded the whole app');
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
