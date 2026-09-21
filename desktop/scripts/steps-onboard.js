// Walk onboarding as a first-time user would, shooting each screen.
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return false;
    log('press', (await el.innerText()).slice(0, 40));
    await el.click();
    await page.waitForTimeout(wait);
    return true;
  };
  await page.waitForTimeout(3000);
  await click(/^Continue$/);
  await click(/^Search or enter coordinates$/);
  await shot('03-search');
  const input = page.locator('input').first();
  await input.fill('Stockholm');
  await page.waitForTimeout(2500);
  await shot('04-search-results');
  await click(/^Stockholm, Stockholm Municipality$/, 2500);
  await shot('05-after-city');
  for (let i = 6; i < 16; i++) {
    const ok =
      (await click(/^(Continue|Next|Skip|Not now|Get started|Done|Maybe later|Start)$/)) ||
      false;
    if (!ok) break;
    await shot(String(i).padStart(2, '0') + '-onboarding');
  }
  await page.waitForTimeout(3000);
  await shot('20-home');
};
