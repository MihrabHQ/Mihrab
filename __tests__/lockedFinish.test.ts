/**
 * #113: the reading lock does not stand in front of "Finish today's
 * reading". A reader turning pages with the volume buttons reaches the
 * end of the day's portion still locked; the finish pill answers there,
 * and the rest of the page stays locked.
 */
import { readFileSync } from 'fs';
import path from 'path';

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('the finish pill on a locked page (#113)', () => {
  it('finishes the portion whatever the lock says, in both readers', () => {
    for (const file of ['src/quran/MushafPhoneReader.tsx', 'src/quran/MushafSpreadReader.tsx']) {
      const src = read(file);
      expect(src).toContain('onPress: finishKhatmahPortion,');
      expect(src).not.toContain('locked ? () => undefined : finishKhatmahPortion');
      // The page number's door, beside it, stays behind the lock.
      expect(src).toContain('onPress={locked ? () => undefined : onOpenJump}');
    }
  });

  it('is not taken for a touch the lock refused', () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    const pill = core.slice(core.indexOf('onPress={finish.onPress}'), core.indexOf('styles.finishPill'));
    expect(pill).toContain('onTouchStart={e => e.stopPropagation()}');
  });
});
