/**
 * The practice strip fills the card it is drawn on, and reads in order.
 *
 * The strip has six rows whatever the box — the five prayers and the
 * fast — so the HEIGHT decides the cell (a sixth of the box, within the
 * bounds that keep a cell a cell) and the WIDTH decides the days: as many
 * columns as that cell fits across, with a week's breath after each
 * Sunday, the cell then widened by the few dp the last column does not
 * divide into so the strip lands on the card's edges.
 *
 * Two failures this guards. A strip drawn for a box WIDER than it has
 * stops short of the right-hand edge; one drawn TALLER than its box is
 * shrunk whole by the image and stops short of both edges — which is what
 * the Log card did while six rows of the smallest cell were taller than
 * the room the card had. A short box now closes the gaps before it
 * shrinks the cells, and the strip is never taller than its box.
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
  const m = new RegExp(`val ${name} = ([0-9_.]+)f?`).exec(GRID);
  if (!m) throw new Error(`${name} is gone from PracticeGridBitmap.kt`);
  return Number(m[1].replace(/_/g, ''));
};

const GAP_DP = numberOf('GAP_DP');
const MIN_GAP_DP = numberOf('MIN_GAP_DP');
const MIN_CELL_DP = numberOf('MIN_CELL_DP');
const MAX_CELL_DP = numberOf('MAX_CELL_DP');
const MAX_ROW_RATIO = numberOf('MAX_ROW_RATIO');
const RING_RATIO = numberOf('RING_RATIO');
const ROWS = numberOf('STRIP_ROWS');

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The margin the bitmap keeps for the rings that overhang a cell. */
const MARGIN = 2 * Math.max(1.5, MAX_CELL_DP * RING_RATIO);

/** A mirror of `layoutFor`'s geometry, built from the Kotlin's own numbers. */
function layoutFor(boxWIn: number, boxHIn: number, maxDays: number) {
  const boxW = Math.max(40, boxWIn);
  const boxH = Math.max(30, boxHIn);
  const usableH = Math.max(ROWS * 3, boxH - MARGIN);
  let gap = GAP_DP;
  let cellFromH = (usableH - (ROWS - 1) * gap) / ROWS;
  if (cellFromH < MIN_CELL_DP) {
    gap = clamp((usableH - ROWS * MIN_CELL_DP) / (ROWS - 1), MIN_GAP_DP, GAP_DP);
    cellFromH = (usableH - (ROWS - 1) * gap) / ROWS;
  }
  cellFromH = clamp(cellFromH, 3, MAX_CELL_DP);
  const breath = gap / 7;
  const columns = clamp(Math.round((boxW + gap) / (cellFromH + gap + breath)), 7, Math.max(7, maxDays));
  const breaths = Math.floor(columns / 7);
  const cell = Math.max(3, (boxW - (columns - 1) * gap - breaths * gap) / columns);
  const cellH = Math.max(3, Math.min(cellFromH, cell * MAX_ROW_RATIO));
  return { rows: ROWS, columns, cell, cellH, gap, breaths, usableH };
}

const gridW = (l: ReturnType<typeof layoutFor>) =>
  l.columns * l.cell + (l.columns - 1) * l.gap + l.breaths * l.gap;
const gridH = (l: ReturnType<typeof layoutFor>) => l.rows * l.cellH + (l.rows - 1) * l.gap;

/** Grid boxes measured off real cards, in dp. */
const BOXES: Array<[string, number, number]> = [
  ['the Pixel 10 Pro’s 4×2 Log card', 355, 61],
  ['the Pixel 10 Pro’s 4×2 prayer card', 359, 56],
  ['an emulator’s shorter 4×2', 341, 39],
  ['a tall box', 318, 200],
  ['the narrow column beside the streak number', 150, 90],
];

