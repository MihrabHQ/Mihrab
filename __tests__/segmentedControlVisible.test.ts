/**
 * The chosen side of a segmented control can be told from the other.
 *
 * It could not. The selected segment was `accentBg` on a `controlBg`
 * track with its label in the accent — two light tints of one ground and
 * two inks of one weight — and on a phone at night neither side of the
 * Hadith tab's "Learn | Look up" looked chosen. Measured under the Sky
 * theme, the fill stood under 1.2 : 1 from its track at every hour of the
 * day, and at 1.00–1.03 in its default variant.
 *
 * These are the floors the control is held to now, on every palette the
 * app can build from hexes (the dynamic system palette is the platform's
 * own colours and cannot be measured here).
 */
import { buildAppPalette, skyPalette, type AppPalette } from '../src/theme/appPalette';
import { selectedSegmentFill } from '../src/components/ui/SegmentedControl';
import { contrastOf } from '../src/theme/skyMoods';
import { nominalSkyTheme, setSkyVariant } from '../src/theme/skyTheme';
import { DEFAULT_SKY_VARIANT, SKY_VARIANTS } from '../src/theme/skyMoods';

/** The selected fill against the track. A surface step, so it is small — and was 1.00. */
const FILL_FLOOR = 1.1;
/** The selected label against the one beside it: what the eye reads first. */
const LABEL_FLOOR = 1.45;

function palettes(): Array<[string, AppPalette]> {
  const out: Array<[string, AppPalette]> = [];
  for (const variant of SKY_VARIANTS) {
    setSkyVariant(variant);
    for (let h = 0; h < 24; h += 1) {
      for (const m of [0, 30]) {
        out.push([`sky ${variant} ${h}:${m || '00'}`, skyPalette(nominalSkyTheme(new Date(2026, 10, 25, h, m, 0)), false)]);
      }
    }
  }
  setSkyVariant(DEFAULT_SKY_VARIANT);
  for (const accent of ['green', 'teal', 'blue', 'amber', 'rose'] as const) {
    for (const tinted of [false, true]) {
      out.push([`light ${accent}${tinted ? ' tinted' : ''}`, buildAppPalette(false, false, accent, '', tinted)]);
      out.push([`dark ${accent}${tinted ? ' tinted' : ''}`, buildAppPalette(true, false, accent, '', tinted)]);
      out.push([`black ${accent}${tinted ? ' tinted' : ''}`, buildAppPalette(true, true, accent, '', tinted)]);
    }
  }
  return out;
}

describe('the selected segment', () => {
  const all = palettes();

  it('covers the Sky theme through a day and every fixed theme', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it.each(all)('%s: its surface stands off the track', (_name, p) => {
    const fill = String(selectedSegmentFill(p, p.isDark));
    expect(contrastOf(fill, String(p.controlBg))).toBeGreaterThanOrEqual(FILL_FLOOR);
  });

  it.each(all)('%s: its label stands off the others', (_name, p) => {
    expect(contrastOf(String(p.text), String(p.muted))).toBeGreaterThanOrEqual(LABEL_FLOOR);
  });

  it('is not the light accent, which the Sky theme never sets apart from the track', () => {
    const sky = all.filter(([name]) => name.startsWith('sky')).map(([, p]) => contrastOf(String(p.accentBg), String(p.controlBg)));
    expect(Math.max(...sky)).toBeLessThan(1.2);
    expect(Math.min(...sky)).toBeLessThan(1.02);
  });
});
