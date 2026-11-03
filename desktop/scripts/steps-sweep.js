// Page through the muṣḥaf and report any line whose ink box overflows.
// Usage: MIHRAB_SWEEP_FROM=<surah regex> MIHRAB_SWEEP_PAGES=<n>
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => { const el = page.getByText(re).last(); if (await el.count()) { await el.click(); await page.waitForTimeout(wait); } };
  await page.waitForTimeout(4000);
  await click(/^Quran$/, 2000);
  await click(new RegExp(process.env.MIHRAB_SWEEP_FROM || '^Al-Fatihah$'), 4000);
  await click(/^Not now$/, 1000);
  await page.mouse.click(1200, 900);
  const n = Number(process.env.MIHRAB_SWEEP_PAGES || 20);
  const bad = [];
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(() => {
      const pg = (document.body.innerText.match(/(\d+)\s*\/\s*604/) || [])[1] ?? '?';
      const lines = [...document.querySelectorAll('div')].filter(e => /^MihrabMushaf/.test(getComputedStyle(e).fontFamily) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().left >= 0 && e.getBoundingClientRect().right <= innerWidth + 1);
      const over = lines.filter(e => e.scrollWidth > e.clientWidth + 0.5 || getComputedStyle(e).textOverflow === 'ellipsis').length;
      return { pg, lines: lines.length, over };
    });
    if (r.over || !r.lines) bad.push(r);
    if (i % 10 === 0 || r.over) log(JSON.stringify(r));
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(900);
  }
  log('BAD', JSON.stringify(bad));
  if (bad.length) throw new Error(bad.length + ' page(s) with a line wider than its box');
  await shot('71-sweep');
};
