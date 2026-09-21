// Esc and the mouse back button go back.
module.exports = async ({ page, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return log('missing', String(re));
    await el.click();
    await page.waitForTimeout(wait);
  };
  const where = () => page.evaluate(() => location.href + ' | ' + document.body.innerText.slice(0, 60).replace(/\n/g, ' / '));
  await page.waitForTimeout(4000);
  await click(/^Quran$/, 2000);
  await click(/^Al-Fatihah$/, 3000);
  log('in reader', await where());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  log('after Esc', await where());
  await click(/^Settings$/, 1500);
  await click(/^Notifications$/, 1500);
  log('in sub', await where());
  await page.mouse.move(600, 600);
  await page.mouse.down({ button: 'back' }).catch(e => log('no back button in playwright', e.message));
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true })));
  await page.waitForTimeout(1500);
  log('after mouse back', await where());
  await page.reload();
  await page.waitForTimeout(4000);
  log('after reload', await where());
};
