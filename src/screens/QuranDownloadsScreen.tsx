/**
 * Manage downloads — v2.7.28.
 *
 * One place to see and reclaim the disk the Quran reader uses:
 * the mushaf page store, per-reciter recitation audio, and the tafsir
 * cache. Settings → Downloads, and reached from the Quran screen, the
 * reader, the riwayah picker and the download notification.
 * Everything here is re-downloadable, so deletes are safe.
 *
 * ── IT USED TO REPORT AN EMPTY DEVICE ─────────────────────────────────
 *
 * The mushaf row read `mushafDiskUsage`, which sums the manifest of the
 * page-IMAGE store at quran/mushaf. Version 2.8.0 replaced that reader
 * with the font-rendered one, which stores 604 typefaces at quran/fonts
 * — and nothing here was ever pointed at the new directory. So a device
 * with the whole mushaf downloaded, a hundred and eighty megabytes of it,
 * opened this screen and was told "Nothing downloaded yet". Confirmed on
 * an emulator holding all 604 fonts.
 *
 * Both stores are listed now. The old one is a separate row rather than
 * folded into the new: it is dead weight from an upgrade, several hundred
 * megabytes that nothing will ever read again, and someone deleting it
 * should be able to see that is what they are deleting. Its size is
 * walked rather than read from the manifest, so a store whose manifest
 * went missing still shows up as the space it is really taking.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SettingsBlock, SettingsGroup } from './settings/SettingsGroup';
import {
  DownloadRow,
  StorageBar,
  TextAction,
  type DeviceStorage,
} from '../quran/downloadsUi';
import { deviceStorage } from '../quran/downloadSpace';
import { ConfirmModal } from '../components/ConfirmModal';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import {
  deleteLegacyImageStore,
  legacyImageStoreBytes,
} from '../quran/mushafDownload';
import {
  deletePageFonts,
  fontStoreStats,
} from '../quran/mushafFontStore';
import { MUSHAF_TOTAL_PAGES } from '../quran/mushafImages';
import {
  deleteReciterAudio,
  totalAyahCount,
} from '../quran/audio/audioStore';
import {
  cancelQuranDownload,
  quranDownloadState,
  startQuranDownload,
  jobDisplayName,
  jobProgressText,
  subscribeQuranDownload,
  type QuranDownloadState,
} from '../quran/quranDownloadManager';
import { findReciter } from '../quran/audio/reciters';
import {
  deleteTafsirEdition,
  findTafsirEdition,
  tafsirEditionStats,
  TAFSIR_EDITIONS,
  TAFSIR_SURAHS,
} from '../quran/tafsir';
import {
  deleteWordMeanings,
  wordMeaningsStats,
  WORD_MEANINGS_SURAHS,
} from '../quran/wordMeanings';
import { RiwayahDownloadSection } from '../quran/RiwayahDownloadSection';
import {
  hydrateRiwayahData,
  riwayahProvenance,
} from '../quran/riwayahData';
import { RIWAYAT } from '../quran/riwayat';
import { TYPE } from '../theme/typography';

type ReciterUsage = {
  reciterId: string;
  bytes: number;
  /** Ayah files on disk, so the row can say what is missing — #55. */
  files: number;
};


/**
 * The page's content. It is drawn inside `SettingsPage` — Settings →
 * Downloads (`DownloadsSettingsScreen`) — which owns the scroll view, the
 * width cap, the bottom reserve and the keyboard, so this is only the
 * cards.
 */
