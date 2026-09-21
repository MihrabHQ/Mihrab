// Switch to Arabic on the welcome screen and walk to Home; is it RTL?
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return log('missing', String(re));
    await el.click();
    await page.waitForTimeout(wait);
  };
  await page.waitForTimeout(3500);
  await click(/^English$/, 1500);
  await shot('60-languages');
  await click(/^العربية$/, 2500);
  await shot('61-welcome-ar');
  log('dir attrs', await page.evaluate(() => [...document.querySelectorAll('[dir]')].slice(0, 5).map(e => e.getAttribute('dir'))));
};
