/**
 * The city alone, out of a place's full name.
 *
 * A saved place is named the way the search returned it — "Rinkeby,
 * Stockholm, Stockholms län, Sweden" — and a reverse-geocoded one can
 * carry a country too. The full page has a chip that truncates; the
 * minimal Today's footer is one line with two other things on it, and
 * wants the one word a person would say. The first comma-separated part
 * is that word (the search puts the place itself first; the rest is
 * where it is). A name with no comma is its own city. Coordinates (the
 * last resort before a name is known) carry a comma too, as a pair, and
 * are kept whole: half a coordinate says nothing.
 */
export function cityOf(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  // "59.33°, 18.07°" — a pair, not a place and its country.
  if (/^-?\d+(\.\d+)?°?,\s*-?\d+(\.\d+)?°?$/.test(trimmed)) return trimmed;
  const first = trimmed.split(/[,،]/)[0]?.trim();
  return first || trimmed;
}
