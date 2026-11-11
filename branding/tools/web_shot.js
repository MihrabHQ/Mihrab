#!/usr/bin/env node
/**
 * The website's pictures of Mihrab Web (docs/assets/img/web-app*.jpg, in the
 * section scripts/build-site.js writes with webSection()): one in a
 * computer's browser, and one in a phone's for a visitor on a phone.
 *
 *   NODE_PATH=desktop/node_modules node branding/tools/web_shot.js out.png [phone] [City] [Zone]
 *
 * Opens the live app in a fresh browser, answers its two questions (a place
 * chosen by hand, no notifications) and photographs Today. The sky is the
 * real hour's, so run it when the chosen city is near sunset — Dhaka's
 * Maghrib is about 11:15 UTC in November, Delhi's about 12:00.
 * Then resize: the computer's to 1600 and 800 wide as web-app.jpg and
 * web-app-800.jpg, the phone's to 780 wide as web-app-phone.jpg, and bump
 * SHOT_V in scripts/build-site.js.
 */
const { chromium } = require('playwright-core');

const out = process.argv[2] || 'web-app.png';
const phone = process.argv[3] === 'phone';
const CITY = process.argv[4] || 'Dhaka';
const ZONE = process.argv[5] || 'Asia/Dhaka';

(async () => {
  const browser = await chromium.launch();
  const page = await (
    await browser.newContext({
      viewport: phone ? { width: 390, height: 700 } : { width: 1100, height: 740 },
      deviceScaleFactor: phone ? 3 : 2,
      isMobile: phone,
      hasTouch: phone,
      userAgent: phone
        ? 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
        : undefined,
      locale: 'en-GB',
      timezoneId: ZONE,
      colorScheme: 'light',
    })
  ).newPage();
  await page.goto('https://mihrabhq.github.io/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.getByText('No, choose my location').click();
  await page.getByRole('button', { name: 'Search or enter coordinates' }).last().click();
  await page.locator('input').first().fill(CITY);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: new RegExp(CITY) }).first().click({ timeout: 15000 });
  await page.getByRole('button', { name: 'Not now' }).click();
  // The countdown rolls down to its figure when Today first appears.
  await page.waitForTimeout(9000);
  // On a phone it then offers to be kept on the home screen.
  const keep = page.getByRole('button', { name: 'Got it' });
  if (await keep.count()) {
    await keep.first().click();
    await page.waitForTimeout(1500);
  }
  if (process.env.DUMP) console.log((await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 500));
  await page.screenshot({ path: out });
  await browser.close();
  console.log(out);
})();
