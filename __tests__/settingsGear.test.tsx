/**
 * One gear, one place (v2.8.5).
 *
 * Settings used to be reachable two ways from Home: a tab, and a gear in
 * the header left over from a toolbar that also held Calendar and Compass.
 * Two answers to the same question, and on a phone the gear crowded the
 * wordmark until they overlapped.
 *
 * The tab, meanwhile, drew its own glyph — a ring with eight radial ticks
 * — which reads as a sun before it reads as settings. Both problems are
 * one problem: the app had two gears and showed the wrong one.
 *
 * These tests pin the outcome, because both regressions are invisible to
 * every other check in the suite: types, lint and the render tests all
 * pass just as happily with a burst in the tab bar and a duplicate gear
 * in the header.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import { create } from 'react-test-renderer';
import { act } from 'react';
import { Path } from 'react-native-svg';
import { SettingsGearIcon } from '../src/theme/icons';
import { SETTINGS_UNDER_DROP, SETTINGS_UNDER_LINE, SETTINGS_UNDER_RISE } from '../src/screens/home/SettingsChip';
import { MOON, SKY_CRAMPED_BELOW, STAR_FIELD_TOP, SUN_R, skyScene } from '../src/screens/home/HeroSky';
import { HERO_SCENE_MIN, HOME_TIERS } from '../src/screens/home/homeBudget';
import { SPACING } from '../src/theme/tokens';

/** The opening of Lucide's cog outline — the shared gear's own path. */
const COG_PATH_PREFIX = 'M12.22 2h-.44';

type Renderer = ReturnType<typeof create>;

/** Render the icon the way the tab bar does and hand back its paths. */
async function renderIcon(color = '#123456', size = 24) {
  let tree!: Renderer;
  await act(async () => {
    tree = create(<SettingsGearIcon color={color} size={size} />);
  });
  const ds = tree.root.findAllByType(Path).map(n => String(n.props.d ?? ''));
  return { tree, ds };
}

// Settings left the tab bar for a cog on Today (`SettingsChip`); the
// cog is still the one shared gear.
describe('the Settings gear', () => {
  it('draws the same cog the header used to', async () => {
    const { tree, ds } = await renderIcon();
    expect(ds.some(d => d.startsWith(COG_PATH_PREFIX))).toBe(true);
    tree.unmount();
  });

  it('is not the sun-burst it used to be', async () => {
    const { tree, ds } = await renderIcon();
    // The burst was eight radial ticks in one path command.
    expect(ds.some(d => d.includes('M12 2.8v2.1M12 19.1v2.1'))).toBe(false);
    tree.unmount();
  });

  it('takes the tint the tab bar hands it', async () => {
    const { tree } = await renderIcon('#123456', 31);
    const cog = tree.root
      .findAllByType(Path)
      .find(n => String(n.props.d ?? '').startsWith(COG_PATH_PREFIX));
    expect(cog?.props.stroke).toBe('#123456');
    tree.unmount();
  });
});

describe('the Home header', () => {
  // Read as source rather than rendered: LocationChip pulls in the settings
  // context, the palette and the location store, and mocking all three to
  // assert the ABSENCE of a button would test the mocks. What must not come
  // back is the import.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'navigation', 'HomeHeaderControls.tsx'),
    'utf-8',
  );

  it('no longer renders the toolbar that held the gear', () => {
    expect(source).not.toMatch(/<HeaderToolbarIcons/);
  });

  it('still carries the location chip — the one thing only it can say', () => {
    expect(source).toMatch(/<LocationChip/);
  });
});

describe("Today's way into Settings", () => {
  const chip = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'screens', 'home', 'SettingsChip.tsx'),
    'utf-8',
  );

  it('draws the shared gear, not a glyph of its own', () => {
    expect(chip).toMatch(/<SettingsGearIcon/);
  });

  it('is no longer a tab', () => {
    const tabs = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'navigation', 'MainTabs.tsx'),
      'utf-8',
    );
    expect(tabs).not.toMatch(/name="SettingsTab"/);
  });
});

