/**
 * Adding and removing a muṣḥaf the app does not ship.
 *
 * ── WHY THIS SCREEN SAYS SO MUCH ──────────────────────────────────────
 *
 * Every other row in Manage downloads is "we have this, want it?" — the
 * page fonts, the recitations, the tafsir all come from somewhere Mihrab
 * already stands behind. This one does not, and pretending otherwise by
 * making it look like the others would be the dishonest option.
 *
 * The app ships the reader and the checks, not the text. The text is
 * downloaded — from Mihrab's own copy of the publisher's file, or from the
 * publisher (`riwayahDownload.ts` has why both) — and the reader is told
 * who publishes it and whom they credit before they add scripture to
 * their device.
 *
 * ── ONE BUTTON, AND A DOOR BESIDE IT ─────────────────────────────────
 *
 * This screen used to ask the reader to paste a link, because there was
 * no honest URL to hardcode: QUL mints its download URLs in the browser,
 * so anything written here would have been a guess that breaks silently
 * later — which for scripture is the worst failure available.
 *
 * Quranpedia serves the muṣḥaf at a fixed path, so the app fetches it.
 * One button, the way the page fonts already work. `riwayat.ts` records
 * why that source and not the other.
 *
 * The by-hand way in is still here, folded away: a publisher's URL can
 * move, a reader can be on a network that will not reach it, and someone
 * may already have the file. But it is no longer the first thing on the
 * card, because for almost everyone the first thing should be a button
 * that simply works.
 *
 * The file never travels through anything of ours either way.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { startQuranDownload } from './quranDownloadManager';
import { useQuranDownloadRun } from './QuranDownloadStrip';
import { DownloadRow, ProgressTrack, TextAction } from './downloadsUi';
import { SettingsGroup } from '../screens/settings/SettingsGroup';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import {
  riwayahProvenance,
  uninstallRiwayah,
  useRiwayahAvailability,
} from './riwayahData';
import { installRiwayahFromText } from './riwayahDownload';
import { hasFilePicker, pickFile } from '../native/FilePicker';
import { mushafTextFromFile } from './mushafFile';
import {
  DEFAULT_RIWAYAH,
  RIWAYAT,
  type RiwayahDefinition,
} from './riwayat';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

function hostOf(from: string): string {
  const m = /^https?:\/\/([^/]+)/i.exec(from);
  return m ? m[1] : from;
}


export function RiwayahDownloadSection({
  onChanged,
}: {
  /** Let the parent re-total its "on this device" figure. */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  // Re-render when a muṣḥaf is added or removed anywhere in the app.
  useRiwayahAvailability();

  const offered = RIWAYAT.filter(r => r.render === 'unicode' && r.source);
  if (offered.length === 0) return null;

  return (
    <SettingsGroup
      title={t('downloads.riwayat', 'Reading traditions')}
      footer={t(
        'downloads.riwayatFootnote',
        'Mihrab keeps its own copy of each text, byte for byte the publisher’s, and falls back to the publisher. Every file is checked here before anything is read from it.',
      )}>
      <BuiltInRow />
      {offered.map(riwayah => (
        <RiwayahCard
          key={riwayah.id}
          riwayah={riwayah}
          onChanged={onChanged}
        />
      ))}
    </SettingsGroup>
  );
}

/**
 * Ḥafṣ, which is not a download and is the reason this list looked short.
 *
 * The section only ever listed the riwayat that HAVE a download, so the
 * one the reader is almost certainly in was missing from a screen headed
 * "Reading traditions" — leaving them to wonder whether it needed
 * fetching too, or where it had gone. It is a card like the others, with
 * nothing to fetch and nothing to delete, and it says the two things that
 * are true of it: it is the default, and it is already here.
 */
function BuiltInRow() {
  const { t } = useTranslation();
  const hafs = RIWAYAT.find(r => r.id === DEFAULT_RIWAYAH);
  if (!hafs) return null;
  return (
    <DownloadRow
      title={`${t(hafs.nameKey, hafs.arabic)} ${t('quran.riwayahDefault', '(default)')}`}
      sub={t(
        'downloads.riwayahBuiltIn',
        'Built into Mihrab. Nothing to download, and nothing to delete.',
      )}
    />
  );
}

