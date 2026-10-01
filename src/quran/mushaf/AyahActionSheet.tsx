/**
 * Ayah action sheet — QR-8/9/12, unified in v2.7.28.
 *
 * Bottom sheet shown on long-pressing an ayah (mushaf page or
 * translation card). ONE panel for everything about the ayah:
 *
 *   • translation peek + real tafsir (on-demand, cached offline),
 *   • bookmark (five colors), star, khatmah "I am here" pin,
 *   • play from here / repeat / share (text or image card),
 *   • the full recitation controls (reciter, download, speed,
 *     memorization, range player) — the header "Recitation" button
 *     opens this same sheet scrolled straight to this section.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type ScrollViewInstance,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useAppPalette } from '../../hooks/useAppPalette';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { READING_BASE } from '../../theme/readingText';
import { useReadingText } from '../../hooks/useReadingText';
import { findSurah, loadSurah } from '../quran';
import { resolveRiwayah, riwayahById } from '../riwayat';
import { riwayahAyahText } from '../riwayahData';
import { getAyahTranslation, QURAN_TRANSLATIONS } from '../translations';
import { useActiveEdition } from '../useActiveEdition';
import {
  useQuranState,
  setQuranPrefs,
  BOOKMARK_COLORS,
  KHATMAH_COLOR,
  READING_COLOR,
} from '../quranState';
import type { AyahSheetPanel, BookmarkColor, QuranBookmark } from '../quranTypes';
import { activeKhatmah } from '../khatmahProgress';
import { khatmahPageInWindow } from '../khatmahSchedule';
import { clearKhatmahPosition, setKhatmahPosition } from '../khatmahActions';
import {
  addBookmark,
  findBookmark,
  isStarred,
  removeBookmark,
  setBookmarkFollows,
  setReadingPosition,
  toggleStar,
} from '../readerMarks';
import { activeReaderMode } from '../readerMode';
import {
  loadTafsir,
  resolveTafsirEdition,
  TAFSIR_EDITIONS,
} from '../tafsir';
import { playFromAyah, playRange } from '../audio/playback';
import { RecitationControls } from '../audio/RecitationControls';
import { ShareAyahModal } from './ShareAyahModal';
import {
  speakWord,
  TajweedAyahSection,
  WarshTajweedAyah,
} from '../tajweed/TajweedAyahSection';
import { riwayahHasTajweed } from '../tajweed/rules';
import { TajweedAyahGlyphs } from '../tajweed/TajweedAyahGlyphs';

/** The page font's size for the āyah at the top of the sheet, dp — the
 *  same as the Tajweed section's, so the two read as one face. */
const AYAH_GLYPH_SIZE = 30;
import { QuranBookIcon, ShareIcon } from '../../theme/icons';
import {
  ayahShareText,
  ayahWithTafsirShareText,
  tafsirShareText,
} from '../../share/shareText';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { RowAction, SectionHead } from '../../components/controls';
import { ChoiceSheet } from '../../components/ui/ChoiceSheet';
import { MODAL_ORIENTATIONS } from '../../components/modalOrientations';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACING } from '../../theme/tokens';

/** The sheet's own padding, before the safe-area insets are added to it. */
const SHEET_H_PADDING = 18;
const SHEET_BOTTOM_PADDING = 26;

/** Clamp heights, and the text lengths past which a toggle is worth showing. */
const TRANSLATION_CLAMP_LINES = 5;
const TAFSIR_CLAMP_LINES = 8;
const LONG_TRANSLATION = 260;
const LONG_TAFSIR = 420;

type Props = {
  visible: boolean;
  onClose: () => void;
  surah: number;
  ayah: number;
  page: number;
  /** Open pre-scrolled to the recitation section (header button). */
  scrollToAudio?: boolean;
};

/**
 * The inside of a pin button: the trail's icon in its colour, what the
 * pin is, and the action a tap takes — a filled pill to set it, a quiet
 * one (✓, or Remove) once it is here.
 */
function PinFace({
  color,
  textColor,
  active,
  label,
  action,
}: {
  color: string;
  textColor: ColorValue;
  active: boolean;
  label: string;
  action: string;
}) {
  return (
    <>
      <View style={[styles.pinIcon, { backgroundColor: active ? color : `${color}33` }]}>
        <QuranBookIcon color={active ? '#fff' : color} size={15} />
      </View>
      <Text style={[styles.pinLabel, { color: textColor }]}>{label}</Text>
      <View
        style={[
          styles.pinAction,
          active
            ? { borderWidth: 1, borderColor: color }
            : { backgroundColor: color },
        ]}>
        <Text style={[styles.pinActionText, { color: active ? color : '#fff' }]}>{action}</Text>
      </View>
    </>
  );
}

