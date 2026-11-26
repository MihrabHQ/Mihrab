/**
 * What a reader does with the hadith beyond reading them, as the pieces
 * the list, the reader and the tab put on their pages: bookmark folders,
 * memorising, and a reading plan. The record of all three is
 * `hadith/hadithRecord.ts`; the plan's arithmetic is `hadith/plan.ts`.
 *
 *   • FOLDERS. A bookmark can be filed in one. The bookmarks list shows
 *     the folders above the bookmarks that are in none; a folder's own
 *     list has Rename and Delete (its bookmarks are kept, in no folder).
 *   • MEMORISING. "Memorise this hadith" on a hadith's page puts it in the
 *     Memorising list. Read from that list, a hadith is hidden behind its
 *     opening words until asked for: recite, then check, then say whether
 *     it was known — which marks it memorised, a mark that can be taken
 *     back.
 *   • A PLAN. "Start a reading plan" on a set, a book or a compilation:
 *     thirty, sixty or ninety days. The list then says which day it is
 *     and how much of today's share is read; the tab's Learn page carries
 *     the same line and goes on from the first unread hadith. No reminder
 *     is sent yet.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useSheetSides } from '../../responsive/sheetSides';
import {
  PLAN_DAYS,
  folderOf,
  foldersOf,
  memoOf,
  nameFolder,
  planOf,
  setFolder,
  setMemo,
  setPlan,
  type HadithRecord,
} from '../../hadith/hadithRecord';
import { updateHadithRecord } from '../../hadith/hadithStore';
import { localDay, planProgress, type PlanProgress } from '../../hadith/plan';
import { refreshHadithPlanReminder } from '../../notifications/hadithReminders';
import { inputChromeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

const now = () => Date.now();
/** A folder's id: made once, never shown. */
export const newFolderId = (at: number = now()) => `f${at.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { palette } = useAppPalette();
  // A Modal is its own window on Android: nothing resizes it for the keyboard.
  const keyboard = useKeyboardInset();
  const sides = useSheetSides();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.scrim,
          {
            backgroundColor: palette.overlay,
            paddingBottom: SPACING.lg + keyboard,
            // rtl-safe: the vertical bar is on a physical side
            paddingLeft: SPACING.lg + sides.left,
            // rtl-safe: the vertical bar is on a physical side
            paddingRight: SPACING.lg + sides.right,
          },
        ]}
      >
        <View style={[styles.sheet, { backgroundColor: palette.card }]}>
          <Text style={[styles.sheetTitle, { color: palette.text }]} accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function Choice({ label, chosen, onPress, testID }: { label: string; chosen?: boolean; onPress: () => void; testID?: string }) {
  const { palette } = useAppPalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!chosen }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.choice, { borderColor: palette.border ?? palette.muted }, pressed && styles.pressed]}
    >
      <Text style={[styles.choiceText, { color: chosen ? palette.accentSolid : palette.text }]}>{label}</Text>
      {chosen ? <Text style={[styles.choiceText, { color: palette.accentSolid }]}>✓</Text> : null}
    </Pressable>
  );
}

/** One line of text asked for: a folder's name. */
export function NameSheet({ visible, title, initial, onClose, onSave }: { visible: boolean; title: string; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);
  const ok = text.trim().length > 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        placeholder={t('hadith.folder.name')}
        placeholderTextColor={palette.muted}
        style={[styles.input, inputChromeStyle(palette), { color: palette.text, backgroundColor: palette.bg }]}
        accessibilityLabel={t('hadith.folder.name')}
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={() => ok && onSave(text)}
        testID="hadith-folder-name"
      />
      <View style={styles.actions}>
        <Button label={t('common.cancel')} variant="tertiary" onPress={onClose} />
        <Button label={t('common.save')} onPress={() => ok && onSave(text)} />
      </View>
    </Sheet>
  );
}

/** Which folder a bookmark is in: one of them, none, or a new one. */
export function FolderSheet({ visible, onClose, rec, id }: { visible: boolean; onClose: () => void; rec: HadithRecord; id: string }) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);
  const current = folderOf(rec, id);
  const put = (folder: string) => {
    void updateHadithRecord(r => setFolder(r, id, folder, now()));
    onClose();
  };
  if (naming) {
    return (
      <NameSheet
        visible={visible}
        title={t('hadith.folder.new')}
        initial=""
        onClose={() => setNaming(false)}
        onSave={name => {
          const folder = newFolderId();
          void updateHadithRecord(r => setFolder(nameFolder(r, folder, name, now()), id, folder, now()));
          setNaming(false);
          onClose();
        }}
      />
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('hadith.folder.move')}>
      <View>
        <Choice label={t('hadith.folder.none')} chosen={current === ''} onPress={() => put('')} />
        {foldersOf(rec).map(([folder, name]) => (
          <Choice key={folder} label={name} chosen={current === folder} onPress={() => put(folder)} />
        ))}
        <Choice label={`+ ${t('hadith.folder.new')}`} onPress={() => setNaming(true)} testID="hadith-folder-new" />
      </View>
      <View style={styles.actions}>
        <Button label={t('common.cancel')} variant="tertiary" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** How long a plan is to take. */
export function PlanSheet({ visible, onClose, list }: { visible: boolean; onClose: () => void; list: string }) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('hadith.plan.choose')}>
      <View>
        {PLAN_DAYS.map(days => (
          <Choice
            key={days}
            label={t('hadith.plan.daysN', { n: days })}
            testID={`hadith-plan-${days}`}
            onPress={() => {
              void updateHadithRecord(r => setPlan(r, { list, days, from: localDay(new Date()) }, now())).then(refreshHadithPlanReminder);
              onClose();
            }}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Button label={t('common.cancel')} variant="tertiary" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** A plan's day, in one line: "Day 4 of 90 · 3 of 17 today", or that it is finished. */
export function planLine(p: PlanProgress, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (p.finished) return t('hadith.plan.finished');
  return t('hadith.plan.line', { day: Math.min(p.day, p.days), days: p.days, done: Math.min(p.doneToday, p.target), target: p.target });
}

function Link({ label, onPress, muted, testID }: { label: string; onPress: () => void; muted?: boolean; testID?: string }) {
  const { palette } = useAppPalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} testID={testID} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={[styles.link, { color: muted ? palette.muted : palette.accentSolid }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Over a list's rows: a plan's line and its start or end, on a list that
 * can be read through (`plannable`); the folders, over the bookmarks; a
 * folder's Rename and Delete, over its own list.
 */
export function ListTools({
  list,
  kind,
  folder,
  plannable,
  rowIds,
  rec,
  onOpenFolder,
  onFolderGone,
}: {
  list: string;
  kind: 'bookmarks' | 'folder' | 'other';
  folder?: string;
  plannable: boolean;
  rowIds: readonly string[] | null;
  rec: HadithRecord;
  onOpenFolder: (id: string) => void;
  onFolderGone: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [planning, setPlanning] = useState(false);
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const plan = planOf(rec);
  const mine = plan?.list === list ? plan : null;
  const folders = foldersOf(rec);
  const folderName = folder ? folders.find(f => f[0] === folder)?.[1] ?? '' : '';

  return (
    <View style={styles.tools}>
      {plannable && rowIds?.length ? (
        mine ? (
          <View style={styles.planBox} testID="hadith-plan-line">
            <Text style={[styles.planText, { color: palette.text }]}>{planLine(planProgress(mine, rowIds, rec, new Date()), t)}</Text>
            <Link label={t('hadith.plan.end')} muted onPress={() => void updateHadithRecord(r => setPlan(r, null, now())).then(refreshHadithPlanReminder)} testID="hadith-plan-end" />
          </View>
        ) : (
          <Link label={t('hadith.plan.start')} onPress={() => setPlanning(true)} testID="hadith-plan-start" />
        )
      ) : null}

      {kind === 'bookmarks' ? (
        <View style={styles.folders}>
          {folders.map(([id, name]) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => onOpenFolder(id)}
              style={({ pressed }) => [styles.folder, { backgroundColor: palette.card }, pressed && styles.pressed]}
            >
              <Text style={[styles.folderName, { color: palette.text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.folderCount, { color: palette.muted }]}>›</Text>
            </Pressable>
          ))}
          <Link label={`+ ${t('hadith.folder.new')}`} onPress={() => setNaming('new')} testID="hadith-folders-new" />
        </View>
      ) : null}

      {kind === 'folder' && folder ? (
        <View style={styles.folderActions}>
          <Link label={t('hadith.folder.rename')} onPress={() => setNaming('rename')} />
          <Link
            label={t('hadith.folder.delete')}
            muted
            onPress={() => {
              void updateHadithRecord(r => nameFolder(r, folder, '', now()));
              onFolderGone();
            }}
          />
          <Text style={[styles.hint, { color: palette.muted }]}>{t('hadith.folder.deleteNote')}</Text>
        </View>
      ) : null}

      <PlanSheet visible={planning} onClose={() => setPlanning(false)} list={list} />
      <NameSheet
        visible={naming != null}
        title={naming === 'rename' ? t('hadith.folder.rename') : t('hadith.folder.new')}
        initial={naming === 'rename' ? folderName : ''}
        onClose={() => setNaming(null)}
        onSave={name => {
          const id = naming === 'rename' && folder ? folder : newFolderId();
          void updateHadithRecord(r => nameFolder(r, id, name, now()));
          setNaming(null);
        }}
      />
    </View>
  );
}

/** At a hadith's foot: memorise it or stop; and, once bookmarked, its folder. */
export function ReaderTools({ id, rec }: { id: string; rec: HadithRecord }) {
  const { t } = useTranslation();
  const [filing, setFiling] = useState(false);
  const memo = memoOf(rec, id);
  const bookmarked = rec.items[id]?.b?.[0] === 1;
  const folder = folderOf(rec, id);
  const folderName = folder ? foldersOf(rec).find(f => f[0] === folder)?.[1] : undefined;
  return (
    <>
      <Link
        label={memo ? t('hadith.memo.remove') : t('hadith.memo.add')}
        muted={!!memo}
        onPress={() => void updateHadithRecord(r => setMemo(r, id, memo ? 0 : 1, now()))}
        testID="hadith-memo-toggle"
      />
      {bookmarked ? (
        <Link
          label={folderName ? t('hadith.folder.in', { name: folderName }) : t('hadith.folder.move')}
          onPress={() => setFiling(true)}
          testID="hadith-folder-move"
        />
      ) : null}
      <FolderSheet visible={filing} onClose={() => setFiling(false)} rec={rec} id={id} />
    </>
  );
}

/**
 * Over a hadith read from the Memorising list, in place of its text: say
 * it from memory, then ask for the text. With the text shown, the two
 * answers; "I knew it" marks it memorised.
 */
export function MemoGate({ shown, memorised, onShow, onKnew, onNotYet }: { shown: boolean; memorised: boolean; onShow: () => void; onKnew: () => void; onNotYet: () => void }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    <View style={[styles.gate, { backgroundColor: palette.card }]} testID="hadith-memo-gate">
      {memorised ? <Text style={[styles.hint, { color: palette.accentSolid }]}>{t('hadith.memo.done')}</Text> : null}
      {shown ? (
        <View style={styles.actions}>
          <Button label={t('hadith.memo.notYet')} variant="tertiary" onPress={onNotYet} />
          <Button label={t('hadith.memo.knew')} onPress={onKnew} />
        </View>
      ) : (
        <>
          <Text style={[styles.planText, { color: palette.text }]}>{t('hadith.memo.prompt')}</Text>
          <Button label={t('hadith.memo.show')} onPress={onShow} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', paddingTop: SPACING.lg },
  sheet: { borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md, width: '100%', maxWidth: 480, alignSelf: 'center' },
  sheetTitle: { fontSize: TYPE.headline.fontSize, fontWeight: '500' },
  input: { borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: TYPE.body.fontSize },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
  choice: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: SPACING.md },
  choiceText: { fontSize: TYPE.body.fontSize },
  pressed: { opacity: 0.6 },
  link: { fontSize: TYPE.callout.fontSize, fontWeight: '500' },
  tools: { gap: SPACING.md },
  planBox: { gap: SPACING.xs },
  planText: { fontSize: TYPE.callout.fontSize },
  folders: { gap: SPACING.sm },
  folder: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md },
  folderName: { flex: 1, fontSize: TYPE.body.fontSize },
  folderCount: { fontSize: TYPE.body.fontSize },
  folderActions: { gap: SPACING.sm },
  hint: { fontSize: TYPE.footnote.fontSize },
  gate: { borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
});
