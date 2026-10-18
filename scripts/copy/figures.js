/*
 * GENERATED from mihrab-methods' scripts/figures.mjs by
 * scripts/copy/sync-certification.js — do not edit here; change it there
 * and sync, so the app quotes figures exactly as the library computes them.
 */
/**
 * Every figure the project quotes, read from certification.json and nowhere
 * else. README tables, the badge, the docs and (copied into the Mihrab app's
 * repository) the website and store listings all take their numbers from
 * here, so a number in prose is never typed by hand: it is a value of the
 * record, or it does not appear.
 *
 * A figure the record does not hold is an error, not a blank: the fix is to
 * add it to `npm run certify` (tools/certify.ts), not to type it in.
 */

const AUTHORITY_ORDER = ['sweden', 'diyanet', 'morocco', 'algeria', 'indonesia'];

/** Who prints the tables each method matches, in words — names, not figures. */
const AUTHORITY_NAMES = {
  sweden: { short: 'Sweden', authority: 'Islamiska Förbundet (Diyanet’s method)' },
  diyanet: { short: 'Diyanet', authority: 'Diyanet İşleri Başkanlığı, Türkiye and worldwide' },
  morocco: { short: 'Morocco', authority: 'Ministry of Habous and Islamic Affairs' },
  algeria: { short: 'Algeria', authority: 'Ministry of Religious Affairs and Wakfs' },
  indonesia: { short: 'Indonesia', authority: 'Kemenag (Ministry of Religious Affairs)' },
};

class MissingFigure extends Error {
  constructor(what) {
    super(`certification.json has no ${what}. Add it to the certify step (tools/certify.ts) rather than typing it.`);
    this.name = 'MissingFigure';
  }
}

const need = (v, what) => {
  if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) throw new MissingFigure(what);
  return v;
};

/** The figures of one authority, from its record. */
function authorityFigures(id, rec) {
  need(rec, `an entry for ${id}`);
  const checks = need(rec.checks, `${id}.checks`);
  if (!checks.length) throw new MissingFigure(`${id}.checks[0]`);
  const times = checks.reduce((n, c) => n + need(c.times, `${id}.checks[].times`), 0);
  const off = checks.reduce((n, c) => n + need(c.off, `${id}.checks[].off`), 0);
  const offAlone = checks.reduce((n, c) => n + need(c.offWithoutCorrections, `${id}.checks[].offWithoutCorrections`), 0);
  const froms = checks.map(c => need(c.from, `${id}.checks[].from`)).sort();
  const tos = checks.map(c => need(c.to, `${id}.checks[].to`)).sort();
  const certified = !!rec.certified && checks.every(c => c.times > 0 && c.off === 0);
  return {
    id,
    certified,
    checkedAt: need(rec.checkedAt, `${id}.checkedAt`),
    revision: need(rec.revision, `${id}.revision`),
    places: need(rec.places, `${id}.places`),
    times,
    off,
    offAlone,
    from: froms[0],
    to: tos[tos.length - 1],
    corrections: need(rec.corrections?.entries, `${id}.corrections.entries`),
    correctionsFrom: need(rec.corrections?.from, `${id}.corrections.from`),
    correctionsTo: need(rec.corrections?.to, `${id}.corrections.to`),
    checks: checks.map(c => ({
      tables: need(c.tables, `${id}.checks[].tables`),
      places: need(c.places, `${id}.checks[].places`),
      times: c.times,
      off: c.off,
      offAlone: c.offWithoutCorrections,
      from: c.from,
      to: c.to,
      setAside: c.setAside ?? null,
    })),
  };
}

/** Every authority's figures and the totals over them. */
function figures(cert) {
  const by = {};
  for (const id of AUTHORITY_ORDER) by[id] = authorityFigures(id, cert[id]);
  const all = AUTHORITY_ORDER.map(id => by[id]);
  const certified = all.filter(a => a.certified);
  return {
    by,
    total: {
      authorities: all.length,
      certified: certified.length,
      times: all.reduce((n, a) => n + a.times, 0),
      off: all.reduce((n, a) => n + a.off, 0),
      offAlone: all.reduce((n, a) => n + a.offAlone, 0),
      // the oldest check: "last checked" never claims more than every method has had
      checkedAt: all.map(a => a.checkedAt).sort()[0],
    },
  };
}

// ── formatting ──────────────────────────────────────────────────────────

const LOCALES = { en: 'en-GB', sv: 'sv-SE', tr: 'tr-TR', id: 'id-ID', ar: 'ar', fr: 'fr-FR' };
const loc = lang => LOCALES[lang] ?? lang;

/** 1 393 794 / 1,393,794 as the language writes it (Latin digits everywhere: the tables print them). */
function int(n, lang = 'en') {
  return new Intl.NumberFormat(loc(lang), { numberingSystem: 'latn', useGrouping: true }).format(n);
}

/** 72.4 million, as the language says it, rounded DOWN so the claim is never more than the record. */
function compact(n, lang = 'en') {
  const m = Math.floor(n / 100_000) / 10;
  if (n < 1_000_000) return int(n, lang);
  const num = new Intl.NumberFormat(loc(lang), { numberingSystem: 'latn', maximumFractionDigits: 1 }).format(m);
  const word = { en: 'million', sv: 'miljoner', tr: 'milyon', id: 'juta', ar: 'مليون', fr: 'millions' }[lang] ?? 'million';
  return `${num} ${word}`;
}

