/**
 * The practice graph fills the card it is drawn on, and reads in order.
 *
 * Reported with a screenshot: on a 4x4 the graph stopped about eighty
 * pixels short of the right-hand edge that the divider, the date and the
 * "0 of 5 logged" line all reach — which reads as a graph being clipped,
 * not as a graph that chose to be narrower.
 *
 * The cause was an estimate. The column count came from a cell size
 * derived from the box's HEIGHT — a number the caller can only guess at,
 * since it is the launcher's report for the host view less whatever chrome
 * the card thinks it draws — and the cell was then drawn at a different
 * size again. Two shapes with no reason to agree, and when they disagreed
 * `fitStart` scaled the bitmap to whichever axis bound first and left the
 * remainder against one edge.
 *
 * It is answered from the WIDTH now, which the caller does know: the
 * columns are however many readable cells fit across it and the cell is
 * that width divided exactly among them. The height only decides how many
 * rows there is room for, rounded down, because a row too few is a band of
 * empty card and a row too many is the whole graph shrunk away from its
 * edge.
 */
import { readFileSync } from 'fs';
import path from 'path';

const JAVA = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'prayer_times',
);
const src = (name: string) => readFileSync(path.join(JAVA, `${name}.kt`), 'utf8');
const GRID = src('PracticeGridBitmap');
const layoutXml = (name: string) =>
  readFileSync(
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'layout', `${name}.xml`),
    'utf8',
  );

const numberOf = (name: string) => {
  const m = new RegExp(`${name} = ([0-9_.]+)f?`).exec(GRID);
  if (!m) throw new Error(`${name} is gone from PracticeGridBitmap.kt`);
  return Number(m[1].replace(/_/g, ''));
};

const GAP_DP = numberOf('GAP_DP');
const TARGET_CELL_DP = numberOf('TARGET_CELL_DP');
const MAX_ROWS = numberOf('MAX_ROWS');
const MIN_COLUMNS = numberOf('MIN_COLUMNS');
const MAX_CELL_DP = numberOf('MAX_CELL_DP');
const MIN_ROW_RATIO = numberOf('MIN_ROW_RATIO');
const MAX_ROW_RATIO = numberOf('MAX_ROW_RATIO');

const RING_RATIO = numberOf('RING_RATIO');

/** The margin the bitmap keeps for the rings that overhang a cell. */
const marginOf = (cell: number) => 2 * Math.max(1.5, cell * RING_RATIO);

/**
 * A mirror of `layoutFor`'s geometry, built from the Kotlin's own numbers.
 *
 * `cell` is the day's WIDTH, which the box's width decides on its own;
 * `cellH` is its height, which is the width within MAX_ROW_RATIO and is
 * what spends the dp the row count could not.
 */
function layoutFor(boxW: number, boxH: number, maxDays: number) {
  const columns = Math.max(
    MIN_COLUMNS,
    Math.round((boxW + GAP_DP) / (TARGET_CELL_DP + GAP_DP)),
  );
  const cell = Math.min(
    MAX_CELL_DP,
    Math.max(3, (boxW - (columns - 1) * GAP_DP) / columns),
  );
  const usableH = Math.max(cell, boxH - marginOf(cell));
  const roomFor = Math.floor((usableH + GAP_DP) / (cell * MIN_ROW_RATIO + GAP_DP));
  const wanted = Math.min(
    Math.round((usableH + GAP_DP) / (cell + GAP_DP)),
    roomFor,
  );
  const rows = Math.min(
    Math.max(1, wanted),
    MAX_ROWS,
    Math.max(1, Math.floor(maxDays / columns)),
  );
  const exactH = (usableH - (rows - 1) * GAP_DP) / rows;
  const cellH = Math.max(3, Math.min(exactH, cell * MAX_ROW_RATIO));
  // `wanted` is what the HEIGHT asked for; when `rows` is less than it, the
  // day cap is what settled the count and the leftover is a design choice,
  // not a quantising error.
  return { rows, columns, cell, cellH, wanted, usableH };
}

const gridW = (l: { columns: number; cell: number }) =>
  l.columns * l.cell + (l.columns - 1) * GAP_DP;
