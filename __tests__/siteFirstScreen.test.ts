/**
 * The first screen, the way round the page, and what every language's page
 * carries.
 *
 * The site was checked in November 2026 and three things held it back, none
 * of them speed: the hero had no way to install the app and no picture of
 * it; the English page was thirty-seven phone screens long with no links to
 * its sections, a third of it one feature list written out in full; and the
 * eleven generated languages had no Accuracy section — the claim the app
 * leads with, on the pages its installs come from. These are the ways each
 * could quietly come back.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const LANGS = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts', 'site', 'strings.json'), 'utf-8'),
) as Record<string, { path: string; accuracy?: { table?: unknown } }>;
const { PLATFORMS, OPERATING_SYSTEMS, WEB_APP_URL } = require('../scripts/build-site.js');

const codes = Object.keys(LANGS);
const pageOf = (code: string) =>
  readFileSync(
    code === 'en' ? path.join(DOCS, 'index.html') : path.join(DOCS, code, 'index.html'),
    'utf-8',
  );
const heroOf = (code: string) => /<header class="hero">[\s\S]*?<\/header>/.exec(pageOf(code))![0];

describe('the first screen gets the app onto a device', () => {
  it.each(codes)('%s offers both stores in the hero, and a link to every other channel', code => {
    const hero = heroOf(code);
    expect(hero).toContain('badges/appstore.png');
    expect(hero).toContain('badges/googleplay.png');
    const more = /<a class="more" href="(#[\w-]+)">/.exec(hero);
    expect(more).not.toBeNull();
    expect(pageOf(code)).toContain(`id="${more![1].slice(1)}"`);
  });

  it.each(codes)('%s shows the app in the hero, described in its own language', code => {
    const img = /<figure class="hero-shot">\s*<img[^>]*>/.exec(heroOf(code));
    expect(img).not.toBeNull();
    expect(img![0]).toMatch(/alt="[^"]{20,}"/);
    // The first picture on the page is not left for the browser to fetch late.
    expect(img![0]).not.toContain('loading="lazy"');
    expect(existsSync(path.join(DOCS, 'assets', 'img', 'hero-home.jpg'))).toBe(true);
  });

  it.each(codes)('%s names every platform the page offers, in the hero and the structured data', code => {
    expect(heroOf(code)).toContain(`<span>${PLATFORMS}</span>`);
    expect(pageOf(code)).toContain(`"operatingSystem": "${OPERATING_SYSTEMS}"`);
  });
});

describe('a long page can be got round', () => {
  it.each(codes)('%s links to its sections, and every link lands on one', code => {
    const page = pageOf(code);
    const nav = /<nav class="jump"[\s\S]*?<\/nav>/.exec(page);
    expect(nav).not.toBeNull();
    const links = [...nav![0].matchAll(/href="#([\w-]+)"/g)].map(m => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const id of links) expect(page).toContain(`id="${id}"`);
  });

  it('folds the English feature list: every feature a name that opens, none dropped', () => {
    const section = /<section class="features" id="features">[\s\S]*?<\/section>/.exec(pageOf('en'))![0];
    const items = section.match(/<li>/g)!.length;
    expect(items).toBeGreaterThanOrEqual(50);
    expect(section.match(/<li><details><summary><b>/g)!.length).toBe(items);
  });

  it('offers the wide device picture at a phone’s width too', () => {
    expect(pageOf('en')).toMatch(/xplat-1200\.jpg[^ ]* 1200w/);
    expect(existsSync(path.join(DOCS, 'assets', 'img', 'panels', 'xplat-1200.jpg'))).toBe(true);
  });
});

describe('accuracy is on every page that leads with it', () => {
  const generated = codes.filter(c => c !== 'en' && c !== 'sv');

  it.each(generated)('%s has the section, its table in its own words, and the report link', code => {
    const section = /<section class="accuracy-section" id="accuracy"[\s\S]*?<\/section>/.exec(pageOf(code));
    expect(section).not.toBeNull();
    expect(section![0]).toContain('<table class="accuracy">');
    expect(section![0]).toContain('github.com/MihrabHQ/mihrab-methods');
    expect(section![0]).toContain('template=times-differ.yml');
    // Its own words, not the English table's — which names an authority
    // the translated pages leave to the Swedish one.
    expect(LANGS[code].accuracy?.table).toBeDefined();
    expect(section![0]).not.toContain('Matches the published timetable of');
  });

  it.each(generated)('%s says the published tables are not part of the check, and that it is independent', code => {
    const section = /<section class="accuracy-section"[\s\S]*?<\/section>/.exec(pageOf(code))![0];
    expect(section).toContain('MUIS');
    expect(section).toContain('JAKIM');
    expect(section).toContain('Türkiye Takvimi');
    expect(section.match(/<article class="card">/g)!.length).toBe(4);
  });

  it.each(generated)('%s answers the accuracy questions too', code => {
    const page = pageOf(code);
    const faq = /<section class="faq" id="faq">[\s\S]*?<\/section>/.exec(page)![0];
    expect(faq.match(/<article class="card">/g)!.length).toBeGreaterThanOrEqual(9);
    expect(faq).toContain('OpenStreetMap');
    expect(faq).toContain('mihrab-methods');
  });
});

/**
 * Mihrab Web was the last card under "Get Mihrab" — one more download
 * channel, when it is the one way to use Mihrab with nothing to install.
 * It has the hero's third button, the first section, a place in the
 * section links, an answer in the questions and its own structured data.
 */
