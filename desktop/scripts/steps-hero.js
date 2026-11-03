// Today's hero at a narrow and a wide window: the sky must cover the hero
// to its edges (to the window's, in the narrow full-bleed layout), and the
// day's rows must be drawn. Fails otherwise.
module.exports = async ({ page, app, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  await page.waitForTimeout(4000);
  const close = page.getByText(/^Close$/);
  if (await close.count()) { await close.last().click(); await page.waitForTimeout(1000); }
  const today = page.getByText(/^Today$/);
  for (let i = (await today.count()) - 1; i >= 0; i--) if (await today.nth(i).isVisible()) { await today.nth(i).click(); break; }
  // A tiling window manager may hold the window's size, so the viewport is
  // emulated instead: exactly w × h CSS pixels, whatever the window is.
  const cdp = await page.context().newCDPSession(page);
  for (const [w, h] of [[760, 820], [820, 1000], [1300, 950]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
    await page.waitForTimeout(2000);
    const onToday = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => /^(Fajr|Sunrise|Dhuhr|Asr|Maghrib|Isha) in$/.test(d.textContent.trim()) && !d.children.length));
    if (!onToday) {
      log(`${w}px: not on Today after the resize`);
      for (let i = (await today.count()) - 1; i >= 0; i--) if (await today.nth(i).isVisible()) { await today.nth(i).click(); break; }
    }
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const label = [...document.querySelectorAll('div')].find(d => /^(Fajr|Sunrise|Dhuhr|Asr|Maghrib|Isha) in$/.test(d.textContent.trim()) && !d.children.length);
      const skies = [...document.querySelectorAll('div')].filter(e => getComputedStyle(e).backgroundImage.includes('gradient') && e.getBoundingClientRect().height > 150);
      // The visible sky: the one under the countdown label.
      const lr = label && label.getBoundingClientRect();
      const sky = skies.find(s => { const r = s.getBoundingClientRect(); return lr && r.top <= lr.top && r.bottom >= lr.bottom; });
      let hero = label;
      for (let e = label; e; e = e.parentElement) { if (getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)') { hero = e; break; } }
      const box = el => el && el.getBoundingClientRect();
      return { innerWidth, sky: sky && [Math.round(box(sky).left), Math.round(box(sky).right)], hero: hero && [Math.round(box(hero).left), Math.round(box(hero).right)] };
    });
    log(`${w}px`, JSON.stringify(r));
    await shot(`99-hero-${w}`);
    if (!r.sky) errors.push(`${w}px: no sky under the countdown`);
    // Below the dashboard the desktop takes the Mac's page: the hero is a
    // rounded card in the middle of the window, not the phone's sky.
    else if (w < 1180) { if (Math.abs(r.sky[0] - (r.innerWidth - r.sky[1])) > 2 || r.sky[0] < 8) errors.push(`${w}px: the hero card ${r.sky} is not a centred card in 0..${r.innerWidth}`); }
    else if (r.hero && (r.sky[0] > r.hero[0] + 1 || r.sky[1] < r.hero[1] - 1)) errors.push(`${w}px: sky ${r.sky} inside the hero ${r.hero}`);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
