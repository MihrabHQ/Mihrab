// Leave Today open and look at it every 30 s: are the day's times still
// drawn, and does the hero reach its edges? MIHRAB_WATCH_MIN sets how long.
module.exports = async ({ page, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  const tap = async (re, w = 1500) => {
    const e = page.getByText(re);
    for (let i = (await e.count()) - 1; i >= 0; i--) if (await e.nth(i).isVisible()) { await e.nth(i).click(); await page.waitForTimeout(w); return true; }
    return false;
  };
  await page.waitForTimeout(4000);
  if (await page.getByText(/^What.s new$/).count()) await tap(/^Close$/, 1200);
  await tap(/^Today$/, 2000);
  // Visible prayer rows: a name and a time, both on screen and painted.
  const look = () => page.evaluate(() => {
    const names = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const vis = el => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    };
    const rows = [...document.querySelectorAll('div')].filter(d => names.includes(d.textContent.trim()) && d.children.length === 0 && vis(d));
    const times = [...document.querySelectorAll('div')].filter(d => /^\d{1,2}:\d{2}( [AP]M)?$/.test(d.textContent.trim()) && d.children.length === 0 && vis(d));
    return { rows: rows.length, times: times.map(t => t.textContent.trim()).slice(0, 8) };
  });
  const minutes = Number(process.env.MIHRAB_WATCH_MIN || 4);
  for (let i = 0; i <= minutes * 2; i++) {
    const r = await look();
    log(`t+${i * 30}s`, JSON.stringify(r));
    if (i % 2 === 0) await shot(`99-today-${String(i * 30).padStart(3, '0')}`);
    if (r.rows < 5) errors.push(`t+${i * 30}s: ${r.rows} prayer rows visible`);
    if (i < minutes * 2) await page.waitForTimeout(30000);
  }
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.slice(0, 3).join('; '));
};
