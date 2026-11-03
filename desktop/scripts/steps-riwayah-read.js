// From a profile with IndoPak and Warsh downloaded: read Al-Fatihah and a
// few pages on in each, then back to Hafs. Fails on a page error or on any
// line wider than its box.
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
  const choose = async name => {
    await page.getByLabel(/^Reading tradition: /).first().click();
    await page.waitForTimeout(1500);
    await tap(new RegExp(`^${name}`), 4000);
  };
  const check = async label => {
    const r = await page.evaluate(() => {
      const big = [...document.querySelectorAll('div')].filter(e => parseFloat(getComputedStyle(e).fontSize) > 25 && e.getBoundingClientRect().width > 100 && e.getBoundingClientRect().left >= 0 && e.getBoundingClientRect().right <= innerWidth + 1);
      // How full each line is against the page's widest: a justified page
      // has every line but a surah's last at the measure.
      const widths = big.map(e => e.getBoundingClientRect().width);
      const widest = Math.max(0, ...widths);
      const short = widths.filter(w => w < widest * 0.97).length;
      return {
        pg: (document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/) || []).slice(1).join('/'),
        lines: big.length,
        short,
        over: big.filter(e => e.scrollWidth > e.clientWidth + 0.5).length,
        fonts: [...new Set(big.map(e => getComputedStyle(e).fontFamily))].join(','),
      };
    });
    log(label, JSON.stringify(r));
    if (r.over) errors.push(`${label}: ${r.over} line(s) wider than their box`);
    if (!r.lines) errors.push(`${label}: no lines drawn`);
    // A surah's closing line or two may stop short; more is a ragged page.
    if (r.short > 3) errors.push(`${label}: ${r.short} of ${r.lines} lines short of the measure`);
  };
  // One viewport whatever the window manager makes of the window.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1214, height: 1350, deviceScaleFactor: 0, mobile: false });
  await page.waitForTimeout(4000);
  if (await page.getByText(/^What.s new$/).count()) await tap(/^Close$/, 1200);
  await tap(/^Quran$/);
  await tap(/^Al-Fatihah$/, 4000);
  await tap(/^Not now$/, 800).catch(() => {});
  for (const name of ['IndoPak', 'Warsh']) {
    await choose(name);
    await check(`${name} p1`);
    await shot(`98-${name.toLowerCase()}-1`);
    await page.mouse.click(1200, 900);
    for (let k = 0; k < 6; k++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(900); await check(`${name} +${k + 1}`); }
    await shot(`98-${name.toLowerCase()}-2`);
  }
  await choose('Hafs');
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
