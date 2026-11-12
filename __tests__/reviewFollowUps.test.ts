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
    // And a capture is never kept waiting for the picture: the wait is the screen's.
    expect(view).toContain('if (!cached && canvas.isHardwareAccelerated) {');
  });

  /**
   * Opening the reader held one frame for 179 ms on a Pixel 10 Pro: the
   * render thread rasterising every word of the page as a path, because a
   * line with no picture yet drew itself directly.
   */
  it('waits for its picture, briefly, rather than draw itself on the page’s first frames', () => {
    expect(view).toContain('private const val INK_WAIT_MS = 250L');
    const draw = view.slice(view.indexOf('override fun onDraw'), view.indexOf('private fun inkOf'));
    expect(draw).toMatch(/if \(now - waitingSince < INK_WAIT_MS\) \{[\s\S]*?postInvalidateDelayed\([\s\S]*?return\s*\}\s*\}\s*drawLine\(canvas, line, uiPens, 0f\)/);
    // Its own older picture only: the same words, the same size.
    expect(draw).toContain('cacheInk == inkOf(line) && cacheWidth == width && cacheHeight == height');
    // A paint that failed ends the wait.
    expect(view).toMatch(/if \(gen == generation\) \{\s*waitingSince = 1L\s*invalidate\(\)/);
    // And the picture arriving, or the view leaving, resets it.
    expect(view.match(/waitingSince = 0L/g)!.length).toBeGreaterThanOrEqual(3);
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
