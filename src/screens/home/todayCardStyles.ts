/**
 * The Today card's styles and the rail's measures — shared by the card
 * (TodayCard.tsx) and its hero (HeroToday.tsx), which were one file.
 */
import { Platform, StyleSheet } from 'react-native';
import { HOME_SCREEN_PADDING, HOME_TABLE_RADIUS } from './tokens';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/** The rail's thread, its head, and the soft ring round the head (dp). */
export const RAIL_LINE = 2;
export const RAIL_HEAD = 9;
export const RAIL_RING = 19;
/** Minimal: the day rail's marks — one a prayer — and the target's, a step larger (dp). */
export const RAIL_TICK = 4;
export const RAIL_TICK_TARGET = 6;


export const styles = StyleSheet.create({
  // Over the twin's sky, which runs on under the column.
  twinColumn: { position: 'absolute', alignItems: 'center', zIndex: 1 },
  card: { overflow: 'hidden' },
  // Full-bleed: no radius — the sky meets the day bar as one plane, not
  // a card foot over the page. Grow to fill the page; never shrink under
  // the content. `flex: 1` would set flexBasis 0 and let a long table
  // (extra times, the Mālikī boundaries) squash the hero to nothing;
  // with basis auto the hero keeps its own height and the page scrolls
  // the little it then has to.
  cardBleed: { overflow: 'hidden', flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  // Roomy: natural height, and the page centres it — see `roomy`.
  cardRoomy: { overflow: 'hidden' },
  heroWrap: { paddingHorizontal: SPACING.xl },
  heroWrapBleed: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    overflow: 'hidden',
  },
  // No side padding: the rows are the page's now, edge to edge, and they
  // carry the hero's own inset (`SPACING.xl`) themselves — see PrayerRow.
  // The 16dp this used to add kept the table inside the ghost of the
  // card it once sat in, a step in from where the hero's text begins.
  // Roomy: a panel with all four corners, inset from the page's edges
  // like the cards on every other tab.
  heroWrapRoomy: {
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: HOME_TABLE_RADIUS,
    overflow: 'hidden',
    marginHorizontal: HOME_SCREEN_PADDING,
  },
  tableBleed: {},
  /**
   * The day bar: a chevron at each edge and the day between them.
   * Same solid ground as the prayer table — sky and page are two surfaces;
   * they meet with a clean cut, not a blend.
   */
  dayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  /** The same two lines with less air round them: the compact page
   *  (homeBudget.ts). One line was tried and cut the Hijri date short on
   *  a narrow phone; the date is why the bar is there. */
  dayBarCompact: { paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
  dayHijriCompact: { marginTop: 0 },
  /** Ink with a hit slop, not a button with a fill. */
  // The day pager scrolls left to right in every language — see `pagerPosition`.
  pager: { direction: 'ltr' },
  // Each page its own height, not stretched to the list's: a day held
  // to today's height is cut at its foot, not squashed, until it is on show.
  pagerContent: { alignItems: 'flex-start' },
  pageLtr: { direction: 'ltr' },
  pageRtl: { direction: 'rtl' },
  dayStep: { padding: SPACING.xs, alignItems: 'center', justifyContent: 'center' },
  /** The glyphs' box, for the empty slot that balances the bar. */
  dayStepGlyph: { width: 20, height: 20 },
  /** At either end of the record there is nowhere to step. */
  dayStepOff: { opacity: 0.25 },
  dayStepPressed: { opacity: 0.55 },
  /** The day itself — the bar's middle, and the way back to today. */
  dayFace: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  dayFaceLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  todayDot: { width: 5, height: 5, borderRadius: 2.5 },
  dayWeekday: { fontSize: TYPE.callout.fontSize, fontWeight: '400' },
  dayDate: { fontWeight: '400' },
  dayHijri: { fontSize: TYPE.caption.fontSize, marginTop: 2 },
  dayBack: { fontWeight: '500' },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  /**
   * The location chip, ON the hero's content edge.
   *
   * The chip is a pressable with its own touch padding, and it fills a
   * flexible slot — so it stretched across the room between the edge and
   * the Qibla chip and centred its pin inside that, leaving a void to the
   * chip's left and putting the city out of line with the countdown and
   * the date beneath it. `flex-start` sizes the slot's child to its
   * content, and the negative start margin cancels the chip's padding so
   * the pin's own edge lands where the hero's text begins; the tap target
   * keeps its full size.
   */
  heroTopLeading: {
    flexShrink: 1,
    flexGrow: 1,
    alignItems: 'flex-start',
    marginStart: -SPACING.sm,
  },
  hero: {},
  heroExpanded: { paddingVertical: SPACING.md },
  heroFill: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  // Minimal: the foreground fills the hero as the hero fills the page,
  // so the spacers inside it share the height as before.
  heroFore: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  /** Grows; the sun and moon cross it — and gives way first when the
   *  table needs the room (the sky then hides its bodies, see HeroSky). */
  // Never below a moon's worth of sky: the table may push the page into
  // a scroll, but it may not take the night out of the hero.
  heroScene: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  // Minimal: the figures stand at the OPTICAL centre, a little above the
  // geometric one — the eye reads a thing dead-centre as sitting low, as
  // every typesetter who has centred a title on a page knows. Nine parts
  // of sky above the block, eleven below.
  heroSceneAbove: { flexGrow: 9 },
  heroSceneBelow: { flexGrow: 11 },
  // Minimal under the Track: the chart takes the room the rail left — three
  // parts of four above the figures, the horizon at the page's middle.
  heroSceneAboveTrack: { flexGrow: 15 },
  heroSceneBelowTrack: { flexGrow: 5 },
  // Sentence case, quiet: the countdown is the thing the eye lands on and
  // the eyebrow only names what it counts to. It was an uppercase,
  // letterspaced overline — the 2016 idiom (docs/design/redesign-plan.md
  // §2.1, the `label` token).
  heroEyebrow: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '400',
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroEyebrowText: { flex: 1 },
  heroCountdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginTop: 2,
  },
  // Shrinks before the time does; one line, never wrapped.
  heroCountdownLine: { flexShrink: 1 },
  // The question the app is opened to answer, at the size that says so —
  // and in the light weight, as a clock on a lock screen is: the figures
  // are large enough to carry a thin stroke, the size does the work and
  // the weight gets out of its way, and the sky shows between the strokes.
  // Bold at this size was a headline; light is a time. Tracked tight, as
  // light figures want to be. Android's default face carries no Light
  // below API 28, so the family is named there.
  // The size is the tier's (HERO_COUNTDOWN_SIZE); this is the face.
  heroCountdown: {
    fontWeight: '300',
    letterSpacing: -1.5,
    ...Platform.select({ android: { fontFamily: 'sans-serif-light' }, default: {} }),
  },
  heroCountdownExpanded: { fontSize: 84, letterSpacing: -2.5 }, // tokens-ok-line: display or Arabic scale, sized by hand
  // Lighter than the figures and a third of their size, in the muted ink:
  // present, readable, and never the thing the eye lands on first.
  heroSeconds: {
    fontWeight: '300',
    letterSpacing: 0,
    ...Platform.select({ android: { fontFamily: 'sans-serif-light' }, default: {} }),
  },
  heroSecondsExpanded: { fontSize: 30 }, // tokens-ok-line: display or Arabic scale, sized by hand
  // The unit letters: plain weight and untracked, the small caps beside
  // the figures (sized from them: UNIT_EM, SECONDS_UNIT_EM).
  heroUnit: {
    fontWeight: '400',
    letterSpacing: 0,
    ...Platform.select({ android: { fontFamily: 'sans-serif' }, default: {} }),
  },
  heroAt: { fontSize: TYPE.title3.fontSize, fontWeight: '400' },
  /**
   * The rail: a hairline of the interval with a lit head where now is.
   *
   * It was a 5 dp bar, a progress bar from a settings page, drawn under
   * the one line of the app that is meant to be quiet. A thread does the
   * same job at a third of the ink, and the head — a dot on the thread
   * with a soft ring of the same ink — is what the eye reads the progress
   * from, the way a slider's thumb is read; the fill behind it is a trace.
   * The ring is a view, not a shadow: a shadow is drawn differently on
   * every platform and clipped by some.
   */
  railWrap: { marginTop: SPACING.md },
  railTrack: { height: RAIL_LINE, borderRadius: RAIL_LINE / 2 },
  railFill: { height: '100%', borderRadius: RAIL_LINE / 2 },
  railHead: {
    position: 'absolute',
    end: -RAIL_HEAD / 2,
    top: (RAIL_LINE - RAIL_HEAD) / 2,
    width: RAIL_HEAD,
    height: RAIL_HEAD,
    borderRadius: RAIL_HEAD / 2,
  },
  // The breath: the head's own size, swelling past the ring and fading.
  railBreath: {
    position: 'absolute',
    end: -RAIL_HEAD / 2,
    top: (RAIL_LINE - RAIL_HEAD) / 2,
    width: RAIL_HEAD,
    height: RAIL_HEAD,
    borderRadius: RAIL_HEAD / 2,
  },
  railRing: {
    position: 'absolute',
    end: -RAIL_RING / 2,
    top: (RAIL_LINE - RAIL_RING) / 2,
    width: RAIL_RING,
    height: RAIL_RING,
    borderRadius: RAIL_RING / 2,
  },
  // Minimal: a prayer's mark on the day rail, placed by its fraction of the day.
  railTick: { position: 'absolute' },
  railLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm + 2,
  },
  railLabel: { fontSize: TYPE.label.fontSize, fontWeight: '400' },
  // Minimal: the figures in the middle of the line, the name and time
  // under them in the muted ink, and the footer a label at the foot —
  // every line centred, nothing at the edges, the way a clock face is.
  heroCountdownRowMinimal: { justifyContent: 'center' },
  // Larger figures want tighter tracking still: light strokes set loose
  // read as separate marks rather than one number.
  heroCountdownLineMinimal: { textAlign: 'center' },
  heroCountdownMinimal: { letterSpacing: -2.2 },
  heroCaption: {
    textAlign: 'center',
    fontSize: TYPE.body.fontSize,
    fontWeight: '400',
    marginTop: SPACING.sm,
    letterSpacing: 0.2,
  },
  heroHandle: { alignItems: 'center', opacity: 0.5 },
  heroFooter: {
    textAlign: 'center',
    fontSize: TYPE.label.fontSize,
    fontWeight: '400',
    marginTop: SPACING.xs,
    letterSpacing: 0.3,
  },
});

