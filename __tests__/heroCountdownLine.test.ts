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
    const close = row.indexOf('</Text>\n        </Text>');
    expect(row.indexOf('pieces.minutes')).toBeGreaterThan(outer);
    expect(row.indexOf('pieces.seconds')).toBeGreaterThan(outer);
    expect(row.indexOf('pieces.seconds')).toBeLessThan(close);
  });

  it('reads in the language’s direction, hours first (#71)', () => {
    expect(row).toContain("writingDirection: rtl ? 'rtl' : 'ltr'");
  });

  it('puts the time at the far end, brought down onto the countdown’s baseline', () => {
    expect(src).toMatch(/heroCountdownRow: \{[^}]*justifyContent: 'space-between'/);
    expect(row.indexOf('{targetClock}')).toBeGreaterThan(row.indexOf('pieces.seconds'));
    expect(row).toContain('marginTop: atShift');
    expect(src).toContain('countdownBase - atBase');
  });
});