/**
 * Where the cog stands on Today's two faces.
 *
 * It stood after the Qibla chip in the hero's top row, and
 * "◎ Qibla 148° ⚙" read as one chip with an icon at each end. On the full
 * page it is now under the chip; under Minimal at the row's right-hand
 * end, the heart at the left. On the RIGHT on both in every language:
 * the hero's top row does not mirror, so Settings is in one corner.
 *
 * Under the chip is where the sky used to begin: the sun, the moon and
 * the stars were laid out from the top row's foot down. So the band they
 * are laid out in begins at the cog's foot instead, and these hold that
 * — for every size the page is drawn at, and without a point of height
 * added to it.
 */
describe('the cog on the full page, under the Qibla chip', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', p), 'utf-8');
  const hero = read('HeroToday.tsx');
  const card = read('TodayCard.tsx');
  const styles = read('todayCardStyles.ts');
  const chip = read('SettingsChip.tsx');

  it('stands in the air the top row already had under it, so the page is no taller', () => {
    // The row's own bottom margin, and a drop into the band's own view: the cog's line.
    expect(styles).toMatch(/heroTopRow: \{[^}]*marginBottom: SPACING\.md[^}]*\}/s);
    expect(SETTINGS_UNDER_LINE).toBe(SPACING.md + SETTINGS_UNDER_DROP);
    const glyph = Number(/const GLYPH_UNDER = (\d+);/.exec(chip)?.[1]);
    const padTop = Number(/const UNDER_PAD_TOP = (\d+);/.exec(chip)?.[1]);
    expect(styles).toMatch(/heroCogUnder: \{ position: 'absolute', top: -SETTINGS_UNDER_RISE,/);
    expect(chip).toMatch(/under: \{\s*paddingTop: UNDER_PAD_TOP,/);
    // From the top of the band's view: the glyph's top and its foot.
    const glyphTop = -SETTINGS_UNDER_RISE + padTop;
    const glyphFoot = glyphTop + glyph;
    // It ends where its line ends…
    expect(glyphFoot).toBe(SETTINGS_UNDER_LINE - SPACING.md);
    // …and begins at the row's foot, not inside the row: the air between the chip and the cog.
    expect(glyphTop).toBe(-SPACING.md);
    expect(glyph).toBe(SETTINGS_UNDER_LINE);
  });

  it('is on the right in every language, under the chip — a physical side, said so', () => {
    expect(styles).toMatch(/\/\/ rtl-safe: [^\n]*\n\s*heroCogUnder: \{[^}]*\bright: 0, direction: 'ltr' \}/);
    expect(styles).not.toMatch(/heroCogUnder: \{[^}]*\b(start|end|left):/);
    // Left to right inside its holder, so the chip's start and end are sides.
    expect(chip).toMatch(/paddingStart: SPACING\.md \+ 2,\s*paddingEnd: SPACING\.sm,/);
    // The Qibla chip pads its words by the same `sm`: the glyph's edge is under the chip's own.
    expect(read('QiblaChip.tsx')).toMatch(/chip: \{[^}]*paddingHorizontal: SPACING\.sm/s);
  });

  it('the top row has sides, not ends: the place on the left, the Qibla on the right', () => {
    expect(styles).toMatch(/heroTopRow: \{\s*flexDirection: 'row',\s*direction: 'ltr',/);
    expect(styles).toMatch(/heroOwnRtl: \{ direction: 'rtl' \}/);
    // In the row's order: the place, the Qibla, the cog when there is no chip to stand under.
    const at = hero.indexOf('<View style={styles.heroTopRow} onLayout={onLayout}>');
    const row = hero.slice(at, hero.indexOf('</View>\n  );', at));
    const place = row.indexOf('<View style={own}>{topRow.renderLocation?.(ink)}</View>');
    const qibla = row.indexOf('{qibla ? <View style={own}>{qibla}</View> : null}');
    const cog = row.indexOf('{settingsInRow ? topRow.renderSettings?.(ink) : null}');
    expect(place).toBeGreaterThan(-1);
    expect(qibla).toBeGreaterThan(place);
    expect(cog).toBeGreaterThan(qibla);
    // What is inside a chip still reads the language's way: the app's direction, not the OS's.
    expect(hero).toContain('const own = rtl ? styles.heroOwnRtl : undefined;');
    expect(hero).toContain('settingsInRow={!cogUnder} rtl={rtl}');
    expect(hero).toContain('const rtl = isRtlLanguage(i18n.language);');
  });

  it('the sky’s band begins at its foot: nothing is laid out behind the glyph', () => {
    expect(hero).toMatch(/\+ topRowH \+ SPACING\.md \+ \(cogUnder \? SETTINGS_UNDER_LINE : 0\)/);
    // In the sky's own measure: the row's foot, then the cog's line, then the band.
    for (const tier of HOME_TIERS) {
      for (const sceneH of [HERO_SCENE_MIN[tier], 96, 160, 320]) {
        const rowFoot = 24 + SPACING.md + 40;
        const glyphFoot = rowFoot + SETTINGS_UNDER_LINE;
        const sceneTop = rowFoot + SETTINGS_UNDER_LINE;
        const sceneBottom = 180;
        // The band is the band's view less the cog's drop into it.
        const scene = skyScene({ height: sceneTop + sceneH - SETTINGS_UNDER_DROP + sceneBottom, sceneTop, sceneBottom });
        // The highest star, the moon at its highest and the sun at noon.
        expect(scene.starY(STAR_FIELD_TOP)).toBeGreaterThanOrEqual(glyphFoot);
        expect(scene.y(0.08) - MOON / 2).toBeGreaterThanOrEqual(glyphFoot);
        expect(scene.y(0.08) - SUN_R).toBeGreaterThanOrEqual(glyphFoot);
      }
    }
  });

  it('where the band used to begin, the highest star and a high moon were behind it', () => {
    // Why the band moved: laid out from the row's foot, as it was.
    const rowFoot = 24 + SPACING.md + 40;
    const glyphFoot = rowFoot + SETTINGS_UNDER_LINE;
    for (const tier of HOME_TIERS) {
      const room = SPACING.md + HERO_SCENE_MIN[tier];
      const before = skyScene({ height: rowFoot + room + 180, sceneTop: rowFoot, sceneBottom: 180 });
      expect(before.starY(STAR_FIELD_TOP)).toBeLessThan(glyphFoot);
      expect(before.y(0.08) - MOON / 2).toBeLessThan(glyphFoot);
    }
  });

  it('the smallest page still has a sky with a sun and a moon in it', () => {
    // The band is now the band's own view less the cog's drop into it —
    // the twelve points above it are the cog's too — so each tier's floor,
    // less the drop, is the room. This is what holds the drop at four.
    for (const tier of HOME_TIERS) {
      const room = HERO_SCENE_MIN[tier] - SETTINGS_UNDER_DROP;
      expect(room).toBeGreaterThanOrEqual(SKY_CRAMPED_BELOW);
      const scene = skyScene({ height: 88 + room + 180, sceneTop: 88, sceneBottom: 180 });
      expect(scene.cramped).toBe(false);
    }
  });

  it('is under the chip only where there is a chip, and never beside the iPhone’s vertical bar', () => {
    expect(card).toContain('const settingsUnder = fullBleed && !minimal && qiblaBearing != null;');
    // Both heroes — the live one and the posed twin the launch picture is drawn from.
    expect(card.match(/settingsUnder=\{settingsUnder\}/g)).toHaveLength(2);
    expect(hero).toContain("const cogUnder = settingsUnder && fill && !minimal && !vbar && !!topRow?.renderSettings;");
    // No chip (no place yet): the cog keeps the row's end.
    expect(hero).toContain('{settingsInRow ? topRow.renderSettings?.(ink) : null}');
    expect(hero).toContain('settingsInRow={!cogUnder}');
  });

  it('is a child of the band’s view, after the Track’s tap target: a touch on it is its own', () => {
    const at = hero.indexOf('{fill && cogUnder ? (');
    expect(at).toBeGreaterThan(-1);
    const band = hero.slice(at, hero.indexOf(') : fill ? (', at));
    expect(band.indexOf('<TrackExplainer')).toBeGreaterThan(-1);
    expect(band.indexOf('styles.heroCogUnder')).toBeGreaterThan(band.indexOf('<TrackExplainer'));
    expect(band).toContain('{topRow?.renderSettings?.(inkRow, true)}');
    // And it takes no touch upward, where the Qibla chip's own is.
    expect(chip).toMatch(/const UNDER_HIT_SLOP = \{ top: 0,/);
  });
});

