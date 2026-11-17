/**
 * Today's notices, floating under the status bar on a phone, end where the
 * page does beside the Duo's vertical bar — not under the column, where a
 * notice's Dismiss sat under the camera and the bar's clock. Off the Duo
 * nothing changes (AGENTS.md §8: `vbar ? <new> : <exactly what was there>`).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const home = readFileSync(join(__dirname, '..', 'src/screens/HomeScreen.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe("Today's floating notices beside the vertical bar", () => {
  const block = /styles\.floatingNotices,([\s\S]*?)\]\}>/.exec(home)?.[1] ?? '';

  it('take the bar’s width on the bar’s side, and only there', () => {
    expect(block).toMatch(
      /vbar\s*\?\s*vbar\.side === 'right'\s*\?\s*\{ right: HOME_SCREEN_PADDING \+ vbar\.width \}\s*:\s*\{ left: HOME_SCREEN_PADDING \+ vbar\.width \}\s*:\s*null/,
    );
  });

  it('keep the shared style as it was for every other device', () => {
    const style = /floatingNotices: \{([\s\S]*?)\}/.exec(home)?.[1] ?? '';
    expect(style).toMatch(/left: HOME_SCREEN_PADDING,/);
    expect(style).toMatch(/right: HOME_SCREEN_PADDING,/);
  });
});
