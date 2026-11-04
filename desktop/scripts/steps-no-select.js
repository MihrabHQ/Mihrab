// The Qur'an's text is not selectable: a drag across the muṣḥaf page (and
// across the verse-by-verse list) selects nothing — only the app's own
// actions (a tap, a hold, the sheet's copy and share) take the text anywhere.
// Run with the word reader OFF, where a drag used to select.
//
//   node scripts/drive.js scripts/steps-no-select.js --profile <onboarded profile>
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return false;
    await el.click();
    await page.waitForTimeout(wait);
    return true;
  };
  await page.waitForTimeout(4000);
  await click(/^Close$/, 1000);

  // The word reader off (Settings → Quran → Word reader).
  await click(/^Settings$/, 1500);
  await click(/^Reading, translation, tafsir$/, 1500);
  await click(/^Word reader$/, 1500);
  const sw = page.getByRole('switch').first();
  if ((await sw.count()) && (await sw.isChecked().catch(() => false))) await sw.click();
  log('word reader on:', (await sw.count()) ? await sw.isChecked().catch(() => null) : null);
  // The setting is kept; start the app again from Today.
  await page.reload();
  await page.waitForTimeout(5000);
  await click(/^Close$/, 1000);

  await click(/^Quran$/, 2000);
  await click(/^Al-Baqarah$/, 4000);
  await click(/^Not now$/, 1200);

  // A drag from the right end of one line to the middle of the line two below.
  const lines = await page.evaluate(() =>
    [...document.querySelectorAll('div')]
      .filter(e => /MihrabMushaf\d/.test(getComputedStyle(e).fontFamily || '') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.children.length >= 2) // an ayah line: words with gaps between them
      .map(e => e.getBoundingClientRect())
      .filter(r => r.width > 200 && r.top > 0 && r.bottom < innerHeight && r.left >= 0 && r.right <= innerWidth)
      .sort((a, b) => a.top - b.top)
      .map(r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]),
  );
  log('lines on screen:', lines.length);
  const [l1, , l3] = lines;
  // First, before any drag: does a tap open the ayah?
  await page.mouse.click(l1[0] + l1[2] - 6, l1[1] + l1[3] / 2);
  await page.waitForTimeout(1500);
  const first = (await page.evaluate(() => document.body.innerText)).match(/(Al-[A-Za-z']+ \d+:\d+)/);
  log('a tap before any drag opens:', first ? first[1] : null);
  await shot('no-select-tap-first');
  const close = page.getByRole('button', { name: /^Close$/ });
  for (let i = (await close.count()) - 1; i >= 0; i--) {
    if (await close.nth(i).isVisible()) {
      await close.nth(i).click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
  await page.waitForTimeout(900);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.mouse.move(l1[0] + l1[2] - 6, l1[1] + l1[3] / 2);
  await page.mouse.down();
  await page.mouse.move(l3[0] + l3[2] / 2, l3[1] + l3[3] / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const selected = await page.evaluate(() => (window.getSelection()?.toString() ?? '').length);
  log('selected on the page (characters):', selected);
  await shot('no-select-page');
  // Select-all, as a keyboard would.
  await page.keyboard.press('Meta+A');
  await page.waitForTimeout(300);
  const all = await page.evaluate(() => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return 0;
    const div = document.createElement('div');
    div.appendChild(s.getRangeAt(0).cloneContents());
    // Only the page font's text counts: the Qur'an itself.
    return [...div.querySelectorAll('*')].length ? (s.toString().match(/[-ﭐ-﷿ﹰ-﻿]/g) || []).length : 0;
  });
  log('Qur\'an glyphs in a select-all:', all);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  // The app's own action still works: a tap opens the ayah.
  await page.mouse.click(l1[0] + l1[2] - 6, l1[1] + l1[3] / 2);
  await page.waitForTimeout(1500);
  const sheet = (await page.evaluate(() => document.body.innerText)).match(/(Al-[A-Za-z']+ \d+:\d+)/);
  log('a tap still opens:', sheet ? sheet[1] : null, 'tapped line', JSON.stringify(l1));
  await shot('no-select-tap');
};
