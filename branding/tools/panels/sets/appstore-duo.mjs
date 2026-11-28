/**
 * App Store, iPhone Duo: 2007×2853 (the APP_IPHONE_DUO slot), English.
 * The phone story's words over the Duo's own captures
 * (branding/store-raw/ios-duo, taken on the Duo simulator's cover display).
 */
import path from 'node:path';
import { ROOT, brand, chip, device } from '../kit.mjs';

export const W = 2007;
export const H = 2853;
export const face = 'sf';
export const out = path.join(ROOT, 'branding/store-panels/appstore-duo');

const s = n => path.join(ROOT, 'branding/store-raw/ios-duo', n + '.png');
const words = (u, { eyebrow, title, sub, top = 8, extra = '', limit }) => `
  <div class="words" ${limit ? `data-limit="${u * limit}"` : ''} style="left:${u * 6.5}px;right:${u * 6.5}px;top:${u * top}px">
    ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
    <h1>${title}</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
    ${extra}
  </div>`;
const pair = (u, front, back) => `
  <div class="lower">
  ${device({ kind: 'fold', img: s(back), x: u * 47, y: u * 62, w: u * 49, rot: 5, z: 1 })}
  ${device({ kind: 'fold', img: s(front), x: u * 4, y: u * 56, w: u * 53, rot: -3, z: 2 })}
  </div>`;
const one = (u, name) => `
  <div class="lower">
  ${device({ kind: 'fold', img: s(name), x: u * 21, y: u * 53, w: u * 58, rot: -2, z: 2 })}
  </div>`;
const panel = (id, key, body, limit = 52) => ({
  id,
  html: ({ u, t }) => `${words(u, { limit, eyebrow: t(key + '.eyebrow'), title: t(key + '.title'), sub: t(key + '.sub') })}${body(u)}`,
});

export const panels = [
  {
    id: 'hero',
    html: ({ u, t }) => `
      ${brand(u * 6.5, u * 7, t('descriptor'), t('name'))}
      ${words(u, {
        limit: 54,
        top: 21,
        title: t('hero.title'),
        sub: t('hero.sub'),
        extra: `<div class="chips" style="margin-top:${u * 3.2}px">
          ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.noaccount'), 'user', 'solid')}
          ${chip(t('badge.notracking'), 'lock')}${chip(t('badge.offline'), 'offline')}</div>`,
      })}
      <div class="lower">
      ${device({ kind: 'fold', img: s('home'), x: u * 25, y: u * 67, w: u * 50, rot: -2, z: 2 })}
      </div>`,
  },
  panel('mushaf', 'mushaf', u => one(u, 'mushaf')),
  panel('tilawah', 'tilawah', u => one(u, 'tilawah')),
  panel('understand', 'understand', u => one(u, 'ayah')),
  panel('remember', 'remember', u => pair(u, 'tasbih', 'duas')),
  panel('month', 'month', u => pair(u, 'month', 'journal')),
];
