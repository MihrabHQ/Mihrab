/**
 * The muṣḥaf header: the riwayah beside the back arrow, audio with the
 * view controls on the right. The right side had grown to four controls;
 * the left held only the arrow.
 */
import { readFileSync } from 'fs';
import path from 'path';

const src = readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'quran', 'MushafSurahScreen.tsx'),
  'utf8',
);
const left = src.slice(src.indexOf('headerLeft: () =>'), src.indexOf('headerRight: () =>'));
const right = src.slice(src.indexOf('headerRight: () =>'));

describe('the muṣḥaf header', () => {
  it('puts the riwayah beside the back arrow, and over the page while the index is up', () => {
    // The two controls are made once and placed by the header's two forms.
    expect(src).toMatch(/const backButton = navigation\.canGoBack\(\) \? \(\s*<TabBackButton/);
    // Always there, not only once a second muṣḥaf is installed: the picker
    // it opens is how a reader learns there are others.
    expect(src).toContain('const riwayahChip = (');
    expect(src).not.toContain('riwayahChoiceExists');
    expect(src).toMatch(/<RiwayahIcon color=\{ink\} size=\{desktopSize\(22\)\}/);
    expect(left).toMatch(/\{backButton\}\s*\{riwayahChip\}/);
    // With the index up (Mac, iPad), the pill stands at the page's leading
    // edge: the arrow, a fixed space the index's width, then the pill.
    expect(left).toMatch(/unstable_headerLeftItems:\s*Platform\.OS === 'ios' && sidebarUp && riwayahChip/);
    expect(left).toContain('SIDEBAR_WIDTH - RIWAYAH_PAST_INDEX');
    expect(left.indexOf('{backButton}</View>')).toBeLessThan(left.indexOf('{riwayahChip}</View>'));
  });

  it('keeps audio on the right, where the riwayah was, before the page tone and fullscreen', () => {
    expect(right).not.toContain('riwayahChip');
    expect(left).not.toContain('<TilawahIcon');
    expect(right).toContain('<TilawahIcon');
    expect(right.indexOf('<TilawahIcon')).toBeLessThan(right.indexOf('<MushafToneHeaderButton color={ink}'));
    // The phone's fullscreen is in its page bar; the spread reader, which
    // has none, has it here, last.
    expect(right).toMatch(/deviceClass !== 'phone' \? \(\s*<MushafFullscreenHeaderButton color=\{ink\}[^>]*onPress=\{toggleFullscreen\}/);
    expect(right.indexOf('<MushafToneHeaderButton color={ink}')).toBeLessThan(right.indexOf('<MushafFullscreenHeaderButton'));
  });

  it("draws the arrow only when there is somewhere to go back to, in the page's ink", () => {
    expect(src).toMatch(/navigation\.canGoBack\(\) \? \(\s*<TabBackButton[\s\S]{0,120}color=\{ink\}/);
  });
});
