/**
 * Tilawah's player, when the choice is open and in Arabic.
 *
 * While the "carry on, or start something new" panel is up (nothing
 * playing, or a stale listen) the player shrinks to the name and reciter,
 * with no transport, until a choice is made. And the transport and the
 * bars run left to right in every language, as media controls do.
 */
import { readFileSync } from 'fs';
import path from 'path';

const screen = readFileSync(
  path.join(__dirname, '..', 'src/screens/quran/TilawahScreen.tsx'),
  'utf8',
);

it('locks the player while the choice is open', () => {
  const i = screen.indexOf('{offerAgain ? null : (');
  expect(i).toBeGreaterThan(0);
  const after = screen.slice(i);
  // The bars, the transport and the options are all inside it.
  expect(after.indexOf('<Scrubber')).toBeGreaterThan(0);
  expect(after.indexOf('style={styles.transport}')).toBeGreaterThan(0);
  expect(after.indexOf('style={styles.optionsRow}')).toBeGreaterThan(0);
  expect(after.indexOf('<Scrubber')).toBeLessThan(after.indexOf('<ListenAgainPanel'));
});

it('keeps the transport and the bars left to right', () => {
  expect(screen).toMatch(/transport: \{[\s\S]{0,600}direction: 'ltr',\s*flexDirection: 'row'/);
  expect(screen).toMatch(/scrubTouch: \{ height: 28, justifyContent: 'center', direction: 'ltr' \}/);
  expect(screen).toMatch(/scrubTouchMinor: \{ height: 18, justifyContent: 'center', direction: 'ltr' \}/);
});
