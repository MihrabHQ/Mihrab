/**
 * The store-panel kit: the pieces every set is built from, as HTML.
 *
 * A set is a row of panels that read as one panorama — the day's sky
 * from the night before Fajr through to Isha — with the Track's arc (the
 * app's own chart of the sun) running across all of them. Each panel is
 * one viewport of that strip, so laid side by side on a store page the
 * sky and the arc carry on from one panel into the next.
 *
 * Units: everything is sized in `u`, a hundredth of the panel's SHORT
 * side, so one layout serves a 1080×1920 phone panel and a 2064×2752
 * iPad one alike.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
const fontUrl = f => 'file://' + path.join(HERE, 'fonts', f);

/** The day's sky, left to right across a whole set, as [stop, top colour, foot colour]. */
const SKY = [
  [0.0, '#0B1230', '#1C2350'], // the last of the night
  [0.1, '#1E2350', '#5A4775'], // Fajr
  [0.2, '#3C3F78', '#D9876E'], // dawn
  [0.32, '#4E7FB8', '#E9C9A6'], // sunrise to morning
  [0.48, '#2F6CB0', '#8DBCE3'], // midday
  [0.62, '#3D6AA3', '#E7B878'], // Asr, golden
  [0.76, '#3A2F63', '#D46F67'], // Maghrib
  [0.88, '#1D1D45', '#4C3363'], // dusk
  [1.0, '#0B1230', '#16204A'], // Isha, night
];

function skyAt(t, which) {
  for (let i = 1; i < SKY.length; i++) {
    if (t <= SKY[i][0]) {
      const [t0, ...a] = SKY[i - 1];
      const [t1, ...b] = SKY[i];
      const f = (t - t0) / (t1 - t0);
      return mix(a[which], b[which], f);
    }
  }
  return SKY[SKY.length - 1][1 + which];
}
function mix(h1, h2, f) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(h1), b = p(h2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, '0')).join('');
}

/**
 * The panorama behind panel `i` of `n`: the sky as two gradients (the
 * top colour and the horizon colour, both running across the strip), the
 * stars at night, and the arc of the sun with the sun on it where this
 * panel's hour is.
 */
export function backdrop(i, n, W, H, { arc = true, label } = {}) {
  const total = W * n;
  const stops = k => SKY.map(s => `${s[1 + k]} ${(s[0] * 100).toFixed(1)}%`).join(',');
  // Stars where the sky is dark: a fixed scatter over the whole strip.
  let stars = '';
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < n * 70; k++) {
    const x = rnd() * total, y = rnd() * H * 0.55, t = x / total;
    const dark = t < 0.16 || t > 0.8 ? 1 : t < 0.24 || t > 0.72 ? 0.35 : 0;
    if (!dark) continue;
    const r = (0.6 + rnd() * 1.6) * (W / 1080);
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(dark * (0.25 + rnd() * 0.6)).toFixed(2)}"/>`;
  }
  // The arc: one sine of the sun over the strip, its horizon a hairline.
  // Low on the panel, behind the devices: the words stay on clear sky.
  const horizon = H * 0.6;
  const amp = H * 0.17;
  const sunX = t => t * total;
  const sunY = t => horizon - amp * Math.sin(Math.PI * (t - 0.2) / 0.6);
  let d = '';
  for (let k = 0; k <= 200; k++) {
    const t = k / 200;
    d += `${k ? 'L' : 'M'}${sunX(t).toFixed(1)} ${sunY(t).toFixed(1)} `;
  }
  // The sun (or the moon) for this panel: at its middle.
  const tMid = (i + 0.5) / n;
  const up = sunY(tMid) < horizon;
  const sx = sunX(tMid), sy = sunY(tMid);
  const bodyR = (up ? 30 : 22) * (Math.min(W, H) / 1080);
  const body = up
    ? `<circle cx="${sx}" cy="${sy}" r="${bodyR * 5}" fill="url(#glow)"/><circle cx="${sx}" cy="${sy}" r="${bodyR}" fill="#FFF3D6"/>`
    : `<circle cx="${i * W + W * 0.9}" cy="${H * 0.032}" r="${bodyR * 0.8}" fill="#E9ECF7" opacity="0.9"/>`;
  return `
  <div class="sky" style="width:${total}px;left:${-i * W}px">
    <div class="sky-top" style="background:linear-gradient(90deg,${stops(0)})"></div>
    <div class="sky-foot" style="background:linear-gradient(90deg,${stops(1)})"></div>
    <svg class="sky-svg" width="${total}" height="${H}" viewBox="0 0 ${total} ${H}">
      <defs><radialGradient id="glow"><stop offset="0" stop-color="#FFE7B0" stop-opacity="0.55"/><stop offset="1" stop-color="#FFE7B0" stop-opacity="0"/></radialGradient></defs>
      ${stars}
      ${arc ? `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="${2 * (W / 1080)}"/>
      <line x1="0" x2="${total}" y1="${horizon}" y2="${horizon}" stroke="#fff" stroke-opacity="0.16" stroke-width="${1.5 * (W / 1080)}"/>` : ''}
      ${arc ? body : ''}
    </svg>
  </div>`;
}

