/**
 * The height budgets the Android cards size themselves against.
 *
 * These exist because of a bug that survived three rounds of "fix the
 * clipping": the prayer-times strip and the Log Today card both drew their
 * full-height variant into a card too short to hold it, and the last row —
 * the next-prayer line on one, the countdown footer on the other — came out
 * as a few points of clipped text.
 *
 * The cause was not the layouts. `widget_card_inset` gave every widget a 6dp
 * gutter on all four sides in August, a week after the height constants were
 * measured; the constants describe the CARD and the launcher reports the HOST
 * VIEW, so from that commit on every budget was 12dp too generous. That is
 * invisible until a launcher row happens to land in the gap it opens — one
 * row on a 480dpi phone is ~147dp, which is exactly there — and then it is a
 * clipped line that no amount of staring at the XML explains.
 *
 * Two invariants, then, and they are what this file pins:
 *
 *  1. Every budget is host-view relative, so it carries the inset twice over
 *     on top of the card content measured from a real `dumpsys` hierarchy.
 *  2. The budget that CHOOSES a variant is the budget the slack is measured
 *     against. The old code picked the layout on one number (145) and filled
 *     it from another (132), and the difference went into padding that
 *     pushed the footer off the bottom.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const JAVA = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const src = (name: string) => readFileSync(path.join(JAVA, `${name}.kt`), 'utf8');
// The budgets moved into the Glance widgets when the RemoteViews providers went.
const strip = src('glance/PrayerGlanceWidget');
const log = src('glance/LogGlanceWidget');

const constOf = (file: string, name: string) => {
  const m = new RegExp(`val ${name} = (\\d+)`).exec(file);
  if (!m) throw new Error(`${name} is gone — the budgets moved, so this test has to move too`);
  return Number(m[1]);
};

/** The gutter between the host view and the card, from the resource itself. */
const INSET = Number(
  /name="widget_card_inset">\s*(\d+)dp/.exec(
    readFileSync(path.join(RES, 'values', 'dimens.xml'), 'utf8'),
  )?.[1],
);

/**
 * What each variant's content measures INSIDE the card, in dp, read off a
 * `dumpsys activity com.android.launcher3` view hierarchy on a 480dpi phone
 * (font scale 1.0) with both cards placed at one and at two launcher rows.
 *
 * Re-measure rather than adjust these: they are observations, not knobs.
 */
const MEASURED_CARD_DP = {
  STRIP_ROOMY_CONTENT_DP: 136, // 28 padding + header 19 + columns 40 + rule 10 + next 19 + night margin 4
  STRIP_TIGHT_CONTENT_DP: 110, // the same without the rule and on 6dp ends
  STRIP_BARE_CONTENT_DP: 83, //  and without the date line
  LOG_ROOMY_CONTENT_DP: 143, //  20 padding + date 15 + chips 75 + rule 13 + footer 16
  LOG_TIGHT_CONTENT_DP: 120, //  no rule, 6dp padding, 30dp chips
  LOG_BARE_CONTENT_DP: 99, //    and no date line
};

describe('every card budget leaves room for the card inset', () => {
  it.each(Object.entries(MEASURED_CARD_DP))('%s', (name, cardDp) => {
    const file = name.startsWith('STRIP') ? strip : log;
    // The launcher measures the host view; the layout gets the card. A
    // budget that forgets the difference is the whole bug.
    expect(constOf(file, name)).toBeGreaterThanOrEqual(cardDp + 2 * INSET);
  });
});

describe('the budgets stay in order', () => {
  it('the strip spends more on each thing it puts back', () => {
    expect(constOf(strip, 'STRIP_ROOMY_CONTENT_DP')).toBeGreaterThan(
      constOf(strip, 'STRIP_TIGHT_CONTENT_DP'),
    );
    expect(constOf(strip, 'STRIP_TIGHT_CONTENT_DP')).toBeGreaterThan(
      constOf(strip, 'STRIP_BARE_CONTENT_DP'),
    );
  });

  it('and so does the log card', () => {
    expect(constOf(log, 'LOG_ROOMY_CONTENT_DP')).toBeGreaterThan(
      constOf(log, 'LOG_TIGHT_CONTENT_DP'),
    );
    expect(constOf(log, 'LOG_TIGHT_CONTENT_DP')).toBeGreaterThan(
      constOf(log, 'LOG_BARE_CONTENT_DP'),
    );
  });
});

describe('a variant is filled against the budget that chose it', () => {
  it('the strip picks its variant on the budgets and nothing else', () => {
    expect(strip).toContain('val oneRow = h in 1 until STRIP_TIGHT_CONTENT_DP');
    expect(strip).toContain('val tight = h in 1 until STRIP_ROOMY_CONTENT_DP');
  });

  it('the log card picks its three the same way', () => {
    expect(log).toContain('val tight = h in 1 until LOG_ROOMY_CONTENT_DP');
    expect(log).toContain('val bare = h in 1 until LOG_TIGHT_CONTENT_DP');
  });

  it.each([
    ['the strip', strip, 'STRIP'],
    ['the log card', log, 'LOG'],
  ])('%s measures its slack against that same budget', (_label, file, prefix) => {
    // `budget` is assigned from the same three constants the flags above
    // read, and the slack subtracts `budget` — never a fourth number.
    const assign = new RegExp(
      `val budget =[\\s\\S]{0,200}?${prefix}_ROOMY_CONTENT_DP`,
    );
    expect(file).toMatch(assign);
    expect(file).toContain('((h - budget) / 2)');
    // No bare numeral may creep back into the slack arithmetic.
    expect(file).not.toMatch(/\(h - \d+\) \/ 2/);
  });
});