const gridH = (l: { rows: number; cellH: number }) =>
  l.rows * l.cellH + (l.rows - 1) * GAP_DP;

/** Grid boxes measured off real cards, in dp. */
const BOXES: Array<[string, number, number]> = [
  ['the 4x4 that was reported', 318, 127],
  ['a taller card', 318, 200],
  ['a 4x2, where the graph now appears at all', 318, 40],
  ['the narrow column beside the streak number', 150, 90],
];

describe('the graph spans its box, whatever the height turns out to be', () => {
  it.each(BOXES)('%s reaches both edges', (_label, boxW, boxH) => {
    const l = layoutFor(boxW, boxH, 210);
    // Within a rounding error of the box's own width — no remainder can
    // pile up against one edge, because the cell IS the width divided.
    expect(Math.abs(gridW(l) - boxW)).toBeLessThan(1);
  });

  it.each(BOXES)('%s is never taller than its box', (_label, boxW, boxH) => {
    // Taller than the box is the failure that shrinks the whole graph and
    // stands it away from the right-hand edge. Shorter is a band of card.
    const l = layoutFor(boxW, boxH, 210);
    expect(gridH(l) + marginOf(l.cell)).toBeLessThanOrEqual(boxH);
  });

  it('drops a row rather than shrinking when the card gets shorter', () => {
    const tall = layoutFor(318, 127, 210);
    const short = layoutFor(318, 60, 210);
    expect(short.rows).toBeLessThan(tall.rows);
    // The cell is the same WIDTH: a shorter card shows fewer days, not
    // smaller ones. That is the difference between a shorter widget and a
    // smaller one. Only the height gives, and only by an eighth.
    expect(short.cell).toBeCloseTo(tall.cell, 5);
  });

  it('never lets the height be the axis that binds, at ANY height', () => {
    // The one that matters, and the one four hand-picked boxes kept
    // missing. `fitStart` scales by whichever axis binds first: while the
    // bitmap is no taller than its box the WIDTH binds, the scale is the
    // same at every height, and the cell is the size the width chose. Let
    // the grid come out half a cell too tall — which round-to-nearest did,
    // for a third of all heights — and the height binds instead, so
    // dragging the card shorter shrinks every square on it instead of
    // dropping a row. Rounding down is what makes a resize a row count.
    // From one row's worth of box upward. Below that the grid still returns
    // a single row rather than none — a graph that is drawn at all has at
    // least one row in it — and it is the providers' `GRID_MIN_HEIGHT_DP`
    // that keeps a box this short from ever being handed over.
    const oneRow = (() => {
      const { cell } = layoutFor(318, 400, 210);
      return Math.ceil(cell + marginOf(cell));
    })();
    const over: Array<{ boxH: number; by: number }> = [];
    for (let boxH = oneRow; boxH <= 400; boxH += 1) {
      const l = layoutFor(318, boxH, 210);
      const tall = gridH(l) + marginOf(l.cell);
      if (tall > boxH) over.push({ boxH, by: Math.round(tall - boxH) });
    }
    expect(over).toEqual([]);
  });

  it('is monotonic: taller card, never fewer rows', () => {
    // A dial, not a lottery. Every extra dp either buys a row or buys
    // nothing; none of them may cost one.
    let last = 0;
    for (let boxH = 20; boxH <= 400; boxH += 1) {
      const { rows } = layoutFor(318, boxH, 210);
      expect(rows).toBeGreaterThanOrEqual(last);
      last = rows;
    }
  });

  it('goes all the way down to one row, and keeps the cell', () => {
    // "It should be able to go from one row up to however many it can fit."
    // The floor is one row of full-size squares, not a smaller graph and
    // not an empty band where the graph was.
    const one = layoutFor(318, 34, 210);
    const many = layoutFor(318, 400, 210);
    expect(one.rows).toBe(1);
    expect(many.rows).toBeGreaterThan(6);
    expect(one.cell).toBeCloseTo(many.cell, 5);
    expect(one.columns).toBe(many.columns);
  });

  it('keeps a day within an eighth of square', () => {
    // A day drawn half again as wide as it is tall does not read as a day.
    // The height is allowed to differ from the width — that is what spends
    // the leftover — but only by the bound the Kotlin states, and the
    // WIDTH is still the number the box's width decides on its own.
    expect(GRID).toContain('val cellWDp = cellDp');
    expect(GRID).toContain('val cellHDp = exactH.coerceAtMost(cellDp * MAX_ROW_RATIO)');
    expect(MAX_ROW_RATIO).toBeLessThanOrEqual(1.15);
    expect(MIN_ROW_RATIO).toBeGreaterThanOrEqual(0.85);
    for (const [, boxW] of BOXES) {
      for (let boxH = 30; boxH <= 400; boxH += 1) {
        const l = layoutFor(boxW, boxH, 210);
        expect(l.cellH / l.cell).toBeGreaterThanOrEqual(MIN_ROW_RATIO - 0.001);
        expect(l.cellH / l.cell).toBeLessThanOrEqual(MAX_ROW_RATIO + 0.001);
      }
    }
  });

  /**
   * Reported as "the graph in the widget is better but has too much void
   * space above and under".
   *
   * The rows were whole squares and the box is never a whole number of
   * them, so up to a row's worth of the box — 27dp on a four-wide card —
   * went unspent, and `fitCenter` split it into a band above the grid and
   * a band below. Averaged over the heights a launcher actually hands out
   * it was 13dp of empty card per graph. The rows take it now.
   */
  it('spends the box on the graph instead of on a band at each end', () => {
    const leftovers: number[] = [];
    let worst = 0;
    for (const [, boxW] of BOXES) {
      for (let boxH = 40; boxH <= 400; boxH += 1) {
        const l = layoutFor(boxW, boxH, 210);
        // Only where the HEIGHT settled the row count. Past that it is
        // MAX_ROWS or the payload's own history that stops the graph
        // growing, and the card keeping the rest is the intended answer.
        if (l.rows < l.wanted || l.rows < 2) continue;
        const left = l.usableH - gridH(l);
        leftovers.push(left);
        worst = Math.max(worst, left);
      }
    }
    const mean = leftovers.reduce((a, b) => a + b, 0) / leftovers.length;
    // Under a dp on average — invisible on a card, where it used to be a
    // sixth of the graph's own height.
    expect(mean).toBeLessThan(2);
    // A two-row box is the one shape that can still keep a band: there is
    // no third row that fits, however far it is squeezed, so what is left
    // over is the difference between two rows and three. Half a cell.
    expect(worst).toBeLessThan(TARGET_CELL_DP * 0.8);
  });

  it('never asks for more history than the payload carries', () => {
    for (const [, w, h] of BOXES) {
      const l = layoutFor(w, h, 210);
      expect(l.rows * l.columns).toBeLessThanOrEqual(210);
    }
  });
});