/**
 * The faces are the app's own: Roboto on Android, Windows, Linux and the
 * web (the app bundles it, res/font/roboto.xml), the system face (SF) on
 * Apple's, Amiri for Arabic as in the reader; light weights for the big
 * lines, as the countdown is set.
 */
const FACES = {
  roboto: "Roboto, 'Noto Sans', sans-serif",
  sf: "-apple-system, 'SF Pro Display', system-ui, sans-serif",
};

export function css(W, H, face = 'roboto') {
  const u = Math.min(W, H) / 100;
  const ui = FACES[face] ?? FACES.roboto;
  return `
  @font-face { font-family: Roboto; src: url('${fontUrl('Roboto.ttf')}'); font-weight: 100 900; }
  @font-face { font-family: Amiri; src: url('${fontUrl('Amiri.ttf')}'); }
  :root { --u: ${u}px; --W: ${W}px; --H: ${H}px; --cream: #F2E7D2; --teal: #0F4D44; --gold: #F3C77A; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0B1230; }
  body { font-family: ${ui}; color: #fff; position: relative; -webkit-font-smoothing: antialiased; }
  .sky { position: absolute; top: 0; height: 100%; }
  .sky-top, .sky-foot { position: absolute; inset: 0; }
  .sky-foot { -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 75%); mask-image: linear-gradient(180deg, transparent 0%, #000 75%); }
  .sky-svg { position: absolute; inset: 0; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,8,25,0.35), rgba(5,8,25,0) 30%, rgba(5,8,25,0) 60%, rgba(5,8,25,0.45)); }
  .stage { position: absolute; inset: 0; }
  .lower { position: absolute; inset: 0; }

  /* Words */
  .brand { position: absolute; display: flex; align-items: center; gap: calc(var(--u)*2.2); }
  .brand img { width: calc(var(--u)*9); height: calc(var(--u)*9); border-radius: calc(var(--u)*2.1); box-shadow: 0 calc(var(--u)*0.6) calc(var(--u)*2) rgba(0,0,0,.3); }
  .brand b { display: block; font-weight: 500; font-size: calc(var(--u)*6.4); letter-spacing: -0.01em; line-height: 1; }
  .brand span { display: block; font-size: calc(var(--u)*2.9); opacity: .85; margin-top: calc(var(--u)*0.7); letter-spacing: .01em; }
  .eyebrow { font-size: calc(var(--u)*2.9); font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); margin-bottom: calc(var(--u)*1.8); }
  h1 { font-weight: 300; font-size: calc(var(--u)*9.2); line-height: 1.06; letter-spacing: -0.025em; text-wrap: balance; }
  h1 em { font-style: normal; font-weight: 400; color: var(--gold); }
  [dir=rtl] h1, [dir=rtl] .sub, [dir=rtl] .eyebrow, [dir=rtl] .list, [dir=rtl] .stat { font-family: Amiri, ${ui}; letter-spacing: 0; }
  [dir=rtl] .eyebrow { text-transform: none; }
  [lang=ur] h1, [lang=ur] .sub, [lang=ur] .eyebrow, [lang=ur] .list, [lang=ur] .chip, [lang=ur] .brand span { font-family: 'Noto Nastaliq Urdu', Amiri, ${ui}; }
  [lang=ur] h1 { line-height: 1.75; font-weight: 400; }
  [lang=ur] .sub { line-height: 1.9; }
  [lang=ar] .chip, [lang=ar] .brand span { font-family: Amiri, ${ui}; }
  .sub { font-size: calc(var(--u)*3.5); line-height: 1.35; opacity: .9; margin-top: calc(var(--u)*2.4); text-wrap: pretty; }
  .words { position: absolute; text-shadow: 0 calc(var(--u)*0.3) calc(var(--u)*2.4) rgba(5,8,30,.35); }

  /* Chips and badges */
  .chips { display: flex; flex-wrap: wrap; gap: calc(var(--u)*1.4); }
  .chip { display: inline-flex; align-items: center; gap: calc(var(--u)*1.1); padding: calc(var(--u)*1.2) calc(var(--u)*2.2); border-radius: 999px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.28); font-size: calc(var(--u)*2.7); font-weight: 600; backdrop-filter: blur(8px); white-space: nowrap; text-shadow: none; }
  .chip svg { width: calc(var(--u)*3); height: calc(var(--u)*3); }
  .chip.solid { background: var(--cream); color: var(--teal); border-color: var(--cream); }
  .chip.gold { background: rgba(243,199,122,.18); border-color: rgba(243,199,122,.6); color: #FFE6B5; }

  /* Devices */
  .device { position: absolute; background: #0d0f14; box-shadow: 0 calc(var(--u)*3) calc(var(--u)*8) rgba(0,0,0,.45), inset 0 0 0 calc(var(--u)*0.25) #3a3d45; }
  .device .screen { position: absolute; overflow: hidden; background: #000; }
  .device .screen img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .device .island { position: absolute; left: 50%; transform: translateX(-50%); background: #000; border-radius: 999px; }
  .device .hole { position: absolute; left: 50%; transform: translateX(-50%); background: #000; border-radius: 50%; }

  /* A cut of a screen, as a card */
  .tile { position: absolute; border-radius: calc(var(--u)*3.2); overflow: hidden; background-repeat: no-repeat; box-shadow: 0 calc(var(--u)*2) calc(var(--u)*6) rgba(0,0,0,.4), 0 0 0 calc(var(--u)*0.3) rgba(255,255,255,.35); }
  .tile .cap { position: absolute; left: calc(var(--u)*2); bottom: calc(var(--u)*2); }
  .label { position: absolute; font-size: calc(var(--u)*2.8); font-weight: 700; letter-spacing: .02em; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.5); }

  /* The loupe */
  .loupe { position: absolute; border-radius: 50%; background-repeat: no-repeat; box-shadow: 0 calc(var(--u)*2) calc(var(--u)*6) rgba(0,0,0,.5), 0 0 0 calc(var(--u)*0.9) #fff, 0 0 0 calc(var(--u)*1.3) rgba(243,199,122,.9); }

  /* Stat */
  .stat b { display: block; font-weight: 200; font-size: calc(var(--u)*17); line-height: .95; letter-spacing: -0.03em; color: #fff; }
  .stat span { display: block; font-size: calc(var(--u)*3.4); opacity: .9; margin-top: calc(var(--u)*1); }
  .card { background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.22); border-radius: calc(var(--u)*3.5); padding: calc(var(--u)*3.2) calc(var(--u)*3.6); backdrop-filter: blur(10px); }
  .list { list-style: none; display: grid; gap: calc(var(--u)*1.5); }
  .list li { display: flex; gap: calc(var(--u)*1.6); align-items: baseline; font-size: calc(var(--u)*3.1); line-height: 1.25; }
  .list li i { font-style: normal; color: var(--gold); font-weight: 800; }
  .list li small { opacity: .75; font-size: .85em; }
  .foot { position: absolute; font-size: calc(var(--u)*2.1); opacity: .7; line-height: 1.35; }
  `;
}

