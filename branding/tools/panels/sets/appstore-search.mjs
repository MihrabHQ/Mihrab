/**
 * App Store product page creative assets: the search results card,
 * 1920×1280 (3:2) — what a search shows above the screenshots. The name,
 * the headline, one line of what is in it and the badges, with Today and
 * Hifz on iPhones, over the sky at Maghrib.
 */
import path from 'node:path';
import { ROOT, brand, chip, device } from '../kit.mjs';

export const W = 1920;
export const H = 1280;
export const face = 'sf';
export const out = path.join(ROOT, 'branding/store-panels/appstore-search');
export const sky = { i: 5, n: 8 };

const s = n => path.join(ROOT, 'branding/store-raw/ios', n + '.png');

export const panels = [
  {
    id: 'search',
    backdrop: { arc: false },
    html: ({ u, t, rtl }) => {
      const X = (x, w) => (rtl ? 150 * u - x - w : x);
      return `
      ${brand(X(u * 9, u * 50), u * 9, t('descriptor'), t('name'))}
      <div class="words" style="left:${X(u * 9, u * 74)}px;width:${u * 74}px;top:${u * 30}px">
        <h1 style="font-size:${u * 9.6}px">${t('hero.title')}</h1>
        <p style="font-size:${u * 3.6}px;margin-top:${u * 4}px;line-height:1.35;opacity:.9">${t('hero.sub')}</p>
        <div class="chips" style="margin-top:${u * 5}px;gap:${u * 1.8}px;flex-wrap:wrap">
          ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.offline'), 'offline')}
        </div>
      </div>
      ${device({ kind: 'iphone', img: s('hifz'), x: X(u * 113, u * 31), y: u * 22, w: u * 31, rot: rtl ? -6 : 6, z: 1 })}
      ${device({ kind: 'iphone', img: s('home-sunset'), x: X(u * 84, u * 37), y: u * 9, w: u * 37, rot: rtl ? 3 : -3, z: 2 })}
    `;
    },
  },
];
