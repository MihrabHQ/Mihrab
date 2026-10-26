/**
 * Today's budget: which size the page is drawn at, decided before layout.
 *
 * The page is six segments in one column, and the column is the viewport
 * (docs/home-layout-plan.md). Every segment has three sizes — roomy,
 * comfortable, compact — and the page picks ONE tier for all of them by
 * arithmetic from what it already knows: the viewport, the status bar,
 * the text size, the number of rows, what is under the table. Not by
 * laying out and measuring: a page that tries a size, sees it does not
 * fit and tries a smaller one draws the wrong page for a frame, every
 * time it opens.
 *
 * The numbers here are the styles' numbers (`homeBudget.test.ts` pins
 * each to the style it mirrors), at a text size of 1.0; the text parts
 * scale with the size the texts themselves cap at. They do not have to be
 * exact to the point — a tier is picked when its sum fits with the slack
 * below — but they have to move when the styles move, which the test is
 * for.
 */
import { PixelRatio } from 'react-native';
import { SPACING } from '../../theme/tokens';
import { TABULAR_MAX_FONT_SCALE, TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';
import { TYPE } from '../../theme/typography';
import { HOME_ROW_PADDING_V } from './tokens';

export type HomeTier = 'roomy' | 'comfortable' | 'compact';

/** The tiers from the largest down: the first that fits is the page's. */
export const HOME_TIERS: readonly HomeTier[] = ['roomy', 'comfortable', 'compact'];

export type HomeBudgetInput = {
  /** The height the page has: the screen's root view, above the tab bar. */
  viewport: number;
  /** The status bar, which the hero clears on a full-bleed page. */
  topInset: number;
  /** The system's text size (`PixelRatio.getFontScale()`), 1.0 = default. */
  fontScale: number;
  /** Rows on today's table — six with Sunrise; more with the extra times. */
  rows: number;
  /** Rows carrying a second line (the Mālikī boundary). */
  sublineRows: number;
  /** Whatever else is on the page at its own height: a banner, Ramadan. */
  extra: number;
};

/* ── The hero ─────────────────────────────────────────────────────────── */

/** The room the sun and the moon move in, at the least (HeroToday.heroScene).
 *  Compact stays over HeroSky's SKY_CRAMPED_BELOW, so the sun and the moon
 *  are drawn on every tier; a hero without its sky is not the hero. */
export const HERO_SCENE_MIN: Record<HomeTier, number> = { roomy: 64, comfortable: 64, compact: 44 };
/** The countdown's figures (HeroToday.heroCountdown). */
export const HERO_COUNTDOWN_SIZE: Record<HomeTier, number> = { roomy: 60, comfortable: 60, compact: 52 };
/** The hero's seconds (HeroToday.heroSeconds). */
export const HERO_SECONDS_SIZE: Record<HomeTier, number> = { roomy: 24, comfortable: 24, compact: 22 };
/** Under the rail's labels, before the day bar (TodayCard.heroWrap). */
export const HERO_FOOT_PAD: Record<HomeTier, number> = { roomy: SPACING.lg, comfortable: SPACING.lg, compact: SPACING.md };
/** At and past this text size the Help Mihrab heart is not on the hero. */
export const HELP_CHIP_MAX_FONT_SCALE = 1.3;
/** Past this the sky stops taking the slack first (docs §4.5). */
export const HERO_SCENE_CEILING = 160;

/* ── The table ────────────────────────────────────────────────────────── */

/** A row's vertical padding (PrayerRow.row / rowRoomy / rowCompact). */
export const ROW_PAD: Record<HomeTier, number> = {
  roomy: HOME_ROW_PADDING_V + 2,
  comfortable: HOME_ROW_PADDING_V,
  compact: SPACING.sm,
};
/** A row's name line (TYPE.title3). */
const ROW_LINE = TYPE.title3.lineHeight;
/** The Mālikī line under a name (PrayerRow.daruri: caption + 2). */
const ROW_SUBLINE = TYPE.caption.lineHeight + 2;

/* ── The day bar ──────────────────────────────────────────────────────── */

/** Two lines: weekday + date, and the Hijri date (TodayCard.dayBar / dayHijri). */
const DAY_BAR_TEXT: Record<HomeTier, number> = {
  roomy: TYPE.callout.lineHeight + TYPE.caption.lineHeight + 2,
  comfortable: TYPE.callout.lineHeight + TYPE.caption.lineHeight + 2,
  compact: TYPE.callout.lineHeight + TYPE.caption.lineHeight,
};
/** Its air (TodayCard.dayBar / dayBarCompact). */
const DAY_BAR_PAD: Record<HomeTier, number> = {
  roomy: SPACING.md + SPACING.sm,
  comfortable: SPACING.md + SPACING.sm,
  compact: SPACING.sm + SPACING.xs,
};

/* ── Under the table ──────────────────────────────────────────────────── */

/** The Quran door (ResumeDoors.door / doorDense): two lines, or the dense one. */
const QURAN_TEXT: Record<HomeTier, number> = {
  roomy: TYPE.callout.lineHeight + TYPE.caption.lineHeight + 1,
  comfortable: TYPE.callout.lineHeight + TYPE.caption.lineHeight + 1,
  compact: TYPE.footnote.lineHeight,
};
const QURAN_PAD: Record<HomeTier, number> = { roomy: SPACING.md, comfortable: SPACING.md, compact: SPACING.sm + 2 };
/** Between the table and the door, and under the door. */
const BELOW_GAP: Record<HomeTier, number> = { roomy: SPACING.md, comfortable: SPACING.md, compact: SPACING.sm };

/* ── The sum ──────────────────────────────────────────────────────────── */

/** The hero's parts that are text, which scale, and those that are not. */
const HERO_FIXED =
  SPACING.md + // top padding under the status bar (TodayCard.heroTop)
  40 + // the top row: the location chip's height
  SPACING.md + // its margin below
  SPACING.md + // rail: margin above
  2 + // the rail's thread
  SPACING.sm + 2; // the labels' margin
const HERO_TEXT = TYPE.footnote.lineHeight + TYPE.label.lineHeight; // eyebrow, rail labels
/** The figures' line, over its size: ascent and descent the font adds. */
const COUNTDOWN_LINE = 1.25;

export type HomeSegmentHeights = {
  hero: number;
  dayBar: number;
  table: number;
  below: number;
  total: number;
};

const cap = (scale: number, max: number) => Math.min(Math.max(scale, 1), max);

/** Each segment's height at a tier, and their sum with the status bar. */
export function homeSegmentHeights(tier: HomeTier, input: HomeBudgetInput): HomeSegmentHeights {
  const tabular = cap(input.fontScale, TABULAR_MAX_FONT_SCALE);
  const band = cap(input.fontScale, TITLE_BAND_MAX_FONT_SCALE);
  const hero =
    HERO_FIXED +
    HERO_SCENE_MIN[tier] +
    HERO_FOOT_PAD[tier] +
    HERO_TEXT * tabular +
    Math.round(HERO_COUNTDOWN_SIZE[tier] * COUNTDOWN_LINE) * tabular;
  const dayBar = DAY_BAR_PAD[tier] + DAY_BAR_TEXT[tier] * band;
  // Compact keeps the second line on the current row alone.
  const sublines = tier === 'compact' ? Math.min(input.sublineRows, 1) : input.sublineRows;
  const table = input.rows * (ROW_PAD[tier] * 2 + ROW_LINE * tabular) + sublines * ROW_SUBLINE * tabular;
  const below =
    BELOW_GAP[tier] +
    QURAN_PAD[tier] * 2 +
    QURAN_TEXT[tier] * tabular +
    BELOW_GAP[tier] +
    input.extra;
  const total = input.topInset + hero + dayBar + table + below;
  return { hero, dayBar, table, below, total };
}

/**
 * The slack a tier needs under its sum before it is chosen: a few points
 * for rounding and a hairline here and there. Roomy also needs the sky to
 * have something to grow into, or it is comfortable with wider rows and
 * no more sky — docs §4.5 gives the sky the first 160 dp.
 */
const TIER_SLACK: Record<HomeTier, number> = { roomy: HERO_SCENE_CEILING, comfortable: 4, compact: 4 };

/** The largest tier whose page fits the viewport; compact when none does. */
export function pickHomeTier(input: HomeBudgetInput): HomeTier {
  for (const tier of HOME_TIERS) {
    if (homeSegmentHeights(tier, input).total + TIER_SLACK[tier] <= input.viewport) return tier;
  }
  return 'compact';
}

/** The system's text size, for the budget — 1 where nobody can say. */
export function currentFontScale(): number {
  const s = PixelRatio.getFontScale();
  return Number.isFinite(s) && s > 0 ? s : 1;
}
