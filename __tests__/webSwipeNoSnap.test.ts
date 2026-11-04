/**
 * Mihrab Web under a finger turns the muṣḥaf's page by `useWebSwipePaging`,
 * which moves the list with a smooth scroll. With CSS scroll snapping still
 * on, Safari (and Chrome, which on iOS is Safari) re-snapped the list to
 * the page being left while that scroll was on its way: the page counter
 * said 3, the page still showed 2 (reported 2026-11-04).
 *
 * So wherever the finger turns the page, the list has no snapping.
 */
import { readFileSync } from 'fs';
import path from 'path';

const read = (f: string) =>
  readFileSync(path.join(__dirname, '..', 'src/quran', f), 'utf8');

describe('the muṣḥaf pager in a touch browser', () => {
  it.each(['MushafPhoneReader.tsx', 'MushafSpreadReader.tsx'])(
    '%s snaps only when the finger does not turn the page',
    file => {
      const src = read(file);
      expect(src).toMatch(/const swipe = useWebSwipePaging\(/);
      expect(src).toMatch(/pagingEnabled=\{!swipe\}/);
      expect(src).not.toMatch(/^\s*pagingEnabled\s*$/m);
    },
  );
});
