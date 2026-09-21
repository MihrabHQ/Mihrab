// From a profile with the mushaf downloaded: open it, page with the keys.
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return log('missing', String(re));
    await el.click();
    await page.waitForTimeout(wait);
  };
  await page.waitForTimeout(4000);
  await click(/^Quran$/, 2000);
  await click(/^Al-Fatihah$/, 4000);
  const pageNo = () =>
    page.evaluate(() => (document.body.innerText.match(/(\d+)\s*\/\s*604/) || [])[1] ?? '?');
  if (await page.getByText(/Download and start reading/).count()) {
    await click(/Download and start reading/, 1000);
    for (let i = 0; i < 40; i++) {
      const n = await page.evaluate(async () => {
        const d = window.mihrabDesktop;
        return (await d.fs.ls(`${d.fs.dirs.documents}/quran/fonts/v2`)).length;
      });
      if (n >= 605) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(3000);
    log('download finished');
  }
  log('start', await pageNo());
  await page.mouse.click(1200, 900);
  for (const k of ['ArrowLeft', 'ArrowLeft', 'a', 'ArrowRight']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(1200);
    log(`after ${k}`, await pageNo());
  }
  await shot('50-keys');
};