describe('Mihrab Web is shown as the app in a browser, not as one more download', () => {
  it.each(codes)('%s opens it from the hero', code => {
    expect(heroOf(code)).toContain(`<a class="open-web" href="${WEB_APP_URL}">`);
  });

  it.each(codes)('%s gives it the first section, with the way in and a picture described in its language', code => {
    const page = pageOf(code);
    const first = /<main id="main">\s*(?:<!--[^>]*-->\s*)*<section class="([\w-]+)" id="([\w-]+)"/.exec(page)!;
    expect([first[1], first[2]]).toEqual(['webapp', 'web']);
    const section = /<section class="webapp" id="web">[\s\S]*?<\/section>/.exec(page)![0];
    expect(section).toContain(`<a class="button" href="${WEB_APP_URL}">`);
    expect(section).toMatch(/<img src="[^"]*img\/web-app\.jpg[^"]*"[^>]*alt="[^"]{20,}"/);
    // A picture of it, never the app itself in a frame: the page loads
    // nothing from anywhere else.
    expect(page).not.toMatch(/<iframe/);
  });

  it('ships the picture at both widths', () => {
    for (const f of ['web-app.jpg', 'web-app-800.jpg']) {
      expect(existsSync(path.join(DOCS, 'assets', 'img', f))).toBe(true);
    }
  });

  it.each(codes)('%s links to it from the section links and answers whether it needs installing', code => {
    const page = pageOf(code);
    expect(/<nav class="jump"[\s\S]*?<\/nav>/.exec(page)![0]).toContain('href="#web"');
    const faq = /<section class="faq"[\s\S]*?<\/section>/.exec(page)![0];
    expect(faq).toContain('mihrabhq.github.io');
  });

  it.each(codes)('%s describes it to a search engine as a free web application', code => {
    const blocks = Array.from(
      pageOf(code).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
      m => JSON.parse(m[1]),
    );
    const web = blocks.find(b => b['@type'] === 'WebApplication');
    expect(web).toBeDefined();
    expect(web.url).toBe(WEB_APP_URL);
    expect(web.offers.price).toBe('0');
    // And the installed app is still the first block, which other tests read.
    expect(blocks[0]['@type']).toBe('MobileApplication');
  });

  it('keeps one line for it under Get Mihrab, so every channel is still listed there', () => {
    for (const code of codes) {
      const install = /<section class="install"[\s\S]*?<\/section>/.exec(pageOf(code))![0];
      expect(install).toContain(`<a class="button" href="${WEB_APP_URL}">`);
    }
  });
});
