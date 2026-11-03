/**
 * The settings sections, in one list.
 *
 * The index renders it and the root navigator registers it, so a section
 * cannot exist on one and not the other — which is the failure mode of a
 * settings screen split into pages: a card that is still in the codebase
 * but no longer reachable from anywhere.
 */
import type { ComponentType } from 'react';
import { Platform, type ColorValue } from 'react-native';
import type { RootStackParamList } from '../../navigation/types';
import {
  AboutIcon,
  AppearanceIcon,
  DownloadsIcon,
  LocationIcon,
  NotificationsIcon,
  PrayerTimesIcon,
  QuranIcon,
  WidgetsIcon,
} from './SettingsSectionIcons';

export type SettingsSubpageRoute = Extract<
  keyof RootStackParamList,
  `Settings${string}`
>;

/**
 * A page that hangs off a section rather than off the index.
 *
 * Some sections are a page and a half — Notifications was four unrelated
 * families in one scroll, and by the fourth nobody had read the second.
 * A nested page is how a family moves out without leaving the section
 * that owns it: it is registered on the same stack, it is NOT on the
 * settings index, and the only way in is the row its parent draws for
 * it. `NestedPageRows` draws those rows from this same list, so a page
 * declared here is reachable by construction.
 */
export type SettingsNestedPage = {
  route: SettingsSubpageRoute;
  titleKey: string;
  blurbKey: string;
  /** The page, required when first opened — see RegisteredSettingsPage. */
  getComponent: () => ComponentType<Record<string, never>>;
};

export type SettingsSubpage = {
  route: SettingsSubpageRoute;
  /** i18n key for the page's own header title. */
  titleKey: string;
  /** i18n key for the one line under it on the index. */
  blurbKey: string;
  Icon: ComponentType<{ size?: number; color: ColorValue }>;
  getComponent: () => ComponentType<Record<string, never>>;
  /**
   * Platforms this section has anything to say on. Absent = all of them.
   *
   * A section is dropped from BOTH the index and the navigator together,
   * which is the whole reason this list exists — a route registered but
   * not listed is a page you can only reach by accident, and a row listed
   * but not registered crashes on tap.
   */
  platforms?: ReadonlyArray<typeof Platform.OS>;
  /** Pages that hang off this section instead of off the index. */
  children?: readonly SettingsNestedPage[];
};

