/**
 * The always-on display: the next prayer's name must show whole.
 *
 * On a Pixel (Android 17) the card's title box on the always-on display
 * kept the width of an EARLIER name: "Dhuhr" drawn in the width "Fajr" had
 * been, reading "D…". That box is the system's, so on the always-on display
 * the name is a metric's label instead — the metrics are fixed-width
 * columns — and the title is the app's name, which never changes width.
 */
import { readFileSync } from 'fs';
import path from 'path';

const KT = path.join(__dirname, '..', 'android/app/src/main/java/com/prayer_times');
const module_ = readFileSync(path.join(KT, 'MihrabLiveActivityModule.kt'), 'utf8');
const service = readFileSync(path.join(KT, 'MihrabLiveActivityService.kt'), 'utf8');

describe('the name on the always-on display', () => {
  it('is the label over its own time, not the title', () => {
    expect(module_).toMatch(/val nameAsMetricLabel = ambient && secondMetric == "time"/);
    expect(module_).toMatch(/else -> name\s*\n\s*\}/);
    expect(module_).toMatch(
      /tryBuildCountdownMetricStyle\(\s*nextEpochMs, inWord, secondMetric, metricAtWord, metricAtText,/,
    );
  });

  it('leaves a title that never changes width', () => {
    expect(module_).toMatch(
      /if \(hasSecond && nameAsMetricLabel\) \{\s*builder\.setContentTitle\(appLabel\(ctx\)\)/,
    );
  });

  it('just after a prayer, says "<prayer> / Now" there too, and wakes to take it down', () => {
    expect(module_).toMatch(/arrivedTitle != null -> arrivedLabel/);
    expect(module_).toMatch(/if \(nameAsMetricLabel && arrivedTitle != null\) nowWord else atText/);
    expect(service).toMatch(/now - prev in 0 until ARRIVED_MS\) return prev \+ ARRIVED_MS - now \+ 500L/);
  });
});
