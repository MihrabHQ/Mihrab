/**
 * The on-disk shape a prayer-times dataset day takes, shared by every
 * country that has one.
 *
 * Nothing here is any one country's — it is the column order the builders
 * write and the app reads, and every country's dataset is byte-compatible
 * because of it.
 */
import type { TimingsMap } from '../types/prayer';

/** Fixed on-disk column order for dataset day tuples. */
export const DATASET_TIME_KEYS = [
  'Imsak',
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

/** A single day in a prepared dataset: 7 `HH:MM` strings in DATASET_TIME_KEYS order. */
export type DatasetDayTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** Build a TimingsMap from a dataset day tuple (DATASET_TIME_KEYS order). */
export function tupleToTimings(t: DatasetDayTuple): TimingsMap {
  return {
    Imsak: t[0],
    Fajr: t[1],
    Sunrise: t[2],
    Dhuhr: t[3],
    Asr: t[4],
    Maghrib: t[5],
    Isha: t[6],
  };
}
