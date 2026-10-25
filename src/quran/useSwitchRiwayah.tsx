/**
 * CHANGING MUṢḤAF, IN ONE PLACE.
 *
 * Setting `prefs.riwayah` is not the whole of it. A `unicode` riwayah
 * starts and ends every page exactly where the printed one does, but its
 * LINES are laid out by the device rather than taken from the print —
 * someone who has memorised where an ayah sits on the page of their own
 * copy will notice, and finding out by being confused is the worst way to
 * learn it. So the first switch to one says so, once, and records that it
 * has (`riwayahNoticeSeen`). A muṣḥaf whose lines ARE the print's
 * (IndoPak) says something else once: the page count changed and the
 * reader's place did not (`indopakNoticeSeen`).
 *
 * That lived inside the muṣḥaf screen while the reader's header was the
 * only way to switch. A second entry point — Settings → Qur'an — would
 * have set the preference without the notice AND without the flag, so the
 * alert would have gone off later, inside the reader, about a muṣḥaf the
 * reader had already been using for a week. Two callers is exactly when a
 * rule stops being a screen's business.
 *
 * ── THE NOTICE IS THE APP'S OWN DIALOG ────────────────────────────────
 *
 * It was the platform's alert — grey, system-styled, and
 * nothing like the sheet it appeared over. The hook now hands back the
 * notice as an element (`ConfirmModal`, the dialog every other confirmation
 * in the app uses) for the caller to mount beside its picker, so the
 * notice is drawn in the theme and follows the fold like the picker does.
 */
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '../components/ConfirmModal';
import { setQuranPrefs, useQuranState } from './quranState';
import { riwayahById, type RiwayahId } from './riwayat';

type Notice = { title: string; message: string };

export function useSwitchRiwayah(): {
  /** Set the preference, and queue the one-time notice when one is due. */
  switchRiwayah: (id: RiwayahId) => void;
  /** The notice, to mount once beside the caller's picker. */
  notice: React.ReactElement;
} {
  const { t } = useTranslation();
  const quran = useQuranState();
  const seen = quran.prefs.riwayahNoticeSeen;
  const indopakSeen = quran.prefs.indopakNoticeSeen;
  const [shown, setShown] = useState<Notice | null>(null);

  const switchRiwayah = useCallback(
    (id: RiwayahId) => {
      const target = riwayahById(id);
      setQuranPrefs({ riwayah: target.id });
      if (target.render === 'unicode-lines') {
        // Its lines ARE the print's, so the reflow notice would be a lie
        // here; what a reader needs to hear once is that the page count
        // changed and their place did not.
        if (indopakSeen) return;
        // The flag is written BEFORE the dialog, not after it: a dialog
        // is not a promise that anybody read it, and one that could fire
        // twice because the second switch happened while the first was
        // on screen is worse than one nobody reads.
        setQuranPrefs({ indopakNoticeSeen: true });
        setShown({
          title: t('quran.indopakNoticeTitle', 'A different book, the same place'),
          message: t(
            'quran.indopakNoticeBody',
            'Pages follow the IndoPak print: 610 of them, line for line. Your bookmarks, your khatmah and your last-read place are kept by ayah, so they carry over.',
          ),
        });
        return;
      }
      if (target.render !== 'unicode' || seen) return;
      setQuranPrefs({ riwayahNoticeSeen: true });
      setShown({
        title: t('quran.riwayahReflowTitle', 'Pages match, lines may not'),
        message: t(
          'quran.riwayahReflowBody',
          'This muṣḥaf starts and ends every page exactly where the printed one does, but its lines are laid out by your device rather than taken from the print, so they will not always break in the same places.',
        ),
      });
    },
    [seen, indopakSeen, t],
  );

  const dismiss = useCallback(() => setShown(null), []);
  const notice = (
    <ConfirmModal
      visible={shown != null}
      title={shown?.title ?? ''}
      message={shown?.message ?? ''}
      confirmLabel={t('common.ok', 'OK')}
      cancelLabel={t('common.cancel', 'Cancel')}
      hideCancel
      onConfirm={dismiss}
      onCancel={dismiss}
    />
  );

  return { switchRiwayah, notice };
}
