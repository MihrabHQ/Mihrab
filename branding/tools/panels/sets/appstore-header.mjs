/**
 * App Store product page creative assets (App Store Connect → the version →
 * Header and Search Results): the header, 3840×1646. The App Store's own
 * counterpart of Play's feature graphic — the name, the headline, the
 * badges and Today, Hifz and Minimal on iPhones, over the sky at Maghrib.
 */
import path from 'node:path';
import { ROOT, brand, chip, device } from '../kit.mjs';

export const W = 3840;
export const H = 1646;
export const face = 'sf';
export const out = path.join(ROOT, 'branding/store-panels/appstore-header');
export const sky = { i: 5, n: 8 };

const s = n => path.join(ROOT, 'branding/store-raw/ios', n + '.png');

export const panels = [
  {
    id: 'header',
    backdrop: { arc: false },
    html: ({ u, t, rtl }) => {
      // Mirrored for Arabic and Urdu: the words on the right, the phones on the left.
      const X = (x, w) => (rtl ? 233.3 * u - x - w : x);
      return `
      ${brand(X(u * 14, u * 60), u * 14, t('descriptor'), t('name'))}
      <div class="words" style="left:${X(u * 14, u * 118)}px;width:${u * 118}px;top:${u * 40}px">
        <h1 style="font-size:${u * 10.5}px">${t('hero.title')}</h1>
        <div class="chips" style="margin-top:${u * 6}px;gap:${u * 2.2}px">
          ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.noaccount'), 'user', 'solid')}${chip(t('badge.offline'), 'offline')}
        </div>
      </div>
      ${device({ kind: 'iphone', img: s('hifz'), x: X(u * 140, u * 30), y: u * 30, w: u * 30, rot: rtl ? 7 : -7, z: 1 })}
      ${device({ kind: 'iphone', img: s('minimal-dawn'), x: X(u * 197, u * 30), y: u * 26, w: u * 30, rot: rtl ? -6 : 6, z: 1 })}
      ${device({ kind: 'iphone', img: s('home-sunset'), x: X(u * 165, u * 38), y: u * 10, w: u * 38, rot: rtl ? 2 : -2, z: 3 })}
    `;
    },
  },
];