/** A percentage to `digits` places, rounded DOWN (99.9996 → 99.999, never 100). */
function pct(part, whole, digits = 3, lang = 'en') {
  const f = 10 ** digits;
  const v = Math.floor((part / whole) * 100 * f) / f;
  return new Intl.NumberFormat(loc(lang), { numberingSystem: 'latn', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** 'Nov 2027' / 'nov. 2027' — the month a span ends in. */
function monthYear(iso, lang = 'en') {
  const [y, m] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(loc(lang), { month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(Date.UTC(y, m - 1, 15)));
}

/** '16 October 2026' */
function longDate(iso, lang = 'en') {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(loc(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** '27 Aug 2026 → 11 Nov 2026' */
function span(from, to, lang = 'en') {
  const f = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(loc(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  return `${f(from)} → ${f(to)}`;
}

/**
 * The named values a document can quote inline, as `<!--fig:KEY-->…<!--/fig-->`.
 * One flat list so a reviewer can see every number the prose may use.
 */
function namedFigures(cert, lang = 'en') {
  const { by, total } = figures(cert);
  const out = {
    'total.times': int(total.times, lang),
    'total.timesCompact': compact(total.times, lang),
    'total.off': int(total.off, lang),
    'total.methods': int(total.authorities, lang),
    'total.certified': int(total.certified, lang),
    'total.checkedAt': total.checkedAt,
    'total.checkedAtLong': longDate(total.checkedAt, lang),
  };
  for (const a of Object.values(by)) {
    const p = a.id;
    Object.assign(out, {
      [`${p}.places`]: int(a.places, lang),
      [`${p}.times`]: int(a.times, lang),
      [`${p}.timesCompact`]: compact(a.times, lang),
      [`${p}.off`]: int(a.off, lang),
      [`${p}.offAlone`]: int(a.offAlone, lang),
      [`${p}.alonePct`]: pct(a.times - a.offAlone, a.times, 3, lang),
      [`${p}.corrections`]: int(a.corrections, lang),
      [`${p}.correctionsPct`]: pct(a.corrections, a.times, 3, lang),
      [`${p}.from`]: a.from,
      [`${p}.to`]: a.to,
      [`${p}.toMonthYear`]: monthYear(a.to, lang),
      [`${p}.span`]: span(a.from, a.to, lang),
      [`${p}.years`]: a.from.slice(0, 4) === a.to.slice(0, 4) ? a.from.slice(0, 4) : `${a.from.slice(0, 4)}–${a.to.slice(0, 4)}`,
      [`${p}.toLong`]: longDate(a.to, lang),
      [`${p}.checkedAt`]: a.checkedAt,
      [`${p}.revision`]: String(a.revision),
    });
    a.checks.forEach((c, i) => {
      Object.assign(out, {
        [`${p}.check${i}.places`]: int(c.places, lang),
        [`${p}.check${i}.times`]: int(c.times, lang),
        [`${p}.check${i}.off`]: int(c.off, lang),
        [`${p}.check${i}.alonePct`]: pct(c.times - c.offAlone, c.times, 3, lang),
        [`${p}.check${i}.span`]: span(c.from, c.to, lang),
        [`${p}.check${i}.years`]: c.from.slice(0, 4) === c.to.slice(0, 4) ? c.from.slice(0, 4) : `${c.from.slice(0, 4)}–${c.to.slice(0, 4)}`,
      });
      if (c.setAside) {
        Object.assign(out, {
          [`${p}.check${i}.sourceFaults`]: int(c.setAside.sourceFaults, lang),
          [`${p}.check${i}.copiedRows`]: int(c.setAside.copiedRows, lang),
          [`${p}.check${i}.misplaced`]: int(c.setAside.misplaced.length, lang),
        });
      }
    });
  }
  return out;
}

/**
 * Replace every `<!--fig:KEY-->…<!--/fig-->` in a text with the figure.
 * An unknown key fails: a document cannot quote a number the record lacks.
 */
function fillFigures(text, named, where = 'text') {
  return text.replace(/<!--fig:([\w.]+)-->([\s\S]*?)<!--\/fig-->/g, (_, key) => {
    if (!(key in named)) throw new MissingFigure(`figure "${key}" (asked for in ${where})`);
    return `<!--fig:${key}-->${named[key]}<!--/fig-->`;
  });
}

/** Replace the block between `<!-- NAME:start -->` and `<!-- NAME:end -->`. */
function fillBlock(text, name, body, where = 'text') {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(text)) throw new Error(`${where} has no <!-- ${name}:start --> … <!-- ${name}:end --> block.`);
  return text.replace(re, (_, a, b) => `${a}\n${body}\n${b}`);
}

/** A flat badge drawn from the record, so no README needs a badge service. */
function badgeSvg(cert) {
  const { total } = figures(cert);
  const left = 'certified';
  const right = `${total.certified}/${total.authorities} methods · ${int(total.off)} of ${compact(total.times)} off`;
  const w = s => Math.round(s.length * 6.4 + 12);
  const lw = w(left), rw = w(right);
  const colour = total.certified === total.authorities && total.off === 0 ? '#2e7d4f' : '#b0601a';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left}: ${right}">
<title>${left}: ${right}</title>
<rect width="${lw}" height="20" rx="3" fill="#555"/><rect x="${lw}" width="${rw}" height="20" rx="3" fill="${colour}"/><rect x="${lw}" width="4" height="20" fill="${colour}"/>
<g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${left}</text><text x="${lw + rw / 2}" y="14">${right}</text>
</g>
</svg>
`;
}

module.exports = { AUTHORITY_ORDER, AUTHORITY_NAMES, authorityFigures, figures, int, compact, pct, monthYear, longDate, span, namedFigures, fillFigures, fillBlock, badgeSvg };