export function AyahActionSheet({
  visible,
  onClose,
  surah,
  ayah,
  page,
  scrollToAudio,
}: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const readingText = useReadingText();
  const keyboardInset = useKeyboardInset();
  const insets = useSafeAreaInsets();
  // The larger of the two, on both — see the sheet's note.
  const sideInset = Math.max(insets.left, insets.right);
  const { settings, updateSettings } = usePrayerSettings();
  const edition = useActiveEdition();
  const state = useQuranState();
  const [arabic, setArabic] = useState<string>('');
  /** The "as text or as a card" question — see `share` below. */
  const [formatPicker, setFormatPicker] = useState(false);
  const [shareCardVisible, setShareCardVisible] = useState(false);

  // ── Tafsir (v2.7.28; persisted v2.8) ────────────────────────────────
  // The chosen edition is derived from the persisted quran pref so it sticks
  // across sheet reopens and stays in sync with the Settings selector — it
  // used to live in ephemeral component state, which reverted to the default
  // on every remount.
  // ALL shipped tafsir editions (v2.7.40) — matches the companion-text
  // selector so a pick made anywhere is offered everywhere.
  const tafsirEditions = TAFSIR_EDITIONS;
  /**
   * TRANSLATION · TAFSIR · TAJWĪD — tabs, one text at a time, or none.
   *
   * None to begin with; the reader's pick is kept in the prefs, so the
   * tafsir someone opened on one āyah is open on the next, and tomorrow.
   * Tapping the open tab again puts the text away. Tajwīd is offered only
   * where the muṣḥaf has it; a remembered tajwīd tab in a recitation
   * without it shows nothing.
   */
  const tajweedOffered = riwayahHasTajweed(state.prefs.riwayah);
  const panel =
    state.prefs.ayahSheetPanel === 'tajweed' && !tajweedOffered
      ? 'none'
      : state.prefs.ayahSheetPanel;
  const choosePanel = (next: AyahSheetPanel) =>
    setQuranPrefs({ ayahSheetPanel: panel === next ? 'none' : next });
  const tafsirOpen = panel === 'tafsir';
  const tafsirEdition = resolveTafsirEdition(
    state.prefs.tafsirEditionId,
    settings.language,
  );
  const setTafsirEdition = (ed: { id: string }) =>
    setQuranPrefs({ tafsirEditionId: ed.id });
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  /**
   * "Show more" state for the two long-form texts in the sheet (v2.8.4).
   *
   * A tafsir entry runs to several hundred words. Rendered whole it pushed
   * the recitation controls — reciter, speed, the range player — off the
   * bottom of the sheet, so the panel read as a tafsir reader with the audio
   * section buried. Both texts are clamped to a few lines with an expand
   * toggle, and BOTH toggles reset on every open: an expansion is a decision
   * about the ayah in front of you, not a mode to be inherited by the next
   * one.
   */
  const [tafsirExpanded, setTafsirExpanded] = useState(false);
  const [translationExpanded, setTranslationExpanded] = useState(false);

  const translationOpen = panel === 'translation';

  const scrollRef = useRef<ScrollViewInstance>(null);
  const audioSectionY = useRef(0);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setArabic('');
    setTafsirText(null);
    setTafsirExpanded(false);
    setTranslationExpanded(false);
    /**
     * THE AYAH THIS READER IS LOOKING AT, IN THE RASM THEY ARE READING.
     *
     * `loadSurah` is the bundled Ḥafṣ text and only ever that, so a Warsh
     * reader who tapped a word on a Warsh page got the Ḥafṣ wording back
     * — on screen, and in everything the sheet hands on from it: copy,
     * share, the share card. Reported in #46.
     *
     * A second riwayah is installed with its own ayah text (that is what
     * makes it a `unicode` riwayah at all, and it is the same table the
     * page itself is drawn from), so the sheet asks it first and falls
     * back to the bundled text only when this riwayah has none — an
     * `image` riwayah, or a dataset still being hydrated.
     */
    const own = riwayahAyahText(
      resolveRiwayah(state.prefs.riwayah),
      surah,
      ayah,
    );
    if (own) {
      setArabic(own);
      return () => {
        cancelled = true;
      };
    }
    void loadSurah(surah).then(loaded => {
      if (cancelled || !loaded) return;
      setArabic(loaded.arabic[ayah - 1] ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [visible, surah, ayah, state.prefs.riwayah]);

  // The share card is a <Modal> NESTED inside this sheet's <Modal>. If the
  // sheet is hidden (or torn down) while the card is still flagged visible,
  // the inner modal window is orphaned above the app and eats every touch —
  // the same failure the reader's dismiss guard exists to prevent. Latch it
  // off as soon as the sheet stops being shown.
  useEffect(() => {
    if (!visible) {
      setShareCardVisible(false);
      setFormatPicker(false);
    }
  }, [visible]);

  // Scroll to the recitation section when opened from the header button.
  useEffect(() => {
    if (!visible || !scrollToAudio) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: audioSectionY.current, animated: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [visible, scrollToAudio]);

  useEffect(() => {
    if (!visible || !tafsirOpen) return;
    let cancelled = false;
    setTafsirLoading(true);
    setTafsirText(null);
    setTafsirExpanded(false);
    void loadTafsir(tafsirEdition.id, surah, ayah).then(text => {
      if (cancelled) return;
      setTafsirLoading(false);
      setTafsirText(text);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, tafsirOpen, tafsirEdition.id, surah, ayah]);

  const meta = findSurah(surah);
  /**
   * The translation, fetched rather than read.
   *
   * It used to be a synchronous call in the render body, which worked
   * only because the whole edition sat in the JS bundle and Metro's
   * require cache kept it alive after the first ayah. The editions have
   * moved off the bundle, so this is a read now — and a read cannot
   * happen during a render.
   *
   * Empty until it arrives, which is the same thing this sheet already
   * does for the tafsir above. The one place an empty string must not
   * escape is the share text below, which fetches it again rather than
   * trusting this — see `shareText`.
   */
  const [translation, setTranslation] = useState('');
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setTranslation('');
    getAyahTranslation(edition, surah, ayah)
      .then(text => {
        if (!cancelled) setTranslation(text);
      })
      .catch(() => {
        if (!cancelled) setTranslation('');
      });
    return () => {
      cancelled = true;
    };
  }, [visible, edition, surah, ayah]);
  const starred = isStarred(state, surah, ayah);
  const bookmark = findBookmark(state, surah, ayah);
  // The colours already on OTHER ayahs — one bookmark each (`addBookmark`).
  const coloursInUse = useMemo(() => {
    const m = new Map<BookmarkColor, QuranBookmark>();
    // With colours free to repeat there is nothing a tap would move.
    if (state.prefs.bookmarkColourReuse) return m;
    for (const b of state.bookmarks) {
      if (b.surah === surah && b.ayah === ayah) continue;
      m.set(b.color, b);
    }
    return m;
  }, [state.bookmarks, state.prefs.bookmarkColourReuse, surah, ayah]);
  const plan = activeKhatmah(state);
  const isKhatmahHere =
    plan?.position?.surah === surah && plan?.position?.ayah === ayah;
  // The muṣḥaf on screen: which portion a page belongs to is a question
  // about THIS print's pagination, not the default one's.
  const riwayah = resolveRiwayah(state.prefs.riwayah);
  // The other trail's marker (#41): pinned here, or recorded here by
  // reading — either way "Continue reading" already leads to this ayah.
  const isReadingHere =
    state.lastRead?.surah === surah && state.lastRead?.ayah === ayah;
  const reference = `${meta?.romanized ?? ''} ${surah}:${ayah}`;

  /**
   * Share is ONE action with two formats, not two actions.
   *
   * "Share" and "Share as image" sat as equal siblings, so a row of four
   * read as four choices when it was really three plus a format. The
   * format question is asked only once the reader has said they want to
   * share.
   *
   * IN THIS APP'S OWN SHEET. It used to ask with the platform's dialog — an action sheet on iOS, `Alert.alert` on Android
   * — and on Android that is a white Material box with two blue words
   * and a band of empty space where the message would be, which is not
   * what anything else here looks like. The dua share had the same fault
   * and the same fix (#47); `ChoiceSheet` is the furniture both use, and
   * the room it has is what lets each format say what it actually
   * produces.
   */
  const share = () => setFormatPicker(true);

  const shareText = async () => {
    // Fetch rather than read the state, in the one case where an empty
    // string would be shipped somewhere it cannot be corrected. The
    // sheet can show a blank line for the instant before the translation
    // lands; a message sent to somebody else with the translation
    // missing is a different kind of wrong. Resolves immediately once it
    // is in the cache, which by this point it almost always is.
    const text =
      translation ||
      (await getAyahTranslation(edition, surah, ayah).catch(() => ''));
    try {
      await Share.share({
        message: ayahShareText({ arabic, translation: text, reference }),
      });
    } catch {
      /* user cancelled */
    }
  };

  /**
   * The passage, not the ayah — issue #24.
   *
   * Its own action rather than a third option on the share above, which
   * is deliberately "one action with two FORMATS". Tafsir is not another
   * format of the ayah; it is a different text, by a different author,
   * that happens to be shown underneath. It shares from where it is read.
   *
   * `tafsirShareText` will not build a body without naming both the
   * edition and the ayah: a paragraph of Ibn Kathir arriving as an
   * anonymous explanation of a verse is exactly the shape of an unsourced
   * religious claim.
   */
  const shareTafsir = async () => {
    if (!tafsirText) return;
    try {
      await Share.share({
        message: tafsirShareText({
          text: tafsirText,
          edition: tafsirEdition.label,
          reference,
        }),
      });
    } catch {
      /* user cancelled */
    }
  };

  /**
   * The ayah with its commentary, instead of its translation.
   *
   * The third format, and the one that needed a decision: the passage is
   * NOT always in hand. The tafsir section starts closed, so most of the
   * time nothing has been fetched for this ayah yet, and a share that
   * quietly sent an ayah with an empty explanation under it would be
   * worse than one that did nothing.
   *
   * So it fetches, with the same loader the section uses — and when
   * nothing comes back (no network, no cached passage), it opens the
   * Tafsir section rather than failing silently. The reader then sees
   * the loader, and its own empty state, in the place that owns it.
   */
  const shareWithTafsir = async () => {
    const text =
      tafsirText ??
      (await loadTafsir(tafsirEdition.id, surah, ayah).catch(() => null));
    if (!text) {
      setQuranPrefs({ ayahSheetPanel: 'tafsir' });
      return;
    }
    try {
      await Share.share({
        message: ayahWithTafsirShareText({
          arabic,
          tafsir: text,
          edition: tafsirEdition.label,
          reference,
        }),
      });
    } catch {
      /* user cancelled */
    }
  };

  /** "Show more / Show less" link under a clamped block. */
  const moreToggle = (expanded: boolean, onToggle: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={6}
      onPress={onToggle}>
      <Text style={[styles.moreLink, { color: palette.accentSolid }]}>
        {expanded
          ? t('quran.showLess', 'Show less')
          : t('quran.showMore', 'Show more')}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      // Landscape too, or the muṣḥaf on its side cannot open this
      // at all — see MODAL_ORIENTATIONS.
      supportedOrientations={MODAL_ORIENTATIONS}
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        accessibilityLabel={t('common.close', 'Close')}
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          // A Modal on Android does not resize for the keyboard, and the
          // recitation controls inside this sheet carry a field. See
          // useKeyboardInset.
          keyboardInset > 0 ? { bottom: keyboardInset } : null,
          {
            backgroundColor: palette.card,
            /**
             * THE ISLAND IS ON THE SIDE IN LANDSCAPE, and it is over this
             * sheet, not beside it.
             *
             * The muṣḥaf is the one screen that turns, and turned on its
             * side an iPhone puts the cutout at one end of the LONG edge —
             * directly on top of the āyah, its translation, and whichever
             * control happened to be under it. The sheet is edge to edge
             * by design, so it takes the insets on itself.
             *
             * Symmetrically, on the larger of the two: the sheet is a
             * centred column of text, and shifting it off centre to dodge
             * a cutout on one side looks like a mistake rather than a
             * clearance.
             */
            paddingStart: SHEET_H_PADDING + sideInset,
            paddingEnd: SHEET_H_PADDING + sideInset,
          },
        ]}>
        <View style={styles.headerRow}>
          <Text style={[styles.reference, { color: palette.muted }]}>
            {reference}
          </Text>
          {/* Share and star: the two things done to the āyah as a whole.
              Share asks for a format afterwards. */}
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'quran.shareChoiceA11y',
                'Share — opens a choice of text or image card',
              )}
              hitSlop={10}
              onPress={share}>
              <ShareIcon size={22} color={palette.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                starred
                  ? t('quran.unstar', 'Remove star')
                  : t('quran.star', 'Star this ayah')
              }
              hitSlop={10}
              onPress={() => toggleStar(surah, ayah)}>
              <Text
                style={{
                  fontSize: TYPE.title2.fontSize,
                  color: starred ? palette.accentSolid : palette.muted,
                }}>
                {starred ? '★' : '☆'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* No `automaticallyAdjustKeyboardInsets` here: the sheet itself
            lifts by the keyboard's height, on both platforms, so this
            scroller never intersects the keyboard to begin with. The prop
            would be an iOS-only no-op sitting where a reader would take
            it for the fix. */}
        {/* The bottom inset is the SCROLLER's, not the sheet's: on the
            sheet it was a band of empty card under the scroller, a lip
            that cut the content off above the screen's edge and looked
            like the end of it. In the content, the list runs to the edge
            and the last control still clears the home indicator. */}
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          bounces={false}
          contentContainerStyle={{
            paddingBottom: SHEET_BOTTOM_PADDING + insets.bottom,
          }}>
          {/* THE ĀYAH IN THE MUṢḤAF'S OWN FACE. It was set in the app's
              Arabic text font, which is not the face the reader had just
              been looking at: the sheet opened on a word and showed it in
              different letters. On a page-font riwayah the āyah is drawn
              from the same page fonts, word for word — plain ink, or the
              tajwīd colours when they are on, whichever the page is in.
              A `unicode` riwayah (Warsh) has no page fonts and keeps the
              text. The text is still what is shared and copied.
              With the Tajweed tab open this is the tab's āyah too —
              tinted whatever the page is in, and a tapped word is read
              out — so the tab does not draw a second copy below. */}
          {arabic && riwayahById(state.prefs.riwayah).render !== 'unicode' ? (
            <View style={styles.arabicGlyphs}>
              <TajweedAyahGlyphs
                surah={surah}
                ayah={ayah}
                fontSize={AYAH_GLYPH_SIZE}
                color={String(palette.text)}
                glyphs={state.prefs.tajweedColours || panel === 'tajweed' ? 'tajweed' : 'v2'}
                onWordPress={
                  panel === 'tajweed'
                    ? w => {
                        if (!w.isEnd) speakWord(surah, ayah, w.position);
                      }
                    : undefined
                }
              />
            </View>
          ) : arabic && panel === 'tajweed' && state.prefs.riwayah === 'warsh' ? (
            <WarshTajweedAyah surah={surah} ayah={ayah} text={arabic} style={styles.arabic} />
          ) : arabic ? (
            <Text style={[styles.arabic, { color: palette.text }]}>
              {arabic}
            </Text>
          ) : null}
          {/* Translation (v2.14.5) — a section like the tafsir below it,
              closed until asked for, and carrying its own edition picker
              so a reader can read an ayah in a language other than the
              one the app happens to be in. */}
          <View
            accessibilityRole="tablist"
            style={[styles.panelTabs, { borderColor: palette.border, backgroundColor: palette.bg }]}>
            {(
              [
                ['translation', t('quran.viewToggleTranslation', 'Translation')],
                ['tafsir', t('quran.tafsir', 'Tafsir')],
                ...(tajweedOffered
                  ? [['tajweed', t('tajweed.sheetSection', 'Tajweed')] as const]
                  : []),
              ] as const
            ).map(([key, label]) => {
              const on = panel === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  onPress={() => choosePanel(key)}
                  style={[styles.panelTab, on && { backgroundColor: palette.accentBg }]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.panelTabLabel,
                      { color: on ? palette.accentSolid : palette.muted },
                    ]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {translationOpen ? (
            <View style={styles.tafsirBlock}>
              <View style={styles.tafsirChips}>
                {QURAN_TRANSLATIONS.map(ed => {
                  const sel = ed.id === edition;
                  return (
                    <Pressable
                      key={ed.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: sel }}
                      accessibilityLabel={`${ed.language} — ${ed.label}`}
                      onPress={() =>
                        updateSettings({ quranTranslationEdition: ed.id })
                      }
                      style={[
                        styles.tafsirChip,
                        {
                          backgroundColor: sel ? palette.accentBg : 'transparent',
                          borderColor: sel ? palette.accentSolid : palette.border,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.chipLabel,
                          { color: sel ? palette.accentSolid : palette.muted },
                        ]}>
                        {ed.language}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {translation ? (
                <>
                  <Text
                    numberOfLines={
                      translationExpanded ? undefined : TRANSLATION_CLAMP_LINES
                    }
                    style={[
                      styles.translation,
                      readingText.style(READING_BASE),
                      { color: palette.muted },
                    ]}>
                    {translation}
                  </Text>
                  {translation.length > LONG_TRANSLATION
                    ? moreToggle(translationExpanded, () =>
                        setTranslationExpanded(v => !v),
                      )
                    : null}
                </>
              ) : (
                <Text style={[styles.tafsirMeta, { color: palette.muted }]}>
                  {t('quran.translationUnavailable', 'No translation for this ayah.')}
                </Text>
              )}
            </View>
          ) : null}

          {/* Tafsir (v2.7.28) */}
          {tafsirOpen ? (
            <View style={styles.tafsirBlock}>
              {tafsirEditions.length > 1 ? (
                <View style={styles.tafsirChips}>
                  {tafsirEditions.map(ed => {
                    const sel = ed.id === tafsirEdition.id;
                    return (
                      <Pressable
                        key={ed.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: sel }}
                        onPress={() => setTafsirEdition(ed)}
                        style={[
                          styles.tafsirChip,
                          {
                            backgroundColor: sel
                              ? palette.accentBg
                              : 'transparent',
                            borderColor: sel
                              ? palette.accentSolid
                              : palette.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.chipLabel,
                            { color: sel ? palette.accentSolid : palette.muted },
                          ]}>
                          {ed.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {tafsirLoading ? (
                <Text style={[styles.tafsirMeta, { color: palette.muted }]}>
                  {t('quran.loading', 'Loading…')}
                </Text>
              ) : tafsirText ? (
                <>
                  <Text
                    numberOfLines={
                      tafsirExpanded ? undefined : TAFSIR_CLAMP_LINES
                    }
                    style={[
                      styles.tafsirText,
                      readingText.style(READING_BASE),
                      { color: palette.text },
                      tafsirEdition.rtl && styles.tafsirRtl,
                    ]}>
                    {tafsirText}
                  </Text>
                  <View style={styles.tafsirActions}>
                    {tafsirText.length > LONG_TAFSIR
                      ? moreToggle(tafsirExpanded, () =>
                          setTafsirExpanded(v => !v),
                        )
                      : null}
                    {/* Trailing, and after the more/less link rather than
                        before it: reading the rest comes before sending
                        it, and on a passage short enough to need no
                        toggle this is simply the only control here. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('quran.shareTafsir', {
                        defaultValue: 'Share this tafsir ({{edition}})',
                        edition: tafsirEdition.label,
                      })}
                      hitSlop={8}
                      onPress={() => void shareTafsir()}
                      style={({ pressed }) => [
                        styles.tafsirShare,
                        { opacity: pressed ? 0.6 : 1 },
                      ]}>
                      <ShareIcon size={15} color={palette.accentSolid} />
                      <Text
                        style={[
                          styles.moreLink,
                          { color: palette.accentSolid },
                        ]}>
                        {t('common.share', 'Share')}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={[styles.tafsirMeta, { color: palette.muted }]}>
                  {t(
                    'quran.tafsirUnavailable',
                    'Tafsir unavailable — connect to the internet once to download it.',
                  )}
                </Text>
              )}
            </View>
          ) : null}

          {/* Tajwīd: the āyah's tinted letters and what each colour asks.
              Only where the muṣḥaf can draw them — the Warsh reader has
              no rules data and no coloured faces. */}
          {panel === 'tajweed' ? (
            <TajweedAyahSection surah={surah} ayah={ayah} onClose={onClose} />
          ) : null}

          {/* Bookmark colours — one bookmark per ayah and ONE PER COLOUR:
              tap the active colour to remove, tap a colour that is on
              another ayah and that bookmark moves here (`addBookmark`).

              One block, read top to bottom: what this ayah has, the
              colours, and under each colour where it is. A colour on this
              ayah is filled with a tick and ringed; a colour on another
              ayah is ringed and names that ayah underneath, so the move a
              tap makes is never a surprise. */}
          <View style={[styles.bookmarkBlock, { borderColor: palette.border ?? palette.muted }]}>
            <View style={styles.bookmarkHead}>
              <Text style={[styles.bookmarkTitle, { color: palette.text }]}>
                {t('quran.bookmark', 'Bookmark')}
              </Text>
              <Text style={[styles.bookmarkStatus, { color: palette.muted }]} numberOfLines={1}>
                {bookmark
                  ? t('quran.bookmarkTapToRemove', 'Tap its colour again to remove')
                  : t('quran.bookmarkPick', 'Pick a colour')}
              </Text>
            </View>
            <View style={styles.swatchRow}>
              {(Object.keys(BOOKMARK_COLORS) as BookmarkColor[]).map(color => {
                const selected = bookmark?.color === color;
                const elsewhere = coloursInUse.get(color);
                const ringed = selected || elsewhere != null;
                const tint = BOOKMARK_COLORS[color];
                return (
                  <Pressable
                    key={color}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={
                      elsewhere
                        ? t('quran.bookmarkColorInUse', {
                            defaultValue:
                              'Bookmark color {{color}} — in use at {{ref}}; tapping moves that bookmark here',
                            color,
                            ref: `${findSurah(elsewhere.surah)?.romanized ?? ''} ${elsewhere.surah}:${elsewhere.ayah}`,
                          })
                        : t('quran.bookmarkColor', {
                            defaultValue: 'Bookmark color {{color}}',
                            color,
                          })
                    }
                    hitSlop={4}
                    onPress={() => {
                      if (selected && bookmark) removeBookmark(bookmark.id);
                      else addBookmark(surah, ayah, page, color);
                    }}
                    style={({ pressed }) => [styles.swatchSlot, pressed && styles.swatchPressed]}>
                    <View style={styles.swatchBox}>
                      {ringed ? <View style={[styles.swatchRing, { borderColor: tint }]} /> : null}
                      <View style={[styles.swatch, { backgroundColor: tint }]}>
                        {selected ? <Text style={styles.swatchTick}>✓</Text> : null}
                      </View>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.swatchCaption,
                        { color: selected ? palette.text : palette.muted },
                      ]}>
                      {selected
                        ? t('quran.bookmarkHere', 'Here')
                        : elsewhere
                          ? `${elsewhere.surah}:${elsewhere.ayah}`
                          : ' '}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {coloursInUse.size > 0 ? (
              <Text style={[styles.bookmarkHint, { color: palette.muted }]}>
                {t(
                  'quran.bookmarkCircledHint',
                  'A ringed colour is on another ayah — picking it moves that bookmark here.',
                )}
              </Text>
            ) : null}
          </View>

          {/**
           * DOES THIS PLACE KEEP ITSELF?
           *
           * A dialog on the way to a bookmark would tax the common case
           * to serve the rare one, so the choice lives here as a line
           * under the colours — set from the reader's default, one tap to
           * change, and it changes THIS bookmark rather than the default.
           *
           * Drawn only once there is a bookmark to talk about. On `ask`
           * it is drawn emphasised, which is the whole of the asking:
           * the question is the control, and answering it is the tap it
           * was already going to take.
           */}
          {bookmark ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: !!bookmark.follows }}
              accessibilityLabel={t(
                'quran.bookmarkFollows',
                'Follows your reading',
              )}
              hitSlop={6}
              onPress={() => setBookmarkFollows(bookmark.id, !bookmark.follows)}
              style={styles.followLine}>
              <View
                style={[
                  styles.followBox,
                  {
                    borderColor: BOOKMARK_COLORS[bookmark.color],
                    backgroundColor: bookmark.follows
                      ? BOOKMARK_COLORS[bookmark.color]
                      : 'transparent',
                  },
                ]}>
                {bookmark.follows ? (
                  <Text style={styles.followTick}>✓</Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.followLineLabel,
                  {
                    color:
                      state.prefs.bookmarkFollowDefault === 'ask' &&
                      !bookmark.follows
                        ? palette.text
                        : palette.muted,
                  },
                ]}>
                {bookmark.follows
                  ? t('quran.followingOn', 'moves as you read')
                  : t('quran.followingOff', 'stays on this ayah')}
              </Text>
            </Pressable>
          ) : null}

          {/* The reading marker (#41): "Continue reading" starts here. A
              pin rather than a bookmark — there is one of it, it moves on
              as the reader reads on, and it is drawn in the reader until
              it does. Beside the khatmah's own pin, in the other colour,
              because the two are different trails through one book and
              an ayah can carry both. */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isReadingHere }}
            accessibilityLabel={
              isReadingHere
                ? t('quran.readingPinned', 'Continue reading starts here')
                : t('quran.readingPin', 'Continue reading from here')
            }
            onPress={() => {
              // A marker that is here because reading brought it is not
              // drawn on the page (`LastRead.pinned`); asking for it from
              // the panel pins it, and then it is. Already pinned here:
              // nothing left to do.
              if (isReadingHere && state.lastRead?.pinned) return;
              // The reader this sheet is OPEN IN, which is not always the
              // one the pref remembers — see `activeReaderMode`. What is
              // written here decides whether the home card counts pages
              // and whether the daily-ayah notification opens a page or
              // an ayah, so it has to be the truth.
              setReadingPosition(surah, ayah, page, activeReaderMode(settings));
            }}
            style={({ pressed }) => [
              styles.pinButton,
              { backgroundColor: `${READING_COLOR}${isReadingHere ? '33' : '1F'}` },
              pressed && styles.pinPressed,
            ]}>
            <PinFace
              color={READING_COLOR}
              textColor={palette.text}
              active={isReadingHere}
              label={
                isReadingHere
                  ? t('quran.readingPinned', 'Continue reading starts here')
                  : t('quran.readingPin', 'Continue reading from here')
              }
              // Nothing to undo: the marker is always somewhere.
              action={isReadingHere ? '✓' : t('quran.pinSet', 'Set')}
            />
          </Pressable>

          {/* Khatmah pin (v2.7.28) — only while a plan is active, and
              only where the plan could actually be. Moving the position
              to a page fifty portions ahead is not a move, it is a claim
              that everything between was read; the plan is the thing that
              decides that, from what was read. Already pinned here stays
              offered whatever the window says, so a pin can always be
              taken back off. */}
          {plan && (isKhatmahHere || khatmahPageInWindow(plan, page, riwayah)) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isKhatmahHere }}
              accessibilityLabel={
                isKhatmahHere
                  ? t('quran.khatmahUnpin', 'Remove khatmah position')
                  : t('quran.khatmahPin', 'Set as my khatmah position')
              }
              onPress={() => {
                if (isKhatmahHere) clearKhatmahPosition();
                else setKhatmahPosition(surah, ayah, page);
              }}
              style={({ pressed }) => [
                styles.pinButton,
                { backgroundColor: `${KHATMAH_COLOR}${isKhatmahHere ? '33' : '1F'}` },
                pressed && styles.pinPressed,
              ]}>
              <PinFace
                color={KHATMAH_COLOR}
                textColor={palette.text}
                active={isKhatmahHere}
                label={
                  isKhatmahHere
                    ? t('quran.khatmahPinnedHere', 'Your khatmah is at this ayah')
                    : t('quran.khatmahPin', 'Set as my khatmah position')
                }
                action={isKhatmahHere ? t('quran.pinRemove', 'Remove') : t('quran.pinSet', 'Set')}
              />
            </Pressable>
          ) : null}

          {/* PLAY — everything that makes this āyah sound, in one place:
              play from here and repeat at the top, then the reciter,
              speed, memorisation and the range player. The header's
              recitation button lands here. */}
          <View
            onLayout={e => {
              audioSectionY.current = e.nativeEvent.layout.y;
            }}>
            <SectionHead label={t('quran.playSection', 'Play')} tight />
            <View style={styles.actionsRow}>
              <RowAction
                label={t('quran.playFromHere', 'Play from here')}
                glyph="▶"
                emphasized
                compact
                grow
                onPress={() => {
                  onClose();
                  void playFromAyah(surah, ayah);
                }}
              />
              <RowAction
                label={t('quran.repeatAyah', 'Repeat this ayah')}
                glyph="↻"
                compact
                grow
                onPress={() => {
                  onClose();
                  void playRange({ surah, ayah }, { surah, ayah });
                }}
              />
            </View>
            <RecitationControls
              surahNumber={surah}
              onStartPlayback={onClose}
            />
          </View>
        </ScrollView>
      </View>
      <ChoiceSheet
        visible={formatPicker}
        onClose={() => setFormatPicker(false)}
        title={t('common.share', 'Share')}
        subject={reference.trim()}
        choices={[
          {
            id: 'text',
            title: t('quran.shareAsText', 'Share the text'),
            subtitle: t(
              'quran.shareAsTextHelp',
              'The ayah, your translation and the reference',
            ),
            onPress: () => void shareText(),
          },
          {
            id: 'tafsir',
            title: t('quran.shareWithTafsir', 'Share with the tafsir'),
            subtitle: t('quran.shareWithTafsirHelp', {
              defaultValue: 'The ayah and {{edition}}, instead of the translation',
              edition: tafsirEdition.label,
            }),
            onPress: () => void shareWithTafsir(),
          },
          {
            id: 'image',
            title: t('quran.shareAsImage', 'Share as image'),
            subtitle: t('quran.shareAsImageHelp', 'A card with the ayah on it'),
            onPress: () => setShareCardVisible(true),
          },
        ]}
      />
      <ShareAyahModal
        visible={shareCardVisible}
        onClose={() => setShareCardVisible(false)}
        surah={surah}
        ayah={ayah}
        arabic={arabic}
        translation={translation}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '82%',
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    // The horizontal and bottom padding are applied inline — they carry the
    // safe-area insets with them. See the sheet's own note.
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  reference: { fontSize: TYPE.footnote.fontSize, fontWeight: '700', letterSpacing: 0.3 },
  body: { flexGrow: 0 },
  arabic: {
    fontSize: TYPE.title2.fontSize,
    lineHeight: 54,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  // The page-font āyah lays itself out in lines; this is the same air the
  // text version had around it.
  arabicGlyphs: { paddingVertical: SPACING.xs },
  translation: { fontSize: TYPE.callout.fontSize, lineHeight: 22, marginTop: SPACING.md },
  // Translation · Tafsir · Tajwīd: one row of tabs, none open to begin with.
  panelTabs: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    padding: 3,
    gap: 3,
  },
  panelTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md - 3,
  },
  panelTabLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '700' },
  tafsirBlock: { marginTop: SPACING.md, gap: SPACING.sm },
  tafsirChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tafsirChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    /**
     * A chip wraps to the next line; it never gets squeezed.
     *
     * Without this, Yoga fits a wrapping row by SHRINKING its items, and
     * the text inside a shrunken chip is truncated to whatever survives.
     * "التفسير الميسر" came back from a rotation as "التفسير" — the
     * edition losing its name and reading as the generic word, on the one
     * control whose whole job is to say which edition you are reading.
     */
    flexShrink: 0,
  },
  chipLabel: { fontSize: TYPE.label.fontSize, fontWeight: '600', flexShrink: 0 },
  tafsirMeta: { fontSize: TYPE.footnote.fontSize, fontStyle: 'italic' },
  tafsirText: { fontSize: TYPE.callout.fontSize, lineHeight: 22 },
  // The more/less link keeps the leading edge; the share control is
  // pushed to the trailing one with `marginStart: 'auto'` on the control
  // itself, so it sits correctly whether or not the toggle is drawn —
  // and on the right edge in English, the left in Arabic.
  tafsirActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  tafsirShare: {
    marginStart: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  tafsirRtl: { textAlign: 'right', writingDirection: 'rtl' },
  moreLink: { fontSize: TYPE.label.fontSize, fontWeight: '700', marginTop: SPACING.xs },
  bookmarkBlock: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  bookmarkHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  bookmarkTitle: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  bookmarkStatus: { fontSize: TYPE.caption.fontSize, flexShrink: 1 },
  swatchRow: { flexDirection: 'row', justifyContent: 'space-between' },
  swatchSlot: { alignItems: 'center', gap: 2, minWidth: 48 },
  swatchPressed: { opacity: 0.6 },
  swatchBox: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  // The ring around a colour that is taken: a gap, then the colour's own line.
  swatchRing: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    borderRadius: RADIUS.full,
    borderWidth: 2, // tokens-ok-line: the ring around a taken colour
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchTick: {
    color: '#fff', // tokens-ok-line: ink on the bookmark's own colour
    fontSize: TYPE.label.fontSize,
    fontWeight: '800',
    includeFontPadding: false,
  },
  swatchCaption: { fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  bookmarkHint: { fontSize: TYPE.caption.fontSize },
  followLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  followBox: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followTick: {
    color: '#fff', // tokens-ok-line: ink on the bookmark's own colour
    fontSize: TYPE.label.fontSize,
    fontWeight: '700',
    includeFontPadding: false,
  },
  followLineLabel: { fontSize: TYPE.footnote.fontSize, flexShrink: 1 },
  // The two pins (reading marker, khatmah position) are BUTTONS: a tinted
  // face, an icon, and an action on the end that says what a tap does.
  pinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    minHeight: 44,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs,
    paddingStart: SPACING.xs + 2,
    paddingEnd: SPACING.xs + 2,
  },
  pinPressed: { opacity: 0.7 },
  pinIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600', flex: 1 },
  pinAction: {
    minWidth: 56,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  pinActionText: { fontSize: TYPE.footnote.fontSize, fontWeight: '700' },
  // The emerald button takes the row's full width; repeat and share share
  // the line below it, so the ranking is visible before it is read.
  // Play and repeat side by side, equal halves.
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});
