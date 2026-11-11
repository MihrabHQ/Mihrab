#!/usr/bin/env node
/**
 * Render the site's translated pages, and keep every page's language
 * picker and hreflang block identical.
 *
 *   node scripts/build-site.js          # write docs/<lang>/index.html
 *   node scripts/build-site.js --check  # exit 1 if anything is out of date
 *
 * ── WHY A GENERATOR ───────────────────────────────────────────────────
 *
 * The app speaks thirteen languages and the site spoke one. A translated
 * page is not a nicety here: Google classifies a page by its language, so
 * "Gebetszeiten" and "namaz vakitleri" are queries an English page does
 * not win, however many German words are sprinkled through it.
 *
 * Thirteen hand-written pages, though, is thirteen pages that drift — and
 * the ones that drift silently are the ones nobody on the project can
 * read. So the eleven translations are rendered from ONE template and one
 * strings file. English and Swedish stay hand-written, because they carry
 * content the others do not (the feature list written out in full and the
 * support section; the Islamiska Förbundet timetable and its 108 towns,
 * which is a Swedish answer to a Swedish question and belongs on no other
 * page). The screenshots are NOT one of those things — they were, for a
 * while, and a page describing an app it never shows is a page asking to
 * be taken on faith — so the gallery is generated into all thirteen from
 * the store panels (see gallery() below).
 *
 * What every page must agree about — which languages exist, where they
 * live, and that each declares all the others — is generated into all
 * thirteen, hand-written ones included, between markers. Add a language
 * to strings.json and every page learns about it.
 *
 * ── AND WHY THERE IS NO JAVASCRIPT ────────────────────────────────────
 *
 * The obvious way to send a visitor to their own language is a script
 * that reads navigator.language and redirects. This site does not ship
 * JavaScript, and says so on the privacy section as a claim someone can
 * check. So the picker is a <details> element — a native disclosure, no
 * script — and search engines are told about the translations through
 * reciprocal hreflang, which is how a visitor arriving from a search
 * lands on their own language anyway.
 */
const fs = require('fs');
const path = require('path');
const { shippedVersion } = require('./sync-version');
const { fillPage, figTokens } = require('./copy/site');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const STRINGS = path.join(__dirname, 'site', 'strings.json');
const ORIGIN = `https://${fs.readFileSync(path.join(DOCS, 'CNAME'), 'utf-8').trim()}`;

/**
 * Every channel the app ships through, in the order the English page lists
 * them. ONE list, because the translated pages were written with four of
 * the five and quietly dropped Obtainium — the channel that matters most
 * to exactly the audience an F-Droid-friendly app reaches.
 */
const BADGES = [
  {
    img: 'appstore',
    alt: 'App Store',
    href: 'https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256',
  },
  {
    img: 'googleplay',
    alt: 'Google Play',
    href: 'https://play.google.com/store/apps/details?id=com.prayer_times',
  },
  {
    img: 'fdroid',
    alt: 'F-Droid',
    href: 'https://f-droid.org/packages/com.prayer_times/',
  },
  {
    img: 'github',
    alt: 'GitHub',
    href: 'https://github.com/MihrabHQ/Mihrab/releases/latest',
  },
  {
    img: 'microsoft',
    alt: 'Microsoft Store',
    href: 'https://apps.microsoft.com/detail/9N43KNMJHBWV',
  },
  {
    img: 'obtainium',
    alt: 'Obtainium',
    href: 'https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.prayer_times%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FMihrabHQ%2FMihrab%22%2C%22author%22%3A%22Hassan-PS%22%2C%22name%22%3A%22Mihrab%22%7D',
  },
];

/**
 * A row of store badges, picked from BADGES by image name. The install
 * section is split by platform (Apple, then Android with Obtainium first),
 * so each group asks for its own badges rather than the whole list.
 */
function badgeList(names, imgBase, indent = '      ', flags = {}) {
  const items = names.map(n => BADGES.find(b => b.img === n));
  return `${indent}<ul class="badges">\n${items
    .map(ba => {
      const link = `<a href="${ba.href}"><img src="${imgBase}/${ba.img}.png" width="564" height="168" alt="${ba.alt}"></a>`;
      return flags[ba.img]
        ? `${indent}  <li class="pick">${link}<p class="flag">${esc(flags[ba.img])}</p></li>`
        : `${indent}  <li>${link}</li>`;
    })
    .join('\n')}\n${indent}</ul>`;
}

