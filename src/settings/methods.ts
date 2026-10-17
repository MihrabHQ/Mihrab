import i18n from '../i18n';
import { CALCULATION_METHODS } from './methodList';

export {
  CALCULATION_METHODS,
  type CalculationMethodOption,
} from './methodList';

/**
 * Resolve the localized name of a calculation method. Reads through
 * i18next so the label tracks the active app language; falls back to
 * the English name if no translation is registered.
 *
 * `translate` exists for the one surface whose language is not the app's:
 * the shared month sheet is exported in a language its sender picks, and
 * a method named in the sender's language on a sheet written in another
 * is the kind of half-translation that reads as a bug.
 */
export function getMethodLabel(
  id: number | 'auto',
  translate: (key: string, opts: { defaultValue: string }) => string = (
    key,
    opts,
  ) => i18n.t(key, opts),
): string {
  const found = CALCULATION_METHODS.find(m => m.id === id);
  if (!found) return `Method ${id}`;
  return translate(found.nameKey, { defaultValue: found.name });
}
