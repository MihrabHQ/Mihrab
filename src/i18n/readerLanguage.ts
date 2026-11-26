import i18n from './index';
import { applyMadhabNaming } from '../prayer/madhab';
import { loadSettings } from '../settings/storage';
import type { Madhab } from '../prayer/madhab';

/**
 * The reader's language — and the Mālikī name for dawn — for a process
 * that has no screen: the headless tasks and the notifications'
 * background handler. The settings provider sets both when the app is
 * opened; a process started for a press on a notification, an alarm's
 * action or a widget's refresh never mounts it, and spoke English.
 *
 * Not only a matter of copy. The snooze choices are read back by their
 * LABEL (`isLastChanceChoice`, `parseSnoozeMinutes`), so "Sista chansen
 * att be Asr", chosen on a notification written in Swedish, was compared
 * with the English label, did not match, and was taken for a plain
 * ten-minute snooze. Awaited before anything is read or written.
 */
export async function applyReaderLanguage(settings?: {
  language?: string | null;
  madhab?: Madhab | null;
}): Promise<void> {
  const s = settings ?? (await loadSettings());
  if (s.language && i18n.language !== s.language) {
    await i18n.changeLanguage(s.language);
  }
  applyMadhabNaming(i18n, s.madhab, s.language ?? undefined);
}
