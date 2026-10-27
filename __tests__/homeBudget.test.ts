/**
 * Today's budget (src/screens/home/homeBudget.ts): the arithmetic that
 * picks the page's size, and the constants it adds up — pinned to the
 * styles they mirror, so a style can't move without the sum moving.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  HELP_CHIP_MAX_FONT_SCALE,
  HERO_COUNTDOWN_SIZE,
  HERO_FOOT_PAD,
  HERO_SCENE_MIN,
  HOME_TIERS,
  homeSegmentHeights,
  pickHomeTier,
  ROW_PAD,
  type HomeBudgetInput,
} from '../src/screens/home/homeBudget';
import { SPACING } from '../src/theme/tokens';
import { HOME_ROW_PADDING_V } from '../src/screens/home/tokens';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const pixel: HomeBudgetInput = {
  viewport: 914 - 62, // the Pixel, above its tab bar
  topInset: 24,
  fontScale: 1,
  rows: 6,
  sublineRows: 0,
  extra: 0,
};

describe('the tiers', () => {
  it('are tried from the largest down', () => {
    expect(HOME_TIERS).toEqual(['roomy', 'comfortable', 'compact']);
  });

  it('get smaller in every segment, and the compact hero keeps its sky', () => {
    for (const k of ['hero', 'dayBar', 'table', 'below', 'total'] as const) {
      const r = homeSegmentHeights('roomy', pixel)[k];
      const c = homeSegmentHeights('comfortable', pixel)[k];
      const p = homeSegmentHeights('compact', pixel)[k];
      expect(r).toBeGreaterThanOrEqual(c);
      expect(c).toBeGreaterThanOrEqual(p);
    }
    expect(homeSegmentHeights('compact', pixel).total).toBeLessThan(homeSegmentHeights('comfortable', pixel).total);
    expect(HERO_SCENE_MIN.compact).toBeGreaterThan(0);
    expect(HERO_COUNTDOWN_SIZE.compact).toBeLessThan(HERO_COUNTDOWN_SIZE.comfortable);
  });
});

describe('the pick', () => {
  it('is comfortable on the Pixel at the default text size, as the page was designed', () => {
    expect(pickHomeTier(pixel)).toBe('comfortable');
  });

  it('is compact on a small phone, and comfortable on a budget one now the month row is gone', () => {
    expect(pickHomeTier({ ...pixel, viewport: 720 - 62 })).toBe('compact');
    expect(pickHomeTier({ ...pixel, viewport: 667 - 62 })).toBe('compact');
    expect(pickHomeTier({ ...pixel, viewport: 800 - 62 })).toBe('comfortable');
  });

  it('stays comfortable on the Pixel at a large text size, until the Mālikī lines are on', () => {
    expect(pickHomeTier({ ...pixel, fontScale: 1.5 })).toBe('comfortable');
    expect(pickHomeTier({ ...pixel, fontScale: 2 })).toBe('comfortable');
    expect(pickHomeTier({ ...pixel, fontScale: 1.5, sublineRows: 5 })).toBe('compact');
    expect(pickHomeTier({ ...pixel, viewport: 800 - 62, fontScale: 1.3 })).toBe('compact');
  });

  it('is roomy only when the sky has its 160 dp to grow into', () => {
    expect(pickHomeTier({ ...pixel, viewport: 914 - 62 })).toBe('comfortable');
    expect(pickHomeTier({ ...pixel, viewport: 1006 - 62 })).toBe('roomy');
  });

  it('counts the extra rows and the Mālikī lines, and folds the lines in compact', () => {
    const malik = { ...pixel, sublineRows: 5 };
    expect(homeSegmentHeights('comfortable', malik).table).toBeGreaterThan(homeSegmentHeights('comfortable', pixel).table);
    // Compact keeps one line, so five cost what one costs.
    expect(homeSegmentHeights('compact', malik).table - homeSegmentHeights('compact', pixel).table).toBe(
      homeSegmentHeights('compact', { ...pixel, sublineRows: 1 }).table - homeSegmentHeights('compact', pixel).table,
    );
    expect(pickHomeTier({ ...pixel, rows: 8 })).toBe('comfortable');
    expect(pickHomeTier({ ...pixel, rows: 8, sublineRows: 5 })).toBe('compact');
  });

  it('caps the text size the way the texts do', () => {
    // Past 1.3 the tabular texts stop growing, so 1.5 and 2.0 sum the same.
    expect(homeSegmentHeights('compact', { ...pixel, fontScale: 1.5 }).hero).toBe(
      homeSegmentHeights('compact', { ...pixel, fontScale: 2 }).hero,
    );
  });
});

describe('the constants are the styles’', () => {
  const card = read('src/screens/home/TodayCard.tsx');
  const row = read('src/screens/home/PrayerRow.tsx');

  it('the rows’ padding', () => {
    expect(ROW_PAD.comfortable).toBe(HOME_ROW_PADDING_V);
    expect(ROW_PAD.compact).toBe(SPACING.sm);
    expect(row).toMatch(/paddingVertical: ROW_PAD\.comfortable,/);
    expect(row).toMatch(/rowCompact: \{ paddingVertical: ROW_PAD\.compact \}/);
    expect(row).toMatch(/rowRoomy: \{ paddingVertical: ROW_PAD\.roomy \}/);
  });

  it('the hero’s scene, figures and foot', () => {
    expect(card).toMatch(/minHeight: HERO_SCENE_MIN\[tier\]/);
    // The tier's size, unless Minimal has the page (settings.minimalUi).
    expect(card).toMatch(/minimal \? MINIMAL_COUNTDOWN_SIZE : HERO_COUNTDOWN_SIZE\[tier\]/);
    expect(card).toMatch(/minimal \? MINIMAL_SECONDS_SIZE : HERO_SECONDS_SIZE\[tier\]/);
    expect(card).toMatch(/\{ fontSize: countdownSize \}/);
    expect(card).toMatch(/\{ fontSize: secondsSize \}/);
    expect(card).toMatch(/paddingBottom: HERO_FOOT_PAD\[fullBleed \? tier : 'comfortable'\]/);
    expect(HERO_FOOT_PAD.comfortable).toBe(SPACING.lg);
    // The styles carry no size of their own any more.
    expect(card).not.toMatch(/heroCountdown: \{[^}]*fontSize/);
  });

  it('the Help heart stands down at a large text size', () => {
    expect(HELP_CHIP_MAX_FONT_SCALE).toBe(1.3);
    expect(card).toMatch(/currentFontScale\(\) < HELP_CHIP_MAX_FONT_SCALE/);
  });
});