describe('the strip spans its box, whatever the height turns out to be', () => {
  it.each(BOXES)('%s reaches both edges', (_label, boxW, boxH) => {
    const l = layoutFor(boxW, boxH, 210);
    // Within a rounding error of the box's own width — no remainder can
    // pile up against one edge, because the cell IS the width divided.
    expect(Math.abs(gridW(l) - boxW)).toBeLessThan(1);
  });

  it.each(BOXES)('%s is never taller than its box', (_label, boxW, boxH) => {
    // Taller than the box is the failure that shrinks the whole strip and
    // stands it away from both edges. Shorter is a little air.
    const l = layoutFor(boxW, boxH, 210);
    expect(gridH(l) + MARGIN).toBeLessThanOrEqual(boxH + 0.01);
  });

  it('is never taller than its box, at ANY height a card can hand over', () => {
    const over: Array<{ boxH: number; by: number }> = [];
    for (let boxH = 36; boxH <= 400; boxH += 1) {
      const l = layoutFor(341, boxH, 210);
      const tall = gridH(l) + MARGIN;
      if (tall > boxH + 0.01) over.push({ boxH, by: Math.round(tall - boxH) });
    }
    expect(over).toEqual([]);
  });

  it('always draws six rows: the five prayers and the fast', () => {
    expect(GRID).toContain('const val STRIP_ROWS = 6');
    expect(GRID).toContain('val rows = STRIP_ROWS');
    expect(ROWS).toBe(6);
  });

  it('closes the gaps before it shrinks the cells on a short box', () => {
    const roomy = layoutFor(341, 120, 210);
    const short = layoutFor(341, 39, 210);
    expect(roomy.gap).toBe(GAP_DP);
    expect(short.gap).toBeLessThan(GAP_DP);
    expect(short.gap).toBeGreaterThanOrEqual(MIN_GAP_DP);
    // …and the cell only once the gaps are at their floor.
    const floor = layoutFor(341, 30, 210);
    expect(floor.gap).toBe(MIN_GAP_DP);
    expect(floor.cellH).toBeLessThan(MIN_CELL_DP);
  });

  it('shows more days on a wider box, and bigger ones on a taller box', () => {
    expect(layoutFor(400, 61, 210).columns).toBeGreaterThan(layoutFor(300, 61, 210).columns);
    expect(layoutFor(341, 120, 210).cellH).toBeGreaterThan(layoutFor(341, 61, 210).cellH);
    expect(layoutFor(341, 120, 210).columns).toBeLessThan(layoutFor(341, 61, 210).columns);
  });

  it('keeps a day within an eighth of square', () => {
    // A day drawn half again as tall as it is wide does not read as a day.
    expect(GRID).toContain('val cellH = minOf(cellFromH, cellW * MAX_ROW_RATIO).coerceAtLeast(3f)');
    expect(MAX_ROW_RATIO).toBeLessThanOrEqual(1.15);
    for (const [, boxW] of BOXES) {
      for (let boxH = 36; boxH <= 400; boxH += 1) {
        const l = layoutFor(boxW, boxH, 210);
        expect(l.cellH / l.cell).toBeLessThanOrEqual(MAX_ROW_RATIO + 0.001);
      }
    }
  });

  it('never asks for more history than the payload carries', () => {
    for (const [, w, h] of BOXES) {
      expect(layoutFor(w, h, 210).columns).toBeLessThanOrEqual(210);
    }
    expect(layoutFor(4000, 61, 210).columns).toBe(210);
  });
});

describe('the run of days reads in order, and ends today', () => {
  it('is a column a day, the prayers down it, the newest day on the right', () => {
    expect(GRID).toMatch(/for \(col in 0 until columns\) \{[\s\S]{0,1200}for \(row in 0 until rows\)/);
  });

  it('starts as far back as it has to for today to be the last column', () => {
    expect(GRID).toContain('add(Calendar.DAY_OF_YEAR, -(columns - 1))');
    expect(GRID).toContain('cursor.add(Calendar.DAY_OF_YEAR, 1)');
  });

  it('breathes after each Sunday, so the weeks read as weeks', () => {
    expect(GRID).toContain('if (d.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY && i < columns - 1) gapPx else 0');
    expect(GRID).toContain('+ weekEnds.sum() + 2 * pad');
  });
});

describe('an edge cell is a whole cell', () => {
  it('keeps a margin inside the bitmap for the rings that overhang', () => {
    // Every ring is centred on a cell boundary and today's is drawn on a
    // rect outset by half a stroke, so the outer half of both fell off a
    // bitmap whose first cell started at x=0.
    expect(GRID).toContain('val pad = padFor(ringUnit)');
    expect(GRID).toContain('+ 2 * pad');
    expect(GRID).toContain('val top = (pad + row * (cellHPx + gapPx)).toFloat()');
  });

  it('sizes that margin by the widest stroke it draws', () => {
    expect(GRID).toMatch(/padFor\(cellPx: Int\): Int =\s*Math\.ceil\(ringWidth\(cellPx\)/);
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
