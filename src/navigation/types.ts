import type { DuaCategory } from '../duas/duas';

/** The two pages of the Dhikr tab: the counter, and the library. */
export type DhikrView = 'tasbih' | 'duas';

/**
 * The five tabs. They are the app; the stack below is everything pushed
 * on top of them.
 */
export type MainTabParamList = {
  TodayTab: undefined;
  QuranTab: undefined;
  HadithTab: undefined;
  /**
   * Tasbih unless `view` says Duas. `category` opens that dua category
   * rather than the index — the morning and evening adhkār reminders,
   * #39 — and implies Duas.
   */
  DhikrTab: { view?: DhikrView; category?: DuaCategory } | undefined;
  LogTab: undefined;
};

export type RootStackParamList = {
  /** The tab navigator. */
  Home: undefined;
  /** `share` opens it on the printable sheet rather than the table. */
  MonthTimes: { share?: boolean } | undefined;
  ShareMonth: { year: number; month: number };
  Compass: undefined;
  QuranSurah: {
    surahNumber: number;
    /** Mushaf mode: open at this exact page (Juz/Page/Bookmark deep links). */
    initialPage?: number;
    /** Translation mode: scroll to this ayah (search / bookmark deep links). */
    scrollToAyah?: number;
    /**
     * The following bookmark this visit was opened FROM, if any. It owns
     * the visit's page turns — see `quran/readingSession`. Sent only when
     * a bookmark that follows is tapped; every other way in leaves it
     * undefined, and the reading is the marker's as it always was.
     */
    sessionBookmarkId?: string;
    /**
     * This visit was opened from the KHATMAH — the home card's door, the
     * Qur'an tab's, or the plan's own "continue". It owns the visit the
     * same way a following bookmark does, and it is what the done-marks
     * beside the surah name are drawn for: they say which pages of the
     * plan are read, which is an answer to a question only a khatmah
     * reading asked. Every other way in leaves it undefined, and the
     * khatmah still counts the reading if it lands in today's portion —
     * crediting never depended on the door (`khatmahTracksPage`).
     */
    sessionKhatmah?: boolean;
    /**
     * Start reciting from this ayah on arrival — issue #25.
     *
     * An ayah rather than a flag, because the two params above are a
     * reader-mode fork and this is not: the muṣḥaf is opened by page and
     * the translation reader by ayah, but recitation always begins at an
     * ayah whichever of them is on screen. One param answers for both,
     * and it carries its own position rather than depending on which
     * fork happened to be taken.
     *
     * Only the widget sends it. Opening the reader from inside the app
     * leaves it undefined, and silence stays the default everywhere it
     * already was.
     */
    playFromAyah?: number;
    /**
     * Recite a hifz portion from memory (#121): the id of the portion.
     * The verse-by-verse reader opens whichever reader is the habit, with
     * the portion's ayahs hidden until each is tapped to check, and a
     * "Done" that asks how it went and records the review.
     */
    hifzReview?: string;
    /**
     * With `hifzReview`: practise the portion ahead of its day rather than
     * revise it — the same hidden ayahs, and a Done that goes back without
     * asking how it went, so nothing is recorded and the schedule stands.
     */
    hifzPractice?: boolean;
  };
  /** The tajwīd colours explained — the legend, rule by rule. */
  QuranTajweed: undefined;
  /**
   * Tilāwah: the recitation as a player, not as part of the reader.
   *
   * On the root stack rather than inside the Quran tab for the same
   * reason the settings subpages are — the platform header, the back
   * control beside the title, and the swipe-back gesture come free there
   * and would have to be drawn by hand in a nested navigator.
   */
  QuranListen: undefined;
  /**
   * The khatmah's own page: the plan's account of itself and its
   * options, or the ways to start one. Off the Qur'an tab for the same
   * reason as Tilāwah — and because the tab was a wall of controls.
   */
  Khatmah: undefined;
  /** What is known by heart and its revision (#121); the row on the Qur'an tab leads here. */
  Hifz: undefined;
  Onboarding: undefined;
  Backup: undefined;
  Fasting: undefined;
  /** One hadith, read: `id` is the entry, `list` the set it was opened from. */
  HadithReader: { id: string; list?: string };
  /** A topic, a set or a book of hadith, listed. */
  /** `all`: a topic's every hadith in one list, past its page of sub-topics. */
  HadithList: { list: string; all?: boolean };
  /** A book of the Library: its chapters, or one of them (by its place) to read. */
  LibraryBook: { id: string; chapter?: number };
  /**
   * The Settings index. Pushed from Today's cog since it left the tab bar;
   * every section below is pushed over it.
   */
  Settings: undefined;
  /**
   * The settings subpages — one destination per section, pushed from the
   * Settings index.
   *
   * Routes on the ROOT stack rather than a nested stack inside the tab,
   * because that is what gives them the platform header: a real title
   * with the system's own back control beside it, the swipe-back gesture
   * on iOS, and the predictive-back animation on Android. A nested
   * navigator would have meant drawing all of that by hand.
   */
  SettingsAppearance: undefined;
  SettingsPrayerTimes: undefined;
  /** `highlight` flashes the saved-locations card after a deep link from Home. */
  SettingsLocation:
    | {
        highlight?: 'savedLocations';
        // Set only by the home chip's "Add new location": the user came
        // here to change where the app is, so a location saved in this
        // visit is switched to immediately, even on automatic. Browsing
        // Settings→Location does not set it, and keeps add-⁠without-switch.
        activateOnAdd?: boolean;
      }
    | undefined;
  SettingsNotifications: undefined;
  SettingsQuran: undefined;
  SettingsWordReader: undefined;
  SettingsTajweed: undefined;
  /** Settings → Downloads: the download manager, and the disk it uses. */
  SettingsHadith: undefined;
  /** Settings → Hadith → Hadith language. */
  SettingsHadithLanguage: undefined;
  /** Settings → Hadith → What the grades mean; also opened from a hadith's foot. */
  SettingsHadithGrades: undefined;
  SettingsDownloads: undefined;
  /** Settings → Widgets (Android): every widget's look, and the prayer-times widget's own options. */
  SettingsWidgets: undefined;
  SettingsDevices: undefined;
  SettingsAbout: undefined;
  /**
   * Pages nested under a section rather than under the index. They are
   * on the same stack — only the row that opens them differs — so they
   * are declared here beside their parents.
   */
  SettingsExtraTimes: undefined;
  SettingsDailyReminders: undefined;
  SettingsPrayerSounds: undefined;
  SettingsDhikrReminders: undefined;
  SettingsHelpMihrab: undefined;
  SettingsAttributions: undefined;
};
