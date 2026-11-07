/**
 * Pairing: this device's code, and the devices it has been introduced to.
 *
 * ── WHAT THIS SCREEN IS HONEST ABOUT ──────────────────────────────────
 *
 * THE CODE IS NOT A SECRET. It is this device's public key written for a
 * human, so the screen shows it permanently rather than behind a "reveal"
 * button, and says it is safe to copy or photograph. Treating a public key
 * as a password teaches the user the wrong thing about their own data and
 * makes the feature feel more dangerous than it is.
 *
 * PAIRING IS TWO-WAY, AND THE CONFIRMATION SAYS SO. The user carries one
 * code in one direction, which reads like a one-way import — so the dialog
 * before pairing states plainly that both devices will sync afterwards, what
 * happens where the two disagree, and — since removals travel now
 * (docs/sync-conflict-rules.md) — that a deletion on one is a deletion on
 * the other.
 *
 * THE FOLDER IS SOMEBODY ELSE'S JOB, AND THE COPY SAYS SO. Mihrab does not
 * move the file between devices; it writes one into a folder and reads what
 * it finds. Which folder, and what keeps it in step, is the user's choice —
 * Syncthing, Nextcloud, a shared drive. Explaining that up front is what
 * makes "nothing arrived" a thing they can debug rather than a mystery.
 *
 * REMOVING IS ONE-SIDED, AND SO DOES THAT. This device can stop talking to
 * a peer; it cannot reach into that peer and remove itself. The dialog says
 * to do it on both, because the alternative is a phone that keeps writing
 * files nobody opens and a user who thinks it did not work.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { useAppPalette } from '../hooks/useAppPalette';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { cardEdgeStyle } from '../theme/chrome';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE, typeStyle } from '../theme/typography';
import { HelpText } from '../components/ui/InfoSheet';
import { PairingQr } from './sync/PairingQr';
import { useSyncDialog } from './sync/useSyncDialog';
import { copyToClipboard, readClipboard } from '../sync/clipboard';
import { fingerprintOf, myPairingCode, getDeviceIdentity } from '../sync/deviceIdentity';
import {
  encryptedStoreDegraded,
  onEncryptedStoreDegraded,
} from '../storage/durableWrite';
import {
  defaultDeviceName,
  getDeviceName,
  MAX_DEVICE_NAME,
  setDeviceName,
} from '../sync/deviceName';
import { decode } from '../sync/pairingCode';
import {
  cameraIsAvailable,
  hasQrScanner,
  scanQrCode,
} from '../sync/qrScanner';
import {
  acceptPeer,
  addPeerByCode,
  awaiting,
  forgetPeer,
  listPeers,
  MAX_PEERS,
  renamePeer,
  type Peer,
} from '../sync/peers';
import { fromBase64, hasSecureRandom } from '../sync/secureRandom';
import { folderAt, hasFolderPicker, pickSyncFolder } from '../sync/folderAccess';
import { forgetDeparted } from '../sync/folderSync';
import { reportForRound } from '../sync/roundReport';
import { ensureSyncFolder, runSyncNow } from '../sync/runSync';
import {
  getSyncSettings,
  SYNC_FREQUENCIES,
  updateSyncSettings,
  type SyncFrequency,
  type SyncSettings,
} from '../sync/syncSettings';
import { Chip } from '../components/controls';
import { SYNC_CATEGORIES, type SyncCategory } from '../sync/snapshot';
import { useScrollBottomInset } from '../navigation/pageBottom';

type Palette = ReturnType<typeof useAppPalette>['palette'];

/**
 * Spelled out rather than built from the value, so every string this
 * screen shows can be found by searching for it.
 */
