// The word reader on the desktop: hold a word on the muṣḥaf page with the
// mouse, see it light, let go, hear it. Logs every audio play() the page
// makes and what it played, so a silent release shows up as one.
//
//   node scripts/drive.js scripts/steps-word-reader.js --profile <onboarded profile>
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

  // Every audio element's play(), and how far it got, into the log.
  await page.evaluate(() => {
    window.__plays = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) {
      const rec = { src: String(this.src).slice(-60), from: this.currentTime, to: null };
      window.__plays.push(rec);
      this.addEventListener('pause', () => (rec.to = this.currentTime), { once: true });
      return orig.apply(this, a);
    };
  });

  // Turn the word reader on (Settings → Quran → Word reader).
  await click(/^Settings$/, 1500);
  await click(/^Reading, translation, tafsir$/, 1500);
  await click(/^Word reader$/, 1500);
  // On only if off: a switch's state is its checked property, not an attribute.
  const sw = page.getByRole('switch').first();
  const on = (await sw.count()) ? await sw.isChecked().catch(() => null) : null;
  log('word reader was', on ? 'on' : 'off');
  if (on === false) await sw.click();
  await page.waitForTimeout(800);
  await shot('word-reader-setting');
  // Back out of the settings pages to the tabs: the page's own back button.
  for (let i = 0; i < 3 && !(await page.getByText(/^Today$/).last().isVisible()); i++) {
    const back = page.getByRole('button', { name: /back/i }).first();
    if (await back.count()) await back.click({ timeout: 2000 }).catch(() => {});
    else await page.goBack().catch(() => {});
    await page.waitForTimeout(800);
  }

  await click(/^Quran$/, 2000);
  await click(/^Al-Baqarah$/, 4000);
  await click(/^Not now$/, 1200);

  const [x, y] = (process.env.WORD || '681,344').split(',').map(Number);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await shot('word-reader-holding');
  await page.mouse.up();
  // The ayah's audio may have to come over the network the first time.
  await page.waitForTimeout(Number(process.env.WAIT || 8000));
  await shot('word-reader-after');
  log('plays', JSON.stringify(await page.evaluate(() => window.__plays)));
  log('notice', await page.evaluate(() => (document.body.innerText.match(/That word is not on this device[^\n]*|No timing is known[^\n]*/) || [''])[0]));
};
