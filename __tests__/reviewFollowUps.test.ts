/**
 * Follow-ups from a review of the muṣḥaf line cache, the layout warm-up
 * and the khatmah page's link.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('the muṣḥaf line cache', () => {
  const view = read('android/app/src/main/java/com/prayer_times/MushafLineView.kt');

  it('never draws a HARDWARE bitmap on a software canvas', () => {
    expect(view).toContain(
      'if (cached && (canvas.isHardwareAccelerated || !isHardwareBitmap(bitmap!!))) {',
    );
    // Drawn directly then, without queueing another paint of a line it has.
    expect(view).toContain('if (!cached && pendingGeneration != generation) paintInBackground(line)');
  });

  it('frees the slot when a paint fails, so a later frame tries again', () => {
    expect(view).toMatch(/if \(painted == null\) \{\s*(\/\/[^\n]*\n\s*)*if \(pendingGeneration == gen\) pendingGeneration = -1/);
  });
});

describe('warming the layout', () => {
  it('warms the file the reader will decode from — the tajwīd one for a tajwīd reader', () => {
    const layout = read('src/quran/mushafLayout.ts');
    expect(layout).toMatch(/if \(tajweed\) loadRawV4\(\);\s*else loadRaw\(\);/);
    expect(read('src/screens/QuranScreen.tsx')).toContain('warmMushafLayout(riwayahForWarm, tajweedForWarm)');
    expect(read('src/screens/home/QuranCard.tsx')).toContain('warmMushafLayout(riwayah, tajweed)');
  });
});

describe('the khatmah page, opened over a running plan', () => {
  it('goes back when it can, and to the Qur’an tab when nothing is under it', () => {
    const screen = read('src/screens/quran/KhatmahScreen.tsx');
    expect(screen).toMatch(/if \(navigation\.canGoBack\(\)\) navigation\.goBack\(\);/);
    expect(screen).toContain("StackActions.replace('Home', { screen: 'QuranTab' })");
  });
});
