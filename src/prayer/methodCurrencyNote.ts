import type { TFunction } from 'i18next';
import type { MethodCurrency } from '../providers/methodCurrency';

/** What to tell the reader about a calculation that is not current, or null when it is. */
export function methodCurrencyNote(t: TFunction, c: MethodCurrency, language: string, short = false): string | null {
  const suffix = short ? 'Short' : '';
  switch (c.state) {
    case 'beyond': {
      const [y, m, d] = c.to.split('-').map(Number);
      const date = new Date(y, m - 1, d).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' });
      return t(`methodCurrency.beyond${suffix}`, { date });
    }
    case 'checking':
      return t(`methodCurrency.checking${suffix}`);
    case 'update':
      return t(`methodCurrency.update${suffix}`);
    default:
      return null;
  }
}
