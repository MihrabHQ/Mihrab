/**
 * The hero's countdown is one line on one baseline, and the time it counts
 * to stands at the other end of the row, over that prayer's name on the
 * rail, on the same baseline.
 *
 * Three Text views aligned on 'baseline' let the seconds ride high beside
 * the figures on both platforms; spans of one Text cannot.
 */
import { readFileSync } from 'fs';
import path from 'path';

const src = readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'TodayCard.tsx'), 'utf8');
// The row's opening: centred under Minimal (settings.minimalUi), else as it was.
const ROW_OPEN = '<View style={[styles.heroCountdownRow, minimal && styles.heroCountdownRowMinimal]}>';
const row = src.slice(src.indexOf(ROW_OPEN), src.indexOf('{rail ? (', src.indexOf(ROW_OPEN)));

describe('the hero countdown', () => {
  it('sets hours, minutes and seconds as spans of one Text', () => {
    const outer = row.indexOf('onTextLayout={onCountdownLine}');
    expect(outer).toBeGreaterThan(-1);
    // The figures and the seconds are nested inside it, before it closes.
    const close = row.indexOf(') : null}\n        </Text>');
    expect(close).toBeGreaterThan(-1);
    expect(row.indexOf('{pieces.m}')).toBeGreaterThan(outer);
    expect(row.indexOf('{pieces.s}')).toBeGreaterThan(outer);
    expect(row.indexOf('{pieces.s}')).toBeLessThan(close);
  });

  it('sets the units apart from the figures, and shows the seconds only close in', () => {
    // Each unit a span of its own: smaller, the muted ink, on the baseline.
    expect(row).toContain('<Text style={unitStyle}>{units.hour}</Text>');
    expect(row).toContain('<Text style={unitStyle}>{units.minute}</Text>');
    expect(row).toContain('<Text style={secondsUnitStyle}>{units.second}</Text>');
    expect(src).toContain('const UNIT_EM = 0.4;');
    // The seconds: the last hour on the full page, the last minutes under Minimal.
    expect(src).toContain('const showSeconds = minimal ? shownRemaining < MINIMAL_SECONDS_UNDER : pieces.h === 0;');
    expect(row).toContain('{showSeconds ? (');
  });

  it('reads in the language’s direction, hours first (#71)', () => {
    expect(row).toContain("writingDirection: rtl ? 'rtl' : 'ltr'");
  });

  it('puts the time at the far end, brought down onto the countdown’s baseline', () => {
    expect(src).toMatch(/heroCountdownRow: \{[^}]*justifyContent: 'space-between'/);
    expect(row.indexOf('{targetClock}')).toBeGreaterThan(row.indexOf('{pieces.s}'));
    expect(row).toContain('marginTop: atShift');
    expect(src).toContain('countdownBase - atBase');
  });
});
