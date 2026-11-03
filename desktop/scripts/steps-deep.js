// From an onboarded profile with the muṣḥaf: play a recitation, open the
// month, switch the theme. Fails on any page error.
module.exports = async ({ page, shot, log }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`uncaught: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  const tap = async (re, wait = 1800) => {
    const els = page.getByText(re);
    for (let i = (await els.count()) - 1; i >= 0; i--) {
      if (await els.nth(i).isVisible()) { await els.nth(i).click(); await page.waitForTimeout(wait); return true; }
    }
    log('missing', String(re));
    return false;
  };
  // The players are `new Audio()`, not in the DOM: note each one that plays.
  const hook = () => page.evaluate(() => {
    if (window.__played) return;
    window.__played = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__played.push(this);
      return play.call(this);
    };
  });
  const playing = () => page.evaluate(() =>
    (window.__played || []).map(a => ({ src: (a.currentSrc || a.src).slice(-50), paused: a.paused, t: Math.round(a.currentTime), err: a.error && a.error.code })));
  await page.waitForTimeout(4000);
  // A version newer than the profile last saw opens What's new once.
  if (await page.getByText(/^What.s new$/).count()) await tap(/^Close$/, 1200);

  // Recitation from the reader's headphones button.
  await tap(/^Quran$/, 2000);
  await tap(/^Al-Fatihah$/, 4000);
  const ear = page.getByRole('button', { name: /listen|recit|play|audio/i }).first();
  if (await ear.count()) { await ear.click(); await page.waitForTimeout(2500); }
  else log('no listen button by role');
  await hook();
  await tap(/Play from here/, 8000);
  const audio = await playing();
  log('audio', JSON.stringify(audio));
  if (!audio.some(a => !a.paused && a.t > 0 && !a.err)) errors.push('recitation did not play');
  await shot('90-recitation');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);

  // Month view from Today.
  await tap(/^Today$/, 2500);
  const cal = page.getByRole('button', { name: /month|calendar/i }).first();
  if (await cal.count()) { await cal.click(); await page.waitForTimeout(2500); await shot('91-month'); await page.keyboard.press('Escape'); await page.waitForTimeout(1200); }
  else log('no month button by role');

  // Theme: Light, then back to System.
  await tap(/^Settings$/, 1800);
  await tap(/^Appearance & language$/, 1800);
  await tap(/^Light$/, 1500);
  await shot('92-light');
  await tap(/^System$/, 1500);

  const found = [...new Set(errors)];
  log('ERRORS', JSON.stringify(found.slice(0, 30), null, 1));
  if (found.length) throw new Error(found.length + ' page error(s)');
};
