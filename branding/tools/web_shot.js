#!/usr/bin/env node
/**
 * The website's picture of Mihrab Web (docs/assets/img/web-app.jpg, in the
 * section scripts/build-site.js writes with webSection()).
 *
 *   NODE_PATH=desktop/node_modules node branding/tools/web_shot.js out.png
 *
 * Opens the live app in a fresh browser, answers its two questions (a place
 * chosen by hand, no notifications) and photographs Today. The sky is the
 * real hour's, so run it when the chosen city is near sunset — Dhaka's
 * Maghrib is about 11:15 UTC in November — or change CITY and ZONE.
 * Then resize to 1600 and 800 wide as web-app.jpg and web-app-800.jpg, and
 * bump SHOT_V in scripts/build-site.js.
 */
const { chromium } = require('playwright-core');

const CITY = 'Dhaka';
const ZONE = 'Asia/Dhaka';

(async () => {
  const out = process.argv[2] || 'web-app.png';
  const browser = await chromium.launch();
  const page = await (
    await browser.newContext({
      viewport: { width: 1100, height: 740 },
      deviceScaleFactor: 2,
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
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out });
  await browser.close();
  console.log(out);
})();