/*
 * Bumped whenever a shot is retaken, INCLUDING a retake on the same day as
 * the last one — a browser holding the old picture has no way to know the
 * bytes moved under an unchanged URL, and the widget shots have now been
 * retaken twice on 2026-09-06.
 */
const SHOT_V = '?v=2026-11-05p';
/** Pages written by hand, which the generator only patches between markers. */
const HAND_WRITTEN = {
  en: path.join(DOCS, 'index.html'),
  sv: path.join(DOCS, 'sv', 'index.html'),
};

const esc = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The picker: every language, the current one marked, no script. */
function picker(langs, current) {
  const label = langs[current].labels
    ? langs[current].labels.lang
    : current === 'sv'
      ? 'Språk'
      : 'Language';
  const items = Object.entries(langs)
    .map(([code, l]) => {
      const here = code === current;
      const href = l.path;
      return (
        `      <li><a href="${href}" hreflang="${code}" lang="${code}"` +
        (here ? ' aria-current="true"' : '') +
        `>${esc(l.name)}</a></li>`
      );
    })
    .join('\n');
  return `<details class="langpicker">
  <summary>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></svg>
    <span class="lang-label">${esc(label)}</span>
  </summary>
  <ul>
${items}
  </ul>
</details>`;
}

/**
 * The gallery: the store panels themselves, in the page's language — the
 * same pictures the stores show (branding/tools/panels), so the site and the
 * listings never drift. First every device at once, then the eight phone
 * panels (each a group of features, not a bare screenshot), then one wide
 * panel per platform: an iPad, a Mac, Windows and a Chromebook. Their words
 * are the panels' own captions (branding/tools/panels/strings), so a page in
 * Urdu shows Urdu panels and describes them in Urdu.
 *
 * The pictures are written by branding/tools/panels/publish.py into
 * assets/img/panels/<lang>/; xplat.jpg carries no words and is shared.
 */
