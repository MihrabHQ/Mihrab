import { readFileSync } from 'fs';
import path from 'path';
import { enteringMinimal, minimalLook } from '../src/settings/minimalLook';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('Minimal wears the classic colours', () => {
  const base = { minimalUi: false, tintedSurfaces: true, useSystemDynamicTheme: true, other: 1 };

  it('leaves the colours alone without Minimal', () => {
    expect(minimalLook(base)).toBe(base);
  });

  it('takes the colour theme and the system colours off under Minimal', () => {
    expect(minimalLook({ ...base, minimalUi: true })).toEqual({
      minimalUi: true,
      tintedSurfaces: false,
      useSystemDynamicTheme: false,
      other: 1,
    });
    const classic = { ...base, minimalUi: true, tintedSurfaces: false, useSystemDynamicTheme: false };
    expect(minimalLook(classic)).toBe(classic);
  });

  it('holds on every write, on every read, and in the pickers', () => {
    expect(read('src/context/PrayerSettingsContext.tsx')).toContain(
      'const next = minimalLook(enteringMinimal(prev, applyLocationProviders(prev, patch)));',
    );
    expect(read('src/screens/settings/AppearanceCard.tsx')).toContain(
      'const next = minimalLook(enteringMinimal(fullSettings, { ...fullSettings, ...patch }));',
    );
    expect(read('src/settings/storage.ts')).toContain('return noteSecureRead(minimalLook(merged), secureFailed);');
    const card = read('src/screens/settings/AppearanceCard.tsx');
    expect(card).toContain('{!dynamicColorsActive && !skyActive && !minimalActive && (');
    expect(card).toContain('disabled={verdantActive || minimalActive}');
    expect(card).toContain('const minimalActive = minimalOffered && minimalOn(settings);');
    expect(card).toContain('if (on && dynamicColorsActive) setPendingMinimal(true);');
    expect(read('src/onboarding/screens/PersonaliseScreen.tsx')).toContain(
      '{dynamicColours || skyActive || minimalActive ? null : (',
    );
  });

  it('comes on in the Vibrant sky, and Classic stays a choice after', () => {
    const off = { minimalUi: false, appearance: 'light', skyVariant: 'realistic' };
    expect(enteringMinimal(off, { ...off, minimalUi: true })).toEqual({
      minimalUi: true,
      appearance: 'sky',
      skyVariant: 'vibrant',
    });
    // Already on: a later choice of Classic (light, dark, system) holds.
    const on = { minimalUi: true, appearance: 'dark', skyVariant: 'realistic' };
    expect(enteringMinimal(on, on)).toBe(on);
    // Turning it off changes nothing.
    expect(enteringMinimal(on, { ...on, minimalUi: false })).toEqual({ ...on, minimalUi: false });
  });
});

describe('Minimal is not offered on the Mac', () => {
  it('reads as off there, for the app and the colour rules alike', () => {
    jest.resetModules();
    jest.doMock('../src/responsive/breakpoints', () => ({ isMacCatalyst: true }));
    const m = require('../src/settings/minimalLook');
    expect(m.MINIMAL_OFFERED).toBe(false);
    expect(m.minimalOn({ minimalUi: true })).toBe(false);
    const s = { minimalUi: true, tintedSurfaces: true, useSystemDynamicTheme: false, appearance: 'light', skyVariant: 'realistic' };
    // A colour theme stays a colour theme; turning it on changes no theme.
    expect(m.minimalLook(s)).toBe(s);
    expect(m.enteringMinimal({ minimalUi: false }, s)).toBe(s);
    jest.dontMock('../src/responsive/breakpoints');
  });

  it('hides the switch and the walkthrough choice there, and every reader asks the one rule', () => {
    expect(read('src/navigation/tabBarInset.ts')).toMatch(/const offered = useMinimalOffered\(\);\s*const asked = useAppearanceSettings\(\)\.slice\.minimalUi;\s*return offered && asked;/);
    // Settings offers the walkthrough's two pictures, not a switch.
    const card = read('src/screens/settings/AppearanceCard.tsx');
    expect(card).toMatch(/\{minimalOffered \? \(\s*<SettingsBlock>[\s\S]{0,200}onboarding\.personalise\.layout[\s\S]{0,100}<LayoutPicker\s*testID="appearance-layout"/);
    expect(card).not.toMatch(/<SettingsToggleRow\s*title=\{t\('settings\.minimalUi'\)\}/);
    expect(read('src/onboarding/screens/PersonaliseScreen.tsx')).toMatch(/\{minimalOffered && !settings\.useSystemDynamicTheme \? \(\s*<SettingsBlock>[\s\S]{0,200}onboarding\.personalise\.layout/);
    expect(read('src/screens/home/TodayCard.tsx')).toContain("{settings.showDataStats && minimalOffered && !settings.useSystemDynamicTheme ? (");
    // Nor beside an iPhone's vertical bar, where Minimal stands down.
    expect(read('src/settings/useMinimalOffered.ts')).toContain('return MINIMAL_OFFERED && !vbar;');
    expect(read('src/screens/HomeScreen.tsx')).toContain('const minimal = minimalUi && !isDashboard && !isRoomy && !book;');
    // Never turned off for another device's sake: the setting travels.
    expect(card).not.toContain('updateSettings({ minimalUi: false })');
    expect(read('src/screens/QuranScreen.tsx')).toContain('const minimal = useMinimalUi();');
  });
});
