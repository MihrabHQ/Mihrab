// The store's desktop Today (branding/store-raw/desktop/home.png): Casablanca,
// the Sky theme, a fixed evening clock, 1440×900 at 2×.
//
//   TZ=Africa/Abidjan node scripts/drive.js scripts/steps-store-home.js --profile <dir>
//
// Run it twice on the same profile: the first run walks onboarding, the
// second starts on Today. STORE_AT=<ISO time> moves the clock.
module.exports = async ({ page, shot, log }) => {
  const at = new Date(process.env.STORE_AT || '2026-11-30T17:16:12Z');
  await page.clock.install({ time: at });
  await page.clock.resume();
  const click = async (re, wait = 1500) => {
    const all = page.getByText(re);
    for (let i = (await all.count()) - 1; i >= 0; i--) {
      if (await all.nth(i).isVisible()) {
        log('press', (await all.nth(i).innerText()).slice(0, 40));
        await all.nth(i).click();
        await page.waitForTimeout(wait);
        return true;
      }
    }
    return false;
  };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await page.reload();
  await page.waitForTimeout(5000);
  await click(/^Close$/);
  if (await click(/^Continue$/)) {
    await click(/^Search or enter coordinates$/);
    await page.locator('input').first().fill('Casablanca');
    await page.waitForTimeout(3000);
    await shot('store-search');
    await click(/^Casablanca, Pachalik/, 2500);
    for (let i = 0; i < 10; i++) {
      if (!(await click(/^(Continue|Next|Skip|Not now|Get started|Done|Maybe later|Start)$/))) break;
    }
    await page.waitForTimeout(3000);
  }
  for (const step of (process.env.STORE_CLICKS || '').split('|').filter(Boolean)) {
    // "x,y" presses a point (CSS pixels); anything else is the text to press.
    const at = /^(\d+),(\d+)$/.exec(step);
    if (at) {
      await page.mouse.click(Number(at[1]), Number(at[2]));
      await page.waitForTimeout(1500);
      continue;
    }
    const ok = await click(new RegExp(step));
    log(ok ? 'did' : 'MISSING', step);
  }
  await page.waitForTimeout(2500);
  await shot(process.env.STORE_SHOT || 'store-home');
};
