/**
 * The Hadith packs in Settings → Downloads: every one on the device or on
 * its way, what it weighs, and a delete — the same rows as the Qur'an's.
 * Fetching starts in the Hadith tab, where the reader sees what a pack is
 * for; this is where they are kept track of and removed.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { languageLabel } from '../i18n/languages';
import { SettingsGroup } from '../screens/settings/SettingsGroup';
import { ConfirmModal } from '../components/ConfirmModal';
import { DownloadRow, TextAction } from '../quran/downloadsUi';
import { WHOLE_PACK, findHadithLanguage } from './catalog';
import { deletePack, usePackStatuses, type PackStatus } from './packs';
import { cancelPack, downloadPack } from './hadithDownloads';
import type { PackKey } from './packTypes';
import LIBRARY_BOOKS from './libraryBooks.json';

/** A pack's language in its own words: the app's name for one of its thirteen, HadeethEnc's for the rest. */
const packLanguageLabel = (code: string) => (languageLabel(code) !== code ? languageLabel(code) : findHadithLanguage(code)?.native ?? code);

/** What a pack is called, in a row. */
export function packLabel(key: string, t: TFunction): string {
  const [kind, a, b] = key.split('/');
  if (kind === 'henc') {
    // One pack a language now (`catalog.ts`); the starter set and the
    // packs by topic are what a device that had them before still holds.
    const what =
      a === WHOLE_PACK
        ? t('hadith.packAll')
        : a === 'starter'
          ? t('hadith.packStarter')
          : t(`hadith.topic.${a.replace('cat-', '')}`, { defaultValue: t('hadith.topics') });
    return `${what} · ${packLanguageLabel(b)}`;
  }
  if (kind === 'categories') return `${t('hadith.packCategories')} · ${packLanguageLabel(a)}`;
  if (kind === 'nawawi') return t('hadith.packNawawi');
  // A Library book by its own title: there is no `hadith.book.<id>` for it, and the row read as the key.
  if (kind === 'library') return (LIBRARY_BOOKS as Array<{ id: string; title: string }>).find(x => x.id === a)?.title ?? t('hadith.library.tab');
  return t(`hadith.book.${a}`);
}

/** Bytes the Hadith packs take on the device. */
export function hadithBytes(statuses: Record<string, PackStatus>): number {
  let sum = 0;
  for (const s of Object.values(statuses)) if (s.state === 'ready') sum += s.bytes;
  return sum;
}

export function HadithDownloadsSection() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const statuses = usePackStatuses();
  const [pending, setPending] = useState<string | null>(null);
  const keys = Object.keys(statuses)
    .filter(k => statuses[k].state !== 'absent')
    .sort((x, y) => packLabel(x, t).localeCompare(packLabel(y, t)));
  if (!keys.length) return null;

  return (
    <>
      <SettingsGroup title={t('nav.hadith')} footer={t('hadith.downloadsFooter')}>
        {keys.map(key => {
          const s = statuses[key];
          const label = packLabel(key, t);
          return (
            <DownloadRow
              key={key}
              title={label}
              sub={s.state === 'failed' ? t('hadith.downloadFailed') : undefined}
              bytes={s.state === 'ready' ? s.bytes : undefined}
              progress={s.state === 'downloading' ? s.progress : undefined}
              actions={
                s.state === 'downloading' ? (
                  <TextAction label={t('common.cancel')} color={palette.danger} onPress={() => cancelPack(key as PackKey)} />
                ) : s.state === 'failed' ? (
                  <TextAction label={t('common.retry')} color={palette.accentSolid} onPress={() => void downloadPack(key as PackKey)} />
                ) : (
                  <TextAction label={t('common.delete')} color={palette.danger} onPress={() => setPending(key)} />
                )
              }
            />
          );
        })}
      </SettingsGroup>
      <ConfirmModal
        visible={pending != null}
        title={t('downloads.deleteTitle')}
        message={t('downloads.deleteBody', { what: pending ? packLabel(pending, t) : '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const key = pending;
          setPending(null);
          if (key) void deletePack(key as PackKey);
        }}
      />
    </>
  );
}
