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
import { SETTINGS_GLYPH, SETTINGS_GLYPH_STROKE } from '../src/screens/home/SettingsChip';
import { SKY_CRAMPED_BELOW } from '../src/screens/home/HeroSky';
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
 * On the full page it is at the row's right-hand end, after the Qibla
 * chip and on the row's own line. It stood there first; then, because
 * "◎ Qibla 148° ⚙" read as one chip with an icon at each end, it was put
 * under the chip on a line of its own — where, on a phone, it hung by
 * itself below everything else at the page's top. It is back on the
 * line, beside the Qibla, with the row's gap between them.
 * Under Minimal it is at the row's right-hand end, the heart at the
 * left. On the RIGHT on both in every language: the hero's top row does
 * not mirror, so Settings is in one corner.
 */
describe('the cog on the full page, at the row’s right-hand end beside the Qibla chip', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', p), 'utf-8');
  const hero = read('HeroToday.tsx');
  const card = read('TodayCard.tsx');
  const styles = read('todayCardStyles.ts');
  const chip = read('SettingsChip.tsx');

  it('the place on the left; then the Qibla chip and the cog, in that order, at the right', () => {
    const at = hero.indexOf('<View style={styles.heroTopRow} onLayout={onLayout}>');
    const row = hero.slice(at, hero.indexOf('</View>\n  );', at));
    const place = row.indexOf('<View style={own}>{topRow.renderLocation?.(ink)}</View>');
    const placeEnd = row.indexOf('</View>\n      </View>', place);
    const qibla = row.indexOf('{qibla ? <View style={own}>{qibla}</View> : null}');
    const cog = row.indexOf('{topRow.renderSettings?.(ink)}');
    expect(place).toBeGreaterThan(-1);
    // The Qibla chip is not in the place's group: it is the row's own child, as the cog is.
    expect(qibla).toBeGreaterThan(placeEnd);
    expect(cog).toBeGreaterThan(qibla);
    // The place's group takes the row's width, which is what puts the other two at the far end,
    // and the row's own gap is what stands between the chip and the cog.
    expect(styles).toMatch(/heroTopLeading: \{\s*flexShrink: 1,\s*flexGrow: 1,\s*alignItems: 'flex-start',/);
    expect(styles).toMatch(/heroTopRow: \{[^}]*gap: SPACING\.md,/s);
  });

  it('is on the row’s own line: no line of its own under the chip, and nothing rising out of the sky’s band', () => {
    for (const src of [hero, card, styles, chip]) {
      expect(src).not.toMatch(/cogUnder|settingsUnder|heroCogUnder|SETTINGS_UNDER|GLYPH_UNDER/);
    }
    // The sky's band begins at the row's foot again, with the row's own margin under it.
    expect(hero).toMatch(/\+ topRowH \+ SPACING\.md\n\s*: 0;/);
    // And the cog is the size it is under Minimal: one cog, one size on the sky.
    expect(chip).toMatch(/size=\{column \? 20 : GLYPH\} strokeWidth=\{SETTINGS_GLYPH_STROKE\}/);
  });

  it('the top row has sides, not ends: the place on the left, the Qibla and the cog on the right, in every language', () => {
    expect(styles).toMatch(/heroTopRow: \{\s*flexDirection: 'row',\s*direction: 'ltr',/);
    expect(styles).toMatch(/heroOwnRtl: \{ direction: 'rtl' \}/);
    // What is inside a chip still reads the language's way: the app's direction, not the OS's.
    expect(hero).toContain('const own = rtl ? styles.heroOwnRtl : undefined;');
    expect(hero).toContain('<HeroTopRow topRow={topRow} ink={inkRow} rtl={rtl}');
    expect(hero).toContain('const rtl = isRtlLanguage(i18n.language);');
  });

  it('is there with or without a place: the same corner before a Qibla chip exists', () => {
    expect(card).toContain('onOpenSettings ? <SettingsChip ink={ink} onPress={onOpenSettings} /> : null;');
    // Beside the iPhone's vertical bar the column has it, and the row is not drawn.
    expect(hero).toContain(') : topRow && fill && vbar ? null : topRow ? (');
  });

  it('the smallest page still has a sky with a sun and a moon in it', () => {
    for (const tier of HOME_TIERS) expect([tier, HERO_SCENE_MIN[tier] >= SKY_CRAMPED_BELOW]).toEqual([tier, true]);
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

  it('the heart is drawn as the cog is: its size, its line, the sky’s full ink', () => {
    // A small grey heart across from a larger white cog read as two things of different standing.
    expect(heart).toContain('<Heart color={ink.text} size={SETTINGS_GLYPH} strokeWidth={SETTINGS_GLYPH_STROKE} />');
    expect(read('SettingsChip.tsx')).toMatch(/size=\{column \? 20 : GLYPH\} strokeWidth=\{SETTINGS_GLYPH_STROKE\}/);
    expect(read('SettingsChip.tsx')).toContain('export const SETTINGS_GLYPH = GLYPH;');
    expect(SETTINGS_GLYPH).toBe(18);
    expect(SETTINGS_GLYPH_STROKE).toBe(1.8);
    // On the eyebrow's line, beside muted words, it is what it was.
    expect(heart).toContain('<Heart color={ink.muted} />');
    expect(heart).toMatch(/const HEART = 14;\s*const HEART_STROKE = 2\.2;/);
    // The words that open from it stay muted in both places.
    expect(heart).toContain('{ color: ink.muted, width: lineW + LINE_PAD }');
  });

  it('both glyphs are as far from the page’s edges, and on one line', () => {
    // The cog pads its glyph by `xs`, which its margin takes back: its box is on the edge.
    expect(styles).toMatch(/heroTopCog: \{ marginEnd: -SPACING\.xs \}/);
    expect(read('SettingsChip.tsx')).toMatch(/chip: \{[^}]*padding: SPACING\.xs/s);
    // The heart fills its box from side to side and the cog does not, so its box stands 1 inside the edge.
    expect(styles).toMatch(/heroTopHeart: \{ marginStart: -\(SPACING\.xs \+ 1\) \}/);
    expect(heart).toMatch(/const SIZE = 30;/);
    expect((30 - SETTINGS_GLYPH) / 2 - (SPACING.xs + 1)).toBe(1);
    // Each centred in its own box, and the boxes centred in the row.
    expect(styles).toMatch(/heroTopRow: \{[^}]*alignItems: 'center'/s);
    expect(heart).toMatch(/icon: \{\s*width: SIZE,\s*height: SIZE,\s*alignItems: 'center',\s*justifyContent: 'center',/);
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
