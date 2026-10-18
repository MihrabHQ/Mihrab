/**
 * The website's generated parts: every figure (`<!--fig:KEY-->…<!--/fig-->`),
 * the accuracy table, and the FAQ's JSON-LD — all written into the static
 * HTML at build time (scripts/build-site.js). The site ships no JavaScript;
 * nothing here runs in a browser.
 *
 * The figures come from data/methods/certification.json, mihrab-methods'
 * record (scripts/copy/sync-certification.js copies it in, with figures.js). A figure the
 * record lacks fails the build.
 */
const fs = require('fs');
const path = require('path');
const { AUTHORITY_ORDER, figures, fillBlock, fillFigures, int, longDate, namedFigures, span } = require('./figures');

const CERT = path.join(__dirname, '..', '..', 'data', 'methods', 'certification.json');

function certification() {
  return JSON.parse(fs.readFileSync(CERT, 'utf-8'));
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Words for the table, by language: the authorities and the column heads. */
const TABLE_WORDS = {
  en: {
    head: ['Matches the published timetable of', 'Places', 'Times checked', 'Off the printed minute', 'Checked over'],
    caption: 'Every time each method has been checked against',
    total: 'Total',
    checked: 'Last checked',
    names: {
      sweden: ['Sweden', 'Islamiska Förbundet’s tables'],
      'sweden-diyanet': ['', 'Diyanet’s tables for Sweden'],
      diyanet: ['Diyanet', 'Diyanet’s tables, Türkiye and worldwide'],
      morocco: ['Morocco', 'the Ministry of Habous and Islamic Affairs'],
      algeria: ['Algeria', 'the Ministry of Religious Affairs and Wakfs'],
      indonesia: ['Indonesia', 'Kemenag'],
    },
  },
  sv: {
    head: ['Stämmer med den publicerade tidtabellen från', 'Orter', 'Kontrollerade tider', 'Fel på den tryckta minuten', 'Kontrollerat'],
    caption: 'Varje tid som varje metod har kontrollerats mot',
    total: 'Totalt',
    checked: 'Senast kontrollerat',
    names: {
      sweden: ['Sverige', 'Islamiska Förbundets tidtabeller'],
      'sweden-diyanet': ['', 'Diyanets tidtabeller för Sverige'],
      diyanet: ['Diyanet', 'Diyanets tidtabeller, Turkiet och världen'],
      morocco: ['Marocko', 'Ministeriet för habous och islamiska frågor'],
      algeria: ['Algeriet', 'Ministeriet för religiösa frågor och wakf'],
      indonesia: ['Indonesien', 'Kemenag'],
    },
  },
};

/** The accuracy table, in a language the table has words for. */
function accuracyTable(cert, lang = 'en') {
  const w = TABLE_WORDS[lang] ?? TABLE_WORDS.en;
  const { by, total } = figures(cert);
  const rows = [];
  for (const id of AUTHORITY_ORDER) {
    const a = by[id];
    a.checks.forEach((c, i) => {
      const key = id === 'sweden' && i === 1 ? 'sweden-diyanet' : id;
      const [name, tables] = w.names[key];
      rows.push(
        `          <tr${i > 0 ? ' class="cont"' : ''}><th scope="row">${esc(i === 0 ? name : '')}</th><td>${esc(tables)}</td><td>${int(c.places, lang)}</td><td>${int(c.times, lang)}</td><td><strong>${int(c.off, lang)}</strong></td><td>${esc(span(c.from, c.to, lang))}</td></tr>`,
      );
    });
  }
  return `      <div class="table-scroll">
        <table class="accuracy">
          <caption>${esc(w.caption)}</caption>
          <thead><tr><th scope="col"></th>${w.head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
${rows.join('\n')}
          </tbody>
          <tfoot><tr><th scope="row">${esc(w.total)}</th><td>${esc(w.checked)} ${esc(longDate(total.checkedAt, lang))}</td><td></td><td>${int(total.times, lang)}</td><td><strong>${int(total.off, lang)}</strong></td><td></td></tr></tfoot>
        </table>
      </div>`;
}

/** Plain text of an HTML fragment: tags and figure comments gone, entities read. */
function plain(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The FAQ's JSON-LD, read off the visible FAQ — so the answers a search
 * engine is given are, word for word, the answers on the page, figures
 * included.
 */
function faqLd(page, lang) {
  const sec = /<section class="faq"[^>]*>([\s\S]*?)<\/section>/.exec(page);
  if (!sec) throw new Error(`${lang}: no FAQ section`);
  const items = [];
  for (const card of sec[1].matchAll(/<article class="card[^"]*">([\s\S]*?)<\/article>/g)) {
    const q = /<h3>([\s\S]*?)<\/h3>/.exec(card[1]);
    const ps = [...card[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => plain(m[1]));
    if (q && ps.length) items.push({ '@type': 'Question', name: plain(q[1]), acceptedAnswer: { '@type': 'Answer', text: ps.join(' ') } });
  }
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items };
  return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
}

/**
 * Fill a page: figures in the page's language, the accuracy table where it
 * has one, and the FAQ's JSON-LD where it has those markers.
 */
function fillPage(text, lang, cert = certification()) {
  let out = fillFigures(text, namedFigures(cert, lang), `docs page (${lang})`);
  if (out.includes('<!-- accuracy-table:start -->')) out = fillBlock(out, 'accuracy-table', accuracyTable(cert, lang), lang);
  if (out.includes('<!-- faq-ld:start -->')) out = fillBlock(out, 'faq-ld', faqLd(out, lang), lang);
  return out;
}

/** `{fig:KEY}` in a strings.json text → the token the page fill writes the figure into. */
function figTokens(s) {
  return String(s).replace(/\{fig:([\w.]+)\}/g, '<!--fig:$1-->…<!--/fig-->');
}

module.exports = { certification, accuracyTable, faqLd, fillPage, figTokens, plain, esc };