/**
 * How the screen waits for the other device, so the user does not.
 *
 * Pairing is two files passing through a folder that something else
 * carries — Syncthing, a cloud app — and that takes anywhere from a
 * second to a few minutes. Pressing Sync now before the file has
 * arrived reads "Nothing arrived", and the only thing to do was press
 * again, which is what people did, many times. So while this screen is
 * open and there is something to wait for (`awaiting`), it checks the
 * folder itself — a read-only round, nothing written — this often, for
 * this long after the last thing that gave it a reason, and says so.
 */
const WATCH_EVERY_MS = 10 * 1000;
const WATCH_FOR_MS = 10 * 60 * 1000;

const FREQUENCY_LABELS: Record<SyncFrequency, string> = {
  open: 'sync.freqOpen',
  '15min': 'sync.freq15Min',
  hourly: 'sync.freqHourly',
  daily: 'sync.freqDaily',
  off: 'sync.freqOff',
};

function PeerRow({
  peer,
  palette,
  onRename,
  onRemove,
  onAccept,
}: {
  peer: Peer;
  palette: Palette;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(peer.name ?? '');

  // A DEVICE WAITING TO BE ACCEPTED: its name and fingerprint, Accept and
  // Remove, and nothing else. Not renamed, not shown as synced: it has
  // sent nothing this device has read and received nothing from it.
  if (peer.pending) {
    return (
      <View style={styles.peerRow}>
        <View style={styles.peerText}>
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {peer.name || t('sync.unnamedDevice')}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('sync.fingerprint', { value: peer.fingerprint })}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.text }]}>
            {t('sync.pendingHelp')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sync.accept')}
          testID={`sync-accept-${peer.fingerprint}`}
          onPress={onAccept}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Text style={[typeStyle('footnote'), { color: palette.accent }]}>
            {t('sync.accept')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sync.remove')}
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Text style={[typeStyle('footnote'), { color: palette.danger }]}>
            {t('sync.remove')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.peerRow}>
      <View style={styles.peerText}>
        <TextInput
          accessibilityLabel={t('sync.peerNameLabel')}
          value={name}
          onChangeText={setName}
          onEndEditing={() => onRename(name)}
          onSubmitEditing={() => onRename(name)}
          placeholder={t('sync.unnamedDevice')}
          placeholderTextColor={String(palette.muted)}
          maxLength={MAX_DEVICE_NAME}
          style={[typeStyle('body'), styles.peerName, { color: palette.text }]}
        />
        <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
          {t('sync.fingerprint', { value: peer.fingerprint })}
          {'  ·  '}
          {peer.via === 'code'
            ? t('sync.viaCode')
            : t('sync.viaAnnounced')}
        </Text>
        {/* THE PEER'S RECORD, not our last read of its file.
            `lastSeenAt` says "we opened a file of theirs this round", which
            is true every two minutes for ever — nothing in the folder is
            ever deleted — and so read "Last synced a moment ago" for a
            device that had not reached this one in a day. `dataAt` is when
            the snapshot was BUILT, which is the thing the label claims.
            Falls back for a peer paired before the field existed. */}
        <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
          {peer.dataAt ?? peer.lastSeenAt
            ? t('sync.lastSeen', {
                when: new Date(
                  peer.dataAt ?? peer.lastSeenAt ?? 0,
                ).toLocaleString(),
              })
            : t('sync.neverSeen')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sync.remove')}
        onPress={onRemove}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
      >
        <Text style={[typeStyle('footnote'), { color: palette.danger }]}>
          {t('sync.remove')}
        </Text>
      </Pressable>
    </View>
  );
}

export function SyncScreen() {
  // One ref for both returns: the not-ready page and the real one are
  // never mounted together.
  const kb = useKeyboardAwareScroll<ScrollViewInstance>();
  // Pads its own end; the stack reserves nothing here (pageBottom.ts).
  const bottom = useScrollBottomInset();
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  const [code, setCode] = useState<string | null>(null);
  /** This device's own fingerprint, for the other screen to compare. */
  const [myFingerprint, setMyFingerprint] = useState<string | null>(null);
  /**
   * The encrypted store has refused something this session. For sync that
   * means the identity and the peer list may be unreachable (they never
   * fall back to plaintext), and for the rest that a record sits in a
   * plaintext file. Said here, where the person it concerns is looking.
   */
  const [degraded, setDegraded] = useState(encryptedStoreDegraded());
  useEffect(() => onEncryptedStoreDegraded(() => setDegraded(true)), []);
  const [deviceName, setName] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [entered, setEntered] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [syncing, setSyncing] = useState(false);
  /** Whether to offer Scan: a build with the module AND a camera to use. */
  const [canScan, setCanScan] = useState(false);
  // The app's own dialog rather than the platform's — see useSyncDialog.
  const { ask, tell, dialog } = useSyncDialog();

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!hasSecureRandom()) {
        if (alive) setReady(false);
        return;
      }
      try {
        // Adopt the platform's default folder before reading the settings,
        // so a first visit shows a folder already in place rather than a
        // button — on iOS there is nothing for the user to decide.
        await ensureSyncFolder();
        if (hasQrScanner()) {
          const camera = await cameraIsAvailable();
          if (alive) setCanScan(camera);
        }
        const [mine, name, list, stored] = await Promise.all([
          myPairingCode(),
          getDeviceName(),
          listPeers(),
          getSyncSettings(),
        ]);
        if (!alive) return;
        setCode(mine);
        try {
          setMyFingerprint(fingerprintOf((await getDeviceIdentity()).publicKey));
        } catch {
          /* the code is enough */
        }
        setName(name);
        setPeers(list);
        setSettings(stored);
        setReady(true);
      } catch {
        if (alive) setReady(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshPeers = useCallback(async () => {
    setPeers(await listPeers());
  }, []);

  // ── WATCHING THE FOLDER ────────────────────────────────────────────
  // Armed by anything that gives the screen a reason to expect a file:
  // opening it, pairing, accepting. Disarmed by time, or by there being
  // nothing left to wait for.
  const watchUntil = useRef(0);
  const [watching, setWatching] = useState<'answer' | 'announcement' | null>(null);
  const armWatch = useCallback(() => {
    watchUntil.current = Date.now() + WATCH_FOR_MS;
  }, []);
  useFocusEffect(
    useCallback(() => {
      armWatch();
      return () => {
        watchUntil.current = 0;
      };
    }, [armWatch]),
  );
  // What the last check saw, so a change can be announced once.
  const seenRef = useRef(peers);
  seenRef.current = peers;
  useEffect(() => {
    const reason = ready && settings?.folder ? awaiting(peers) : null;
    setWatching(reason);
    if (!reason) return;
    let inFlight = false;
    const check = async () => {
      if (inFlight || Date.now() > watchUntil.current) {
        if (Date.now() > watchUntil.current) setWatching(null);
        return;
      }
      inFlight = true;
      try {
        const result = await runSyncNow({ readOnly: true });
        if (!result.ok) return;
        const before = seenRef.current;
        const after = await listPeers();
        setPeers(after);
        // A device that has your code just wrote its first file.
        const arrived = after.find(p => p.pending && !before.some(b => b.pk === p.pk));
        if (arrived) {
          tell(
            t('sync.pendingTitle'),
            t('sync.pendingBody', {
              device: arrived.name ?? t('sync.unnamedDevice'),
              fingerprint: arrived.fingerprint,
            }),
          );
          return;
        }
        // The device you paired with has answered: both know each other.
        const answered = after.find(
          p => !p.pending && p.lastSeenAt && before.some(b => b.pk === p.pk && !b.lastSeenAt),
        );
        if (answered) {
          setSettings(await getSyncSettings());
          tell(
            t('sync.answeredTitle'),
            t('sync.answeredBody', { device: answered.name ?? t('sync.unnamedDevice') }),
          );
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void check(), WATCH_EVERY_MS);
    return () => clearInterval(timer);
  }, [peers, ready, settings?.folder, t, tell]);

  const onCopy = useCallback(async () => {
    if (!code) return;
    const result = await copyToClipboard(code);
    if (result === 'failed') {
      tell(t('sync.copyFailed'));
      return;
    }
    // Android 13 and up shows its own confirmation; a second one is noise.
    if (result === 'copied-quietly') tell(t('sync.copied'));
  }, [code, t, tell]);

  const onPaste = useCallback(async () => {
    const text = await readClipboard();
    if (text.trim()) setEntered(text.trim());
  }, []);

  const onRenameSelf = useCallback(
    (next: string) => {
      void (async () => {
        const saved = await setDeviceName(next);
        setName(saved);
      })();
    },
    [],
  );

  const pairWith = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      const parsed = decode(text);
      if (!parsed.ok) {
        tell(t('sync.errorBadCodeTitle'), t('sync.errorBadCode'));
        return;
      }
      const fingerprint = fingerprintOf(parsed.key);

      ask({
        title: t('sync.pairWarnTitle', { value: fingerprint }),
        message: t('sync.pairWarnBody'),
        confirmLabel: t('sync.pairConfirm'),
        onConfirm: () => {
          void (async () => {
            setBusy(true);
            try {
              const result = await addPeerByCode(text);
              if (!result.ok) {
                tell(
                  t('sync.errorBadCodeTitle'),
                  result.reason === 'this-device'
                    ? t('sync.errorThisDevice')
                    : result.reason === 'too-many'
                      ? t('sync.errorTooMany', { max: MAX_PEERS })
                      : t('sync.errorBadCode'),
                );
                return;
              }
              setEntered('');
              await refreshPeers();

              // ANNOUNCE AT ONCE, not on the next app open.
              //
              // Pairing is one-directional: this device now knows the
              // other, and the other has never heard of this one. It finds
              // out by reading a file with our key in it, so the sooner
              // that file exists the sooner the pair is real. Waiting for
              // the next foreground meant the user had to carry a second
              // code back by hand, which is what this is here to stop.
              const current = await getSyncSettings();
              if (!current.folder) {
                // No folder is no channel, so promising two-way sync here
                // would be a lie the user finds out about later.
                tell(t('sync.pairedTitle'), t('sync.pairedNeedsFolder'));
                return;
              }
              setSyncing(true);
              try {
                await runSyncNow();
              } finally {
                setSyncing(false);
              }
              setSettings(await getSyncSettings());
              await refreshPeers();
              armWatch();
              tell(t('sync.pairedTitle'), t('sync.pairedBody'));
            } catch {
              tell(t('sync.errorSaveTitle'), t('sync.errorSaveBody'));
            } finally {
              setBusy(false);
            }
          })();
        },
      });
    },
    [armWatch, ask, busy, refreshPeers, t, tell],
  );

  const onAdd = useCallback(() => pairWith(entered), [entered, pairWith]);

  /**
   * Scan, then go straight to the same confirmation a typed code gets.
   *
   * Not into the text field first: the user pointed a camera at a code and
   * watched it be read, so asking them to look at the same string again and
   * press another button is ceremony. The fingerprint in the dialog is the
   * check that matters, and they still get that.
   */
  const onScan = useCallback(() => {
    if (busy) return;
    void (async () => {
      const result = await scanQrCode({
        hint: t('sync.scanHint'),
        cancel: t('common.cancel'),
        // The viewfinder is drawn in the accent the user chose, so the one
        // full-screen native surface in the app is not the one that looks
        // like somebody else's.
        accent: String(palette.accentSolid),
      });
      if (result.ok) {
        setEntered(result.text);
        pairWith(result.text);
        return;
      }
      // A cancel is a decision, and the app should say nothing about it.
      if (result.reason === 'cancelled') return;
      if (result.reason === 'denied') {
        tell(t('sync.scanDeniedTitle'), t('sync.scanDeniedBody'));
        return;
      }
      if (result.reason === 'no-camera') {
        tell(t('sync.scanNoCameraTitle'), t('sync.scanNoCameraBody'));
        return;
      }
      tell(
        t('sync.syncFailedTitle'),
        t('sync.syncFailedBody', { detail: result.detail ?? '' }),
      );
    })();
  }, [busy, pairWith, palette.accentSolid, t, tell]);

  const onChooseFolder = useCallback(() => {
    void (async () => {
      if (!hasFolderPicker()) {
        tell(t('sync.errorUnsupported'));
        return;
      }
      try {
        const picked = await pickSyncFolder();
        // Null is a cancel, not a failure. Saying nothing is the correct
        // response to someone deciding not to.
        if (!picked) return;
        setSettings(await updateSyncSettings({ folder: picked, lastError: null }));
      } catch (e) {
        // Never `String(e)` here. What the user saw was
        // "java.io.FileNotFoundException: could not create a folder in
        // there" (Pixel, 2026-08-24) — the name of a Java class and an
        // instruction to nobody. The native side answers with a code, and
        // every code it can answer with has a sentence someone can act on.
        const code = (e as { code?: string } | null)?.code;
        tell(
          t('sync.errorFolderTitle'),
          code === 'no_picker' || code === 'no_activity'
            ? t('sync.errorUnsupported')
            : t('sync.errorFolderUnwritable'),
        );
      }
    })();
  }, [t, tell]);

  const onSyncNow = useCallback(() => {
    if (syncing) return;
    void (async () => {
      setSyncing(true);
      try {
        const result = await runSyncNow();
        setSettings(await getSyncSettings());
        if (result.ok) await refreshPeers();
        // "Synced" is the wrong word for a round that exchanged nothing,
        // and telling the quiet cases apart IS the diagnosis. That ladder
        // lives in `roundReport.ts` so this screen and the header button
        // cannot drift apart on it, which they had already begun to.
        const report = reportForRound(result, await listPeers(), {
          unnamedDevice: t('sync.unnamedDevice'),
        });
        tell(t(report.title), t(report.body, report.vars));
      } finally {
        setSyncing(false);
      }
    })();
  }, [refreshPeers, syncing, t, tell]);

  const onToggleCategory = useCallback(
    (category: SyncCategory, next: boolean) => {
      void (async () => {
        const current = settings ?? (await getSyncSettings());
        setSettings(
          await updateSyncSettings({
            selection: { ...current.selection, [category]: next },
          }),
        );
      })();
    },
    [settings],
  );

  const onChooseFrequency = useCallback((next: SyncFrequency) => {
    void (async () => {
      setSettings(await updateSyncSettings({ autoFrequency: next }));
    })();
  }, []);

  // ACCEPTING IS THE SAME DECISION AS TYPING THE CODE, so it asks the
  // same question, with the fingerprint the other device shows under
  // "This device" for the user to compare before answering.
  const onAccept = useCallback(
    (peer: Peer) => {
      ask({
        title: t('sync.pairWarnTitle', { value: peer.fingerprint }),
        message: `${t('sync.acceptBody')}\n\n${t('sync.pairWarnBody')}`,
        confirmLabel: t('sync.accept'),
        onConfirm: () => {
          void (async () => {
            await acceptPeer(peer.pk);
            await refreshPeers();
            // AND WRITE FOR IT NOW: the accepted device is waiting for a
            // file sealed to it, and the next app open is too late to be
            // the first time it gets one.
            setSyncing(true);
            try {
              await runSyncNow();
            } finally {
              setSyncing(false);
            }
            setSettings(await getSyncSettings());
            await refreshPeers();
            armWatch();
          })();
        },
      });
    },
    [armWatch, ask, refreshPeers, t],
  );

  const onRemove = useCallback(
    (peer: Peer) => {
      ask({
        title: t('sync.removeTitle', {
          value: peer.name || t('sync.unnamedDevice'),
        }),
        message: t('sync.removeBody'),
        confirmLabel: t('sync.remove'),
        destructive: true,
        onConfirm: () => {
          void (async () => {
            await forgetPeer(peer.pk);
            // AND ITS FILE. Left in the folder it is a frozen snapshot that
            // nothing will ever rewrite, and a frozen snapshot keeps
            // asserting a record that has since moved on — which is how a
            // replaced Mac spent a day putting a cleared sunnah back on a
            // phone. See `forgetDeparted`. Best effort: a folder that will
            // not delete must not turn "forget this device" into an error.
            const chosen = await getSyncSettings();
            if (chosen.folder) {
              try {
                await forgetDeparted(
                  folderAt(chosen.folder.handle),
                  fromBase64(peer.pk),
                );
              } catch {
                // Unreachable folder, revoked grant, older native side.
              }
            }
            await refreshPeers();
          })();
        },
      });
    },
    [ask, refreshPeers, t],
  );

  const card = {
    backgroundColor: palette.card,
    borderRadius: RADIUS.md,
    ...cardEdgeStyle(palette),
  };

  if (ready === false) {
    return (
      <ScrollView
        ref={kb.ref}
        automaticallyAdjustKeyboardInsets
        style={styles.scroll}
        // Below the transparent iOS header, as every pushed page.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: SPACING.lg + bottom },
          kb.contentPadding,
        ]}>
        <CenteredColumn innerStyle={styles.stack} style={styles.stack}>
          <View style={[styles.card, card]}>
            <Text style={[typeStyle('body'), { color: palette.text }]}>
              {t('sync.notReady')}
            </Text>
          </View>
        </CenteredColumn>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={kb.ref}
      automaticallyAdjustKeyboardInsets
      style={styles.scroll}
      // Below the transparent iOS header, as every pushed page. Without
      // it the first card sat under the title and the back chevron.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        { paddingBottom: SPACING.lg + bottom },
        kb.contentPadding,
      ]}>
      <CenteredColumn innerStyle={styles.stack} style={styles.stack}>
        {/* One explanation, two lines, the rest a tap away. The intro and
            the folder card each carried a paragraph saying the same thing
            (redesign-plan B.10.4); the intro is the one that stays, with the
            folder card's fuller version behind the ⓘ. */}
        {degraded ? (
          <View style={[styles.card, card]}>
            <Text style={[typeStyle('body'), { color: palette.danger }]}>
              {t('sync.storeDegraded')}
            </Text>
          </View>
        ) : null}

        <HelpText
          title={t('sync.folderSection')}
          text={`${t('sync.pairIntro')}\n\n${t('sync.folderHelp')}`}
          style={[typeStyle('body'), styles.intro]}
          color={palette.text}
        />

        <Text
          style={[typeStyle('label'), styles.section, { color: palette.muted }]}
        >
          {t('sync.folderSection')}
        </Text>
        <View style={[styles.card, card]}>
          {settings?.folder ? (
            <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
              {settings.folder.kind === 'app'
                ? t('sync.folderAppHint', { value: settings.folder.label })
                : t('sync.folderChosen', { value: settings.folder.label })}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                settings?.folder
                  ? t('sync.changeFolder')
                  : t('sync.chooseFolder')
              }
              testID="sync-choose-folder"
              onPress={onChooseFolder}
              style={({ pressed }) => [
                styles.secondary,
                styles.grow,
                { borderColor: palette.border, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typeStyle('headline'), { color: palette.text }]}>
                {settings?.folder
                  ? t('sync.changeFolder')
                  : t('sync.chooseFolder')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sync.syncNow')}
              accessibilityState={{ disabled: syncing || !settings?.folder }}
              testID="sync-now"
              onPress={onSyncNow}
              disabled={syncing || !settings?.folder}
              style={({ pressed }) => [
                styles.primary,
                styles.grow,
                { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
                (syncing || !settings?.folder) && styles.disabled,
              ]}
            >
              {syncing ? (
                <ActivityIndicator color={String(palette.bg)} />
              ) : (
                <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                  {t('sync.syncNow')}
                </Text>
              )}
            </Pressable>
          </View>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {settings?.lastSyncAt
              ? t('sync.lastSyncedAt', {
                  when: new Date(settings.lastSyncAt).toLocaleString(),
                })
              : t('sync.neverSynced')}
          </Text>
          <Text
            style={[
              typeStyle('body'),
              styles.frequencyLabel,
              { color: palette.text },
            ]}
          >
            {t('sync.autoTitle')}
          </Text>
          {/* Four chips rather than a switch and a picker behind it: the
              whole choice is four words wide, and a setting you can read
              without opening it is one you can trust. */}
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('sync.autoTitle')}
            style={styles.chipRow}
          >
            {SYNC_FREQUENCIES.map(frequency => (
              <Chip
                key={frequency}
                label={t(FREQUENCY_LABELS[frequency])}
                selected={(settings?.autoFrequency ?? 'open') === frequency}
                onPress={() => onChooseFrequency(frequency)}
              />
            ))}
          </View>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('sync.autoHelp')}
          </Text>
        </View>

        <Text
          style={[typeStyle('label'), styles.section, { color: palette.muted }]}
        >
          {t('sync.thisDevice')}
        </Text>
        <View style={[styles.card, card]}>
          <TextInput
            accessibilityLabel={t('sync.deviceNameLabel')}
            value={deviceName}
            onChangeText={setName}
            onEndEditing={() => onRenameSelf(deviceName)}
            onSubmitEditing={() => onRenameSelf(deviceName)}
            placeholder={defaultDeviceName()}
            placeholderTextColor={String(palette.muted)}
            maxLength={MAX_DEVICE_NAME}
            style={[
              typeStyle('body'),
              styles.input,
              {
                color: palette.text,
                backgroundColor: palette.bg,
                borderColor: palette.border,
                borderRadius: RADIUS.sm,
              },
            ]}
          />
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {t('sync.thisDeviceHelp')}
          </Text>
          {code ? (
            <>
              <PairingQr code={code} />
              <Text
                accessibilityLabel={t('sync.codeA11y')}
                selectable
                testID="sync-code"
                style={[styles.code, { color: palette.text }]}
              >
                {code}
              </Text>
              {myFingerprint ? (
                <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
                  {t('sync.fingerprint', { value: myFingerprint })}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('sync.copyCode')}
                testID="sync-copy"
                onPress={() => void onCopy()}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                  {t('sync.copyCode')}
                </Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={String(palette.accent)} />
          )}
        </View>

        <Text
          style={[typeStyle('label'), styles.section, { color: palette.muted }]}
        >
          {t('sync.addDevice')}
        </Text>
        <View style={[styles.card, card]}>
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {t('sync.addDeviceHelp')}
          </Text>
          <TextInput
            accessibilityLabel={t('sync.codePlaceholder')}
            testID="sync-code-input"
            value={entered}
            onChangeText={setEntered}
            placeholder={t('sync.codePlaceholder')}
            placeholderTextColor={String(palette.muted)}
            autoCapitalize="characters"
            autoCorrect={false}
            multiline
            style={[
              styles.codeInput,
              {
                color: palette.text,
                backgroundColor: palette.bg,
                borderColor: palette.border,
                borderRadius: RADIUS.sm,
              },
            ]}
          />
          <View style={styles.buttonRow}>
            {canScan ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('sync.scanCode')}
                testID="sync-scan"
                onPress={onScan}
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: palette.border, borderRadius: RADIUS.sm },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[typeStyle('headline'), { color: palette.text }]}>
                  {t('sync.scanCode')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sync.pasteCode')}
              onPress={() => void onPaste()}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: palette.border, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typeStyle('headline'), { color: palette.text }]}>
                {t('sync.pasteCode')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sync.addCta')}
              accessibilityState={{ disabled: busy || !entered.trim() }}
              testID="sync-pair"
              onPress={onAdd}
              disabled={busy || !entered.trim()}
              style={({ pressed }) => [
                styles.primary,
                styles.grow,
                { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
                (busy || !entered.trim()) && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={String(palette.bg)} />
              ) : (
                <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                  {t('sync.addCta')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <Text
          style={[typeStyle('label'), styles.section, { color: palette.muted }]}
        >
          {t('sync.pairedSection')}
        </Text>
        <View style={[styles.card, card]}>
          {peers.length === 0 ? (
            <Text style={[typeStyle('body'), { color: palette.muted }]}>
              {t('sync.noneYet')}
            </Text>
          ) : (
            peers.map(peer => (
              <PeerRow
                key={peer.pk}
                peer={peer}
                palette={palette}
                onRename={name => {
                  void (async () => {
                    await renamePeer(peer.pk, name);
                    await refreshPeers();
                  })();
                }}
                onRemove={() => onRemove(peer)}
                onAccept={() => onAccept(peer)}
              />
            ))
          )}
          {watching ? (
            <View style={styles.watching}>
              <ActivityIndicator size="small" color={String(palette.muted)} />
              <Text style={[typeStyle('footnote'), styles.watchingText, { color: palette.muted }]}>
                {watching === 'answer'
                  ? t('sync.watchingAnswer', {
                      device:
                        peers.find(p => !p.pending && !p.lastSeenAt)?.name ??
                        t('sync.unnamedDevice'),
                    })
                  : t('sync.watchingAnnouncement')}
              </Text>
            </View>
          ) : null}
        </View>


        <Text
          style={[typeStyle('label'), styles.section, { color: palette.muted }]}
        >
          {t('sync.whatSyncs')}
        </Text>
        <View style={[styles.card, card]}>
          {SYNC_CATEGORIES.map(category => (
            <View key={category} style={styles.peerRow}>
              <View style={styles.peerText}>
                <Text style={[typeStyle('body'), { color: palette.text }]}>
                  {t(`sync.category.${category}`)}
                </Text>
                <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
                  {t(`sync.categoryHint.${category}`)}
                </Text>
              </View>
              <Switch
                accessibilityLabel={t(`sync.category.${category}`)}
                value={settings?.selection[category] ?? false}
                onValueChange={next => onToggleCategory(category, next)}
                trackColor={{ true: palette.accentSolid, false: String(palette.border) }}
                thumbColor="#ffffff" // tokens-ok-line: a Switch thumb stays light in both states so it reads against an accent track
              />
            </View>
          ))}
        </View>

        <Text
          style={[
            typeStyle('footnote'),
            { color: palette.muted, textAlign: 'center' },
          ]}
        >
          {t('sync.privacyNoteP2p')}
        </Text>
      </CenteredColumn>
      {dialog}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg },
  stack: { gap: SPACING.md },
  section: {
    marginTop: SPACING.sm,
  },
  intro: { marginBottom: SPACING.xs },
  card: { padding: SPACING.md, gap: SPACING.sm },
  code: {
    fontFamily: 'monospace',
    fontSize: TYPE.callout.fontSize,
    lineHeight: 22,
    letterSpacing: 1,
    textAlign: 'center',
  },
  codeInput: {
    fontFamily: 'monospace',
    fontSize: TYPE.callout.fontSize,
    borderWidth: 1,
    padding: SPACING.sm,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  input: { borderWidth: 1, padding: SPACING.sm },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'stretch' },
  grow: { flex: 1 },
  primary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  secondary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
    borderWidth: 1,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  frequencyLabel: { marginTop: SPACING.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  peerText: { flex: 1 },
  watching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  watchingText: { flex: 1 },
  peerName: { padding: 0, margin: 0 },
  remove: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.xs },
});
