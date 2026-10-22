/**
 * The two pages of a spread stand level. The facing page's header row
 * ('none') draws nothing, and it used to be its padding alone — a line
 * shorter than the row with the label over the other page, so the page
 * under the label sat that much lower across the gutter.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('a spread keeps its two pages level', () => {
  it("gives the empty header row the label's line, unseen", () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/show === 'none' \? \(\s*<Text[\s\S]{0,200}styles\.pageHeaderText, styles\.pageHeaderGhost/);
    expect(core).toMatch(/pageHeaderGhost: \{ opacity: 0 \}/);
  });

  it("gives the facing page the lock badge's height too, in fullscreen", () => {
    const spread = read('src/quran/MushafSpreadReader.tsx');
    expect(spread).toMatch(/lock=\{isFullscreen && chrome !== 'pill' \? lock : null\}/);
    expect(read('src/quran/mushafReaderCore.tsx')).toMatch(
      /testID=\{show === 'none' \? undefined : 'mushaf-lock-badge'\}/,
    );
  });
});
