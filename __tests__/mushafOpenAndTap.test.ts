/**
 * Opening the muṣḥaf and tapping an ayah, measured on a Pixel 10 Pro on
 * 2026-11-24 (tools/startup-trace/interaction.sh) after a report that the
 * page was seen loading in and a tap took far too long to answer:
 *
 *   - a tap held the JavaScript thread 540 ms, 320 of them in one
 *     `localeCompare` (the reciter list, sorted twice) and 80 decoding the
 *     whole-surah tables with a search per character;
 *   - the tapped ayah was not marked until the whole sheet had rendered;
 *   - a page's lines were painted two at a time on background threads, in
 *     among the neighbour pages' lines, and each shown as it came.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { RECITERS, searchReciters, sortedReciters } from '../src/quran/audio/reciters';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the reciter list is put in order without the platform’s collator', () => {
  it('in the order the collator gave', () => {
    const collated = [...RECITERS]
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .map(r => r.name);
    expect(sortedReciters(RECITERS).map(r => r.name)).toEqual(collated);
  });

  it('with the reader’s own reading still first, each group in that order', () => {
    const warsh = sortedReciters(RECITERS, 'warsh');
    const firstOther = warsh.findIndex(r => (r.riwayah ?? 'hafs') !== 'warsh');
    expect(firstOther).toBeGreaterThan(0);
    expect(warsh.slice(firstOther).some(r => r.riwayah === 'warsh')).toBe(false);
    expect(searchReciters('', RECITERS).map(r => r.id)).toEqual(sortedReciters(RECITERS).map(r => r.id));
  });

  it('and nothing in the sort calls localeCompare', () => {
    const src = read('src/quran/audio/reciters.ts');
    const fn = src.slice(src.indexOf('export function sortedReciters'), src.indexOf(' * A name as the alphabet compares it'));
    expect(fn).not.toMatch(/localeCompare\(/);
    expect(src).toMatch(/const alphabetKeys = new Map<string, string>\(\)/);
  });
});

describe('the whole-surah tables are decoded by a table, not a search', () => {
  it('six bits a character by its code', () => {
    const src = read('src/quran/audio/surahRecitation.ts');
    expect(src).toContain('B64_VALUE[clean.charCodeAt(i)]');
    expect(src).not.toMatch(/\| B64\.indexOf\(/);
  });
});

describe('the mark on the page is drawn before the sheet is mounted', () => {
  it('the readers give the sheet the deferred selection', () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toContain('const sheetSelected = useDeferredValue(selected);');
    expect(core).toContain('const sheetShown = useDeferredValue(sheetVisible);');
    expect(core).toContain('const sheetAudio = useDeferredValue(sheetScrollAudio);');
    for (const f of ['src/quran/MushafPhoneReader.tsx', 'src/quran/MushafSpreadReader.tsx']) {
      const src = read(f);
      const sheet = src.slice(src.indexOf('{core.sheetSelected ? ('), src.indexOf('<MiniPlayer'));
      expect(sheet).toContain('visible={core.sheetShown}');
      expect(sheet).toContain('surah={core.sheetSelected.surah}');
      expect(sheet).toContain('scrollToAudio={core.sheetAudio}');
      // The page's own mark still reads the urgent values.
      expect(src).not.toMatch(/<AyahActionSheet\s+visible=\{core\.sheetVisible\}/);
    }
  });
});

describe('Android: a page’s lines', () => {
  const view = read('android/app/src/main/java/com/prayer_times/MushafLineView.kt');

  it('are painted on-screen first, at the app’s priority; off-screen ones at background priority', () => {
    expect(view).toContain('val onScreen = isShown && getGlobalVisibleRect(visibleProbe)');
    expect(view).toContain('PAINTERS.execute(PaintJob(onScreen) {');
    expect(view).toMatch(/if \(onScreen\) android\.os\.Process\.THREAD_PRIORITY_DEFAULT\s*else android\.os\.Process\.THREAD_PRIORITY_BACKGROUND/);
    expect(view).toMatch(/if \(onScreen != other\.onScreen\) \(if \(onScreen\) -1 else 1\) else order\.compareTo\(other\.order\)/);
    expect(view).toContain('java.util.concurrent.PriorityBlockingQueue<Runnable>()');
    expect(view).toContain('(Runtime.getRuntime().availableProcessors() - 2).coerceIn(2, 4)');
  });

  it('appear together: a line with nothing to show waits for the rest of its page, never longer than the ink wait', () => {
    expect(view).toContain('val joined: Reveal? = if (firstInk) Reveal.join(fontFamily, this) else null');
    const draw = view.slice(view.indexOf('override fun onDraw'), view.indexOf('private fun inkOf'));
    expect(draw).toMatch(/val left = INK_WAIT_MS - \(android\.os\.SystemClock\.uptimeMillis\(\) - r\.since\)\s*if \(r\.pending > 0 && left > 0\) \{\s*postInvalidateDelayed\(left \+ 1\)\s*return/);
    // Counted out exactly once per job, on the main looper — not `post`,
    // which a view that has left the window never runs.
    expect(view).toMatch(/MAIN\.post \{\s*joined\?\.done\(\)/);
    expect(view).not.toMatch(/\n\s+post \{/);
    // A view that leaves stops waiting.
    const detach = view.slice(view.indexOf('override fun onDetachedFromWindow'), view.indexOf('override fun onDraw'));
    expect(detach).toContain('reveal = null');
  });

  it('a line with an older picture of the same words never waits', () => {
    expect(view).toContain('if (!cached && pendingGeneration != generation) paintInBackground(line, !standIn)');
  });
});

describe('the profile that found these can be taken again', () => {
  it('MainActivity samples the running app when asked to, and only then', () => {
    const activity = read('android/app/src/main/java/com/prayer_times/MainActivity.kt');
    expect(activity).toMatch(/override fun onNewIntent[\s\S]*?if \(intent\.getBooleanExtra\("mihrab\.profile", false\)\) \{\s*profileFor\(/);
    expect(read('tools/startup-trace/interaction.sh')).toContain('--ez mihrab.profile true --ei mihrab.profileMs');
  });
});
