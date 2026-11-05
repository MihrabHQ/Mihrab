/**
 * The landscape story — tablets, foldables, Chromebooks, Macs and PCs:
 * the words on the reading side, the screens on the other.
 */
import path from 'node:path';
import { ROOT, brand, callout, chip, device, imageSize, laptop, loupe, tile, windowFrame } from '../kit.mjs';

export function widePanels({ kind = 'tab', raw, phoneKind = 'android', phoneRaw = 'android', foldRaw = 'android-fold', extra = {} }) {
  const s = (n, dir = raw) => path.join(ROOT, 'branding/store-raw', dir, n + '.png');
  const SRC = phoneRaw === 'ios' ? { region: [0, 1090, 1206, 1010], ring: [1690, 310] } : { region: [0, 1036, 1080, 900], ring: [1580, 250] };
  const sw = SRC.region[2];
  // The loupe over the spread: the first lines of the left-hand page.
  const spreadAt = () => {
    const { w, h } = imageSize(s('spread'));
    return [w * 0.29, h * (raw === 'ipad' ? 0.36 : 0.26)];
  };
  // The big screen: a tablet, or (for Chromebooks and computers) a laptop.
  const big = o => (o.kind === 'laptop' ? laptop({ ...o, w: o.w * 0.92, x: o.x + o.w * 0.04 }) : device(o));

  // The words on the left third (the right in Arabic and Urdu, by dir).
  const words = (u, W, { eyebrow, title, sub, top = 14, width = 58, more = '' }) => `
    <div class="words" style="left:${u * 7}px;width:${u * width}px;top:${u * top}px">
      ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
      <h1 style="font-size:${u * 7.4}px">${title}</h1>
      ${sub ? `<div class="sub" style="font-size:${u * 2.9}px">${sub}</div>` : ''}
      ${more}
    </div>`;
  const badges = (u, t) => `<div class="chips" style="margin-top:${u * 3}px">
      ${chip(t('badge.noads'), 'noads', 'solid')}${chip(t('badge.open'), 'open', 'solid')}${chip(t('badge.noaccount'), 'user', 'solid')}
      ${chip(t('badge.notracking'), 'lock')}${chip(t('badge.offline'), 'offline')}</div>`;

  // Laid out for 16:9. A squarer screen (the iPad's 4:3) gets the same
  // layout, scaled to its width and centred top to bottom, over the full sky.
  const fit = fn => ctx => {
    const u = Math.min(ctx.u, ctx.W / 177.78);
    const h = u * 100;
    return `<div style="position:absolute;left:0;width:${ctx.W}px;top:${(ctx.H - h) / 2}px;height:${h}px;--u:${u}px">${fn({ ...ctx, u })}</div>`;
  };
  const panels = {
    hero: {
      id: 'hero',
      html: ({ u, W, t }) => `
        ${brand(u * 7, u * 7, t('descriptor'), t('name'))}
        ${words(u, W, { top: 26, title: t('hero.title'), sub: t('hero.sub'), more: badges(u, t) })}
        <div class="lower">
        ${big({ kind, img: s('home'), x: u * 70, y: u * 12, w: u * 98, rot: 0, z: 1 })}
        ${device({ kind: phoneKind, img: s('minimal-dawn', phoneRaw), x: u * 143, y: u * 40, w: u * 28, rot: 5, z: 3 })}
        </div>`,
    },
    accuracy: {
      id: 'accuracy',
      html: ({ u, W, t }) => `
        ${words(u, W, {
          top: 10,
          eyebrow: t('accuracy.eyebrow'),
          title: t('accuracy.title'),
          sub: t('accuracy.sub'),
          more: `<div style="display:flex;align-items:flex-end;gap:${u * 2.4}px;margin-top:${u * 2.4}px">
              <div class="stat"><b style="color:var(--gold);font-size:${u * 17}px">${t.F['total.off']}</b></div>
              <div style="font-size:${u * 2.9}px;line-height:1.3;padding-bottom:${u * 2}px">${t('accuracy.off')}</div></div>
            <div style="font-size:${u * 1.9}px;opacity:.7;margin-top:${u * 2}px;line-height:1.4">${t('accuracy.foot')}</div>`,
        })}
        <div class="lower">
        <ul class="list card" style="position:absolute;left:${u * 72}px;top:${u * 10}px;width:${u * 98}px;font-size:${u * 3}px">
          ${['diyanet', 'sweden', 'morocco', 'algeria', 'indonesia'].map(k => `<li style="font-size:${u * 3.1}px"><i>✓</i><div>${t('accuracy.' + k)}</div></li>`).join('')}
          <li style="font-size:${u * 2.5}px;opacity:.9"><i>+</i><div>${t('accuracy.more')}</div></li>
        </ul>
        ${tile({ img: s('source', phoneRaw), region: SRC.region, x: u * 81, y: u * 50, w: u * 80, z: 2 })}
        ${callout({ u, x: u * 79.5, y: u * (50 + (SRC.ring[0] - SRC.region[1]) * 80 / sw), w: u * 83, h: u * (SRC.ring[1] * 80 / sw) })}
        </div>`,
    },
    spread: {
      id: 'spread',
      html: ({ u, W, t }) => `
        ${words(u, W, {
          eyebrow: t('mushaf.eyebrow'),
          title: t('mushaf.title'),
          sub: t('mushaf.sub'),
          more: `<div class="chips" style="margin-top:${u * 3}px">${chip(t('mushaf.riwayat'), '', 'gold')}${chip(t('mushaf.indopak'), '', 'gold')}${chip(t('mushaf.word'), '', 'gold')}</div>`,
        })}
        <div class="lower">
        ${big({ kind, img: s('spread'), x: u * 70, y: u * 14, w: u * 104, z: 1 })}
        ${loupe({ img: s('spread'), at: spreadAt(), zoom: raw === 'ipad' ? 0.7 : 0.8, x: u * 128, y: u * 52, d: u * 44 })}
        </div>`,
    },
    tilawah: {
      id: 'tilawah',
      html: ({ u, W, t }) => `
        ${words(u, W, { eyebrow: t('tilawah.eyebrow'), title: t('tilawah.title'), sub: t('tilawah.sub') })}
        <div class="lower">
        ${big({ kind, img: s('tilawah'), x: u * 70, y: u * 14, w: u * 104, z: 1 })}
        </div>`,
    },
    remember: {
      id: 'remember',
      html: ({ u, W, t }) => `
        ${words(u, W, { eyebrow: t('remember.eyebrow'), title: t('remember.title'), sub: t('remember.sub') })}
        <div class="lower">
        ${big({ kind, img: s('duas-morning'), x: u * 66, y: u * 12, w: u * 96, z: 1 })}
        ${device({ kind: phoneKind, img: s('tasbih', phoneRaw), x: u * 144, y: u * 38, w: u * 28, rot: 5, z: 3 })}
        </div>`,
    },
    month: {
      id: 'month',
      html: ({ u, W, t }) => `
        ${words(u, W, { eyebrow: t('month.eyebrow'), title: t('month.title'), sub: t('month.sub') })}
        <div class="lower">
        ${big({ kind, img: s('month'), x: u * 68, y: u * 8, w: u * 80, rot: 0, z: 1 })}
        ${device({ kind: 'tab', img: s('log'), x: u * 104, y: u * 46, w: u * 70, rot: 0, z: 2 })}
        </div>`,
    },
    devices: {
      id: 'devices',
      html: ({ u, W, H, t }) => `
        ${words(u, W, { eyebrow: t('devices.eyebrow'), title: t('devices.title'), sub: t('devices.sub') })}
        <div class="lower">
        ${laptop({ img: s('home', 'desktop'), x: u * 80, y: u * 6, w: u * 90, z: 1 })}
        ${device({ kind: 'fold', img: s('mushaf', foldRaw), x: u * 64, y: u * 50, w: u * 52, rot: -3, z: 3 })}
        ${device({ kind: phoneKind, img: s('home-sunset', phoneRaw), x: u * 120, y: u * 48, w: u * 21, rot: 3, z: 4 })}
        ${device({ kind: 'iphone', img: s('minimal-dawn', phoneRaw), x: u * 146, y: u * 52, w: u * 20, rot: 7, z: 5 })}
        </div>`,
    },
    ...extra,
  };
  for (const p of Object.values(panels)) p.html = fit(p.html);
  return panels;
}