function RiwayahCard({
  riwayah,
  onChanged,
}: {
  riwayah: RiwayahDefinition;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [url, setUrl] = useState('');
  /** Reading a file the reader chose — local work, not a download. */
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  /**
   * The download itself belongs to the download manager, like every other
   * one in the app: it is in the shade, it survives this screen closing,
   * it waits its turn behind a reciter's gigabyte, and it is offered again
   * if the network takes it away. This card only shows what the manager
   * says about this riwayah.
   */
  const run = useQuranDownloadRun();
  const mine =
    run.running?.kind === 'riwayah' && run.running.riwayahId === riwayah.id;
  const otherRunning = run.running != null && !mine;
  const last =
    run.last?.job.kind === 'riwayah' && run.last.job.riwayahId === riwayah.id
      ? run.last
      : null;
  const busy = reading || mine;
  useEffect(() => {
    if (!last?.complete) return;
    setUrl('');
    onChanged?.();
  }, [last, onChanged]);
  const lastError =
    last && !last.complete && !last.cancelled && last.error ? last.error : null;
  const shownError =
    error ??
    (lastError ? t(lastError.key, lastError.fallback, lastError.params) : null);
  const shownDetail = error ? detail : lastError?.detail ?? null;
  /** Whether the reader has asked for the by-hand way in. */
  const [manual, setManual] = useState(false);

  const direct = riwayah.source?.direct;

  const installed = riwayahProvenance(riwayah.id);
  const name = t(riwayah.nameKey, riwayah.arabic);

  /**
   * Take the file the reader downloaded themselves.
   *
   * One tap, start to finish: the picker opens, and whatever comes back is
   * read, checked and installed. Nothing is asked in between — not which
   * folder, not which of several files, and not whether it has been
   * unzipped, because `mushafTextFromFile` decides what the bytes are.
   */
  const chooseFile = useCallback(async () => {
    setError(null);
    setDetail(null);
    let picked;
    try {
      picked = await pickFile();
    } catch (e) {
      // `too_large` is the only native failure worth its own sentence: it
      // means a mis-tap on a film or a backup, and "could not be read"
      // would send the reader looking for a fault in a good file.
      if ((e as { code?: string })?.code === 'too_large') {
        setError(
          t(
            'downloads.riwayahFileTooLarge',
            'That file is far too large to be a muṣḥaf.',
          ),
        );
        return;
      }
      setError(t('downloads.riwayahUnreadable', 'That file could not be read.'));
      setDetail(String(e));
      return;
    }
    // Backed out. A cancel is a decision, not an error to report back.
    if (!picked) return;
    setReading(true);
    try {
      const read = mushafTextFromFile(picked.name, picked.bytes);
      if (!read.ok) {
        setError(t(read.key, read.fallback));
        setDetail(read.detail ?? null);
        return;
      }
      const result = await installRiwayahFromText(
        riwayah.id,
        read.text,
        picked.name,
      );
      if (result.ok) {
        onChanged?.();
        return;
      }
      setError(t(result.error.key, result.error.fallback, result.error.params));
      setDetail(result.error.detail ?? null);
    } catch (e) {
      setError(t('downloads.riwayahUnreadable', 'That file could not be read.'));
      setDetail(String(e));
    } finally {
      setReading(false);
    }
  }, [onChanged, riwayah.id, t]);

  /**
   * Fetch the muṣḥaf the way the page fonts are fetched: one button, no
   * link to find, no file to go looking for. Mihrab's own copy first, the
   * publisher's second (`downloadRiwayah`), and checked before a word of it
   * is drawn.
   */
  const download = useCallback(() => {
    if (!direct) return;
    setError(null);
    setDetail(null);
    startQuranDownload({ kind: 'riwayah', riwayahId: riwayah.id });
  }, [direct, riwayah.id]);

  /** A link the reader pasted — the same download, from their address. */
  const install = useCallback(() => {
    setError(null);
    setDetail(null);
    startQuranDownload({ kind: 'riwayah', riwayahId: riwayah.id, url: url.trim() });
  }, [riwayah.id, url]);

  // The app's own themed dialog, not the platform alert.
  const [confirming, setConfirming] = useState(false);
  const remove = useCallback(() => setConfirming(true), []);

  if (installed) {
    return (
      <View>
        <DownloadRow
          title={name}
          sub={t('downloads.riwayahInstalled', {
            defaultValue: '{{pages}} pages · from {{host}}',
            pages: installed.pages,
            host: hostOf(installed.from),
          })}
          bytes={installed.bytes}
          actions={
            <TextAction
              label={t('common.delete', 'Delete')}
              accessibilityLabel={`${t('common.delete', 'Delete')} — ${name}`}
              color={palette.danger}
              onPress={remove}
            />
          }
        />
        <ConfirmModal
          visible={confirming}
          title={t('downloads.deleteTitle', 'Delete download?')}
          message={t('downloads.deleteBody', {
            defaultValue:
              '{{what}} will be removed from this device. You can download it again at any time.',
            what: name,
          })}
          confirmLabel={t('common.delete', 'Delete')}
          cancelLabel={t('common.cancel', 'Cancel')}
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void uninstallRiwayah(riwayah.id).then(() => onChanged?.());
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.block}>
      {/* One line: the name, and the one thing to do with it. The
          explanation of where the file comes from is the group's footer,
          once, rather than a paragraph repeated under every riwayah. */}
      <View style={styles.headRow}>
        <View style={styles.grow}>
          <Text style={[styles.title, { color: palette.text }]}>{name}</Text>
          <Text style={[styles.sub, { color: palette.muted }]}>
            {t('downloads.riwayahPublisher', {
              defaultValue: 'Published by {{publisher}}. Credits {{credits}}.',
              publisher: riwayah.source?.publisher ?? '',
              credits: riwayah.source?.credits ?? '',
            })}
          </Text>
        </View>
        {direct ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('downloads.riwayahDownload', 'Download')} — ${name}`}
            accessibilityHint={t(
              'downloads.riwayahFetchHowTo',
              'Mihrab will fetch it to this device and check it before anything is read from it.',
            )}
            accessibilityState={{ disabled: busy || otherRunning, busy }}
            disabled={busy || otherRunning}
            hitSlop={6}
            onPress={download}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: palette.accentSolid,
                opacity: busy || otherRunning ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}>
            {busy ? (
              <ActivityIndicator size="small" color={String(palette.onAccent)} />
            ) : (
              <Text style={[styles.pillLabel, { color: palette.onAccent }]}>
                {t('downloads.riwayahDownload', 'Download')}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {mine ? (
        <ProgressTrack progress={run.progress.done / Math.max(1, run.progress.total)} />
      ) : null}

      {shownError ? (
        <View style={styles.errorBox}>
          <Text style={[styles.error, { color: palette.danger }]}>{shownError}</Text>
          {shownDetail ? (
            <Text style={[styles.detail, { color: palette.muted }]}>
              {shownDetail}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* The source, and the manual way in — words, not buttons. The
          manual way is not dead weight: a publisher's URL can move, a
          network may not reach it, and someone may have the file already.
          But for almost everyone the button above is the whole story. */}
      <View style={styles.links}>
        <TextAction
          label={t('downloads.riwayahOpenSource', 'Open the source')}
          color={palette.accentSolid}
          onPress={() => {
            const page = riwayah.source?.page;
            if (page) void Linking.openURL(page);
          }}
        />
        {direct && !manual ? (
          <TextAction
            label={t('downloads.riwayahAddAFile', 'Add a file I already have')}
            color={palette.muted}
            onPress={() => setManual(true)}
          />
        ) : null}
      </View>

      {!direct || manual ? (
        <>
          <Text style={[styles.help, { color: palette.muted }]}>
            {t(
              'downloads.riwayahHowTo',
              'Download the JSON export from that page, then choose it below. It can stay zipped.',
            )}
          </Text>

          {hasFilePicker() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'downloads.riwayahChooseFile',
                'Choose the downloaded file',
              )}
              disabled={busy}
              onPress={() => void chooseFile()}
              style={({ pressed }) => [
                styles.secondary,
                { backgroundColor: palette.controlBg },
                (busy || pressed) && { opacity: 0.6 },
              ]}>
              <Text style={[styles.secondaryLabel, { color: palette.accentSolid }]}>
                {t('downloads.riwayahChooseFile', 'Choose the downloaded file')}
              </Text>
            </Pressable>
          ) : null}

          <Text style={[styles.help, styles.orLine, { color: palette.muted }]}>
            {t('downloads.riwayahOrLink', 'Or paste a direct link to the file:')}
          </Text>

          <TextInput
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!busy}
            placeholder="https://…"
            placeholderTextColor={String(palette.muted)}
            accessibilityLabel={t('downloads.riwayahLink', 'Link to the data file')}
            style={[
              styles.input,
              { color: palette.text, backgroundColor: palette.controlBg },
            ]}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('downloads.riwayahInstall', 'Add this muṣḥaf')}
            disabled={busy || otherRunning || url.trim().length === 0}
            onPress={install}
            style={[
              styles.secondary,
              styles.orLine,
              { backgroundColor: palette.controlBg },
              (busy || otherRunning || url.trim().length === 0) && { opacity: 0.5 },
            ]}>
            <Text style={[styles.secondaryLabel, { color: palette.accentSolid }]}>
              {t('downloads.riwayahInstall', 'Add this muṣḥaf')}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A riwayah not yet on the device: a row of the group, padded like one,
  // with no surface of its own — the group is the card.
  block: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },
  title: { fontSize: TYPE.body.fontSize, fontWeight: '500' },
  sub: { fontSize: TYPE.footnote.fontSize, marginTop: SPACING.xs, lineHeight: 18 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  grow: { flex: 1 },
  // The one filled control on the row: compact, beside the name.
  pill: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    minHeight: 34,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: { fontWeight: '600', fontSize: TYPE.footnote.fontSize },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: SPACING.xl,
    marginTop: SPACING.xs,
  },
  // Tonal, not outlined: a filled pill in the control colour.
  secondary: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginBottom: SPACING.xs,
  },
  secondaryLabel: { fontWeight: '600', fontSize: TYPE.callout.fontSize },
  orLine: { marginTop: SPACING.md },
  help: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginBottom: SPACING.sm },
  input: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPE.callout.fontSize,
  },
  errorBox: { marginTop: SPACING.md },
  error: { fontSize: TYPE.footnote.fontSize, fontWeight: '600', lineHeight: 18 },
  detail: { fontSize: TYPE.caption.fontSize, marginTop: SPACING.xs, lineHeight: 15 },
});