const ALL_SUBPAGES: readonly SettingsSubpage[] = [
  {
    route: 'SettingsPrayerTimes',
    titleKey: 'settings.sectionPrayerTimes',
    blurbKey: 'settings.sectionPrayerTimesBlurb',
    Icon: PrayerTimesIcon,
    getComponent: () => (require('./pages/PrayerTimesSettingsScreen') as typeof import('./pages/PrayerTimesSettingsScreen')).PrayerTimesSettingsScreen,
  },
  {
    route: 'SettingsNotifications',
    titleKey: 'settings.sectionNotifications',
    blurbKey: 'settings.sectionNotificationsBlurb',
    Icon: NotificationsIcon,
    getComponent: () => (require('./pages/NotificationSettingsScreen') as typeof import('./pages/NotificationSettingsScreen')).NotificationSettingsScreen,
    children: [
      {
        route: 'SettingsPrayerSounds',
        titleKey: 'settings.prayerSounds',
        blurbKey: 'settings.prayerSoundsBlurb',
        getComponent: () => (require('./pages/PrayerSoundsSettingsScreen') as typeof import('./pages/PrayerSoundsSettingsScreen')).PrayerSoundsSettingsScreen,
      },
      {
        route: 'SettingsExtraTimes',
        titleKey: 'settings.additionalTimes',
        blurbKey: 'settings.additionalTimesBlurb',
        getComponent: () => (require('./pages/ExtraTimesSettingsScreen') as typeof import('./pages/ExtraTimesSettingsScreen')).ExtraTimesSettingsScreen,
      },
      {
        route: 'SettingsDailyReminders',
        titleKey: 'settings.dailyReminders',
        blurbKey: 'settings.dailyRemindersBlurb',
        getComponent: () => (require('./pages/DailyRemindersSettingsScreen') as typeof import('./pages/DailyRemindersSettingsScreen')).DailyRemindersSettingsScreen,
      },
      {
        route: 'SettingsDhikrReminders',
        titleKey: 'dhikr.remindersTitle',
        blurbKey: 'dhikr.remindersBlurb',
        getComponent: () => (require('./pages/DhikrRemindersSettingsScreen') as typeof import('./pages/DhikrRemindersSettingsScreen')).DhikrRemindersSettingsScreen,
      },
    ],
  },
  {
    route: 'SettingsLocation',
    titleKey: 'settings.sectionLocation',
    blurbKey: 'settings.sectionLocationBlurb',
    Icon: LocationIcon,
    getComponent: () => (require('./pages/LocationSettingsScreen') as typeof import('./pages/LocationSettingsScreen')).LocationSettingsScreen,
  },
  {
    route: 'SettingsAppearance',
    titleKey: 'settings.sectionAppearance',
    blurbKey: 'settings.sectionAppearanceBlurb',
    Icon: AppearanceIcon,
    getComponent: () => (require('./pages/AppearanceSettingsScreen') as typeof import('./pages/AppearanceSettingsScreen')).AppearanceSettingsScreen,
  },
  {
    /**
     * Its own row because "widget" is the word someone hunting for these
     * scans the index for, and the prayer-times widget's options are a
     * page's worth. Android only until #111 gave iOS's widgets a setting
     * of their own (time since the adhan).
     */
    route: 'SettingsWidgets',
    // Phones, tablets and the Mac. Windows and Linux have no widgets.
    platforms: ['ios', 'android'],
    titleKey: 'settings.sectionWidgets',
    // iOS has only the one setting: say that, not Android's list.
    blurbKey: Platform.OS === 'ios' ? 'settings.sectionWidgetsBlurbIos' : 'settings.sectionWidgetsBlurb',
    Icon: WidgetsIcon,
    getComponent: () => (require('./pages/WidgetsSettingsScreen') as typeof import('./pages/WidgetsSettingsScreen')).WidgetsSettingsScreen,
  },
  {
    route: 'SettingsQuran',
    titleKey: 'settings.sectionQuran',
    blurbKey: 'settings.sectionQuranBlurb',
    Icon: QuranIcon,
    getComponent: () => (require('./pages/QuranSettingsScreen') as typeof import('./pages/QuranSettingsScreen')).QuranSettingsScreen,
    children: [
      {
        route: 'SettingsWordReader',
        titleKey: 'quran.wordReaderTitle',
        blurbKey: 'quran.wordReaderBlurb',
        getComponent: () => (require('./pages/WordReaderSettingsScreen') as typeof import('./pages/WordReaderSettingsScreen')).WordReaderSettingsScreen,
      },
      {
        route: 'SettingsTajweed',
        titleKey: 'tajweed.title',
        blurbKey: 'tajweed.settingsBlurb',
        getComponent: () => (require('./pages/TajweedSettingsScreen') as typeof import('./pages/TajweedSettingsScreen')).TajweedSettingsScreen,
      },
    ],
  },
  {
    /**
     * Its own section rather than a row under Data & privacy: the
     * download manager is something people come back to — to resume, to
     * see what is taking the space, to delete a reciter — and every door
     * in the app (the Quran screen, the reader, the riwayah picker, the
     * "download stopped" notification) opens this page.
     */
    route: 'SettingsDownloads',
    titleKey: 'settings.sectionDownloads',
    blurbKey: 'settings.sectionDownloadsBlurb',
    Icon: DownloadsIcon,
    getComponent: () => (require('./pages/DownloadsSettingsScreen') as typeof import('./pages/DownloadsSettingsScreen')).DownloadsSettingsScreen,
  },
  {
    route: 'SettingsAbout',
    titleKey: 'settings.sectionAbout',
    blurbKey: 'settings.sectionAboutBlurb',
    Icon: AboutIcon,
    getComponent: () => (require('./pages/AboutSettingsScreen') as typeof import('./pages/AboutSettingsScreen')).AboutSettingsScreen,
    children: [
      {
        route: 'SettingsHelpMihrab',
        titleKey: 'settings.helpMihrab',
        blurbKey: 'settings.helpMihrabBlurb',
        getComponent: () => (require('./pages/HelpMihrabSettingsScreen') as typeof import('./pages/HelpMihrabSettingsScreen')).HelpMihrabSettingsScreen,
      },
      {
        route: 'SettingsAttributions',
        titleKey: 'settings.attributions',
        blurbKey: 'settings.attributionsBlurb',
        getComponent: () => (require('./pages/AttributionsSettingsScreen') as typeof import('./pages/AttributionsSettingsScreen')).AttributionsSettingsScreen,
      },
    ],
  },
] as const;

export const SETTINGS_SUBPAGES: readonly SettingsSubpage[] =
  ALL_SUBPAGES.filter(
    page => !page.platforms || page.platforms.includes(Platform.OS),
  );

/** Every section, whatever the platform — for tests that check the set. */
export const ALL_SETTINGS_SUBPAGES = ALL_SUBPAGES;

/**
 * Everything the root stack registers: the sections, then the pages that
 * hang off them.
 *
 * `backTitleKey` is what the back control says. For a section that is
 * "Settings"; for a nested page it is the section's own name, because
 * "‹ Settings" from two levels down points past where back actually
 * goes.
 */
export type RegisteredSettingsPage = {
  route: SettingsSubpageRoute;
  titleKey: string;
  /**
   * The page's component, required at the first open: the stack lists
   * every page from the first render, and a `component` would have loaded
   * all eighteen pages' modules at every launch (docs/first-frame-plan.md).
   */
  getComponent: () => ComponentType<Record<string, never>>;
  backTitleKey: string;
};

export const SETTINGS_STACK_PAGES: readonly RegisteredSettingsPage[] =
  SETTINGS_SUBPAGES.flatMap(page => [
    {
      route: page.route,
      titleKey: page.titleKey,
      getComponent: page.getComponent,
      backTitleKey: 'nav.settings',
    },
    ...(page.children ?? []).map(child => ({
      route: child.route,
      titleKey: child.titleKey,
      getComponent: child.getComponent,
      backTitleKey: page.titleKey,
    })),
  ]);

/** The pages hanging off one section, for the rows that open them. */
export function nestedPagesOf(
  route: SettingsSubpageRoute,
): readonly SettingsNestedPage[] {
  return SETTINGS_SUBPAGES.find(p => p.route === route)?.children ?? [];
}