export const ICONS = {
  noads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/><path d="M3 3l18 18"/></svg>',
  offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="10" rx="1.5"/><path d="M1 18h16"/><rect x="18" y="8" width="5" height="11" rx="1"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.6 6.3L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.7z"/></svg>',
};

export const chip = (text, icon, cls = '') =>
  `<span class="chip ${cls}">${icon ? ICONS[icon] : ''}${text}</span>`;

/** The size of an image file, PNG or JPEG, without decoding it. */
export function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let o = 2;
  while (o < b.length) {
    const m = b[o + 1];
    const len = b.readUInt16BE(o + 2);
    if (m >= 0xc0 && m <= 0xc3) return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) };
    o += 2 + len;
  }
  throw new Error('size of ' + file);
}

const url = f => 'file://' + f;

/**
 * A device with a screen in it. `kind`: android | iphone | ipad | tab |
 * fold | laptop | desktop. x, y, w in px (height follows the screen's
 * shape); `rot` in degrees; `img` the raw capture. `crop` [top, height]
 * as fractions shows only part of the screen (a device cut short).
 */
export function device({ kind = 'android', img, x, y, w, rot = 0, z = 1, crop, shadow = true }) {
  const { w: iw, h: ih } = imageSize(img);
  const ratio = ih / iw;
  const P = {
    android: { bezel: 0.028, radius: 0.105, inner: 0.085 },
    iphone: { bezel: 0.034, radius: 0.16, inner: 0.13 },
    ipad: { bezel: 0.03, radius: 0.06, inner: 0.045 },
    tab: { bezel: 0.025, radius: 0.045, inner: 0.03 },
    fold: { bezel: 0.022, radius: 0.06, inner: 0.045 },
  }[kind] ?? { bezel: 0.03, radius: 0.1, inner: 0.08 };
  const b = w * P.bezel;
  const sw = w - 2 * b;
  let sh = sw * ratio;
  let pos = 'top';
  if (crop) {
    sh = sw * ratio * crop[1];
    pos = `0 ${(-crop[0] * sw * ratio).toFixed(1)}px`;
  }
  const h = sh + 2 * b;
  const extra =
    kind === 'iphone'
      ? `<div class="island" style="top:${b + sw * 0.03}px;width:${sw * 0.29}px;height:${sw * 0.085}px"></div>`
      : '';
  const imgStyle = crop
    ? `width:${sw}px;height:${sw * ratio}px;object-fit:fill;top:${(-crop[0] * sw * ratio).toFixed(1)}px`
    : '';
  return `<div class="device" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${w * P.radius}px;transform:rotate(${rot}deg);z-index:${z};${shadow ? '' : 'box-shadow:none'}">
    <div class="screen" style="left:${b}px;top:${b}px;width:${sw}px;height:${sh}px;border-radius:${w * P.inner}px"><img src="${url(img)}" style="${imgStyle}"></div>${extra}</div>`;
}

