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
  diyanet: 1,
  morocco: 1,
  algeria: 1,
  indonesia: 1,
} as const;
