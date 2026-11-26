/**
 * The town in the location chip is asked for in the app's language and kept
 * while the phone stays put. A change of language has to drop what was kept
 * and ask again, or the chip names the town in the language left behind.
 */
import { readFileSync } from 'fs';
import path from 'path';

const hook = readFileSync(path.join(__dirname, '../src/hooks/usePrayerDay.ts'), 'utf-8');

describe('the place name follows the app language', () => {
  it('a language change drops the kept name and looks the place up again', () => {
    const at = hook.indexOf("i18n.on('languageChanged', onLanguage)");
    expect(at).toBeGreaterThan(-1);
    const effect = hook.slice(hook.lastIndexOf('useEffect(', at), at);
    expect(effect).toContain('lastGeocodeRef.current = null;');
    expect(effect).toContain('requestAndLoad(true);');
    expect(hook).toContain("i18n.off('languageChanged', onLanguage)");
  });

  it('a place chosen by hand keeps the name it was chosen under', () => {
    const at = hook.indexOf("i18n.on('languageChanged', onLanguage)");
    const effect = hook.slice(hook.lastIndexOf('useEffect(', at), at);
    expect(effect).toContain("if (liveModeRef.current === 'manual') return;");
  });
});