/** The height a device of width `w` takes for `img` (for layout). */
export function deviceHeight(kind, img, w, crop) {
  const { w: iw, h: ih } = imageSize(img);
  const bez = { android: 0.028, iphone: 0.034, ipad: 0.03, tab: 0.025, fold: 0.022 }[kind] ?? 0.03;
  const sw = w - 2 * w * bez;
  return sw * (ih / iw) * (crop ? crop[1] : 1) + 2 * w * bez;
}

/** A laptop: the screen in a lid, a base under it. */
export function laptop({ img, x, y, w, z = 1 }) {
  const { w: iw, h: ih } = imageSize(img);
  const b = w * 0.022;
  const sw = w - 2 * b;
  const sh = sw * (ih / iw);
  const lidH = sh + b * 2.4;
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;z-index:${z}">
    <div class="device" style="position:relative;width:${w}px;height:${lidH}px;border-radius:${w * 0.025}px ${w * 0.025}px ${w * 0.006}px ${w * 0.006}px">
      <div class="screen" style="left:${b}px;top:${b * 1.2}px;width:${sw}px;height:${sh}px;border-radius:${w * 0.006}px"><img src="${url(img)}"></div>
    </div>
    <div style="position:relative;left:${-w * 0.07}px;width:${w * 1.14}px;height:${w * 0.028}px;background:linear-gradient(180deg,#d9dbe0,#9ea2ab);border-radius:0 0 ${w * 0.04}px ${w * 0.04}px;box-shadow:0 ${w * 0.02}px ${w * 0.05}px rgba(0,0,0,.45)">
      <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:${w * 0.16}px;height:${w * 0.009}px;background:#8a8e97;border-radius:0 0 ${w * 0.01}px ${w * 0.01}px"></div>
    </div></div>`;
}

/** A desktop window (Windows/Linux): the capture with a title bar. */
export function windowFrame({ img, x, y, w, z = 1, title = 'Mihrab', dark = false }) {
  const { w: iw, h: ih } = imageSize(img);
  const bar = w * 0.03;
  const h = w * (ih / iw);
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;z-index:${z};border-radius:${w * 0.008}px;overflow:hidden;box-shadow:0 ${w * 0.02}px ${w * 0.06}px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.18)">
    <div style="height:${bar}px;background:${dark ? '#1f2230' : '#f3f3f3'};display:flex;align-items:center;padding:0 ${bar * 0.5}px;font:500 ${bar * 0.42}px Inter;color:${dark ? '#ddd' : '#333'}">
      <span style="flex:1">${title}</span><span style="letter-spacing:${bar * 0.6}px;opacity:.7">–□×</span></div>
    <img src="${url(img)}" style="display:block;width:${w}px;height:${h}px"></div>`;
}