describe('the cog under Minimal, across the row from the heart', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', p), 'utf-8');
  const hero = read('HeroToday.tsx');
  const styles = read('todayCardStyles.ts');
  const heart = read('HelpMihrabChip.tsx');

  it('the heart on the left, the cog on the right, the row’s middle between them — in every language', () => {
    // The same row as the full page's: laid out left to right whatever the app's direction.
    expect(styles).toMatch(/heroTopRow: \{\s*flexDirection: 'row',\s*direction: 'ltr',/);
    const at = hero.indexOf('<View style={styles.heroTopHeart}>');
    expect(at).toBeGreaterThan(-1);
    const row = hero.slice(at, hero.indexOf('</View>\n        ) : null', at));
    const help = row.indexOf('{topRow.renderHelp?.(inkRow, true)}');
    const gap = row.indexOf('<View style={styles.heroTopSpacer} />');
    const cog = row.indexOf('{topRow.renderSettings?.(inkRow)}');
    expect(help).toBeGreaterThan(-1);
    expect(gap).toBeGreaterThan(help);
    expect(cog).toBeGreaterThan(gap);
  });

  it('both glyphs are on the page’s edges', () => {
    // The cog pads its glyph by `xs`; the heart is 14 in a square of 30.
    expect(styles).toMatch(/heroTopCog: \{ marginEnd: -SPACING\.xs \}/);
    expect(read('SettingsChip.tsx')).toMatch(/chip: \{[^}]*padding: SPACING\.xs/s);
    expect(styles).toMatch(/heroTopHeart: \{ marginStart: -SPACING\.sm \}/);
    expect(heart).toMatch(/const SIZE = 30;/);
    expect(heart).toMatch(/width=\{14\}\s*height=\{14\}/);
    expect((30 - 14) / 2).toBe(SPACING.sm);
    expect(styles).toMatch(/heroTopSpacer: \{ flexGrow: 1, flexShrink: 1 \}/);
  });

  it('the heart holds still on the left and its line opens to the right, in Arabic as in English', () => {
    expect(read('TodayCard.tsx')).toContain('<HelpMihrabChip ink={ink} onPress={onHelpMihrab} left={left} />');
    // Heart first from the left whatever the language; elsewhere it ends its row and opens back along it.
    expect(heart).toMatch(/pillLeft: \{ flexDirection: 'row', direction: 'ltr' \}/);
    expect(heart).toMatch(/pill: \{[^}]*flexDirection: 'row-reverse'/s);
    expect(heart).toMatch(/left && styles\.pillLeft,/);
    // The line's padding is on its far side from the heart, and the measured width carries it either way.
    expect(heart).toMatch(/labelLeft: \{ paddingStart: 0, paddingEnd: 12 \}/);
    expect(heart.match(/left && styles\.labelLeft/g)).toHaveLength(2);
  });
});
