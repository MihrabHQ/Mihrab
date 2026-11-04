// Can the short first ayahs be pressed? Al-Baqarah 1 (الٓمٓ) and Al-A'raf 1
// (الٓمٓصٓ) on the muṣḥaf page. Every ayah line on the surah's first page is
// pressed at its right end (where a line begins) and its left end, and the
// ayah whose sheet opens is logged. Before the fix every press opened the
// ayah that ENDS the line, so 2:1 and 7:1 never appeared.
//
//   node scripts/drive.js scripts/steps-short-ayah.js --profile <onboarded profile>
module.exports = async ({ page, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return false;
    await el.click();
    await page.waitForTimeout(wait);
    return true;
  };
  const sheetTitle = async () => {
    const t = await page.evaluate(() => document.body.innerText);
    const m = t.match(/(Al-Baqarah|Al-Araf|Al-Anam) (\d+:\d+)/);
    return m ? m[2] : null;
  };
  const closeSheet = async () => {
    // The sheet's own close button; a hidden "Close" elsewhere is not waited on.
    const x = page.getByRole('button', { name: /^Close$/ });
    for (let i = (await x.count()) - 1; i >= 0; i--) {
      if (await x.nth(i).isVisible()) {
        await x.nth(i).click({ timeout: 1500 }).catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(900);
  };
  // The page's ayah lines: the press targets that hold the page font's text.
  const lines = () =>
    page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('div')) {
        const ff = getComputedStyle(el).fontFamily || '';
        if (!/MihrabMushaf\d/.test(ff)) continue;
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const r = el.parentElement.getBoundingClientRect();
        if (r.width < 50 || r.bottom < 0 || r.top > innerHeight) continue;
        out.push([r.left, r.top, r.width, r.height]);
      }
      return out.sort((a, b) => a[1] - b[1] || b[0] - a[0]);
    });

  const sweep = async label => {
    const found = [];
    for (const [l, t, w, h] of await lines()) {
      for (const [end, x] of [['right', l + w * 0.97], ['left', l + w * 0.03]]) {
        await page.mouse.click(x, t + h / 2);
        await page.waitForTimeout(1200);
        const title = await sheetTitle();
        found.push(`${end}@${Math.round(t)}→${title}`);
        if (title) await closeSheet();
      }
    }
    log(label, found.join('  '));
    return found;
  };

  const pressAt = async (label, x, y) => {
    await page.mouse.click(x, y);
    await page.waitForTimeout(1500);
    const title = await sheetTitle();
    log(label, '→', title);
    await shot(`short-${label.replace(/[^a-z0-9]+/gi, '-')}`);
    if (title) await closeSheet();
    return title;
  };
  await page.waitForTimeout(4000);
  await click(/^Close$/, 1000);
  await click(/^Quran$/, 2000);
  await click(/^Al-Baqarah$/, 4000);
  await click(/^Not now$/, 1200);
  // Page 2, line 1 (the left page of the spread): الٓمٓ at its right end; then ذَٰلِكَ (2:2); line 2 starts with لِّلْمُتَّقِينَ (2:2).
  await pressAt('2-1 alif-lam-mim', 762, 344);
  await pressAt('2-2 dhalika', 681, 344);
  await pressAt('2-2 lil-muttaqin', 740, 418);
  await click(/^Al-Araf$/, 4000);
  await click(/^Not now$/, 1200);
  await shot('short-7-page');
  if (process.env.ARAF) {
    const [x, y] = process.env.ARAF.split(',').map(Number);
    await pressAt('7-1 alif-lam-mim-sad', x, y);
  }
};
