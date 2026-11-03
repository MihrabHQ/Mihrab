/**
 * Türkiye — Diyanet: the id AlAdhan gives its method; the app computes it
 * as Diyanet does, on the phone (`diyanetMethod.ts`). A leaf, as
 * `swedenMethodId.ts` is: the calculator compares every method id against
 * it, and reading it from `diyanetMethod.ts` loaded that module — and the
 * eight thousand places it carries — at the first times of every launch,
 * 7 ms on a Pixel 10 Pro for a reader its places never serve.
 */
export const DIYANET_METHOD_ID = 13;
