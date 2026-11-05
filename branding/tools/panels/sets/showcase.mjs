/**
 * The cross-platform pictures for the README, the GitHub social card and
 * the website: every device at once, over the panorama's sky.
 *
 *   01_xplat  2400×1200  devices only — the site's and README's showcase
 *   02_hero   1600×900   name, headline and badges beside the devices (README top, GitHub)
 *   03_og     1200×630   the link card (og:image, twitter:image)
 *
 * Built at one size per run (W×H are per panel here), so build.mjs is
 * called with SHOWCASE=<n>; `node build.mjs showcase` builds all three.
 */
import path from 'node:path';
import { ROOT, brand, chip, device, laptop } from '../kit.mjs';

const r = (dir, n) => path.join(ROOT, 'branding/store-raw', dir, n + '.png');
const SIZES = [
  [2400, 1200],
  [1600, 900],
  [1200, 630],
];
const which = Number(process.env.SHOWCASE || 1) - 1;
export const [W, H] = SIZES[which];
export const face = 'roboto';
export const out = path.join(ROOT, 'branding/store-panels/showcase');
export const sky = { i: 5, n: 8 };

// Every device, as one group, scaled to `s` (1 = the 2400×1200 layout's size) and placed at x, y.
const devices = (s, x, y) => `
  <div style="position:absolute;left:${x}px;top:${y}px;width:${2400 * s}px;height:${1200 * s}px">
    ${laptop({ img: r('desktop', 'home'), x: 560 * s, y: 70 * s, w: 1280 * s, z: 1 })}
    ${device({ kind: 'ipad', img: r('ipad', 'spread'), x: 140 * s, y: 380 * s, w: 800 * s, rot: -4, z: 2 })}
    ${device({ kind: 'fold', img: r('android-fold', 'home'), x: 1500 * s, y: 470 * s, w: 520 * s, rot: 3, z: 2 })}
    ${device({ kind: 'android', img: r('android', 'home-sunset'), x: 930 * s, y: 430 * s, w: 300 * s, rot: -2, z: 3 })}
    ${device({ kind: 'iphone', img: r('ios', 'minimal-dawn'), x: 1230 * s, y: 470 * s, w: 280 * s, rot: 5, z: 4 })}
  </div>`;

const all = [
  { id: 'xplat', html: () => devices(1, 0, -40) },
  {
    id: 'hero',
    html: ({ u, t }) => `
      ${brand(u * 7, u * 9, t('descriptor'), t('name'))}
      <div class="words" style="left:${u * 7}px;width:${u * 58}px;top:${u * 30}px">
        <h1 style="font-size:${u * 7.2}px">${t('hero.title')}</h1>
        <div class="sub" style="font-size:${u * 2.9}px">${t('hero.sub')}</div>
        <div class="chips" style="margin-top:${u * 3}px">
          ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.noaccount'), 'user', 'solid')}
          ${chip(t('badge.notracking'), 'lock')}${chip(t('badge.offline'), 'offline')}</div>
      </div>
      ${devices(0.42, u * 66, u * 30)}`,
  },
  {
    id: 'og',
    html: ({ u, t }) => `
      ${brand(u * 7, u * 8, t('descriptor'), t('name'))}
      <div class="words" style="left:${u * 7}px;width:${u * 70}px;top:${u * 32}px">
        <h1 style="font-size:${u * 8.4}px">${t('hero.title')}</h1>
        <div class="chips" style="margin-top:${u * 4}px">
          ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.noaccount'), 'user', 'solid')}</div>
      </div>
      ${devices(0.31, u * 74, u * 30)}`,
  },
];
export const panels = [all[which]];
export const ext = 'png';
