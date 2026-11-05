/**
 * The phone story, shared by the Play, F-Droid and App Store phone sets:
 * the same panels in the same order, each set choosing its device, its
 * captures, its face and how many panels its store takes.
 */
import path from 'node:path';
import { ROOT, brand, callout, chip, device, loupe, tile } from '../kit.mjs';

export function phonePanels({ kind, raw, extra = {} }) {
  const s = n => path.join(ROOT, 'branding/store-raw', raw, n + '.png');
  const img = n => path.join(ROOT, 'docs/assets/img', n + '.png');

  const words = (u, { eyebrow, title, sub, top = 8, extra: more = '', limit }) => `
    <div class="words" ${limit ? `data-limit="${u * limit}"` : ''} style="left:${u * 6.5}px;right:${u * 6.5}px;top:${u * top}px">
      ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
      <h1>${title}</h1>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      ${more}
    </div>`;

  const label = (u, text, x, y) =>
    `<div class="chip" style="position:absolute;left:${x}px;top:${y}px;z-index:9;font-size:${u * 2.5}px;padding:${u * 0.8}px ${u * 2}px">${text}</div>`;

  return {
    hero: {
      id: 'hero',
      html: ({ u, t }) => `
        ${brand(u * 6.5, u * 7, t('descriptor'), t('name'))}
        ${words(u, {
          limit: 79,
          top: 21,
          title: t('hero.title'),
          sub: t('hero.sub'),
          more: '',
          extra: `<div class="chips" style="margin-top:${u * 3.2}px">
            ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.noaccount'), 'user', 'solid')}
            ${chip(t('badge.notracking'), 'lock')}${chip(t('badge.offline'), 'offline')}</div>`,
        })}
        <div class="lower">
        ${device({ kind, img: s('minimal-dawn'), x: u * 49, y: u * 92, w: u * 49, rot: 4, z: 1 })}
        ${device({ kind, img: s('home-sunset'), x: u * 3, y: u * 88, w: u * 52, rot: -4, z: 2 })}
        ${label(u, t('hero.full'), u * 7, u * 80.5)}
        ${label(u, t('hero.minimal'), u * 73, u * 84.5)}
        </div>
      `,
    },
    accuracy: {
      id: 'accuracy',
      html: ({ u, t }) => `
        ${words(u, {
          limit: 111,
          eyebrow: t('accuracy.eyebrow'),
          title: t('accuracy.title'),
          sub: t('accuracy.sub'),
          extra: `
          <div style="display:flex;align-items:flex-end;gap:${u * 3}px;margin-top:${u * 3}px">
            <div class="stat"><b style="color:var(--gold);font-size:${u * 22}px">${t.F['total.off']}</b></div>
            <div style="font-size:${u * 3.6}px;line-height:1.3;padding-bottom:${u * 2.6}px">${t('accuracy.off')}</div>
          </div>
          <ul class="list card" style="margin-top:${u * 2.5}px">
            ${['diyanet', 'sweden', 'morocco', 'algeria', 'indonesia'].map(k => `<li><i>✓</i><div>${t('accuracy.' + k)}</div></li>`).join('')}
            <li style="font-size:${u * 2.7}px;opacity:.9;margin-top:${u * 0.6}px"><i>+</i><div>${t('accuracy.more')}</div></li>
            <li style="font-size:${u * 2.1}px;opacity:.65;margin-top:${u * 0.4};display:block">${t('accuracy.foot')}</li>
          </ul>`,
        })}
        <div class="lower">
        ${tile({ img: s('source'), region: [0, 1036, 1080, 900], x: u * 7, y: u * 113, w: u * 86, z: 2 })}
        ${callout({ u, x: u * 5.5, y: u * (113 + (1580 - 1036) * 86 / 1080), w: u * 89, h: u * (250 * 86 / 1080) })}
        </div>
      `,
    },
    mushaf: {
      id: 'mushaf',
      html: ({ u, t }) => `
        ${words(u, {
          limit: 76,
          eyebrow: t('mushaf.eyebrow'),
          title: t('mushaf.title'),
          sub: t('mushaf.sub'),
          extra: `<div class="chips" style="margin-top:${u * 3}px">${chip(t('mushaf.riwayat'), '', 'gold')}${chip(t('mushaf.indopak'), '', 'gold')}${chip(t('mushaf.word'), '', 'gold')}</div>`,
        })}
        <div class="lower">
        ${device({ kind, img: s('mushaf'), x: u * 8, y: u * 78, w: u * 58, rot: -3 })}
        ${loupe({ img: s('mushaf'), at: [560, 830], zoom: 1.0, x: u * 50, y: u * 108, d: u * 46 })}
        </div>
      `,
    },
    tilawah: {
      id: 'tilawah',
      html: ({ u, t }) => `
        ${words(u, { limit: 64, eyebrow: t('tilawah.eyebrow'), title: t('tilawah.title'), sub: t('tilawah.sub') })}
        <div class="lower">
        ${device({ kind, img: s('reciters'), x: u * 48, y: u * 70, w: u * 48, rot: 6, z: 1 })}
        ${device({ kind, img: s('tilawah'), x: u * 5, y: u * 66, w: u * 52, rot: -4, z: 2 })}
        </div>
      `,
    },
    understand: {
      id: 'understand',
      html: ({ u, t }) => `
        ${words(u, { limit: 50, eyebrow: t('understand.eyebrow'), title: t('understand.title'), sub: t('understand.sub') })}
        <div class="lower">
        ${tile({ img: s('ayah-translation'), region: [0, 420, 1080, 820], x: u * 6, y: u * 52, w: u * 70, rot: -3, z: 2 })}
        ${tile({ img: s('ayah-tafsir'), region: [0, 1080, 1080, 520], x: u * 26, y: u * 94, w: u * 68, rot: 2, z: 3 })}
        ${tile({ img: s('tajweed-guide'), region: [0, 1350, 1080, 600], x: u * 8, y: u * 122, w: u * 62, rot: -2, z: 4 })}
        </div>
      `,
    },
    hifz: {
      id: 'hifz',
      html: ({ u, t }) => `
        ${words(u, { limit: 56, eyebrow: t('hifz.eyebrow'), title: t('hifz.title'), sub: t('hifz.sub') })}
        <div class="lower">
        ${device({ kind, img: s('quran-recommended'), x: u * 48, y: u * 64, w: u * 48, rot: 6, z: 1 })}
        ${device({ kind, img: s('hifz'), x: u * 5, y: u * 58, w: u * 52, rot: -4, z: 2 })}
        </div>
      `,
    },
    remember: {
      id: 'remember',
      html: ({ u, t }) => `
        ${words(u, { limit: 56, eyebrow: t('remember.eyebrow'), title: t('remember.title'), sub: t('remember.sub') })}
        <div class="lower">
        ${device({ kind, img: s('fasting'), x: u * 60, y: u * 68, w: u * 38, rot: 7, z: 1 })}
        ${device({ kind, img: s('duas'), x: u * 2, y: u * 68, w: u * 38, rot: -7, z: 1 })}
        ${device({ kind, img: s('tasbih'), x: u * 27, y: u * 58, w: u * 46, z: 3 })}
        </div>
      `,
    },
    day: {
      id: 'day',
      html: ({ u, t }) => `
        ${words(u, { limit: 48, eyebrow: t('day.eyebrow'), title: t('day.title'), sub: t('day.sub') })}
        <div class="lower">
        <img src="file://${img('shot-alerts')}" style="position:absolute;left:${-u * 3}px;top:${u * 50}px;width:${u * 106}px;filter:drop-shadow(0 ${u * 2}px ${u * 4}px rgba(0,0,0,.4))">
        ${tile({ img: s('widgets'), region: [40, 300, 1000, 1000], x: u * 5, y: u * 114, w: u * 44, rot: -3, z: 3 })}
        ${tile({ img: s('qibla'), region: [80, 260, 920, 1130], x: u * 53, y: u * 112, w: u * 42, rot: 3, z: 3 })}
        </div>
      `,
    },
    ...extra,
  };
}