describe('the run of days reads in order, and ends today', () => {
  it('fills a column at a time, top to bottom', () => {
    // Column-major, because the Log screen's heatmap is: days run down a
    // column, a column is a week, the newest week is on the right. It was
    // row-major for a while — the days were the same days in the same
    // order, but laid along rows, and reading the widget after reading the
    // Log screen meant re-learning which square was which. Two pictures of
    // one record should not need two reading directions.
    expect(GRID).toMatch(
      /for \(col in 0 until columns\) \{\s*\n\s*for \(row in 0 until rows\)/,
    );
  });

  it('starts as far back as it has to for today to be the last cell', () => {
    expect(GRID).toContain('add(Calendar.DAY_OF_YEAR, -(rows * columns - 1))');
    expect(GRID).toContain('cursor.add(Calendar.DAY_OF_YEAR, 1)');
  });
});

describe('an edge cell is a whole cell', () => {
  it('keeps a margin inside the bitmap for the rings that overhang', () => {
    // Every ring is centred on a cell boundary and today's is drawn on a
    // rect outset by half a stroke, so the outer half of both fell off a
    // bitmap whose first cell started at x=0.
    expect(GRID).toContain('val pad = padFor(ringUnit)');
    expect(GRID).toContain('+ 2 * pad');
    expect(GRID).toContain('val left = (pad + col * (cellWPx + gapPx)).toFloat()');
    expect(GRID).toContain('val top = (pad + row * (cellHPx + gapPx)).toFloat()');
  });

  it('sizes that margin by the widest stroke it draws', () => {
    expect(GRID).toMatch(/padFor\(cellPx: Int\): Int =\s*Math\.ceil\(ringWidth\(cellPx\)/);
    expect(GRID).toContain('paint.strokeWidth = ringWidth(ringUnit)');
  });

  it('draws at the device’s own resolution unless the budget says no', () => {
    // A bitmap drawn at a third of the pixels it is shown at is a blur with
    // rounded corners.
    expect(GRID).toContain('var scale = density');
    expect(GRID).toMatch(/if \(area > MAX_BITMAP_PX\)/);
  });
});

/**
 * The other thing the 12-hour clock made longer.
 *
 * The strip's six time columns were declared at 17sp with an
 * `autoSizeTextType` under them, and AppWidget hosts do not reliably honour
 * auto-sizing: on the ones that ignore it the text draws at the size it was
 * given and spills into its neighbour. "05:36" fit; "5:36 AM" did not, and
 * the top of the card became one run of digits.
 */
describe('the times row fits its own columns', () => {
  const strip = src('glance/PrayerGlanceWidget');
  const support = src('glance/GlanceSupport');

  it('sets the size it measured, on every column', () => {
    // Measured, then the user's size (Settings → widget) held to the column.
    expect(strip).toContain('val baseSp = fitTimesSp(');
    expect(strip).toContain('val timeSp = scaledClockSp(');
    expect(strip).toContain('ClockText(r.minutes, m.clock, timeSp, color)');
  });

  it('finds one size that every time in the row fits', () => {
    expect(support).toMatch(/while \(sp > minSp && times\.any \{ width\(it, sp\) > available \}\)/);
  });

  it('measures the string it will actually draw', () => {
    // The meridiem is set small, so a search that measured the whole time
    // at one size would fit a string nobody draws — and settle on type
    // smaller than it had to be.
    expect(support).toContain('sp * MERIDIEM_SCALE');
    // Pixels as the TextView computes them: non-linear from Android 14.
    expect(support).toContain('TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics)');
    expect(support).toContain(
      'TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp * MERIDIEM_SCALE, metrics)',
    );
    expect(support).not.toContain('scaledDensity');
  });

  it('keeps the meridiem where the language puts it', () => {
    // Chinese writes 上午5:36. ClockText draws the period before or after
    // the digits by WallClock.parts' periodFirst, small either way.
    expect(support).toMatch(
      /if \(parts\.periodFirst\) \{\s*\n\s*first = \{ Label\(period, sp \* MERIDIEM_SCALE[\s\S]{0,120}second = \{ Label\(parts\.digits, sp/,
    );
    expect(support).toMatch(
      /\} else \{\s*\n\s*first = \{ Label\(parts\.digits, sp[\s\S]{0,120}second = \{ Label\(" \$period", sp \* MERIDIEM_SCALE/,
    );
  });

  it('shrinks the meridiem on the Log card too', () => {
    expect(src('glance/LogGlanceWidget')).toContain('ClockText(chip.minutes, m.clock,');
  });

  it('leaves a gutter, so fitting is not the same as touching', () => {
    expect(strip).toMatch(/TIME_GUTTER_DP = ([1-9]\d*)f/);
    expect(strip).toContain('/ columns.size.coerceAtLeast(1) - TIME_GUTTER_DP');
  });

  it('stops declaring an auto-size the host may ignore', () => {
    // The strip layouts are gone (Glance measures with fitTimesSp); what
    // remains of them is the picker preview and the shared card.
    for (const layout of ['prayer_widget_strip_preview', 'prayer_widget_log_preview', 'glance_card']) {
      expect(layoutXml(layout)).not.toContain('autoSizeTextType');
    }
  });
});

/**
 * One band between the times and the graph, and the same one on both cards.
 */
describe('the streak sits on the line with what is next', () => {
  const strip = src('glance/PrayerGlanceWidget');
  const log = src('glance/LogGlanceWidget');

  /** The Row that holds what is next, and the text up to the rule under it. */
  const nextRow = (file: string, marker: string) => {
    const at = file.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    return file.slice(at, at + 1400);
  };
  const STRIP_ROW = 'if (m.nextName.isNotEmpty()) Label(m.nextName, 11f';
  const LOG_ROW = 'm.next?.let { (name, at) ->';

  it.each([
    ['the strip', strip, STRIP_ROW, 'practice.block.streak.toString()'],
    ['the log card', log, LOG_ROW, 'pr.streak.toString()'],
  ])('%s carries it on the row that already existed', (_l, file, marker, streak) => {
    const row = nextRow(file, marker);
    const rowEnd = row.indexOf('\n      }\n');
    const at = row.indexOf(streak);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(rowEnd);
  });

  // Removed: "keeps the old row as an empty shell" — that guarded the shared
  // RemoteViews binder against ids a layout no longer has; Glance has no ids.

  it('is one line on the prayer card, as it is on the Log card', () => {
    // The night times belong to the times, so they are above the rule and
    // the band between the times and the graph is a single line on both.
    const night = strip.indexOf('m.night?.let { n ->');
    const rule = strip.indexOf('if (!tight) Rule(d.rule, top = 6, bottom = 8)');
    const next = strip.indexOf(STRIP_ROW);
    expect(night).toBeGreaterThan(-1);
    expect(night).toBeLessThan(rule);
    expect(rule).toBeLessThan(next);
  });

  it('rules itself off the same way on both cards', () => {
    // The prayer card draws its rules in the user's text colour (`d.rule`),
    // the Log card in the fixed one: the same rule, the same margins.
    expect(strip).toContain('if (!tight) Rule(d.rule, top = 6, bottom = 8)');
    expect(log).toContain('if (!tight) Rule(Palette.RULE, top = 6, bottom = 8)');
  });

  /**
   * The band is what sits between the rule under the times and the rule
   * over the graph, and it is centred between them: the same dp above the
   * row as below it. Reported as "the middle segment in both of the widgets
   * is not centered between the top and the bottom line". The row itself
   * carries no vertical margin in Glance, so the two Rule() gaps are the
   * whole of it.
   */
  /** The gap under the rule over the row, and the gap over the rule under it. */
  const band = (file: string, gridRule: string) => {
    // `Palette.RULE_STRONG` and the display's `d.ruleStrong` are one rule.
    const norm = (n: string) => n.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    const rules = [...file.matchAll(/Rule\((?:Palette|d)\.(\w+), top = (\d+), bottom = (\d+)\)/g)].map(
      (m) => [m[0], norm(m[1]), m[2], m[3]] as const,
    );
    const over = rules.find((r) => r[1] === 'RULE' && r[2] === '6');
    const under = rules.find((r) => r[1] === gridRule && r[2] === '8');
    expect(over).toBeDefined();
    expect(under).toBeDefined();
    return { above: Number(over![3]), below: Number(under![2]) };
  };

  it.each([
    ['the strip', strip, 'RULE_STRONG'],
    ['the log card', log, 'RULE'],
  ])('%s centres the band between its two rules', (_l, file, gridRule) => {
    const b = band(file, gridRule);
    expect(b.above).toBe(b.below);
  });

  it('gives both cards the same band, not just a symmetric one', () => {
    expect(band(strip, 'RULE_STRONG')).toEqual(band(log, 'RULE'));
  });

  it.each([
    ['the strip', strip],
    ['the log card', log],
  ])('%s centres the graph in whatever slack is left', (_l, file) => {
    // The row count quantises, so up to a row's worth of the box goes
    // unspent. Fit centres the bitmap and splits it above and below.
    expect(file).toContain('contentScale = ContentScale.Fit');
  });

  it('reads at the same size on both cards', () => {
    expect(strip).toMatch(/Label\(practice\.block\.streak\.toString\(\), 11f,/);
    expect(log).toMatch(/Label\(pr\.streak\.toString\(\), 11f,/);
    expect(strip).toMatch(/Label\("\$\{practice\.streakText\} · \$\{practice\.second\}", 11f,/);
    expect(log).toMatch(/Label\(practiceLine\(context, pr\), 11f,/);
  });
});
