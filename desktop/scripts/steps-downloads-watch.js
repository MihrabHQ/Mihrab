// Settings → Downloads left open: the storage headline must settle and stay
// settled (it flickered between "Loading…" and the bar). Samples it for
// MIHRAB_WATCH_S seconds (default 20) and fails on any flip after the first
// load.
module.exports = async ({ page, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  await page.waitForTimeout(4000);
  const close = page.getByText(/^Close$/);
  if (await close.count()) { await close.last().click(); await page.waitForTimeout(1000); }
  if (process.env.MIHRAB_START_TAJWEED) {
    // Start a download first (the tajweed pages), so the page is watched
    // while one runs. Needs a profile without them.
    const tap = async re => {
      const els = page.getByText(re);
      for (let i = (await els.count()) - 1; i >= 0; i--) {
        if (await els.nth(i).isVisible()) { await els.nth(i).click(); await page.waitForTimeout(1800); return; }
      }
      log('missing', String(re));
    };
    await tap(/^Quran$/);
    await tap(/^Tajweed colou?rs/);
    const sw = page.getByRole('switch').first();
    if (await sw.count()) { await sw.click(); await page.waitForTimeout(2000); }
    await tap(/^Turn on$|^Download$/);
  }
  await page.evaluate(() => { location.href = 'mihrab://app/downloads'; });
  await page.waitForTimeout(1500);
  if (process.env.MIHRAB_CONTINUE) {
    // Resume a reciter's audio from this page — the other kind of run.
    const c = page.getByText(/^Continue downloading$/);
    if (await c.count()) { await c.first().click(); log('continued a download'); } else log('nothing to continue');
  }
  if (process.env.MIHRAB_RIWAYAH) {
    // Download a riwāyah from this page and wait for it: a finished
    // riwāyah run is what set the page re-reading itself in a loop.
    const d = page.getByText(/^Download$/);
    if (await d.count()) { await d.first().click(); log('downloading a riwayah'); } else log('no riwayah to download');
    await page.waitForTimeout(Number(process.env.MIHRAB_RIWAYAH_WAIT || 15000));
  }
  const seconds = Number(process.env.MIHRAB_WATCH_S || 20);
  const sample = () => page.evaluate(() => {
    const t = [...document.querySelectorAll('div[role="heading"], h1, h2, h3, div')]
      .map(d => d.textContent.trim())
      .find(s => /^Loading|free of|^Total on device/.test(s));
    return t || '(none)';
  });
  const seen = [];
  let flips = 0; let last = null; let settled = false;
  // Sampled in the page itself, every animation frame: a flash of
  // "Loading…" lasts a frame or two and a slower poll misses it.
  const result = await page.evaluate(seconds => new Promise(resolve => {
    const seen = []; let flips = 0; let last = null; let settled = false;
    const t0 = performance.now();
    // Focus going away and coming back, as when a person clicks into another
    // window and back — the app hears it as an AppState change.
    let flip = false;
    const focusTimer = setInterval(() => {
      flip = !flip;
      window.dispatchEvent(new Event(flip ? 'blur' : 'focus'));
    }, 1500);
    setTimeout(() => clearInterval(focusTimer), seconds * 1000);
    const step = () => {
      const s = [...document.querySelectorAll('div')]
        .map(d => d.textContent.trim())
        .find(x => /^Loading|free of|^Total on device/.test(x)) || '(none)';
      const state = /^Loading/.test(s) ? 'loading' : s === '(none)' ? 'none' : 'bar';
      const at = ((performance.now() - t0) / 1000).toFixed(2);
      if (state !== last) { seen.push(`${at}s ${state}`); if (settled) flips++; }
      if (state === 'bar') settled = true;
      last = state;
      if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(step);
      else resolve({ seen, flips, settled });
    };
    step();
  }), seconds);
  seen.push(...result.seen); flips = result.flips; settled = result.settled;
  await shot('98-downloads');
  log('STATES', seen.slice(0, 30).join(' | '), `flips=${flips}`);
  if (!settled) errors.push('the storage bar never showed');
  if (flips) errors.push(`the storage headline flipped ${flips} times after it settled`);
  log('ERRORS', JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('; '));
};