/**
 * A cut of a capture as a card: `region` [x, y, w, h] in the capture's
 * pixels, shown at width `w` (height follows the region's shape).
 */
export function tile({ img, region, x, y, w, rot = 0, z = 2, label, radius }) {
  const { w: iw, h: ih } = imageSize(img);
  const [rx, ry, rw, rh] = region;
  const s = w / rw;
  const h = rh * s;
  return `<div class="tile" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);z-index:${z};background-image:url('${url(img)}');background-size:${iw * s}px ${ih * s}px;background-position:${-rx * s}px ${-ry * s}px;${radius != null ? `border-radius:${radius}px` : ''}">${label ? `<div class="label" style="left:${w * 0.05}px;bottom:${w * 0.04}px">${label}</div>` : ''}</div>`;
}

export function tileHeight(region, w) {
  return (region[3] / region[2]) * w;
}

/** A gold ring round a part of the panel, to point at it. */
export function callout({ x, y, w, h, z = 6, u }) {
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${z};border-radius:${u * 2}px;border:${u * 0.6}px solid var(--gold);box-shadow:0 0 ${u * 3}px rgba(243,199,122,.65), inset 0 0 ${u * 2}px rgba(243,199,122,.25)"></div>`;
}

/** A round magnifier over a point of a capture: `at` [x, y] in its pixels, `zoom` × the capture's own size. */
export function loupe({ img, at, zoom, x, y, d, z = 5 }) {
  const { w: iw, h: ih } = imageSize(img);
  const s = zoom;
  return `<div class="loupe" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;z-index:${z};background-image:url('${url(img)}');background-size:${iw * s}px ${ih * s}px;background-position:${d / 2 - at[0] * s}px ${d / 2 - at[1] * s}px"></div>`;
}

