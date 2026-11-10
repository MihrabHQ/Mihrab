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
 * THE GRAPH'S ROOM IS SUMMED, NOT KEPT.
 *
 * The box the graph is drawn for is the card's height less everything else
 * on it. That used to be a constant per layout, read off one phone's view
 * tree (161, 108, 125dp…) — right there, wrong wherever a line came out
 * another height: a larger font size, Arabic names, the night marks on. Now
 * each card sums its own chrome from the rows as it lays them out
 * (`rowDp`: a TextView's own line height), and these hold that it stays so.
 */
describe('the graph is drawn for the room the card leaves it', () => {
  const support = readFileSync(path.join(JAVA, 'glance', 'GlanceSupport.kt'), 'utf8');

  it('no card keeps a measured chrome', () => {
    for (const file of [strip, log]) {
      expect(file).not.toMatch(/const val \w*(TALL|COMPACT|ROOMY|TIGHT)_CHROME_DP/);
    }
    expect(support).toContain('internal fun rowDp(');
    expect(support).toContain('internal fun cardInsetsDp(');
  });

  it('the strip sums its chrome and subtracts it', () => {
    expect(strip).toContain('private fun stripChromeDp(');
    // Every part of the layout over the graph is in the sum.
    const at = strip.indexOf('private fun stripChromeDp(');
    const body = strip.slice(at, strip.indexOf('\n  }\n', at));
    for (const part of ['cardInsetsDp(context)', 'stripEnds(h, compact)', 'header', 'table', 'next', 'rule']) {
      expect(body).toContain(part);
    }
    // The night marks are part of the times' segment — the constant forgot them.
    expect(strip).toMatch(/private fun tableDp\([\s\S]*?m\.night\?\.let/);
    expect(strip).toContain('val box = room - plan.chromeDp - (if (showFoot) plan.footDp else 0)');
    expect(strip).toContain('size.widthDp - insetDp(context, size), box,');
  });

  it('the log card sums its chrome and subtracts it', () => {
    expect(log).toContain('private fun graphChromeDp(');
    expect(log).toContain('return cardInsetsDp(context) + 2 * paddingFor(size) + chips + foot + rule');
    expect(log).toContain('val box = room - chrome');
    expect(log).toContain('val boxW = size.widthDp - 2 * (CARD_INSET_DP + paddingFor(size))');
    expect(log).toContain('PracticeGridBitmap.layoutFor(boxW, box, density, MAX_GRID_DAYS)');
    // Six rows of the smallest cell and the gaps between them, closed up.
    expect(constOf(log, 'GRID_MIN_BOX_DP')).toBeGreaterThanOrEqual(36);
  });

  it('drops the log card’s date line when the graph takes its place', () => {
    // Both facts on that line are said again once the graph is drawn.
    expect(log).toMatch(/if \(!bare && !graphHeight\) \{\s*\n\s*DirRow\([^\n]*\n\s*cell \{ Label\(m\.title/);
  });

  it('the graph is the one weighted child of its column', () => {
    const at = strip.indexOf('practice?.let { pr ->\n        if (compact) Rule(');
    expect(at).toBeGreaterThan(-1);
    expect(strip.slice(at, at + 900).match(/defaultWeight\(\)/g)).toHaveLength(1);
    const lat = log.indexOf('val grid = PracticeGridBitmap.layoutFor(');
    expect(log.slice(lat, lat + 700).match(/defaultWeight\(\)/g)).toHaveLength(1);
    expect(log).toContain('contentScale = spreadScale(spread)');
  });
});

/**
 * THE TALL CARDS ARE ALWAYS 4×2 WITH THEIR GRAPH. Launchers disagree on how
 * many rows a widget takes, so the cards ask for two rows everywhere and,
 * where two rows are short of the full card, lay out tighter (`compact`)
 * before they give up the graph.
 */
describe('two rows always hold the tall cards’ graph', () => {
  it('the prayer card tries the full layout, then the compact one, by the summed chrome', () => {
    expect(strip).toMatch(/if \(h - full >= GRID_MIN_BOX_DP\) return plan\(graph = true, compact = false/);
    expect(strip).toMatch(/if \(d\.showTable && entry == Entry\.TALL\) \{[\s\S]*?if \(h - tight >= GRID_MIN_BOX_DP\) return plan\(graph = true, compact = true/);
    // Compact moves the next prayer up into the header, centred.
    expect(strip).toContain('if (!oneRow || topNext) Header(m.header, m.hijri, d, center = if (!topNext) null');
    expect(strip).toContain('&& !topNext) DirRow(');
  });

  it('and so does the log card, without its footer', () => {
    expect(log).toContain(
      'val compact = hasPractice && tall && graphBox < GRID_MIN_BOX_DP && h - compactChrome >= GRID_MIN_BOX_DP',
    );
    expect(log).toContain('val showFoot = fit.showFoot && !compact');
  });

  it('the padding and the layout read one plan', () => {
    expect(strip).toContain('design == Design.STRIP -> plan?.ends ?: stripEnds(size.heightDp, compact = false)');
    expect(strip).toContain('Design.STRIP -> Strip(context, m, size, plan ?: stripPlan(context, m, size))');
  });
});

/**
 * THE TALL CARDS' GRAPH FILLS ITS ROOM AT THE DEFAULT SIZE, AND ONLY THERE.
 * In the two-row band the rows are spread over the room; above it the graph
 * is the band's, so a card stretched taller does not get a bigger graph.
 */
describe('the tall cards’ graph fills the default size and grows no further', () => {
  const support = readFileSync(path.join(JAVA, 'glance', 'GlanceSupport.kt'), 'utf8');
  const top = constOf(support, 'GRAPH_BAND_TOP_DP');
  const max = constOf(support, 'GRAPH_SPREAD_MAX_DP');

  it('the band reaches both launchers’ two rows', () => {
    // Two rows measured on a Pixel 10 Pro: 201dp on the Pixel launcher, 259dp on Nova.
    expect(top).toBeGreaterThanOrEqual(259);
    expect(max).toBeGreaterThan(top);
  });

  it('caps the room at the band and spreads only inside it', () => {
    expect(strip).toContain('val room = if (tall) minOf(size.heightDp, GRAPH_BAND_TOP_DP) else size.heightDp');
    expect(strip).toContain('spread = tall && size.heightDp < GRAPH_SPREAD_MAX_DP');
    expect(log).toContain('val room = if (tall) minOf(h, GRAPH_BAND_TOP_DP) else h');
    expect(log).toContain('val spread = tall && h < GRAPH_SPREAD_MAX_DP');
  });

  it('stretches the graph to its room in the band, in one image, so the days stay in columns', () => {
    // Rows cut apart and fitted one by one were scaled by slots a pixel
    // apart, and stopped lining up; one stretched image has one scale.
    expect(support).toContain('if (spread) ContentScale.FillBounds else ContentScale.Fit');
    expect(support).not.toMatch(/SpreadGrid|gridRows/);
    expect(strip).toContain('contentScale = spreadScale(spread)');
  });

  it('steps through the band finely enough for the spread to stay small', () => {
    const band = /for \(h in listOf\(([\w, ]+)\)\) add\(DpSize\(370\.dp/.exec(support)![1]
      .split(',').map(s => s.trim()).map(s => (/^\d+$/.test(s) ? Number(s) : s === 'GRAPH_BAND_TOP_DP' ? top : max))
      .filter(h => h >= 176 && h <= top);
    for (let i = 1; i < band.length; i++) expect(band[i] - band[i - 1]).toBeLessThanOrEqual(16);
  });
});
