/**
 * The Continue Reading widget at the size it actually ships at.
 *
 * Its default is 4x1, and one launcher row is not much. Measured on a
 * 420dpi phone: the launcher hands the widget about 101dp, the card insets
 * 6dp a side and pads 10dp inside that, so the content has 69dp. At the
 * type the card was set in — an 11sp header, a 23sp surah name, a 13sp
 * position line, with their margins — the left column wanted 65dp of that
 * and the side column 70dp. One was inside a rounding error of the edge and
 * the other was already over it: "3 pages left" was cut in half at the
 * default size.
 *
 * Then the play control landed on the surah's line and made that line 40dp
 * tall, which took the left column to 77dp and cut the position line too.
 * That one was mine, added with the resume feature, and it is the reason
 * this file exists: a card that fits by luck will stop fitting.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const GLANCE = read(
  'android/app/src/main/java/com/prayer_times/glance/ReadingGlanceWidget.kt',
);
// Tier thresholds, type sizes and the tier logic are unchanged from the old
// provider; they live in the Glance widget now.
const PROVIDER = GLANCE;
const INFO = read('android/app/src/main/res/xml/glance_reading_info.xml');

describe('a control does not decide how tall the text is', () => {
  it('keeps the play disc out of the text column', () => {
    // Between the two columns, as a sibling of both. Inside the left one it
    // set the height of the line it sat on, and that line was the surah
    // name — so a 36dp target quietly became the card's layout.
    const position = GLANCE.indexOf('context.getString(R.string.widget_reading_position');
    const disc = GLANCE.indexOf('.size(36.dp)');
    const side = GLANCE.indexOf('if (size.widthDp !in 1 until SIDE_COLUMN_MIN_WIDTH_DP)');
    expect(position).toBeGreaterThan(-1);
    expect(disc).toBeGreaterThan(position);
    expect(disc).toBeLessThan(side);
    // ...and it is a child of the root Row, not of the text Column: the
    // Column that holds the position line is closed before the disc opens.
    const between = GLANCE.slice(position, disc);
    expect(between).toMatch(/\n      \}\n/);
  });

  it('lets the surah name have the column to itself', () => {
    const at = GLANCE.indexOf('Label(r.surahName');
    expect(at).toBeGreaterThan(-1);
    const call = GLANCE.slice(at, GLANCE.indexOf('\n', at));
    // A weight is how it looked when it shared a row with the control.
    expect(call).not.toContain('defaultWeight');
  });
});

describe('height picks a tier, and every tier fits', () => {
  it('names three of them', () => {
    expect(PROVIDER).toContain(
      'private enum class Tier { COMPACT, NORMAL, GENEROUS }',
    );
  });

  it('orders the thresholds so the tiers cannot overlap', () => {
    const num = (name: string) => {
      const m = PROVIDER.match(new RegExp(`${name} = (\\d+)`));
      expect(m).not.toBeNull();
      return Number(m![1]);
    };
    const compact = num('COMPACT_MAX_HEIGHT_DP');
    const progress = num('PROGRESS_MIN_HEIGHT_DP');
    const generous = num('GENEROUS_MIN_HEIGHT_DP');
    expect(compact).toBeLessThan(progress);
    expect(progress).toBeLessThan(generous);
    // One launcher row is about 101dp on a 420dpi phone, so the default
    // size has to land in COMPACT rather than just above it.
    expect(compact).toBeGreaterThan(101);
  });

  it('scales the type rather than drawing three cards', () => {
    expect(PROVIDER).toMatch(
      /Tier\.COMPACT -> 20f; Tier\.NORMAL -> 23f; Tier\.GENEROUS -> 28f/,
    );
  });

  it('drops the side column’s third line at one row', () => {
    // The line that was being cut. It repeats what the counter above it
    // already says, so it is the one to lose.
    expect(PROVIDER).toContain('note = if (tier == Tier.COMPACT) null else when {');
  });

  it('will not let a branch put back a line the height ruled out', () => {
    // The khatmah branch used to set the tail visible on its own, after the
    // card had already decided it had no room for one.
    expect(PROVIDER).toContain('lastReadTail(context, r, nowMs)?.takeIf { tall }');
  });

  it('gives the tallest sizes something to say', () => {
    // Without a plan the left column is a header, a name and a page; at
    // three rows and up the rest was air.
    expect(PROVIDER).toContain(
      'else if (tier == Tier.GENEROUS) lastReadTail(context, r, nowMs)',
    );
  });
});

describe('the stack fits the card it is drawn in', () => {
  /**
   * The measurement this whole file rests on, kept as arithmetic rather
   * than as a screenshot — a screenshot proves today's type fits and says
   * nothing about the next change to it.
   *
   * 420dpi phone, one launcher row: the widget is given ~101dp. The card
   * insets `widget_card_inset` a side and pads 10dp inside that, so the
   * content budget is 101 − 12 − 20 = 69dp.
   */
  const INSET_DP = Number(
    read('android/app/src/main/res/values/dimens.xml').match(
      /name="widget_card_inset">(\d+)dp/,
    )![1],
  );
  // MihrabCard's default contentPadding / verticalPadding.
  const CARD_PADDING_DP = Number(
    read('android/app/src/main/java/com/prayer_times/glance/GlanceSupport.kt').match(
      /contentPadding: Dp = (\d+)\.dp/,
    )![1],
  );
  const ONE_ROW_DP = 101;

  const budget = (launcherDp: number) =>
    launcherDp - 2 * INSET_DP - 2 * CARD_PADDING_DP;

  /** A line box is about 1.2x its type size for the default face. */
  const line = (sp: number) => sp * 1.2;

  /**
   * The type size a tier draws a label at, read off the Kotlin's own
   * `surahSp` / `positionSp` / `sideValueSp` tables.
   */
  const spFor = (tier: 'COMPACT' | 'NORMAL' | 'GENEROUS', which: string) => {
    const fn = which === 'reading_surah' ? 'surahSp' : which === 'reading_position' ? 'positionSp' : 'sideValueSp';
    const body = PROVIDER.slice(PROVIDER.indexOf(`private fun ${fn}(`));
    const line1 = body.slice(0, body.indexOf('\n'));
    const arm = line1.match(new RegExp(`Tier\\.${tier} -> (\\d+)f`));
    if (arm) return Number(arm[1]);
    const iff = line1.match(/if \(t == Tier\.COMPACT\) (\d+)f else (\d+)f/);
    if (iff) return Number(tier === 'COMPACT' ? iff[1] : iff[2]);
    throw new Error(`${fn} changed shape — teach this test how to read it`);
  };

  /**
   * The gap above a label: the `padding(top = N.dp)` on the Label call whose
   * first line mentions `needle`, read off the Kotlin. Glance has no layout
   * margins; the padding on the Label is the margin.
   */
  const marginOf = (id: string) => {
    const needle = {
      reading_surah: 'Label(r.surahName',
      reading_position: 'context.getString(R.string.widget_reading_position',
      reading_side_value: 'Label(value, valueSp',
      reading_progress: 'Spacer(GlanceModifier.height(',
      reading_progress_label: 'R.string.widget_reading_progress',
      reading_tail: 'if (tail != null) Label(tail',
    }[id]!;
    const at = PROVIDER.indexOf(needle);
    expect(at).toBeGreaterThan(-1);
    const chunk = PROVIDER.slice(at, at + 260);
    const m = chunk.match(/(?:padding\(top = |height\()(\d+)\.dp/);
    return m ? Number(m[1]) : 0;
  };

  const HEADER_SP = 11;
  const PROGRESS_BAR_DP = Number(PROVIDER.match(/fillMaxWidth\(\)\.height\((\d+)\.dp\)/)![1]);

  it('fits one launcher row, which is the size it ships at', () => {
    // header + surah + position, at COMPACT's type. Nothing else is drawn
    // at this tier.
    const stack =
      line(HEADER_SP) +
      marginOf('reading_surah') +
      line(spFor('COMPACT', 'reading_surah')) +
      marginOf('reading_position') +
      line(spFor('COMPACT', 'reading_position'));
    expect(stack).toBeLessThanOrEqual(budget(ONE_ROW_DP));
    // And with room to spare, so the next change to the type does not
    // silently spend the last of it — which is how this broke twice.
    expect(stack).toBeLessThanOrEqual(budget(ONE_ROW_DP) * 0.9);
  });

  it('fits one row on the side column too', () => {
    // The column that was actually being cut: its third line is dropped at
    // this tier, so what is left is a title and a value.
    const stack =
      line(HEADER_SP) +
      marginOf('reading_side_value') +
      line(spFor('COMPACT', 'reading_side_value'));
    expect(stack).toBeLessThanOrEqual(budget(ONE_ROW_DP) * 0.9);
  });

  it('fits the play control beside them', () => {
    // It sizes the card's row now rather than the text column's line, so
    // what it has to fit inside is the same budget.
    const size = Number(PROVIDER.match(/\.size\((\d+)\.dp\)\s*\n\s*\.background\(ImageProvider\(R\.drawable\.widget_play_button/)![1]);
    expect(size).toBeLessThanOrEqual(budget(ONE_ROW_DP));
    // Still a real target for a thumb.
    expect(size).toBeGreaterThanOrEqual(32);
  });

  it('fits the middle tier, which drops the bar but not the type', () => {
    // Between COMPACT and the bar's own threshold: full-size type, header,
    // surah and page, and nothing below them.
    const compactMax = Number(
      PROVIDER.match(/COMPACT_MAX_HEIGHT_DP = (\d+)/)![1],
    );
    const stack =
      line(HEADER_SP) +
      marginOf('reading_surah') +
      line(spFor('NORMAL', 'reading_surah')) +
      marginOf('reading_position') +
      line(spFor('NORMAL', 'reading_position'));
    expect(stack).toBeLessThanOrEqual(budget(compactMax));
  });

  it('only draws the bar where the whole stack fits', () => {
    // This is the one that was wrong. The threshold was 150dp, the full
    // stack measures ~133dp, and a card keeps 32dp less than the launcher
    // gives it — so between 150 and 165 the card drew a stack it had no
    // room for and cut the tail off the bottom. Two rows is about 220dp,
    // which is why the common size looked fine.
    const progressMin = Number(
      PROVIDER.match(/PROGRESS_MIN_HEIGHT_DP = (\d+)/)![1],
    );
    const stack =
      line(HEADER_SP) +
      marginOf('reading_surah') +
      line(spFor('NORMAL', 'reading_surah')) +
      marginOf('reading_position') +
      line(spFor('NORMAL', 'reading_position')) +
      marginOf('reading_progress') +
      PROGRESS_BAR_DP +
      marginOf('reading_progress_label') +
      line(11) +
      marginOf('reading_tail') +
      line(11);
    expect(stack).toBeLessThanOrEqual(budget(progressMin));
  });

  it('fits the largest type at the size that turns it on', () => {
    const generousMin = Number(
      PROVIDER.match(/GENEROUS_MIN_HEIGHT_DP = (\d+)/)![1],
    );
    const stack =
      line(HEADER_SP) +
      marginOf('reading_surah') +
      line(spFor('GENEROUS', 'reading_surah')) +
      marginOf('reading_position') +
      line(spFor('GENEROUS', 'reading_position')) +
      marginOf('reading_progress') +
      PROGRESS_BAR_DP +
      marginOf('reading_progress_label') +
      line(11) +
      marginOf('reading_tail') +
      line(11);
    expect(stack).toBeLessThanOrEqual(budget(generousMin));
  });
});

describe('the sizes are reachable at all', () => {
  it('can be dragged past two rows', () => {
    const m = INFO.match(/maxResizeHeight="(\d+)dp"/);
    expect(m).not.toBeNull();
    // At 200dp the card stopped at about two rows, so "make it bigger" was
    // not something a user could do.
    expect(Number(m![1])).toBeGreaterThanOrEqual(300);
  });

  it('still starts at the size it is designed for', () => {
    expect(INFO).toContain('android:targetCellWidth="4"');
    expect(INFO).toContain('android:targetCellHeight="1"');
  });
});