/**
 * The graph's two numbers describe the SAME card, or the graph is wrong.
 *
 * `*_CHROME_DP` is what everything else on the 4×2 card costs, and the box
 * the strip is drawn for is the card's height less that. Quote the chrome
 * too low and the strip asks for a box taller than it has, which Fit
 * answers by shrinking the whole strip short of the card's edges — the
 * Log card's bug on a Pixel 10 Pro. Quote it too high and a few dp of
 * card go spare, which nobody sees. So the figures are MEASURED, a little
 * over the measure, and the Log card's tight variant — 8dp less padding,
 * 8dp less chip, no 15dp rule — has its own.
 */
describe('the graph is drawn for the room the card leaves it', () => {
  it('the log card chooses its chrome by its padding, and gates on the box', () => {
    expect(log).toContain('val chrome = if (tight) LOG_CHROME_TIGHT_DP else LOG_CHROME_ROOMY_DP');
    expect(log).toContain('val graphBox = h - chrome');
    expect(log).toContain('val graphHeight = tall && graphBox >= GRID_MIN_BOX_DP');
    // Roomy pays 8dp of padding, 8dp of chip and a 15dp rule the tight
    // card does without.
    expect(constOf(log, 'LOG_CHROME_ROOMY_DP') - constOf(log, 'LOG_CHROME_TIGHT_DP')).toBe(31);
    // Six rows of the smallest cell and the gaps between them, closed up.
    expect(constOf(log, 'GRID_MIN_BOX_DP')).toBeGreaterThanOrEqual(36);
  });

  it('drops the log card’s date line when the graph takes its place', () => {
    // Both facts on that line are said again once the graph is drawn.
    expect(log).toMatch(/if \(!bare && !graphHeight\) \{\s*\n\s*Row\([^\n]*\n\s*Label\(m\.title/);
  });
});

/**
 * The box the graph is TOLD it has is the box the card HANDS it.
 *
 * The strip's graph is the one weighted child of its column, so it gets
 * whatever the rest of the card leaves — and the bitmap has to be drawn
 * for exactly that, from the card's inner width and a subtraction of
 * named, measured constants. A weighted sibling added to either column
 * would break the arithmetic silently; the only symptom would be a graph
 * that had shrunk.
 */
describe('the graph is sized for the space it is actually given', () => {
  it('the strip gives the whole remainder to the graph alone', () => {
    const at = strip.indexOf('practice?.let { pr ->\n        Rule(');
    expect(at).toBeGreaterThan(-1);
    const block = strip.slice(at, at + 700);
    expect(block.match(/defaultWeight\(\)/g)).toHaveLength(1);
    expect(block).toMatch(/PracticeImage\([\s\S]*?fillMaxWidth\(\)\.defaultWeight\(\)/);
  });

  it('the log card gives the whole remainder to the graph alone', () => {
    const at = log.indexOf('val grid = PracticeGridBitmap.layoutFor(');
    expect(at).toBeGreaterThan(-1);
    const block = log.slice(at, at + 900);
    expect(block.match(/defaultWeight\(\)/g)).toHaveLength(1);
    expect(block).toContain('GlanceModifier.fillMaxWidth().defaultWeight()');
  });

  it('both subtract what the card costs instead of taking a fraction', () => {
    expect(strip).toContain(
      'val box = size.heightDp - STRIP_TALL_CHROME_DP - (if (showFoot) STRIP_FOOT_DP else 0)',
    );
    expect(strip).toContain('size.widthDp - insetDp(context, size), box,');
    expect(log).toContain('val boxW = size.widthDp - 2 * (CARD_INSET_DP + paddingFor(size))');
    expect(log).toContain('PracticeGridBitmap.layoutFor(boxW, graphBox, density, MAX_GRID_DAYS)');
    // (The list card's graph — beside the streak number, in a wrap_content
    // row — keeps its share: `((h - STRIP_CHROME_DP) * 2) / 3`.)
  });

  /**
   * Both numbers are measurements of the same two cards, taken the same way,
   * so they cannot drift far apart.
   */
  it('the two chromes stay within a band of each other', () => {
    const stripChrome = constOf(strip, 'STRIP_TALL_CHROME_DP');
    const logChrome = constOf(log, 'LOG_CHROME_ROOMY_DP');
    expect(Math.abs(stripChrome - logChrome)).toBeLessThan(20);
    // And both are big enough to be a real 4×2's chrome rather than a
    // guess left over from a smaller layout.
    expect(stripChrome).toBeGreaterThan(150);
    expect(logChrome).toBeGreaterThan(150);
  });
});
