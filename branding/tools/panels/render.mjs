/**
 * Render panels to PNG with the Chromium Playwright keeps on this Mac.
 *
 *   node branding/tools/panels/build.mjs <set> [panel…]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './kit.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, 'desktop/node_modules/playwright-core'));

function chromePath() {
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export async function renderAll(jobs) {
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--allow-file-access-from-files'] });
  try {
    for (const { html, out, W, H } of jobs) {
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const tmp = path.join(os.tmpdir(), `panel-${process.pid}-${path.basename(out)}.html`);
      fs.writeFileSync(tmp, html);
      await page.goto('file://' + tmp);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.__fit && window.__fit());
      await page.waitForLoadState('networkidle');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, type: out.endsWith('.jpg') ? 'jpeg' : 'png', quality: out.endsWith('.jpg') ? 92 : undefined });
      await page.close();
      fs.unlinkSync(tmp);
      console.log('  ' + path.relative(ROOT, out));
    }
  } finally {
    await browser.close();
  }
}
