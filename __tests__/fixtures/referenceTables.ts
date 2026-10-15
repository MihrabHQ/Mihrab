/**
 * The authorities' published tables, for the suites that hold a method to
 * them. Sweden's, Morocco's, Algeria's and Indonesia's are not in this repo
 * (`data/prayer-times/` holds the app's own calculation for earlier versions) — the app
 * computes those — but in the reference tables the methods are certified
 * against, in the folder MIHRAB_TABLES names (<authority>/v1/cities). Without
 * it those suites skip; mihrab-methods runs the same comparison.
 */
import fs from 'fs';
import path from 'path';

export const REFERENCE_TABLES =
  process.env.MIHRAB_TABLES ?? path.join(__dirname, '..', '..', '.tables');

/** The folder of an authority's per-place tables, or null where they are not checked out. */
export function referenceCities(authority: 'sweden' | 'morocco' | 'algeria' | 'indonesia'): string | null {
  const dir = path.join(REFERENCE_TABLES, authority, 'v1', 'cities');
  return fs.existsSync(dir) ? dir : null;
}

/** `describe`, or `describe.skip` where the authority's tables are not checked out. */
export const withReferenceTables = (authority: 'sweden' | 'morocco' | 'algeria' | 'indonesia') =>
  referenceCities(authority) ? describe : describe.skip;
