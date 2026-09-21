// From an onboarded profile: open the Quran tab, start the mushaf, read a page.
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) {
      log('missing', String(re));
      return false;
    }
    log('press', (await el.innerText()).slice(0, 40));
    await el.click();
    await page.waitForTimeout(wait);
    return true;
  };
  await page.waitForTimeout(4000);
  await click(/^Quran$/, 2500);
  await shot('30-quran');
  const alive = async label => {
    const t0 = Date.now();
    const ok = await Promise.race([
      page.evaluate(() => 1).then(() => true),
      new Promise(r => setTimeout(() => r(false), 5000)),
    ]);
    log(`${label}: page ${ok ? 'responsive' : 'NOT responding'} (${Date.now() - t0} ms)`);
    return ok;
  };
  await click(/^Al-Fatihah$/, 500);
  for (let i = 0; i < 6; i++) {
    if (!(await alive(`after open +${i * 2}s`))) continue;
    await page.waitForTimeout(2000);
  }
  await shot('31-reader');
  await click(/Download and start reading/, 15000);
  await shot('32-reading');
  await page.waitForTimeout(15000);
  await shot('33-reading-later');
};
