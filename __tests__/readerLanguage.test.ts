/**
 * A process with no screen speaks the reader's language before it writes
 * or reads a notification (src/i18n/readerLanguage.ts). The snooze
 * choices are read back by their label, so a Swedish "last chance",
 * compared with the English label, was taken for a plain snooze.
 */
import { readFileSync } from 'fs';
import path from 'path';
import i18n from '../src/i18n';
import { applyReaderLanguage } from '../src/i18n/readerLanguage';
import { isLastChanceChoice, lastChanceLabel } from '../src/notifications/prayerAlertActions';

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('the reader’s language, without a screen', () => {
  afterEach(async () => {
    await applyReaderLanguage({ language: 'en', madhab: null });
  });

  it('switches to the reader’s language and reads their choice back in it', async () => {
    await applyReaderLanguage({ language: 'sv', madhab: null });
    expect(i18n.language).toBe('sv');
    const swedish = lastChanceLabel('Asr');
    expect(swedish).not.toBe('');
    expect(isLastChanceChoice(swedish, 'Asr')).toBe(true);
    // The fault: in English, the same Swedish label was not recognised.
    await applyReaderLanguage({ language: 'en', madhab: null });
    expect(isLastChanceChoice(swedish, 'Asr')).toBe(swedish === lastChanceLabel('Asr'));
  });

  it('names dawn Ṣubḥ under Mālikī there too', async () => {
    await applyReaderLanguage({ language: 'en', madhab: 'maliki' });
    expect(i18n.t('prayer.Fajr')).toBe(i18n.t('prayer.Subh'));
    await applyReaderLanguage({ language: 'en', madhab: null });
    expect(i18n.t('prayer.Fajr')).toBe('Fajr');
  });

  it('runs at every entry point that has no screen, before the work', () => {
    expect(read('src/notifications/adhanMute.ts')).toMatch(/if \(!Number\.isFinite\(epoch\)[^\n]*\n[^\n]*\n[^\n]*\n\s*await applyReaderLanguage\(\);/);
    expect(read('src/notifications/prayerAlarmTask.ts')).toMatch(/await applyReaderLanguage\(\);\s*const notification = notificationFromTask\(raw\);/);
    const bg = read('src/notifications/adhanSafetyControls.ts');
    expect(bg.indexOf('await applyReaderLanguage()')).toBeGreaterThan(-1);
    expect(bg.indexOf('await applyReaderLanguage()')).toBeLessThan(bg.indexOf('await handleAdhanAction(event, false);'));
    expect(read('src/widget/republishWidgetPayload.ts')).toContain('await applyReaderLanguage(settings);');
  });
});
