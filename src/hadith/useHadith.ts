/**
 * The Hadith screens' reads, as hooks: a list's rows, the packs it still
 * needs, and the topic tree — each read again when a pack arrives or goes.
 *
 * "Arrives or goes" is `usePacksReadyKey`, not `usePackStatuses`: the
 * statuses change on every tick of a download's progress, and an effect
 * keyed on them re-read every list of the shelf four times a second for
 * as long as a book was coming down.
 */
import { useEffect, useMemo, useState } from 'react';
import { useHadithLanguage } from './hadithLang';
import {
  bookKey,
  findHub,
  findSet,
  packsForSet,
  packsForTopics,
  compilationNeeds,
  findCompilation,
  isRecordList,
  parseList,
  type CategoryTree,
} from './catalog';
import { folderIds, memoIds, type HadithRecord } from './hadithRecord';
import { useHadithRecord } from './hadithStore';
import { categoryTree, listRows, topicCounts, type ListRow } from './library';
import { usePackStatuses, usePacksReadyKey, type PackStatus } from './packs';
import type { PackKey } from './packTypes';

/** The packs a list reads from, in this language. */
export function packsForList(list: string, appLang: string): PackKey[] {
  const ref = parseList(list);
  if (!ref || isRecordList(ref)) return [];
  if (ref.kind === 'book') return [bookKey(ref.id)];
  // Every entry of it is HadeethEnc's: the one pack, and the topic tree.
  if (ref.kind === 'agreed') return packsForTopics([], appLang, false);
  if (ref.kind === 'comp') {
    // HadeethEnc for the hadith it holds in translation, and the books the rest are read from.
    const c = findCompilation(ref.id);
    return c ? [...packsForTopics([], appLang, false), ...compilationNeeds(c).map(bookKey)] : [];
  }
  if (ref.kind === 'cat') return packsForTopics([ref.id], appLang);
  if (ref.kind === 'hub') return packsForTopics(findHub(ref.id)?.topics ?? [], appLang);
  const set = findSet(ref.id);
  return set ? packsForSet(set, appLang) : [];
}

export type PackSummary = {
  keys: PackKey[];
  missing: PackKey[];
  downloading: boolean;
  /** 0–1 across the packs still to come. */
  progress: number;
  failed: boolean;
};

export function summarisePacks(keys: readonly PackKey[], statuses: Record<string, PackStatus>): PackSummary {
  const missing = keys.filter(k => statuses[k]?.state !== 'ready');
  let sum = 0;
  let downloading = false;
  let failed = false;
  for (const k of missing) {
    const s = statuses[k];
    if (s?.state === 'downloading') {
      downloading = true;
      sum += s.progress;
    } else if (s?.state === 'failed') failed = true;
  }
  return {
    keys: [...keys],
    missing,
    downloading,
    progress: missing.length ? sum / missing.length : 1,
    failed,
  };
}

/** The language hadith are read in: the app's, unless another is chosen in Settings → Hadith (`hadithLang.ts`). */
export function useAppLang(): string {
  return useHadithLanguage();
}

/** The topic tree in the app's language, once its pack is here. */
export function useCategoryTree(): CategoryTree | null {
  const lang = useAppLang();
  const here = usePacksReadyKey();
  const [tree, setTree] = useState<CategoryTree | null>(null);
  useEffect(() => {
    let live = true;
    categoryTree(lang).then(t => {
      if (live) setTree(t);
    });
    return () => {
      live = false;
    };
  }, [lang, here]);
  return tree;
}

/** How many hadith are under each topic, from what is on the device (`topicCounts`). */
export function useTopicCounts(): Map<string, number> | null {
  const lang = useAppLang();
  const here = usePacksReadyKey();
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    let live = true;
    topicCounts(lang)
      .then(c => {
        if (live) setCounts(c);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [lang, here]);
  return counts;
}

/** The ids of a list that is the reader's own marks — bookmarks, a folder of them, what is being memorised — or null. */
export function recordListIds(list: string, rec: HadithRecord): string[] | null {
  const ref = parseList(list);
  // Those in no folder: the folders stand over them on the list (`ListTools`). With no folders, all of them.
  if (ref?.kind === 'bookmarks') return folderIds(rec, '');
  if (ref?.kind === 'memo') return memoIds(rec);
  if (ref?.kind === 'folder') return folderIds(rec, ref.id);
  return null;
}

/** A list's rows (null while reading) and the packs it is waiting on. */
export function useListRows(list: string): { rows: ListRow[] | null; packs: PackSummary } {
  const lang = useAppLang();
  const statuses = usePackStatuses();
  const here = usePacksReadyKey();
  const rec = useHadithRecord();
  const bookmarks = recordListIds(list, rec);
  const bookmarkKey = bookmarks?.join('|') ?? '';
  const keys = useMemo(() => packsForList(list, lang), [list, lang]);
  const packs = summarisePacks(keys, statuses);
  const ready = packs.missing.length === 0;
  const [rows, setRows] = useState<ListRow[] | null>(null);
  useEffect(() => {
    if (!ready) {
      setRows(null);
      return undefined;
    }
    let live = true;
    listRows(list, lang, bookmarkKey ? bookmarkKey.split('|') : []).then(r => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [list, lang, ready, here, bookmarkKey]);
  return { rows, packs };
}
