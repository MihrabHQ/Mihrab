/**
 * What a whole-surah recitation is, and its download — one notice.
 *
 * The mp3quran.net recitations (SURAH_FILE_RECITERS) play from a full
 * download only, and their ayah tracking is a best attempt (see the note
 * there). Both are conditions of choosing the voice, so they are said in
 * the same words wherever the voice meets the reader: the ayah sheet's
 * recitation controls, the player card when playback could not start, and
 * the listening page. The download itself is the reciter's ordinary one —
 * the manager, the notification, the strip, the space check — so starting
 * it here is starting it everywhere.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RowAction } from '../../components/controls';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { findSurah } from '../quran';
import {
  deleteSurahFile,
  estimatedReciterBytes,
  reciterAudioStats,
  surahFileState,
  type ReciterAudioStats,
  type SurahFileState,
} from './audioStore';
import { findReciter } from './reciters';
import { expectedSurahBytes, isExactRecitation, isExactSurah } from './surahRecitation';
import { ayahBoundaryReportUrl } from './ayahBoundaryReport';
import type { RiwayahId } from '../riwayat';
import {
  cancelQuranDownload,
  isJobRunning,
  quranDownloadState,
  startQuranDownload,
  subscribeQuranDownload,
  type QuranDownloadState,
} from '../quranDownloadManager';

/** "1.2 GB", "812 MB" — the picker's shape. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function WholeSurahNotice({
  reciterId,
  missingSurah,
  reason = 'missing',
}: {
  reciterId: string;
  /** The surah playback stopped at because it is not on the device. */
  missingSurah?: number | null;
  /** Why: not on the device, or changed at its source (no download fixes that). */
  reason?: 'missing' | 'changed';
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [download, setDownload] = useState<QuranDownloadState>(quranDownloadState);
  const [stats, setStats] = useState<ReciterAudioStats | null>(null);

  useEffect(() => subscribeQuranDownload(setDownload), []);
  // Re-read the folder when a run ends: that is when the answer changes.
  useEffect(() => {
    let alive = true;
    void reciterAudioStats(reciterId).then(next => {
      if (alive) setStats(next);
    });
    return () => {
      alive = false;
    };
  }, [reciterId, download.running]);

  const reciter = findReciter(reciterId);
  const job = { kind: 'audio' as const, reciterId };
  const running = isJobRunning(job);
  const busyElsewhere = download.running != null && !running;
  const size = formatBytes(estimatedReciterBytes(reciterId));
  const complete = stats?.complete === true;
  const partial = !complete && (stats?.files ?? 0) > 0;
  const pct =
    running && download.progress.total > 0
      ? Math.round((download.progress.done / download.progress.total) * 100)
      : 0;

  const changedLead =
    missingSurah != null && reason === 'changed'
      ? t('quran.wholeSurahChanged', {
          defaultValue:
            '{{surah}} cannot be played in this voice: the recording at its source has changed since Mihrab measured where its ayahs fall. The rest of {{name}} plays as before.',
          surah: findSurah(missingSurah)?.romanized ?? missingSurah,
          name: reciter.name,
        })
      : null;
  const lead =
    changedLead ??
    (missingSurah != null && !complete
      ? t('quran.wholeSurahUnreachable', {
          defaultValue:
            '{{surah}} in this voice is not on this device, and it cannot be streamed right now — there is no connection to its source. Download it to have it offline.',
          surah: findSurah(missingSurah)?.romanized ?? missingSurah,
        })
      : complete
      ? t('quran.wholeSurahDownloaded', {
          defaultValue: '{{name}} is downloaded — the whole recitation, on this device.',
          name: reciter.name,
        })
      : t('quran.wholeSurahIntro', {
          defaultValue:
            '{{name}} plays from a full download only — the whole recitation, {{size}}.',
          name: reciter.name,
          size,
        }));

  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: palette.text }]}>{lead}</Text>
      {isExactRecitation(reciterId) ? null : (
      <Text style={[styles.note, { color: palette.muted }]}>
        {t(
          'quran.wholeSurahTracking',
          'It is one recording per surah, cut into ayahs as closely as the recording allows: the ayah tracking is a best attempt, and a few ayahs may start or end a moment off.',
        )}
      </Text>
      )}
      {complete || changedLead ? null : (
        <View style={styles.actions}>
          {missingSurah != null ? (
            <RowAction
              compact
              label={t('quran.downloadSurahAudioSized', {
                defaultValue: 'Download this surah · {{size}}',
                size: formatBytes(expectedSurahBytes(reciterId, missingSurah) ?? 0),
              })}
              disabled={running || busyElsewhere}
              onPress={() =>
                startQuranDownload({ kind: 'surah', reciterId, surah: missingSurah })
              }
              accessibilityLabel={t('quran.downloadSurahAudio', {
                defaultValue: 'Download audio for {{surah}}',
                surah: findSurah(missingSurah)?.romanized ?? missingSurah,
              })}
            />
          ) : null}
          <RowAction
            compact
            grow
            label={
              running
                ? t('quran.wholeSurahDownloading', {
                    defaultValue: 'Downloading · {{pct}}%',
                    pct,
                  })
                : busyElsewhere
                ? t(
                    'quran.listenDownloadBusy',
                    'Something else is downloading. One at a time, so neither is halved.',
                  )
                : partial
                ? t('quran.wholeSurahResume', {
                    defaultValue: 'Download the rest · {{size}} in all',
                    size,
                  })
                : t('quran.wholeSurahDownload', {
                    defaultValue: 'Download {{name}} · {{size}}',
                    name: reciter.name,
                    size,
                  })
            }
            disabled={running || busyElsewhere}
            onPress={() => startQuranDownload(job)}
            accessibilityLabel={t('quran.listenDownloadReciter', {
              defaultValue: 'Download {{name}}, about {{size}}',
              name: reciter.name,
              size,
            })}
          />
          {running ? (
            <RowAction
              compact
              label={t('common.cancel', 'Cancel')}
              onPress={() => cancelQuranDownload()}
              accessibilityLabel={t('common.cancel', 'Cancel')}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * One surah of a whole-surah recitation, in the ayah sheet — the same row
 * the EveryAyah voices have there: download this surah (its exact size),
 * delete it, or say it is downloaded. Plus the two things that are this
 * kind of voice's own: its ayah tracking is a best attempt, and a way to
 * say when an ayah's boundary is wrong.
 */
export function WholeSurahSurahRow({
  reciterId,
  surah,
  ayah,
  riwayah,
}: {
  reciterId: string;
  surah: number;
  /** The ayah the sheet is open on, in the reader's count, for a report. */
  ayah: number | null;
  riwayah: RiwayahId;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [download, setDownload] = useState<QuranDownloadState>(quranDownloadState);
  const [state, setState] = useState<SurahFileState | null>(null);
  useEffect(() => subscribeQuranDownload(setDownload), []);

  const read = useCallback(() => {
    let alive = true;
    void surahFileState(reciterId, surah).then(next => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [reciterId, surah]);
  // On open, and whenever a download ends — that is when the answer moves.
  useEffect(read, [read, download.running]);

  const job = { kind: 'surah' as const, reciterId, surah };
  const downloading = isJobRunning(job);
  const busyElsewhere = download.running != null && !downloading;
  const size = formatBytes(expectedSurahBytes(reciterId, surah) ?? 0);
  const surahLabel = findSurah(surah)?.romanized ?? String(surah);
  const reportUrl =
    ayah != null ? ayahBoundaryReportUrl(reciterId, surah, ayah, riwayah) : null;

  const label = downloading
    ? t('quran.downloadingAudioMegabytes', {
        defaultValue: 'Downloading… {{done}}/{{total}} MB',
        done: download.progress.done,
        total: download.progress.total,
      })
    : busyElsewhere
    ? t(
        'quran.listenDownloadBusy',
        'Something else is downloading. One at a time, so neither is halved.',
      )
    : state === 'here'
    ? t('quran.surahAudioDownloaded', 'Audio downloaded for offline use')
    : t('quran.downloadSurahAudioSized', {
        defaultValue: 'Download this surah · {{size}}',
        size,
      });

  return (
    <View style={styles.wrap}>
      {state === 'changed' ? (
        <Text style={[styles.lead, { color: palette.text }]}>
          {t('quran.wholeSurahChanged', {
            defaultValue:
              '{{surah}} cannot be played in this voice: the recording at its source has changed since Mihrab measured where its ayahs fall. The rest of {{name}} plays as before.',
            surah: surahLabel,
            name: findReciter(reciterId).name,
          })}
        </Text>
      ) : (
        <View style={styles.actions}>
          <RowAction
            compact
            grow
            label={label}
            onPress={() => startQuranDownload(job)}
            disabled={state !== 'absent' || downloading || busyElsewhere}
            accessibilityLabel={t('quran.downloadSurahAudio', {
              defaultValue: 'Download audio for {{surah}}',
              surah: surahLabel,
            })}
          />
          {downloading ? (
            <RowAction
              compact
              label={t('common.cancel', 'Cancel')}
              onPress={() => cancelQuranDownload()}
              accessibilityLabel={t('common.cancel', 'Cancel')}
            />
          ) : null}
          {!downloading && state === 'here' ? (
            <RowAction
              compact
              label={t('common.delete', 'Delete')}
              onPress={() => void deleteSurahFile(reciterId, surah).then(read)}
              accessibilityLabel={t('quran.deleteSurahAudioFor', {
                defaultValue: 'Delete downloaded audio for {{surah}}',
                surah: surahLabel,
              })}
            />
          ) : null}
        </View>
      )}
      {/* A surah whose every boundary was confirmed is cut as exactly as a
          file per ayah: neither the caveat nor the report applies to it. */}
      {isExactSurah(reciterId, surah) ? null : (
        <Text style={[styles.note, { color: palette.muted }]}>
          {t(
            'quran.wholeSurahTrackingShort',
            'One recording per surah, cut into ayahs as closely as it allows: ayah tracking is a best attempt.',
          )}
        </Text>
      )}
      {reportUrl ? (
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => void Linking.openURL(reportUrl).catch(() => undefined)}>
          <Text style={[styles.note, { color: palette.accentSolid }]}>
            {t('quran.reportAyahBoundary', 'An ayah starts or ends in the wrong place? Report it')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs, marginTop: SPACING.sm },
  lead: { fontSize: TYPE.footnote.fontSize, fontWeight: '400' },
  note: { fontSize: TYPE.caption.fontSize, fontWeight: '400' },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
});
