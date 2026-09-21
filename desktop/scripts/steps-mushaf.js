// From an onboarded profile: open Al-Fatihah, press download, watch.
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return log('missing', String(re));
    await el.click();
    await page.waitForTimeout(wait);
  };
  await page.waitForTimeout(4000);
  await click(/^Quran$/, 2000);
  await click(/^Al-Fatihah$/, 3000);
  await click(/Download and start reading/, 1000);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    const n = await page.evaluate(async () => {
      const d = window.mihrabDesktop;
      try {
        return (await d.fs.ls(`${d.fs.dirs.documents}/quran/fonts/v2`)).length;
      } catch (e) {
        return String(e);
      }
    });
    log(`t+${(i + 1) * 5}s fonts on disk:`, n);
  }
  await shot('40-mushaf');
};
