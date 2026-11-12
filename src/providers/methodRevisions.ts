/**
 * Each method's revision: raised whenever a change to a method, or to the
 * points it computes its places at, changes what it prints. A correction
 * list is written for one revision (certification.json names it), and an
 * app applies a list only to the revision it computes — a list for another
 * would move the wrong minutes. An app on an older revision tells its user
 * to update instead.
 */
export const METHOD_REVISION = {
  sweden: 1,
  diyanet: 2,
  morocco: 3,
  algeria: 1,
  indonesia: 2,
  tatarstan: 1,
  cdum: 1,
  albania: 1,
  bulgaria: 1,
  egypt: 1,
  kuwait: 1,
  qatar: 1,
  jordan: 1,
  kazakhstan: 1,
  brunei: 1,
} as const;
