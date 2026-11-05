/**
 * Google Play's feature graphic, 1024×500: the name, the headline, the
 * badges and the two faces of Today, over the sky at Maghrib.
 */
import path from 'node:path';
import { ROOT, brand, chip, device } from '../kit.mjs';

export const W = 1024;
export const H = 500;
export const face = 'roboto';
export const out = path.join(ROOT, 'branding/store-panels/play-feature');
export const sky = { i: 5, n: 8 };

const s = n => path.join(ROOT, 'branding/store-raw/android', n + '.png');

export const panels = [
  {
    id: 'feature',
    backdrop: { arc: false },
    html: ({ u, t }) => `
      ${brand(u * 9, u * 9, t('descriptor'), t('name'))}
      <div class="words" style="left:${u * 9}px;width:${u * 118}px;top:${u * 33}px">
        <h1 style="font-size:${u * 11.5}px">${t('hero.title')}</h1>
        <div class="chips" style="margin-top:${u * 5}px;gap:${u * 2}px">
          ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.noaccount'), 'user', 'solid')}${chip(t('badge.offline'), 'offline')}
        </div>
      </div>
      ${device({ kind: 'android', img: s('minimal-dawn'), x: u * 166, y: u * 20, w: u * 34, rot: 6, z: 1 })}
      ${device({ kind: 'android', img: s('home-sunset'), x: u * 134, y: u * 12, w: u * 38, rot: -4, z: 2 })}
    `,
  },
];
