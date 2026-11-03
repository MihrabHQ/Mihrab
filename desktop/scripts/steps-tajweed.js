// From a profile with the muṣḥaf: turn tajweed colours on, wait for the
// coloured pages, open Al-Baqarah and check no line overflows.
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
  const count = dir => page.evaluate(async d => {
    const m = window.mihrabDesktop;
    try { return (await m.fs.ls(`${m.fs.dirs.documents}/quran/fonts/${d}`)).length; } catch { return 0; }
  }, dir);
  await page.waitForTimeout(4000);
  if (await page.getByText(/^What.s new$/).count()) await tap(/^Close$/, 1200);
  await tap(/^Quran$/, 2000);
  await tap(/^Tajweed colou?rs/);
  await shot('94-tajweed-settings');
  const sw = page.getByRole('switch').first();
  if (await sw.count()) { await sw.click(); await page.waitForTimeout(2000); }
  await tap(/^Turn on$|^Download$/, 2000).catch(() => {});
  let dirs = await page.evaluate(async () => {
    const m = window.mihrabDesktop;
    return m.fs.ls(`${m.fs.dirs.documents}/quran/fonts`);
  });
  log('font dirs', JSON.stringify(dirs));
  const v4 = dirs.find(d => /v4|tajweed/i.test(d) && !/dark/i.test(d)) || dirs.find(d => d !== 'v2');
  for (let i = 0; i < 60; i++) {
    const n = await count(v4);
    if (i % 5 === 0) log(`t+${i * 5}s ${v4}:`, n);
    if (n >= 604) break;
    await page.waitForTimeout(5000);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await tap(/^Quran$/, 2000);
  await tap(/^Al-Baqarah$/, 5000);
  const r = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('div')].filter(e => /^MihrabMushaf|Tajweed|QCF4/i.test(getComputedStyle(e).fontFamily) && e.getBoundingClientRect().width > 0);
    return { lines: lines.length, over: lines.filter(e => e.scrollWidth > e.clientWidth + 0.5).length, font: lines[0] && getComputedStyle(lines[0]).fontFamily };
  });
  log('page', JSON.stringify(r));
  await shot('95-tajweed-page');
  if (r.over) errors.push(`${r.over} tajweed line(s) wider than their box`);
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