const PANEL_STRINGS = path.join(__dirname, '..', 'branding', 'tools', 'panels', 'strings');
const PHONE_PANELS = ['hero', 'accuracy', 'mushaf', 'tilawah', 'understand', 'hifz', 'remember', 'day'];
const WIDE_PANELS = [
  { key: 'mushaf', device: 'iPad' },
  { key: 'hero', device: 'Mac' },
  { key: 'remember', device: 'Windows' },
  { key: 'month', device: 'Chromebook' },
];
const plain = h => String(h).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function panelWords(code) {
  const read = c => {
    const f = path.join(PANEL_STRINGS, `${c}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : {};
  };
  return { ...read('en'), ...read(code) };
}

function gallery(code, t) {
  const at = code === 'en' ? 'assets' : '../assets';
  const w = panelWords(code);
  const lang = fs.existsSync(path.join(DOCS, 'assets', 'img', 'panels', code)) ? code : 'en';
  const cap = k => plain(w[`${k}.title`]);
  const alt = k => `${cap(k)} ${plain(w[`${k}.sub`] ?? '')}`.trim();
  const phones = PHONE_PANELS.map(
    (k, i) => `      <li><figure>
        <img src="${at}/img/panels/${lang}/phone-${i + 1}.jpg${SHOT_V}" width="540" height="960" loading="lazy" decoding="async"
          alt="${esc(alt(k))}">
      </figure></li>`,
  ).join('\n');
  const wide = WIDE_PANELS.map(
    ({ key, device }, i) => `      <li><figure>
        <img src="${at}/img/panels/${lang}/wide-${i + 1}.jpg${SHOT_V}" width="1280" height="720" loading="lazy" decoding="async"
          alt="${esc(`${device}: ${alt(key)}`)}">
        <figcaption>${esc(device)}</figcaption>
      </figure></li>`,
  ).join('\n');
  return `    <figure class="xplat">
      <img src="${at}/img/panels/xplat.jpg${SHOT_V}" width="2400" height="1200" loading="lazy" decoding="async"
        srcset="${at}/img/panels/xplat-1200.jpg${SHOT_V} 1200w, ${at}/img/panels/xplat.jpg${SHOT_V} 2400w"
        sizes="(max-width: 1128px) calc(100vw - 48px), 1032px"
        alt="${esc(`${plain(w['devices.title'])} ${plain(w['devices.sub'])}`)}">
    </figure>
    <ul class="panels">
${phones}
    </ul>
    <ul class="panels wide">
${wide}
    </ul>`;
}

/**
 * What people write: store reviews (scripts/site/reviews.json) as a band of
 * cards drifting left to right, in a loop, with no script. The list is
 * written twice — the second copy hidden from assistive tech — so a
 * translateX of half its width loops without a seam. Each review keeps its
 * own language and direction; one not in English carries our translation.
 */
const REVIEWS = path.join(__dirname, 'site', 'reviews.json');
const STAR = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.83 5.74 6.33.92-4.58 4.46 1.08 6.3L12 17.25l-5.66 2.97 1.08-6.3-4.58-4.46 6.33-.92z"/></svg>';
const RTL = new Set(['ar', 'ur', 'fa', 'he']);

function reviews(code, t) {
  const r = t.reviews;
  if (!r) throw new Error(`${code}: no strings for the reviews`);
  const list = JSON.parse(fs.readFileSync(REVIEWS, 'utf-8')).reviews;
  const fmt = new Intl.DateTimeFormat(code === 'zh' ? 'zh-CN' : code, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const card = (v, hidden) => {
    const dir = RTL.has(v.lang) ? ' dir="rtl"' : '';
    const title = v.title ? `\n          <p class="review-title" lang="${v.lang}"${dir}>${esc(v.title)}</p>` : '';
    const tr = v.en ? `\n          <p class="review-tr" lang="en" dir="ltr"><span>${esc(r.translated)}</span> ${esc(v.en)}</p>` : '';
    return `      <li${hidden ? ' aria-hidden="true"' : ''}><figure class="review">
          <p class="stars" aria-label="5/5">${STAR.repeat(5)}</p>${title}
          <blockquote lang="${v.lang}"${dir}>${esc(v.text)}</blockquote>${tr}
          <figcaption><span class="who" dir="auto">${esc(v.name)}</span> · ${esc(v.store)} · <time datetime="${v.date}">${esc(fmt.format(new Date(v.date + 'T00:00:00Z')))}</time></figcaption>
        </figure></li>`;
  };
  return `<section class="voices" id="reviews">
  <div class="wrap">
    <p class="eyebrow">${esc(r.eyebrow)}</p>
    <h2>${esc(r.h2)}</h2>
    <p class="lede">${esc(r.note)}</p>
  </div>
  <div class="marquee" dir="ltr">
    <ul class="marquee-track">
${list.map(v => card(v, false)).join('\n')}
${list.map(v => card(v, true)).join('\n')}
    </ul>
  </div>
</section>`;
}

/**
 * Mihrab Web: the same app in a browser, at the MihrabHQ.github.io site. A
 * link, nothing more — this page still loads nothing from anywhere else.
 */
const WEB_APP_URL = 'https://mihrabhq.github.io/';

function webCard(code, t) {
  const w = t.install && t.install.web;
  if (!w) throw new Error(`${code}: no strings for the Mihrab Web card`);
  return `      <div class="platform web">
        <h3><svg class="glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></svg>${esc(w.h3)}</h3>
        <div class="web-row">
          <p class="web-body">${esc(w.body)}</p>
          <p class="web-link"><a class="button" href="${WEB_APP_URL}">${esc(w.link)}</a> <code>mihrabhq.github.io</code></p>
        </div>
      </div>`;
}

/**
 * The Windows and Linux app. Windows: the Microsoft Store (Store ID
 * 9N43KNMJHBWV), which installs it and keeps it up to date. Linux: the
 * distribution's own package manager, from Mihrab's signed repositories at
 * mihrabhq.github.io/packages (published by MihrabHQ/packages; the Desktop
 * workflow's `packages` job installs and removes from them on each
 * distribution), so updates come with the system's. Commands are in a <pre>,
 * left to right on every page, so the lines copy whole.
 */
const PACKAGES = 'https://mihrabhq.github.io/packages';
// The repositories' signing key (desktop/packaging/make-keys.sh): pacman is
// told to trust it by this fingerprint. Change it here if the key changes.
const PACKAGES_KEY = '28BB36D6D8388A8EF15EEA24E19DCF135A3D8035';
// The package manager takes the app; the settings live in the home folder.
const SETTINGS = 'rm -rf ~/.config/Mihrab';
const LINUX_COMMANDS = [
  {
    name: 'Debian, Ubuntu, Mint (apt)',
    install: [
      `sudo curl -fsSLo /usr/share/keyrings/mihrab.gpg ${PACKAGES}/mihrab.gpg`,
      `sudo curl -fsSLo /etc/apt/sources.list.d/mihrab.sources ${PACKAGES}/mihrab.sources`,
      'sudo apt update && sudo apt install mihrab',
    ],
    remove: `sudo apt purge mihrab && ${SETTINGS}`,
  },
  {
    name: 'Fedora (dnf)',
    install: [
      `sudo curl -fsSLo /etc/yum.repos.d/mihrab.repo ${PACKAGES}/mihrab.repo`,
      'sudo dnf install mihrab',
    ],
    remove: `sudo dnf remove mihrab && ${SETTINGS}`,
  },
  {
    name: 'openSUSE (zypper)',
    install: [`sudo zypper addrepo ${PACKAGES}/mihrab.repo`, 'sudo zypper install mihrab'],
    remove: `sudo zypper remove mihrab && ${SETTINGS}`,
  },
  {
    name: 'Arch, Manjaro, EndeavourOS (pacman, yay)',
    install: [
      `curl -fsSL ${PACKAGES}/mihrab.asc | sudo pacman-key --add -`,
      `sudo pacman-key --lsign-key ${PACKAGES_KEY}`,
      `printf '\\n[mihrab]\\nServer = ${PACKAGES}/arch/$arch\\n' | sudo tee -a /etc/pacman.conf`,
      'sudo pacman -Syu mihrab',
    ],
    remove: `sudo pacman -R mihrab && ${SETTINGS}`,
  },
];

function desktopCard(code, t, imgBase) {
  const d = t.install && t.install.desktop;
  if (!d) throw new Error(`${code}: no strings for the Windows and Linux cards`);
  const glyph = inner =>
    `<svg class="glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  // Each distribution folded under its name, so the card stays the size of
  // its neighbours; the one a reader opens shows its lines in full.
  const distros = LINUX_COMMANDS.map(
    l => `        <details class="distro">
          <summary dir="ltr">${esc(l.name)}</summary>
          <p class="cmd-label">${esc(d.install)}</p>
          <pre dir="ltr"><code>${esc(l.install.join('\n'))}</code></pre>
          <p class="cmd-label">${esc(d.remove)}</p>
          <pre dir="ltr"><code>${esc(l.remove)}</code></pre>
        </details>`,
  ).join('\n');
  return `      <div class="platform windows">
        <h3>${glyph('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/>')}${esc(d.windows)}</h3>
${badgeList(['microsoft'], imgBase, '        ')}
      </div>
      <div class="platform linux">
        <h3>${glyph('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 10 3 2-3 2M12 15h5"/>')}${esc(d.linux)} <span class="tag">${esc(d.tag)}</span></h3>
${distros}
        <p class="flag">${esc(d.flag)} <a href="https://github.com/MihrabHQ/Mihrab/issues">${esc(d.report)}</a></p>
      </div>`;
}

/**
 * Where the app runs, as the hero and the structured data say it: one list,
 * because the hero went on saying three platforms after the page offered six.
 */
const PLATFORMS = 'iOS, Android, macOS, Windows, Linux, web';
const OPERATING_SYSTEMS = 'Android, iOS, iPadOS, macOS, Windows, Linux';

/**
 * The first screen's way in: the two stores most visitors want, and a link
 * down to every other channel. The hero used to be words only, with the
 * badges a screen further down — and a page whose job is to get the app
 * onto a device should not make the reader scroll to find out how.
 */
function heroCta(code, t, imgBase) {
  const more = t.labels && t.labels.allDownloads;
  const to = t.navInstall || '#install';
  if (!more) throw new Error(`${code}: no label for the hero's link to every download`);
  return `    <div class="cta">
${badgeList(['appstore', 'googleplay'], imgBase, '      ')}
      <a class="more" href="${to}">${esc(more)} <span aria-hidden="true">&darr;</span></a>
    </div>`;
}

/** The hero's phone: the Today screen itself, beside the words about it. */
function heroShot(code, t, at) {
  const alt = t.shots && t.shots.items && t.shots.items.home && t.shots.items.home.alt;
  if (!alt) throw new Error(`${code}: no words for the hero's screenshot`);
  return `    <figure class="hero-shot">
      <img src="${at}/img/hero-home.jpg${SHOT_V}" width="540" height="1200" decoding="async"
        alt="${esc(alt)}">
    </figure>`;
}

/**
 * The way round a long page: one row of links to its sections, in the brand
 * row. Links, not a script — and each must land on an id the page has
 * (__tests__/siteFirstScreen.test.ts).
 */
function jumpNav(code, t) {
  if (!t.nav) throw new Error(`${code}: no strings for the section links`);
  const items = Array.isArray(t.nav.items)
    ? t.nav.items
    : ['install', 'accuracy', 'screenshots', 'features', 'privacy', 'faq'].map(id => [`#${id}`, t.nav[id]]);
  for (const [href, label] of items) if (!href || !label) throw new Error(`${code}: a section link has no label`);
  return `<nav class="jump" aria-label="${esc(t.nav.label)}">
  <ul>
${items.map(([href, label]) => `    <li><a href="${href}">${esc(label)}</a></li>`).join('\n')}
  </ul>
</nav>`;
}

/** **bold**, [text](https://…) and {fig:KEY} — all the markup a drafted text needs. */
const rich = s =>
  figTokens(esc(s))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+|#[\w-]+)\)/g, '<a href="$2">$1</a>');

/**
 * Accuracy, on the translated pages: what the English page says, shorter —
 * why a minute matters, how each method is checked, the table of every
 * check (scripts/copy/site.js fills it from the certification record), and
 * the four things beside it. It was on the English page alone, which left
 * eleven languages without the one claim the app leads with. Drafts are
 * marked for review by a native speaker until one has signed them off.
 */
function accuracy(code, t) {
  const a = t.accuracy;
  if (!a) throw new Error(`${code}: no strings for the accuracy section`);
  return `<section class="accuracy-section" id="accuracy"${a.review ? ` data-review="${a.review}"` : ''}>
${a.review ? `<!-- DRAFT: needs review by a native ${code} speaker before it is relied on -->\n` : ''}  <div class="wrap">
    <p class="eyebrow">${esc(a.eyebrow)}</p>
    <h2>${esc(a.h2)}</h2>
${a.lede.map(l => `    <p class="lede">${rich(l)}</p>`).join('\n')}
<!-- accuracy-table:start -->
<!-- accuracy-table:end -->
    <div class="cols">
${a.cards
  .map(
    c => `      <article class="card">
        <h3>${esc(c.h3)}</h3>
        <p>${rich(c.p)}</p>
      </article>`,
  )
  .join('\n')}
    </div>
  </div>
</section>`;
}

/** Reciprocal hreflang: a page that names only itself is ignored. */
function hreflang(langs) {
  const lines = Object.entries(langs).map(
    ([code, l]) =>
      `<link rel="alternate" hreflang="${code}" href="${ORIGIN}${l.path}">`,
  );
  lines.push(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`);
  return lines.join('\n');
}

/** Replace what is between `<!-- name:start -->` and `<!-- name:end -->`. */
function patchBlock(text, name, body) {
  const re = new RegExp(
    `(<!-- ${name}:start -->\\n)[\\s\\S]*?(<!-- ${name}:end -->)`,
  );
  if (!re.test(text)) throw new Error(`no ${name} markers in the page`);
  return text.replace(re, `$1${body}\n$2`);
}

/**
 * A country's own section on its language's page, after the Swedish one on
 * the English page: what Mihrab gives there, matched to the authority people
 * there pray by, with the figures from the certification record. Drafts are
 * marked for review by a native speaker (`review: "native"` in strings.json)
 * until someone who reads the language has signed them off.
 */
function country(c, code) {
  const body = rich;
  return `<section class="sweden" id="${c.id}"${c.lang ? ` lang="${c.lang}"` : ''}${c.review ? ` data-review="${c.review}"` : ''}>
${c.review ? `<!-- DRAFT: needs review by a native ${code} speaker before it is relied on -->\n` : ''}  <div class="wrap">
    <p class="eyebrow">${esc(c.eyebrow)}</p>
    <h2>${esc(c.h2)}</h2>
    <p class="lede">${body(c.lede)}</p>
    <div class="cols">
${c.cards
  .map(
    k => `      <article class="card">
        <h3>${esc(k.h3)}</h3>
        <ul>
${k.items.map(i => `          <li>${body(i)}</li>`).join('\n')}
        </ul>
      </article>`,
  )
  .join('\n')}
    </div>
    <p class="note">${body(c.note)}</p>
  </div>
</section>

`;
}

function ld(obj) {
  return JSON.stringify(obj, null, 2);
}

function renderPage(code, langs, version) {
  const t = langs[code];
  const v = `${version.versionName} (${version.versionCode})`;
  const app = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: 'Mihrab: The Muslim Companion',
    alternateName: 'Mihrab',
    applicationCategory: 'LifestyleApplication',
    operatingSystem: OPERATING_SYSTEMS,
    softwareVersion: version.versionName,
    url: `${ORIGIN}${t.path}`,
    inLanguage: code,
    image: `${ORIGIN}/assets/img/og-hero.png?v=2026-11-05`,
    description: t.description,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    author: {
      '@type': 'Person',
      name: 'Hassan El Ghamri',
      url: 'https://github.com/Hassan-PS',
    },
    sameAs: [
      'https://play.google.com/store/apps/details?id=com.prayer_times',
      'https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256',
      'https://f-droid.org/packages/com.prayer_times/',
      'https://github.com/MihrabHQ/Mihrab',
    ],
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: code,
    mainEntity: t.faq.items.map(i => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
  const check =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  return `<!DOCTYPE html>
<html lang="${code}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#070F33" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F162F" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${ORIGIN}${t.path}">
<!-- hreflang:start -->
${hreflang(langs)}
<!-- hreflang:end -->
<link rel="icon" href="../assets/img/icon.png" type="image/png">
<link rel="apple-touch-icon" href="../assets/img/icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Mihrab">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:url" content="${ORIGIN}${t.path}">
<meta property="og:image" content="${ORIGIN}/assets/img/og-hero.png?v=2026-11-05">
<meta property="og:image:width" content="1600">
<meta property="og:image:height" content="900">
<meta property="og:locale" content="${code}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t.title)}">
<meta name="twitter:description" content="${esc(t.description)}">
<meta name="twitter:image" content="${ORIGIN}/assets/img/og-hero.png?v=2026-11-05">
<script type="application/ld+json">
${ld(app)}
</script>
<script type="application/ld+json">
${ld(faq)}
</script>
<link rel="stylesheet" href="../assets/site.css">
</head>
<body>
<a class="skip" href="#main">${esc(t.labels.skip)}</a>

<a class="solidarity" href="https://github.com/Safouene1/support-palestine-banner/blob/master/Markdown-pages/Support.md">
  <svg class="flag" width="27" height="18" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
    <rect width="30" height="20" fill="#FFFFFF"/>
    <rect width="30" height="6.67" fill="#000000"/>
    <rect y="13.33" width="30" height="6.67" fill="#007A3D"/>
    <path d="M0 0 L13 10 L0 20 Z" fill="#CE1126"/>
  </svg>
  <span><b>${esc(t.labels.banner)}</b><span class="wide"> ${esc(t.labels.bannerMore)}</span></span>
  <span class="go" aria-hidden="true">&rarr;</span>
</a>

<header class="hero">
  <svg class="hero-art" viewBox="0 0 1200 600" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
    <g fill="currentColor" opacity=".07">
      <g transform="translate(1010 450)">
        <rect x="-148" y="-148" width="296" height="296" rx="6"/>
        <rect x="-148" y="-148" width="296" height="296" rx="6" transform="rotate(45)"/>
      </g>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="2" opacity=".16">
      <path d="M745 600 V335 Q745 152 905 88 Q1065 152 1065 335 V600"/>
      <path d="M779 600 V344 Q779 186 905 132 Q1031 186 1031 344 V600"/>
    </g>
  </svg>
  <div class="wrap">
    <div class="brandline">
      <img src="../assets/img/icon.png" width="62" height="62" alt="Mihrab">
      <span class="wordmark">Mihrab</span>
<!-- jump:start -->
${jumpNav(code, t)}
<!-- jump:end -->
<!-- langpicker:start -->
${picker(langs, code)}
<!-- langpicker:end -->
    </div>
    <div class="hero-grid">
    <div class="hero-text">
    <h1>${esc(t.h1)}</h1>
    <p class="sub">${esc(t.sub)}</p>
<!-- cta:start -->
${heroCta(code, t, '../assets/img/badges')}
<!-- cta:end -->
    <ul class="trust">
${t.chips.map(c => `      <li>${check}${esc(c)}</li>`).join('\n')}
    </ul>
    <p class="meta">
      <span>${esc(t.labels.version)} ${v}</span> <span class="dot" aria-hidden="true">•</span>
      <span>${PLATFORMS}</span> <span class="dot" aria-hidden="true">•</span>
      <span>AGPL-3.0-or-later</span> <span class="dot" aria-hidden="true">•</span>
      <a href="https://github.com/MihrabHQ/Mihrab">${esc(t.labels.source)}</a>
    </p>
    </div>
<!-- heroshot:start -->
${heroShot(code, t, '../assets')}
<!-- heroshot:end -->
    </div>
  </div>
</header>

<main id="main">
<section class="install" id="install">
  <div class="wrap">
    <p class="eyebrow">${esc(t.install.eyebrow)}</p>
    <h2>${esc(t.install.h2)}</h2>
    <p class="lede">${esc(t.install.lede)}</p>
    <div class="platforms">
      <div class="platform">
        <h3><svg class="glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/></svg>${esc(t.install.apple)}</h3>
${badgeList(['appstore'], '../assets/img/badges', '        ')}
        <p class="note">${esc(t.install.brew)}<br><code>brew install --cask mihrabhq/tap/mihrab</code></p>
      </div>
      <div class="platform">
        <h3><svg class="glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 5.5 7 3"/><path d="M15.5 5.5 17 3"/><rect x="4" y="5.5" width="16" height="14" rx="4.5"/><circle cx="9.5" cy="11.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="11.5" r="1.2" fill="currentColor" stroke="none"/></svg>${esc(t.install.android)}</h3>
${badgeList(['obtainium', 'googleplay', 'fdroid', 'github'], '../assets/img/badges', '        ')}
        <p class="flag">${esc(t.install.flag)} <a href="https://github.com/ImranR98/Obtainium">${esc(t.install.getObtainium)}</a></p>
      </div>
${desktopCard(code, t, '../assets/img/badges')}
${webCard(code, t)}
    </div>
  </div>
</section>

${accuracy(code, t)}

<section class="shots" id="screenshots">
  <div class="wrap">
    <p class="eyebrow">${esc(t.shots.eyebrow)}</p>
    <h2>${esc(t.shots.h2)}</h2>
    <p class="lede">${esc(t.shots.lede)}</p>
${gallery(code, t)}
  </div>
</section>

<!-- reviews:start -->
${reviews(code, t)}
<!-- reviews:end -->

<section class="features" id="features">
  <div class="wrap">
    <p class="eyebrow">${esc(t.features.eyebrow)}</p>
    <h2>${esc(t.features.h2)}</h2>
    <div class="cols">
${t.features.cards
  .map(
    c => `      <article class="card">
        <h3>${esc(c.h3)}</h3>
        <p>${esc(c.p)}</p>
      </article>`,
  )
  .join('\n')}
    </div>
  </div>
</section>

${t.country ? country(t.country, code) : ''}<section class="privacy" id="privacy">
  <div class="wrap">
    <p class="eyebrow">${esc(t.privacy.eyebrow)}</p>
    <h2>${esc(t.privacy.h2)}</h2>
    <p class="lede">${esc(t.privacy.lede)}</p>
    <div class="cols">
${t.privacy.cards
  .map(
    c => `      <article class="card">
        <h3>${esc(c.h3)}</h3>
        <p>${esc(c.p)}</p>
      </article>`,
  )
  .join('\n')}
    </div>
  </div>
</section>

<section class="faq" id="faq">
  <div class="wrap">
    <p class="eyebrow">${esc(t.faq.eyebrow)}</p>
    <h2>${esc(t.faq.h2)}</h2>
    <div class="cols">
${t.faq.items
  .map(
    i => `      <article class="card">
        <h3>${esc(i.q)}</h3>
        <p>${esc(i.a)}</p>
      </article>`,
  )
  .join('\n')}
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <h2>${esc(t.footer.licence.h2)}</h2>
        <p>${esc(t.footer.licence.p)}</p>
      </div>
      <div>
        <h2>${esc(t.footer.content.h2)}</h2>
        <p>${esc(t.footer.content.p)}</p>
      </div>
      <div>
        <h2>${esc(t.footer.project.h2)}</h2>
        <ul>
          <li><a href="https://github.com/MihrabHQ/Mihrab/issues">${esc(t.footer.project.issues)}</a></li>
          <li><a href="https://github.com/MihrabHQ/Mihrab/blob/main/CHANGELOG.md">${esc(t.footer.project.changelog)}</a></li>
        </ul>
      </div>
    </div>
    <p class="colophon">${esc(t.labels.built.replace('{v}', v))}</p>
  </div>
</footer>
</body>
</html>
`;
}

/** The sitemap: every language, each naming all the others. */
function sitemap(langs) {
  const alts = Object.entries(langs)
    .map(
      ([code, l]) =>
        `    <xhtml:link rel="alternate" hreflang="${code}" href="${ORIGIN}${l.path}"/>`,
    )
    .join('\n');
  const entries = Object.entries(langs)
    .map(
      ([code, l]) => `  <url>
    <loc>${ORIGIN}${l.path}</loc>
${alts}
    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/"/>
    <changefreq>weekly</changefreq>
    <priority>${code === 'en' ? '1.0' : '0.9'}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}

function build() {
  const langs = JSON.parse(fs.readFileSync(STRINGS, 'utf-8'));
  const version = shippedVersion();
  const files = new Map();

  for (const [code, l] of Object.entries(langs)) {
    if (HAND_WRITTEN[code]) {
      const file = HAND_WRITTEN[code];
      let text = fs.readFileSync(file, 'utf-8');
      text = patchBlock(text, 'hreflang', hreflang(langs));
      text = patchBlock(text, 'langpicker', picker(langs, code));
      const assets = code === 'en' ? 'assets' : '../assets';
      text = patchBlock(text, 'jump', jumpNav(code, l));
      text = patchBlock(text, 'cta', heroCta(code, l, `${assets}/img/badges`));
      text = patchBlock(text, 'heroshot', heroShot(code, l, assets));
      text = patchBlock(text, 'gallery', gallery(code, l));
      text = patchBlock(text, 'reviews', reviews(code, l));
      text = patchBlock(text, 'web', webCard(code, l));
      text = patchBlock(
        text,
        'desktop',
        desktopCard(code, l, path.relative(path.dirname(file), path.join(DOCS, 'assets', 'img', 'badges'))),
      );
      files.set(file, fillPage(text, code));
      continue;
    }
    if (!l.h1) throw new Error(`${code}: no strings, and no hand-written page`);
    files.set(
      path.join(DOCS, code, 'index.html'),
      fillPage(renderPage(code, langs, version), code),
    );
  }
  files.set(path.join(DOCS, 'sitemap.xml'), sitemap(langs));
  return files;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const files = build();
  const stale = [];
  for (const [file, text] of files) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
    if (current === text) continue;
    stale.push(path.relative(ROOT, file));
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
  }
  if (!stale.length) {
    console.log(`✓ site is current (${files.size} files)`);
  } else if (check) {
    console.error(`✗ out of date: ${stale.join(', ')}`);
    console.error('  Fix with: node scripts/build-site.js');
    process.exit(1);
  } else {
    console.log(`✓ wrote ${stale.length} file(s):`);
    for (const s of stale) console.log(`  ${s}`);
  }
}

module.exports = { build, PLATFORMS, OPERATING_SYSTEMS, heroCta, heroShot, jumpNav, accuracy, picker, hreflang, gallery, webCard, desktopCard, ORIGIN, SHOT_V, PHONE_PANELS, WIDE_PANELS, panelWords, plain };
