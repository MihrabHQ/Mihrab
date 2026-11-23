// "Update my location in the background" in the desktop app: turned on with
// My location in Stockholm, the window hidden in the tray, the computer
// "carried" to Gothenburg and woken — the place must follow without the
// window being opened. The position is the page's own stand-in
// (navigator.geolocation), set by this script.
module.exports = async ({ page, app, shot, log }) => {
  const click = async (re, wait = 1500) => {
    const el = page.getByText(re).last();
    if (!(await el.count())) return false;
    log('press', (await el.innerText()).slice(0, 40));
    await el.click();
    await page.waitForTimeout(wait);
    return true;
  };
  const at = (lat, lng) =>
    page.evaluate(([la, ln]) => {
      window.__pos = { latitude: la, longitude: ln };
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: ok =>
            setTimeout(() => ok({ coords: { ...window.__pos, accuracy: 30 }, timestamp: Date.now() }), 50),
          watchPosition: () => 1,
          clearWatch: () => {},
        },
      });
    }, [lat, lng]);

  await page.waitForTimeout(3000);
  await at(59.3293, 18.0686);
  await click(/^Continue$/);
  await click(/^Use my location$/, 4000);
  for (let i = 0; i < 10; i++) {
    if (!(await click(/^(Continue|Next|Skip|Not now|Get started|Done|Maybe later|Start)$/))) break;
  }
  await page.waitForTimeout(4000);
  await shot('bg-01-home');
  log('home says Stockholm:', (await page.locator('body').innerText()).includes('Stockholm'));

  await click(/^Settings$/, 2000);
  await click(/^Location$/, 2000);
  await shot('bg-02-location-settings');
  const toggle = page.getByTestId('background-location-toggle');
  log('toggle offered:', await toggle.count());
  await toggle.click();
  await page.waitForTimeout(2000);
  await shot('bg-03-turned-on');

  // To the tray, then the journey and the wake.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await at(57.7089, 11.9746);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('location:hint', 'wake'),
  );
  await page.waitForTimeout(20000);
  const stored = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter(k => /settings/i.test(k))
      .map(k => localStorage.getItem(k))
      .join(' ')
      .match(/"autoLocationLabel":"[^"]*"/g),
  );
  log('stored label while hidden:', JSON.stringify(stored));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await click(/^Today$/, 3000);
  await shot('bg-04-after-journey');
  const text = await page.locator('body').innerText();
  log('home says Gothenburg:', /Göteborg|Gothenburg/.test(text), 'Stockholm:', text.includes('Stockholm'));
};