export function brand(x, y, descriptor = 'The Muslim Companion', name = 'Mihrab') {
  const icon = path.join(ROOT, 'ios/PrayerApp/Images.xcassets/AppIcon.appiconset/AppIcon-1024.png');
  return `<div class="brand" style="left:${x}px;top:${y}px"><img src="${url(icon)}"><div><b>${name}</b><span>${descriptor}</span></div></div>`;
}

export function page(W, H, i, n, body, opts = {}) {
  const dir = opts.rtl ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${opts.lang ?? 'en'}" dir="${dir}"><head><meta charset="utf-8"><style>${css(W, H, opts.face)}</style></head><body>
  ${backdrop(i, n, W, H, opts)}<div class="shade"></div><div class="stage">${body}</div>
  <script>
  // The words come first: a longer language shrinks the headline (to 70 %)
  // and then pushes the devices down, never under the words.
  window.__fit = () => {
  for (const l of document.querySelectorAll('.lower')) l.style.transform = '';
  for (const w of document.querySelectorAll('.words[data-limit]')) {
    const limit = parseFloat(w.dataset.limit);
    const h1 = w.querySelector('h1');
    let fs = parseFloat(getComputedStyle(h1).fontSize);
    const min = fs * 0.7;
    while (w.getBoundingClientRect().bottom > limit && fs > min) { fs -= 1; h1.style.fontSize = fs + 'px'; }
    const over = w.getBoundingClientRect().bottom - limit;
    if (over > 0) for (const l of document.querySelectorAll('.lower')) l.style.transform = 'translateY(' + over + 'px)';
  }
  };
  </script></body></html>`;
}

/* ── Words in thirteen languages ─────────────────────────────────── */
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);
export const LANGS = ['en', 'sv', 'ar', 'tr', 'ur', 'id', 'de', 'fr', 'es', 'ru', 'bn', 'hi', 'zh'];
export const RTL = new Set(['ar', 'ur']);

/**
 * The captions of `lang`, English for any key it lacks, with the
 * accuracy figures filled in from certification.json — never typed.
 */
export function strings(lang) {
  const read = l => {
    const f = path.join(HERE, 'strings', l + '.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  };
  const en = read('en');
  const mine = lang === 'en' ? en : read(lang);
  const figures = requireCjs(path.join(ROOT, 'scripts/copy/figures.js'));
  const cert = requireCjs(path.join(ROOT, 'data/methods/certification.json'));
  const F = { ...figures.namedFigures(cert, lang) };
  // figures.js words "million" in six languages; the rest, here, from the
  // same number and rounded down the same way (a claim never larger
  // than the record).
  const total = figures.figures(cert).total.times;
  const nf = new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : lang, { maximumFractionDigits: 1 });
  const millions = Math.floor(total / 1e5) / 10;
  const local = {
    zh: `${new Intl.NumberFormat('zh-CN', { useGrouping: false }).format(Math.floor(total / 1e4))} 万`,
    de: `${nf.format(millions)} Millionen`,
    es: `${nf.format(millions)} millones`,
    ru: `${nf.format(millions)} млн`,
    bn: `${nf.format(millions)} মিলিয়ন`,
    hi: `${nf.format(millions)} मिलियन`,
    ur: `${nf.format(millions)} ملین`,
  }[lang];
  if (local) F['total.timesCompact'] = local;
  const fill = v => v.replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
    if (F[k] == null) throw new Error(`no figure ${k}`);
    return F[k];
  });
  const t = key => {
    const v = mine[key] ?? en[key];
    if (v == null) throw new Error(`no string ${key}`);
    return fill(v);
  };
  t.F = F;
  t.lang = lang;
  t.missing = Object.keys(en).filter(k => mine[k] == null);
  return t;
}
