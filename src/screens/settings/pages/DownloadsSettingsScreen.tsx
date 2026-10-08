/**
 * Settings → Downloads.
 *
 * Its own section on the settings index, not a row inside another one:
 * it is where the download manager answers for everything it holds —
 * what is running, what stopped and can be resumed, and the disk each
 * download takes — for the Qur'an pages, the tajwīd colours, every
 * reciter, tafsir, word meanings and the riwayat.
 *
 * Every door in the app leads here (`SettingsDownloads`): the Quran
 * screen, the reader, the riwayah picker, and mihrab://downloads, which
 * is where the "download stopped" notification lands.
 */
import { QuranDownloadsContent } from '../../QuranDownloadsScreen';
import { SettingsPage } from '../SettingsPage';

export function DownloadsSettingsScreen() {
  return (
    <SettingsPage>
      <QuranDownloadsContent />
    </SettingsPage>
  );
}
