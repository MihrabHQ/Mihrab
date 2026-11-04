/**
 * Intl.PluralRules for the app's thirteen languages, where the engine has none.
 *
 * i18next picks a counted string's form (`_one`, `_two`, `_few`, `_many`)
 * by asking Intl.PluralRules which category a number falls in. Hermes has
 * no Intl.PluralRules, and without it i18next falls back to a stand-in that
 * knows only "one" and "other" — so on a phone Arabic never reached its
 * dual or its plurals ("3 مقطع" for "3 مقاطع") and Russian never reached
 * `_few` or `_many` ("3 отрывков"), in every counted string in the app.
 * The tests run under Node, whose ICU has the real thing, so nothing there
 * could see it.
 *
 * The CLDR cardinal rules for these languages are short, and this is them.
 * `pluralRules.test.ts` checks every one against Node's ICU for 0 to 2000
 * and a few fractions, so a slip here fails a test rather than a sentence.
 * Installed only where the engine has no working Intl.PluralRules.
 */

type Category = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type Rule = { categories: Category[]; select: (n: number) => Category };

/** CLDR operands: i integer digits, v count of visible fraction digits. */
function operands(n: number) {
  const abs = Math.abs(n);
  const s = String(abs);
  const dot = s.indexOf('.');
  return { n: abs, i: Math.floor(abs), v: dot < 0 ? 0 : s.length - dot - 1 };
}

const millionMany = (i: number, v: number) => v === 0 && i !== 0 && i % 1000000 === 0;

export const PLURAL_RULES: Record<string, Rule> = {
  en: { categories: ['one', 'other'], select: x => { const { i, v } = operands(x); return i === 1 && v === 0 ? 'one' : 'other'; } },
  de: { categories: ['one', 'other'], select: x => { const { i, v } = operands(x); return i === 1 && v === 0 ? 'one' : 'other'; } },
  sv: { categories: ['one', 'other'], select: x => { const { i, v } = operands(x); return i === 1 && v === 0 ? 'one' : 'other'; } },
  ur: { categories: ['one', 'other'], select: x => { const { i, v } = operands(x); return i === 1 && v === 0 ? 'one' : 'other'; } },
  tr: { categories: ['one', 'other'], select: x => (operands(x).n === 1 ? 'one' : 'other') },
  hi: { categories: ['one', 'other'], select: x => { const { n, i } = operands(x); return i === 0 || n === 1 ? 'one' : 'other'; } },
  bn: { categories: ['one', 'other'], select: x => { const { n, i } = operands(x); return i === 0 || n === 1 ? 'one' : 'other'; } },
  es: {
    categories: ['one', 'many', 'other'],
    select: x => { const { n, i, v } = operands(x); return n === 1 ? 'one' : millionMany(i, v) ? 'many' : 'other'; },
  },
  fr: {
    categories: ['one', 'many', 'other'],
    select: x => { const { i, v } = operands(x); return i === 0 || i === 1 ? 'one' : millionMany(i, v) ? 'many' : 'other'; },
  },
  id: { categories: ['other'], select: () => 'other' },
  zh: { categories: ['other'], select: () => 'other' },
  ru: {
    categories: ['one', 'few', 'many', 'other'],
    select: x => {
      const { i, v } = operands(x);
      if (v !== 0) return 'other';
      const d = i % 10;
      const h = i % 100;
      if (d === 1 && h !== 11) return 'one';
      if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'few';
      return 'many';
    },
  },
  ar: {
    categories: ['zero', 'one', 'two', 'few', 'many', 'other'],
    select: x => {
      const { n, v } = operands(x);
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      const h = n % 100;
      if (v === 0 && h >= 3 && h <= 10) return 'few';
      if (v === 0 && h >= 11 && h <= 99) return 'many';
      return 'other';
    },
  },
};

function ruleFor(locales?: string | string[]): { locale: string; rule: Rule } {
  const list = locales == null ? [] : Array.isArray(locales) ? locales : [locales];
  for (const l of list) {
    const lang = String(l).slice(0, 2).toLowerCase();
    if (PLURAL_RULES[lang]) return { locale: lang, rule: PLURAL_RULES[lang] };
  }
  return { locale: 'en', rule: PLURAL_RULES.en };
}

/** The stand-in: cardinal only (the app asks for nothing else); an ordinal request answers "other". */
export class AppPluralRules {
  private readonly locale: string;
  private readonly rule: Rule;
  private readonly type: 'cardinal' | 'ordinal';
  constructor(locales?: string | string[], options?: { type?: 'cardinal' | 'ordinal' }) {
    const { locale, rule } = ruleFor(locales);
    this.locale = locale;
    this.rule = rule;
    this.type = options?.type ?? 'cardinal';
  }
  select(n: number): Category {
    return this.type === 'ordinal' ? 'other' : this.rule.select(Number(n));
  }
  resolvedOptions() {
    return {
      locale: this.locale,
      type: this.type,
      pluralCategories: this.type === 'ordinal' ? (['other'] as Category[]) : [...this.rule.categories],
    };
  }
  static supportedLocalesOf(locales?: string | string[]): string[] {
    const list = locales == null ? [] : Array.isArray(locales) ? locales : [locales];
    return list.filter(l => PLURAL_RULES[String(l).slice(0, 2).toLowerCase()]);
  }
}

/** Whether the engine's own Intl.PluralRules works (it does in Node and JSC; Hermes has none). */
export function enginePluralRulesWork(): boolean {
  try {
    const I = (globalThis as { Intl?: { PluralRules?: unknown } }).Intl;
    if (!I || typeof I.PluralRules !== 'function') return false;
    return new (I.PluralRules as typeof Intl.PluralRules)('ar').select(3) === 'few';
  } catch {
    return false;
  }
}

/** Put the stand-in in place, once, if the engine needs it. */
export function installPluralRules(): void {
  if (enginePluralRulesWork()) return;
  const g = globalThis as { Intl?: Record<string, unknown> };
  if (!g.Intl) g.Intl = {};
  g.Intl.PluralRules = AppPluralRules;
}

installPluralRules();