export function QuranDownloadsContent() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  const [mushafBytes, setMushafBytes] = useState(0);
  const [mushafPages, setMushafPages] = useState(0);
  const [legacyBytes, setLegacyBytes] = useState(0);
  /** One entry per tafsir edition that has anything on disk. */
  const [tafsirRows, setTafsirRows] = useState<
    Array<{ id: string; bytes: number; surahs: number }>
  >([]);
  const [wordMeanings, setWordMeanings] = useState({ bytes: 0, surahs: 0 });
  /** The tajwīd page fonts, one set per palette (`mushafFontStore`). */
  const [tajweed, setTajweed] = useState({
    light: { bytes: 0, pages: 0 },
    dark: { bytes: 0, pages: 0 },
  });
  const [audio, setAudio] = useState<ReciterUsage[]>([]);
  const [riwayahBytes, setRiwayahBytes] = useState(0);
  /** The phone's own total and free space, for the storage bar. */
  const [device, setDevice] = useState<DeviceStorage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // The riwayah store is read from disk once per process; this screen
      // is often the first thing to need it, and it is what makes the
      // section below able to answer synchronously while it renders.
      await hydrateRiwayahData();
      setDevice(await deviceStorage());
      setRiwayahBytes(
        RIWAYAT.reduce(
          (sum, r) => sum + (riwayahProvenance(r.id)?.bytes ?? 0),
          0,
        ),
      );
      const [fonts, light, dark, legacy, tafsir, words] = await Promise.all([
        fontStoreStats(),
        fontStoreStats('tajweed-light'),
        fontStoreStats('tajweed-dark'),
        legacyImageStoreBytes(),
        Promise.all(
          TAFSIR_EDITIONS.map(async e => ({
            id: e.id,
            ...(await tafsirEditionStats(e.id)),
          })),
        ),
        wordMeaningsStats(),
      ]);
      setMushafBytes(fonts.bytes);
      setMushafPages(fonts.pages);
      setTajweed({
        light: { bytes: light.bytes, pages: light.pages },
        dark: { bytes: dark.bytes, pages: dark.pages },
      });
      setLegacyBytes(legacy);
      setTafsirRows(tafsir.filter(e => e.bytes > 0));
      setWordMeanings(words);
      const base = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/audio`;
      const out: ReciterUsage[] = [];
      if (await ReactNativeBlobUtil.fs.exists(base)) {
        const dirs = await ReactNativeBlobUtil.fs.ls(base);
        for (const dir of dirs) {
          const files = await ReactNativeBlobUtil.fs
            .lstat(`${base}/${dir}`)
            .catch(() => []);
          let sum = 0;
          let count = 0;
          for (const f of files) {
            const size = Number(f.size) || 0;
            sum += size;
            // The same floor the downloader believes in, so "on disk"
            // means one thing on both sides of this screen.
            if (String(f.filename ?? '').endsWith('.mp3') && size > 1000) {
              count += 1;
            }
          }
          if (sum > 0) out.push({ reciterId: dir, bytes: sum, files: count });
        }
      }
      out.sort((a, b) => b.bytes - a.bytes);
      setAudio(out);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * What is downloading right now.
   *
   * This screen used to be an inventory and nothing else: it could tell
   * you a reciter took 1.2 GB and let you delete them, but a download in
   * flight was invisible here — you had to be on the screen that started
   * it. Which is precisely backwards for a page called "Manage
   * downloads", and it meant the only place to cancel a run was the place
   * you had already navigated away from.
   *
   * Re-reading the inventory when a run ENDS is the other half: the moment
   * a download finishes is the moment every byte count on this screen is
   * wrong.
   */
  const [download, setDownload] = useState<QuranDownloadState>(
    quranDownloadState,
  );
  useEffect(() => subscribeQuranDownload(setDownload), []);
  const running = download.running;
  useEffect(() => {
    if (!running) void refresh();
  }, [running, refresh]);

  /**
   * The delete being asked about, if one is. The app's own themed dialog,
   * not the platform alert, which drew a stock grey box over this screen.
   */
  const [pendingDelete, setPendingDelete] = useState<{
    label: string;
    action: () => Promise<void>;
  } | null>(null);
  const confirmDelete = (label: string, action: () => Promise<void>) =>
    setPendingDelete({ label, action });

  /** Delete, and Continue when there is a rest to fetch — issue #55. */
  const itemActions = (
    title: string,
    onDelete: () => void,
    /**
     * Only where there IS a rest: a complete reciter has nothing to
     * fetch, and an offer to continue a finished download is a button
     * that walks six thousand files to do nothing.
     */
    onResume?: () => void,
  ) => (
    <>
      {onResume ? (
        <TextAction
          label={t('quran.listenDownloadResume', 'Continue downloading')}
          color={palette.accentSolid}
          disabled={running != null}
          onPress={onResume}
        />
      ) : null}
      <TextAction
        label={t('common.delete', 'Delete')}
        accessibilityLabel={`${t('common.delete', 'Delete')} — ${title}`}
        color={palette.danger}
        onPress={onDelete}
      />
    </>
  );

  const total =
    mushafBytes +
    tajweed.light.bytes +
    tajweed.dark.bytes +
    legacyBytes +
    tafsirRows.reduce((s, e) => s + e.bytes, 0) +
    wordMeanings.bytes +
    riwayahBytes +
    audio.reduce((s, a) => s + a.bytes, 0);

  const items: ReactNode[] = [];

  if (mushafBytes > 0) {
    items.push(
      <DownloadRow
        key="mushaf"
        title={t('downloads.mushaf', 'Mushaf pages')}
        // The count, not a flat "604": a run that was cancelled or that
        // lost pages leaves a store this screen should describe honestly
        // rather than round up to complete.
        sub={t('downloads.mushafPages', {
          defaultValue: '{{pages}} of {{total}} pages',
          pages: mushafPages,
          total: MUSHAF_TOTAL_PAGES,
        })}
        bytes={mushafBytes}
        actions={itemActions(t('downloads.mushaf', 'Mushaf pages'), () =>
          confirmDelete(t('downloads.mushaf', 'Mushaf pages'), async () => {
            await deletePageFonts();
          }),
        )}
      />,
    );
  }

  for (const which of ['light', 'dark'] as const) {
    if (tajweed[which].bytes <= 0) continue;
    const title = `${t('tajweed.downloadsRow', 'Tajweed colours')} · ${
      which === 'dark'
        ? t('tajweed.darkPages', 'dark pages')
        : t('tajweed.lightPages', 'light pages')
    }`;
    items.push(
      <DownloadRow
        key={`tajweed-${which}`}
        title={title}
        sub={t('tajweed.downloadsRowSub', {
          defaultValue: '{{pages}} of {{total}} coloured pages',
          pages: tajweed[which].pages,
          total: MUSHAF_TOTAL_PAGES,
        })}
        bytes={tajweed[which].bytes}
        actions={itemActions(title, () =>
          confirmDelete(t('tajweed.downloadsRow', 'Tajweed colours'), async () => {
            await deletePageFonts(`tajweed-${which}`);
          }),
        )}
      />,
    );
  }

  if (legacyBytes > 0) {
    const title = t('downloads.legacyMushaf', 'Older mushaf pages');
    items.push(
      <DownloadRow
        key="mushaf-legacy"
        title={title}
        sub={t(
          'downloads.legacyMushafSub',
          'Left by the previous reader. Nothing opens these now.',
        )}
        bytes={legacyBytes}
        actions={itemActions(title, () =>
          confirmDelete(title, async () => {
            await deleteLegacyImageStore();
          }),
        )}
      />,
    );
  }

  for (const a of audio) {
    // While this reciter is the one downloading, the row follows the run.
    // It used to show what the inventory found when the screen opened —
    // "92 of 6236" and a bar at 1% — the whole time the run counted up, so
    // the download looked stuck. The run walks every ayah in order and
    // counts the ones already on disk as it passes them, so its count is
    // the floor of what is there; the inventory's own count wins until the
    // run overtakes it. The size is re-read when the run ends.
    const live =
      running?.kind === 'audio' && running.reciterId === a.reciterId
        ? download.progress
        : null;
    const files = live ? Math.max(a.files, live.done) : a.files;
    const whole = files >= totalAyahCount();
    const name = findReciter(a.reciterId).name;
    items.push(
      <DownloadRow
        key={a.reciterId}
        title={name}
        // What is actually there, not a flat "Recitation audio" — the
        // difference between a complete reciter and one that stopped at
        // 85% is the difference the reader came here to act on (#55).
        sub={
          whole
            ? t('downloads.audioSub', 'Recitation audio')
            : t('quran.downloadProgressAyahs', {
                defaultValue: '{{done}} of {{total}} ayahs',
                done: files,
                total: totalAyahCount(),
              })
        }
        bytes={a.bytes}
        progress={whole ? undefined : files / totalAyahCount()}
        actions={itemActions(
          name,
          () => confirmDelete(name, () => deleteReciterAudio(a.reciterId)),
          // No Continue on the row of the reciter that IS continuing: a
          // greyed copy of the button read as "this did not start".
          whole || live
            ? undefined
            : () => {
                startQuranDownload({ kind: 'audio', reciterId: a.reciterId });
              },
        )}
      />,
    );
  }

  for (const e of tafsirRows) {
    const edition = findTafsirEdition(e.id);
    if (!edition) continue;
    const live =
      running?.kind === 'tafsir' && running.editionId === e.id
        ? download.progress
        : null;
    const surahs = live ? Math.max(e.surahs, live.done) : e.surahs;
    const whole = surahs >= TAFSIR_SURAHS;
    items.push(
      <DownloadRow
        key={`tafsir-${e.id}`}
        title={edition.label}
        sub={
          whole
            ? t('downloads.tafsirWhole', 'Complete tafsir')
            : surahs > 0
              ? t('downloads.tafsirPart', {
                  defaultValue: '{{done}} of {{total}} surahs',
                  done: surahs,
                  total: TAFSIR_SURAHS,
                })
              : t('downloads.tafsirSub', 'Cached tafsir texts')
        }
        bytes={e.bytes}
        progress={whole || surahs === 0 ? undefined : surahs / TAFSIR_SURAHS}
        actions={itemActions(
          edition.label,
          () => confirmDelete(edition.label, () => deleteTafsirEdition(e.id)),
          // Continue only for a download that is part way (surahs > 0): the
          // ayahs cached one at a time are not a download to resume.
          whole || live || surahs === 0
            ? undefined
            : () => {
                startQuranDownload({ kind: 'tafsir', editionId: e.id });
              },
        )}
      />,
    );
  }

  if (wordMeanings.bytes > 0) {
    const whole = wordMeanings.surahs >= WORD_MEANINGS_SURAHS;
    const title = t('downloads.wordMeanings', 'Arabic word meanings');
    items.push(
      <DownloadRow
        key="word-meanings"
        title={title}
        sub={
          whole
            ? t(
                'downloads.wordMeaningsSub',
                'Meanings of the harder words, from QuranEnc.com',
              )
            : t('downloads.wordMeaningsPart', {
                defaultValue: '{{done}} of {{total}} surahs',
                done: wordMeanings.surahs,
                total: WORD_MEANINGS_SURAHS,
              })
        }
        bytes={wordMeanings.bytes}
        progress={whole ? undefined : wordMeanings.surahs / WORD_MEANINGS_SURAHS}
        actions={itemActions(
          title,
          () => confirmDelete(title, deleteWordMeanings),
          whole || running?.kind === 'wordMeanings'
            ? undefined
            : () => {
                startQuranDownload({ kind: 'wordMeanings' });
              },
        )}
      />,
    );
  }

  const runningProgress =
    running && download.progress.total > 0
      ? download.progress.done / download.progress.total
      : 0;

  return (
    <>
      <SettingsGroup
        title={t('downloads.storageTitle', 'Storage')}
        footer={t(
          'downloads.storageFooter',
          'Everything Mihrab downloads can be downloaded again, so deleting it here is always safe.',
        )}>
        <StorageBar mihrabBytes={total} device={device} loading={loading} />
      </SettingsGroup>

      {running ? (
        <SettingsGroup title={t('downloads.groupDownloading', 'Downloading')}>
          <DownloadRow
            title={jobDisplayName(running)}
            sub={jobProgressText(
              running,
              download.progress.done,
              download.progress.total,
            )}
            progress={runningProgress}
            actions={
              <TextAction
                label={t('common.cancel', 'Cancel')}
                color={palette.danger}
                onPress={() => cancelQuranDownload()}
              />
            }
          />
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={t('downloads.groupOnDevice', 'On this device')}>
        {items.length > 0 ? (
          items
        ) : (
          <SettingsBlock>
            <Text style={[styles.empty, { color: palette.muted }]}>
              {loading
                ? t('quran.loading', 'Loading…')
                : t(
                    'downloads.empty',
                    'Nothing downloaded yet. Mushaf pages, recitation audio and tafsir you download appear here.',
                  )}
            </Text>
          </SettingsBlock>
        )}
      </SettingsGroup>

      <RiwayahDownloadSection onChanged={() => void refresh()} />

      <ConfirmModal
        visible={pendingDelete != null}
        title={t('downloads.deleteTitle', 'Delete download?')}
        message={t('downloads.deleteBody', {
          defaultValue:
            '{{what}} will be removed from this device. You can download it again at any time.',
          what: pendingDelete?.label ?? '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const pending = pendingDelete;
          setPendingDelete(null);
          if (pending) void pending.action().then(refresh);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
});
