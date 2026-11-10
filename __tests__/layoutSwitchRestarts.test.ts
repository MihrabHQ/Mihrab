/**
 * Android: a change of layout (Full ↔ Minimal) is a restart, asked for
 * in the same confirm as system colours. Trading one navigator for the
 * other in a running app left Fabric's mounting broken — after Minimal
 * on and off, a tab change could die with "Unable to find view for
 * viewState" (seen on a Pixel 10 Pro, 2026-11-10, in 2.37.0 too).
 */
import fs from 'fs';
import path from 'path';

const card = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'settings', 'AppearanceCard.tsx'),
  'utf8',
);
const locales = path.join(__dirname, '..', 'src', 'i18n', 'locales');

describe('the layout switch on Android', () => {
  it('asks before it changes anything, in both directions', () => {
    const picker = card.slice(card.indexOf('testID="appearance-layout"'));
    const onChange = picker.slice(0, picker.indexOf('skyTop='));
    expect(onChange).toMatch(/else if \(Platform\.OS === 'android'\) setPendingLayout\(on\);/);
    // The immediate change is what is left for the other platforms, after it.
    expect(onChange.indexOf('setPendingLayout(on)')).toBeLessThan(
      onChange.indexOf('updateSettings({ minimalUi: on })'),
    );
  });

  it('saves the layout and restarts on confirm, and does nothing on cancel', () => {
    const modal = card.slice(card.indexOf('visible={pendingLayout !== null}'));
    const body = modal.slice(0, modal.indexOf('/>'));
    expect(body).toContain("t('settings.layoutRestartBody')");
    expect(body).toContain('applyAndRestart({ minimalUi: on })');
    expect(body).toMatch(/onCancel=\{\(\) => setPendingLayout\(null\)\}/);
  });

  it('has its question in every language', () => {
    for (const file of fs.readdirSync(locales).filter(f => f.endsWith('.json'))) {
      const strings = JSON.parse(fs.readFileSync(path.join(locales, file), 'utf8'));
      expect(typeof strings.settings.layoutRestartBody).toBe('string');
      expect(strings.settings.layoutRestartBody.length).toBeGreaterThan(20);
    }
  });
});
