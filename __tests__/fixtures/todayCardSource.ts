/**
 * The Today card's source, for the tests that still hold a line of it in
 * place by its text.
 *
 * The card was one file of 3,400 lines and is now five; a test that looks
 * for a line looks in all of them, in the order they stood. Said here, in
 * the open, rather than by answering a read of TodayCard.tsx with more
 * than the file (which jest.setup.js did for a while).
 *
 * New tests should not come here: test what the card does
 * (`__tests__/todayMinimal.test.tsx` renders it), not what its file says.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const HOME = join(__dirname, '..', '..', 'src', 'screens', 'home');

/** The card's files, in the order their text stood in the one file. */
export const TODAY_CARD_FILES = ['TodayCard.tsx', 'HeroToday.tsx', 'heroRail.ts', 'useHeroClock.ts', 'todayCardStyles.ts'] as const;

export function todayCardSource(): string {
  const card = readFileSync(join(HOME, 'TodayCard.tsx'), 'utf8');
  const rest = TODAY_CARD_FILES.slice(1).map(f => readFileSync(join(HOME, f), 'utf8')).join('\n');
  // The hero stood before the card's own component.
  const at = card.indexOf('\nfunction TodayCardImpl(');
  return at < 0 ? `${card}\n${rest}` : `${card.slice(0, at)}\n${rest}${card.slice(at)}`;
}
