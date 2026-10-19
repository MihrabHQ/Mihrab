/**
 * The hero's sky, published for the one view that is NOT inside it: the
 * status bar's ink on Today (`HomeStatusBand`), which has to know where the
 * sky ends to hand the glyphs over to the page.
 *
 * A module store rather than a prop or a context, for the reason
 * `tabBarVisibility` gives: the publisher (the hero) re-renders on the
 * countdown's tick, and the consumer is a view at the root of the screen
 * that must not re-render with it.
 */
import { useEffect, useState } from 'react';

export type HeroSkyBand = {
  /** The gradient's top colour, as `skyFrame` gives it. */
  top: string;
  /** Its bottom colour. */
  bottom: string;
  /** Its middle stop, when it has one (the Sky theme's hero). */
  mid?: string;
  midAt?: number;
  /** The height the gradient is drawn over, in dp — the hero plus its bleed. */
  skyH: number;
};

let band: HeroSkyBand | null = null;
const listeners = new Set<(next: HeroSkyBand | null) => void>();

function same(a: HeroSkyBand | null, b: HeroSkyBand | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // The height is measured, so it wobbles by fractions of a dp between
  // layouts; a whole dp is the smallest change worth waking the band for.
  return a.top === b.top && a.bottom === b.bottom && a.mid === b.mid && Math.abs(a.skyH - b.skyH) < 1;
}

/** The hero says what its sky is. Returns the release, for an effect's cleanup. */
export function setHeroSkyBand(next: HeroSkyBand): () => void {
  if (!same(band, next)) {
    band = next;
    listeners.forEach(fn => fn(next));
  }
  return () => {
    // Only if nobody else has claimed it since: two heroes overlap for a
    // frame when the tab is remounted, and the one leaving must not clear
    // the one arriving.
    if (band === next || same(band, next)) {
      band = null;
      listeners.forEach(fn => fn(null));
    }
  };
}

/** The sky the band should wear, or null when no hero owns the strip. */
export function useHeroSkyBand(): HeroSkyBand | null {
  const [value, setValue] = useState(band);
  useEffect(() => {
    setValue(band);
    const fn = (next: HeroSkyBand | null) => setValue(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}

/** Tests only. */
export function _resetHeroSkyBand(): void {
  band = null;
  listeners.clear();
}

