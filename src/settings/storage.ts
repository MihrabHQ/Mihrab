import { minimalLook } from './minimalLook';
import { DEFAULT_SKY_VARIANT, isSkyVariant } from '../theme/skyMoods';
import { MADHABS, madhabMatches, type Madhab } from '../prayer/madhab';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveDeviceLanguage } from '../i18n/deviceLanguage';
import { coerceNotificationSoundId } from '../notifications/notificationSounds';
import { coerceSavedAccents } from './accentColors';
import { coerceClockFormat } from '../utils/clockFormat';
import { coerceDhikrReminders } from '../dhikr/dhikrReminders';
import { coerceDaruriAlerts } from '../prayer/daruriTimes';
import { coercePrePrayerReminderMinutes } from './prePrayerReminder';
import { coercePrayerSilence } from './prayerSilence';
import { clampReadingScale } from '../theme/readingText';
import {
  coerceHijriAdjust,
  coerceHijriCalendarId,
  setHijriCalendar,
} from '../hijri/calendar';
import { loadCachedHijriOverrides } from '../hijri/overrides';
import { loadCachedMethodCurrency } from '../providers/methodCurrency';
import {
  coerceCustomAngle,
  coerceHighLatitudeRule,
  CUSTOM_METHOD_ID,
  DEFAULT_CUSTOM_FAJR_ANGLE,
  DEFAULT_CUSTOM_ISHA_ANGLE,
  setCalculationPreferences,
} from '../prayer/calculationPreferences';
import {
  extractSecureFields,
  hasSecureFields,
  readSecureSettings,
  saveSecureFallback,
  saveSecureSettings,
  SECURE_FIELD_NAMES,
  stripSecureFields,
  type SecureRead,
  type SecureSettings,
} from './secureStorage';
import {
  coerceLocationProviders,
  seedLocationProviders,
} from './locationProviders';
import { CALCULATION_METHODS } from './methodList';
import { coercePrayerOffsets } from './prayerOffsets';
import {
  DEFAULT_SETTINGS,
  PRAYER_DATA_PROVIDER_IDS,
  WIDGET_TIME_SCALE_MAX,
  WIDGET_TIME_SCALE_MIN,
  WIDGET_TIME_SCALE_STEP,
  WIDGET_SINCE_ADHAN_CHOICES,
  type AppLanguage,
  type PrayerAppSettings,
  type WidgetHighlightId,
} from './types';

const KEY = 'prayerapp.settings.v1';

const LANGUAGES: AppLanguage[] = [
  'en',
  'sv',
  'ar',
  'bn',
  'ur',
  'hi',
  'fr',
  'es',
  'de',
  'tr',
  'id',
  'ru',
  'zh',
];

// No 'dynamic': removed 2026-08-27. A stored 'dynamic' from an older
// build falls through to the default, which is the colour that build was
// already drawing — this is the migration, and it needs no other code.
const WIDGET_HIGHLIGHT_IDS: WidgetHighlightId[] = [
  'green',
  'teal',
  'blue',
  'amber',
  'custom',
];

function coerceLanguage(value: unknown): AppLanguage {
  if (typeof value === 'string' && LANGUAGES.includes(value as AppLanguage)) {
    return value as AppLanguage;
  }
  return DEFAULT_SETTINGS.language;
}

/**
 * The language to open in when the user has never chosen one.
 *
 * Consulted on every load rather than once, so a phone switched to Arabic
 * brings the app with it — right up until the moment someone picks a
 * language in Settings, after which their choice is the only thing that
 * decides.
 */
function deviceLanguage(): AppLanguage {
  return resolveDeviceLanguage(LANGUAGES, DEFAULT_SETTINGS.language);
}

/**
 * Whether a stored blob represents a language the user actually chose.
 *
 * v2.8.4 and earlier had no way to record the difference: the default was
 * 'en' and the picker wrote the same field. So for a blob from before this
 * flag existed, anything other than 'en' can only have come from the
 * picker, and 'en' is indistinguishable from never having been asked —
 * which is exactly the install that should have been following the phone
 * all along.
 */
function coerceLanguagePicked(parsed: Record<string, unknown>): boolean {
  if (typeof parsed.languagePicked === 'boolean') return parsed.languagePicked;
  return 'language' in parsed && coerceLanguage(parsed.language) !== 'en';
}

const KNOWN_METHOD_IDS: ReadonlyArray<number | 'auto'> =
  CALCULATION_METHODS.map(m => m.id);

/** 'auto', or a method id this build lists (Custom, 99, among them). */
function coerceCalculationMethod(
  value: unknown,
): PrayerAppSettings['calculationMethod'] {
  if (value === undefined) return DEFAULT_SETTINGS.calculationMethod;
  if (
    value === CUSTOM_METHOD_ID ||
    KNOWN_METHOD_IDS.includes(value as number | 'auto')
  ) {
    return value as PrayerAppSettings['calculationMethod'];
  }
  return DEFAULT_SETTINGS.calculationMethod;
}

function coerceWidgetHighlightId(value: unknown): WidgetHighlightId {
  if (
    typeof value === 'string' &&
    WIDGET_HIGHLIGHT_IDS.includes(value as WidgetHighlightId)
  ) {
    return value as WidgetHighlightId;
  }
  return DEFAULT_SETTINGS.widgetHighlightId;
}

function coerceWidgetHighlightHex(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
    return value.trim();
  }
  return DEFAULT_SETTINGS.widgetHighlightCustomHex;
}

function coerceHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())
    ? value.trim().toUpperCase()
    : fallback;
}

/** Snapped to the stepper's rungs and clamped to its ends. */
/** The id PrayTimes.dev was stored under, before it was removed in 2.32.0. */
const REMOVED_PRAYTIMES_DEV = 'prayertimes_dev';

/** A location-providers map with one source id renamed, choices kept. */
function renameProvider(value: unknown, from: string, to: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const c = v as { provider?: unknown } | null;
    out[k] =
      c && typeof c === 'object' && c.provider === from
        ? { ...c, provider: to }
        : v;
  }
  return out;
}

/** One of the offered choices, else off: a hand-edited 45 is not a choice. */
export function coerceWidgetSinceAdhan(value: unknown): number {
  return typeof value === 'number' &&
    (WIDGET_SINCE_ADHAN_CHOICES as readonly number[]).includes(value)
    ? value
    : 0;
}

export function coerceWidgetTimeScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.androidWidgetTimeScale;
  }
  const snapped =
    Math.round(value / WIDGET_TIME_SCALE_STEP) * WIDGET_TIME_SCALE_STEP;
  return Math.min(
    WIDGET_TIME_SCALE_MAX,
    Math.max(WIDGET_TIME_SCALE_MIN, snapped),
  );
}

function coerceWidgetOpacity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(Math.min(100, Math.max(0, value)));
  }
  return DEFAULT_SETTINGS.androidWidgetBackgroundOpacity;
}

/**
 * The one read in flight, shared by everyone who asks while it is.
 *
 * Six callers ask for the settings inside the first 35 ms of a cold
 * start — the provider that hydrates the app, the widget payload, the
 * Live Activity, the widget-queue drain — and each used to do its own
 * AsyncStorage read, its own Keychain/Keystore read, its own parse and
 * its own pass through the migrations below, all racing each other for
 * the storage bridge while the first screen waited on the same bridge.
 * Measured: the hydration read that should have taken 34 ms was landing
 * in the middle of five others.
 *
 * Concurrent callers now share the promise. Only CONCURRENT ones: the
 * slot is emptied the moment the read settles, so the next call reads
 * fresh — and it is emptied by every write, so a caller who asks after
 * a save never receives the answer from before it. Nothing is cached
 * across time; nothing is served stale.
 */
let inflightLoad: Promise<PrayerAppSettings> | null = null;

/** Forget the in-flight read: what it would return is no longer current. */
function invalidateInflightLoad(): void {
  inflightLoad = null;
}

/**
 * THE LOCATION STORE COULD NOT BE READ.
 *
 * Coordinates and saved locations live in the Keychain/Keystore, and that
 * read can fail — a phone not yet unlocked since a restart, a corrupt
 * entry. The load then carries on with the defaults for those fields
 * (0, 0, no saved locations) so the app still opens. But the settings the
 * app now holds were never what is stored, and every save writes the whole
 * thing back: the next theme change wrote 0, 0 and an empty list over the
 * real ones, and — since locations kept their own sources — a provider map
 * pruned of every saved location, with the active one dropped and its
 * source turned to Automatic.
 *
 * So the failure is remembered, with the location fields as they were
 * handed out, and every save from then on (the app's state came from that
 * load and stays in memory for the session) asks again before writing:
 *
 *  - Location untouched since that load: the location fields and the
 *    choices that hang off them (`LOCATION_DERIVED_FIELDS`) are left on
 *    disk exactly as they are; everything else is saved.
 *  - Location changed by the user, store still unreadable: their location
 *    goes to the plaintext fallback only (`saveSecureFallback`), so it
 *    survives a relaunch without being written over the unseen entry.
 *  - Location changed, store readable again: only the fields they changed
 *    are written, onto what is stored; saved locations are joined by id
 *    rather than replaced, since one they never saw is not one they removed.
 *
 * Once a save finds the store readable and the app's location the same as
 * what is stored, there is nothing left to protect and saves go back to
 * normal.
 */
let unreadLocation: { handedOut: SecureSettings } | null = null;

/** Plaintext fields that are derived from, or point into, the location store. */
const LOCATION_DERIVED_FIELDS = [
  'locationMode',
  'activeLocationPresetId',
  'dataProvider',
  'dataProviderAuto',
  'locationProviders',
] as const;

function noteSecureRead(
  settings: PrayerAppSettings,
  failed: boolean,
): PrayerAppSettings {
  // Only the first failure's values: a second failed load hands out the
  // same defaults, and a later successful one does not reach the state the
  // app already took from the first (see above).
  if (failed && !unreadLocation) {
    unreadLocation = {
      handedOut: extractSecureFields(
        settings as unknown as Record<string, unknown>,
      ),
    };
  }
  return settings;
}

/**
 * THE PLAINTEXT SETTINGS COULD NOT BE READ.
 *
 * The same hazard as `unreadLocation`, for the other store. A failed read of
 * the plaintext blob (a storage error at launch) handed out the defaults —
 * and dropped the location store's values that HAD been read — so the app
 * opened on the welcome flow at (0, 0), and the first save after it wrote
 * the defaults over every preference and an empty list over the saved
 * locations. Now the location store's values are kept, and every save from
 * then on writes only the fields changed since that load onto what is on
 * disk, or nothing while the blob still cannot be read.
 */
let unreadPlaintext: { handedOut: Record<string, unknown> } | null = null;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

async function readPlaintextOnDisk(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    return asRecord(JSON.parse(raw)) ?? {};
  } catch {
    return null;
  }
}

type SavePlan = {
  secure: SecureSettings;
  secureTarget: 'store' | 'fallback' | 'none';
  /** Null: leave the plaintext blob as it is. */
  plaintext: Record<string, unknown> | null;
};

async function planSaveWithUnreadLocation(
  state: { handedOut: SecureSettings },
  mem: SecureSettings,
  plaintext: Record<string, unknown>,
): Promise<SavePlan> {
  const base = state.handedOut as Record<string, unknown>;
  const ours = mem as Record<string, unknown>;
  const changed = SECURE_FIELD_NAMES.filter(f => !sameJson(ours[f], base[f]));
  const [onDisk, read] = await Promise.all([
    readPlaintextOnDisk(),
    readSecureSettings().catch(
      (): SecureRead => ({ settings: {}, failed: true }),
    ),
  ]);

  if (changed.length === 0) {
    if (!read.failed && sameJson(mem, read.settings)) unreadLocation = null;
    // Can't see what is on disk: then nothing is written over it either.
    if (!onDisk) return { secure: mem, secureTarget: 'none', plaintext: null };
    const out = { ...plaintext };
    for (const f of LOCATION_DERIVED_FIELDS) {
      if (f in onDisk) out[f] = onDisk[f];
      else delete out[f];
    }
    // A blob from before the encrypted store, waiting to be migrated.
    for (const f of SECURE_FIELD_NAMES) {
      if (onDisk[f] !== undefined) out[f] = onDisk[f];
    }
    return { secure: mem, secureTarget: 'none', plaintext: out };
  }

  // The user set a location this session: theirs, with every other
  // location's source that is on disk kept beside it.
  const out = { ...plaintext };
  const diskMap = asRecord(onDisk?.locationProviders);
  const memMap = asRecord(plaintext.locationProviders);
  if (diskMap) out.locationProviders = { ...diskMap, ...(memMap ?? {}) };
  if (read.failed)
    return { secure: mem, secureTarget: 'fallback', plaintext: out };

  const stored = read.settings as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...stored };
  for (const f of changed) {
    if (f === 'locationPresets') {
      const mine = mem.locationPresets ?? [];
      const ids = new Set(mine.map(p => p.id));
      merged.locationPresets = [
        ...mine,
        ...(read.settings.locationPresets ?? []).filter(p => !ids.has(p.id)),
      ];
    } else if (ours[f] === undefined) {
      delete merged[f];
    } else {
      merged[f] = ours[f];
    }
  }
  if (sameJson(merged, ours)) unreadLocation = null;
  return {
    secure: merged as SecureSettings,
    secureTarget: 'store',
    plaintext: out,
  };
}

/**
 * Load settings — task #16.
 *
 * Settings live in TWO stores:
 *   • Plaintext AsyncStorage (`prayerapp.settings.v1`): theme, language,
 *     notifications, calculation method, widget appearance — non-sensitive.
 *   • Encrypted Keychain/Keystore (`prayerapp.location.v1`): coordinates and
 *     manual-location label — PII, never plaintext on disk.
 *
 * Migration: if an old plaintext blob still contains coordinate fields
 * (a pre-task-#16 install), this function copies them to the encrypted
 * store and re-saves the plaintext blob WITHOUT them. The migration runs
 * inline on every `loadSettings()` call but is idempotent — once the
 * plaintext blob no longer carries coordinates, subsequent loads no-op.
 */
export function loadSettings(): Promise<PrayerAppSettings> {
  if (inflightLoad) return inflightLoad;
  const p = loadSettingsUncached()
    .then(s => {
      // Every Hijri date read after this — in the app, a notification
      // task, the widget's headless refresh — is in the user's calendar.
      setHijriCalendar(s.hijriCalendar, s.hijriAdjustDays);
      // …with the last announced corrections this phone downloaded.
      void loadCachedHijriOverrides();
      // …and the newest correction lists it downloaded for the methods it computes.
      void loadCachedMethodCurrency();
      // And every calculation after this is under the user's high-latitude
      // rule and custom angles, in the same places.
      setCalculationPreferences(s);
      return s;
    })
    .finally(() => {
      // Only clear our own slot: a write may already have replaced it.
      if (inflightLoad === p) inflightLoad = null;
    });
  inflightLoad = p;
  return p;
}

async function loadSettingsUncached(): Promise<PrayerAppSettings> {
  // Two stores, one round trip. The plaintext blob and the encrypted one
  // are independent reads that were awaited one after the other; on a
  // phone the Keychain is the slower of the two and it was queued behind
  // the other for no reason.
  let plaintextRaw: string | null = null;
  let secure: SecureSettings = {};
  const [plainResult, secureResult] = await Promise.allSettled([
    AsyncStorage.getItem(KEY),
    readSecureSettings(),
  ]);
  if (secureResult.status === 'fulfilled') {
    secure = secureResult.value.settings;
  }
  // A failed secure read was already logged inside readSecureSettings. The
  // app goes on with empty location fields, so it still runs — but what it
  // hands out is not what is stored, and saves must not write it back.
  const secureFailed =
    secureResult.status === 'rejected' || secureResult.value.failed;
  if (plainResult.status === 'rejected') {
    console.warn(
      'loadSettings: the settings could not be read',
      plainResult.reason,
    );
    // An install with a location store has been through the welcome flow.
    const known = Object.keys(secure).length > 0;
    const handedOut: PrayerAppSettings = {
      ...DEFAULT_SETTINGS,
      language: deviceLanguage(),
      ...(known
        ? { onboardingComplete: true, locationOnboardingComplete: true }
        : {}),
      ...secure,
    };
    unreadPlaintext ??= {
      handedOut: stripSecureFields(
        handedOut as unknown as Record<string, unknown>,
      ),
    };
    return noteSecureRead(handedOut, secureFailed);
  }
  plaintextRaw = plainResult.value;

  if (!plaintextRaw) {
    // First-ever launch (no plaintext blob). Encrypted store may still
    // hold coordinates from a partially-completed prior session — merge.
    // The UI language follows the device here, not the 'en' default.
    return noteSecureRead(
      { ...DEFAULT_SETTINGS, language: deviceLanguage(), ...secure },
      secureFailed,
    );
  }

  let parsed: Partial<PrayerAppSettings> & Record<string, unknown>;
  try {
    parsed = JSON.parse(plaintextRaw) as Partial<PrayerAppSettings> &
      Record<string, unknown>;
  } catch {
    return noteSecureRead(
      { ...DEFAULT_SETTINGS, language: deviceLanguage(), ...secure },
      secureFailed,
    );
  }

  // Migration: if the plaintext blob still has coordinate fields, this is a
  // pre-task-#16 install. Copy them into the encrypted store, then strip
  // them from the plaintext blob and re-save.
  // Not while the encrypted store is unreadable: the copy would be written
  // over an entry nobody could see. The plaintext keeps them till next time.
  if (hasSecureFields(parsed) && !secureFailed) {
    const fromPlain = extractSecureFields(parsed);
    // Encrypted store wins on overlap (it's the newer, authoritative source
    // for sensitive fields if the user already migrated partially).
    const migrated: SecureSettings = { ...fromPlain, ...secure };
    try {
      await saveSecureSettings(migrated);
      const stripped = stripSecureFields(parsed);
      await AsyncStorage.setItem(KEY, JSON.stringify(stripped));
      secure = migrated;
      parsed = stripped as Partial<PrayerAppSettings> & Record<string, unknown>;
    } catch (e) {
      // Migration failed (e.g., Keychain locked). Don't strip plaintext —
      // we'd lose the user's coordinates. Try again next launch.
      console.warn('Settings migration to encrypted storage failed:', e);
    }
  }

  const merged: PrayerAppSettings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    ...secure,
  };
  merged.languagePicked = coerceLanguagePicked(parsed);
  merged.language = merged.languagePicked
    ? coerceLanguage(parsed.language)
    : deviceLanguage();
  if (!('locationOnboardingComplete' in parsed)) {
    merged.locationOnboardingComplete = true;
  }
  // The same argument, for the flag that gates the WHOLE welcome flow, and
  // it was missing: `locationOnboardingComplete` got this treatment and
  // `onboardingComplete` never did. So an install whose blob predates the
  // flag loaded it as false and was routed into the new-user greeting on
  // update — salam, notifications ask, exact-alarms ask, then the feature
  // tour — which is how existing users came to be shown a welcome as an
  // accidental release note. Nobody designed that; see
  // docs/design/onboarding-plan.md §2.4.
  //
  // Reaching here at all means a plaintext blob EXISTS, which means the app
  // has been run and settings have been written. A genuinely fresh install
  // returns above, at `if (!plaintextRaw)`, with DEFAULT_SETTINGS and
  // `onboardingComplete: false` — so this cannot swallow a real first run.
  if (!('onboardingComplete' in parsed)) {
    merged.onboardingComplete = true;
  }
  if (!('dataProviderAuto' in parsed)) {
    merged.dataProviderAuto = false;
  } else if (typeof merged.dataProviderAuto !== 'boolean') {
    // Present but not a boolean: a hand-edited blob, or a peer's garbage
    // brought in by sync. Truthy garbage read as "pinned" or "automatic"
    // by accident; the default is the honest answer.
    merged.dataProviderAuto = DEFAULT_SETTINGS.dataProviderAuto;
  }
  // PrayTimes.dev is gone (2.32.0), and had been answering 404 for a while
  // before that: its users were getting their own method and Asr computed
  // on the phone, by the fallback under every source. The on-device source
  // IS that, so they keep exactly the times they had. Sending them to
  // Automatic instead handed a Stockholm user Islamiska Förbundet's method
  // with the Hanafi Asr they had chosen set aside.
  if ((merged.dataProvider as string) === REMOVED_PRAYTIMES_DEV) {
    merged.dataProvider = 'local_adhan';
  }
  // A source this build does not know — picked in a newer build and brought
  // here by sync or a backup — would fall to the on-device rung on every
  // fetch under a name the screens cannot show. Automatic answers instead.
  if (
    !(PRAYER_DATA_PROVIDER_IDS as readonly string[]).includes(
      merged.dataProvider,
    )
  ) {
    merged.dataProvider = DEFAULT_SETTINGS.dataProvider;
    merged.dataProviderAuto = true;
  }
  // A method this build cannot compute — a string, a number from no table —
  // would reach every calculation as an id nobody can resolve.
  merged.calculationMethod = coerceCalculationMethod(parsed.calculationMethod);
  // Each offset clamped to what the stepper allows; anything else dropped.
  merged.prayerOffsets = coercePrayerOffsets(parsed.prayerOffsets);
  if (!('appearance' in parsed)) {
    merged.appearance = 'system';
  }
  if (!('pureBlackDark' in parsed)) {
    merged.pureBlackDark = false;
  }
  if (!('useSystemDynamicTheme' in parsed)) {
    merged.useSystemDynamicTheme = false;
  }
  // A typed guard rather than a presence check: this one decides which
  // notification channel the adhan is scheduled against, and a non-boolean
  // that survived the spread would be truthy garbage pointing at a channel
  // nobody created — a prayer alert that arrives silently.
  if (typeof merged.adhanUsesAlarmStream !== 'boolean') {
    merged.adhanUsesAlarmStream = false;
  }
  // Same kind of guard: truthy garbage here would wake the screen for every
  // prayer of someone who never asked for it.
  if (typeof merged.prayerAlertFullScreen !== 'boolean') {
    merged.prayerAlertFullScreen = false;
  }
  // The same kind of guard: this one turns Do Not Disturb on and off on
  // a clock, and a half-shaped blob would be read by a receiver with the
  // app closed, where there is nobody to notice.
  merged.prayerSilence = coercePrayerSilence(parsed.prayerSilence);
  // One-time v2.7.27 migration: the mushaf became the default reading
  // mode. Blobs written before the marker existed carry the OLD default
  // ('withTranslation') that virtually no user chose explicitly — apply
  // the new default once, then never touch the user's choice again.
  if (!('quranModeMushafDefault' in parsed)) {
    merged.quranReadingMode = 'mushaf';
    merged.quranModeMushafDefault = true;
  }
  // The verse-by-verse reader became opt-in: the muṣḥaf is the reader,
  // and the ayah-by-ayah list is a setting. Nobody who was USING the list
  // should open the app to find it gone, so this grandfathers them in
  // once. The key's own absence is the marker — once written, the user's
  // switch is the only thing that moves it.
  //
  // The condition is narrower than "was on withTranslation", and the
  // narrowing is the point. Before the v2.7.27 default flip,
  // `withTranslation` is what every install carried WITHOUT choosing it
  // — the migration above exists precisely because that value meant
  // nothing. Grandfathering on it would switch this on for a large
  // number of people who have never seen the reader it refers to. So we
  // only count a `withTranslation` that was recorded after the flip,
  // which is one somebody reached by pressing the toggle.
  if (!('quranVerseByVerseEnabled' in parsed)) {
    merged.quranVerseByVerseEnabled =
      'quranModeMushafDefault' in parsed &&
      parsed.quranReadingMode === 'withTranslation';
  }
  // App accent (#127). Older installs persisted no `appAccentId`; fall
  // back to the brand green default and a valid 6-char hex so the
  // palette resolver always has something concrete to work with.
  const validAccentIds: ReadonlyArray<string> = [
    'green',
    'teal',
    'blue',
    'amber',
    'rose',
    'violet',
    'custom',
  ];
  if (
    typeof parsed.appAccentId !== 'string' ||
    !validAccentIds.includes(parsed.appAccentId)
  ) {
    merged.appAccentId = DEFAULT_SETTINGS.appAccentId;
  }
  if (
    typeof parsed.appAccentCustomHex !== 'string' ||
    !/^#[0-9A-Fa-f]{6}$/.test(parsed.appAccentCustomHex)
  ) {
    merged.appAccentCustomHex = DEFAULT_SETTINGS.appAccentCustomHex;
  }
  // Colour theme: new installs get DEFAULT_SETTINGS (true → green theme).
  // A blob that never wrote the key must stay Classic — checking `parsed`,
  // not `merged`, because the spread already filled DEFAULT's `true`.
  // Non-boolean garbage also collapses to Classic.
  if (typeof parsed.tintedSurfaces !== 'boolean') {
    merged.tintedSurfaces = false;
  }
  // The Sky theme's colours: Vibrant unless a known variant was kept.
  if (!isSkyVariant(merged.skyVariant)) {
    merged.skyVariant = DEFAULT_SKY_VARIANT;
  }
  // Reconcile coords with the active location preset — task #137. The
  // user's coordinates live in two places: `manualLatitude/Longitude`
  // (mirrored for the app's read path) and the entry inside
  // `locationPresets[*]`. They can drift apart if the encrypted
  // storage load partially failed, or if a previous version wrote
  // one but not the other. When the active preset is known, treat
  // its coords as authoritative and override the bare manual coords
  // — this fixes the (0, 0) sentinel showing up after the user
  // already saved a real location preset.
  if (
    typeof merged.activeLocationPresetId === 'string' &&
    Array.isArray(merged.locationPresets)
  ) {
    const active = merged.locationPresets.find(
      p => p.id === merged.activeLocationPresetId,
    );
    if (active) {
      const noManual =
        !Number.isFinite(merged.manualLatitude) ||
        !Number.isFinite(merged.manualLongitude) ||
        (merged.manualLatitude === 0 && merged.manualLongitude === 0);
      if (noManual) {
        merged.manualLatitude = active.latitude;
        merged.manualLongitude = active.longitude;
        merged.manualLocationLabel = active.label ?? merged.manualLocationLabel;
      }
    }
  }
  merged.androidWidgetBackgroundOpacity = coerceWidgetOpacity(
    parsed.androidWidgetBackgroundOpacity,
  );
  merged.hijriCalendar = coerceHijriCalendarId(parsed.hijriCalendar);
  merged.hijriAdjustDays = coerceHijriAdjust(parsed.hijriAdjustDays);
  merged.androidWidgetTextColor = coerceHexColor(
    parsed.androidWidgetTextColor,
    DEFAULT_SETTINGS.androidWidgetTextColor,
  );
  merged.androidWidgetShowLocation = parsed.androidWidgetShowLocation !== false;
  merged.androidWidgetShowCountdown =
    parsed.androidWidgetShowCountdown !== false;
  merged.androidWidgetShowTable = parsed.androidWidgetShowTable !== false;
  merged.androidWidgetTimeScale = coerceWidgetTimeScale(
    parsed.androidWidgetTimeScale,
  );
  merged.widgetSinceAdhanMinutes = coerceWidgetSinceAdhan(
    parsed.widgetSinceAdhanMinutes,
  );
  merged.clockFormat = coerceClockFormat(parsed.clockFormat);
  // Snapped, not merged: a value between rungs — an older ladder, a
  // hand-edited blob — would leave the stepper unable to say where it is.
  merged.readingTextScale = clampReadingScale(parsed.readingTextScale);
  // Issue #19. A typed guard rather than a presence check: this decides
  // whether the card prints a second clock time under every prayer, and a
  // truthy non-boolean from a hand-edited blob would turn it on silently.
  if (typeof merged.malikiSecondTimesEnabled !== 'boolean') {
    merged.malikiSecondTimesEnabled = false;
  }
  // A truthy non-boolean here would unfold a diagnostics panel on the
  // Today screen of somebody who never asked for one.
  if (typeof merged.dataStatsExpanded !== 'boolean') {
    merged.dataStatsExpanded = false;
  }
  // Alerts are opt-in per boundary and the list is the kill-switch, so a
  // blob holding anything but a known key must come back empty rather
  // than scheduling something nobody chose.
  merged.malikiSecondTimeAlerts = coerceDaruriAlerts(
    parsed.malikiSecondTimeAlerts,
  );
  // #29. Every field of every reminder comes back through a coercion,
  // and a malformed one is dropped rather than repaired: these schedule
  // notifications, and an hour of NaN is a trigger that never fires or
  // fires now. Same treatment as the location presets beside them.
  merged.dhikrReminders = coerceDhikrReminders(parsed.dhikrReminders);
  merged.malikiSecondTimeAlertMinutes = coercePrePrayerReminderMinutes(
    parsed.malikiSecondTimeAlertMinutes ??
      DEFAULT_SETTINGS.malikiSecondTimeAlertMinutes,
  );
  // #21. A stored blob naming a school this build does not know, or a
  // school that no longer matches the ʿaṣr shadow beside it, comes back as
  // Custom — the label for a combination no school claims. Never the other
  // way round: a bad value must not silently move somebody's times.
  merged.madhab = MADHABS.includes(parsed.madhab as Madhab)
    ? (parsed.madhab as Madhab)
    : null;
  if (!madhabMatches(merged.madhab, merged.school)) merged.madhab = null;
  merged.highLatitudeRule = coerceHighLatitudeRule(parsed.highLatitudeRule);
  merged.customFajrAngle = coerceCustomAngle(
    parsed.customFajrAngle,
    DEFAULT_CUSTOM_FAJR_ANGLE,
  );
  merged.customIshaAngle = coerceCustomAngle(
    parsed.customIshaAngle,
    DEFAULT_CUSTOM_ISHA_ANGLE,
  );
  merged.widgetHighlightId = coerceWidgetHighlightId(parsed.widgetHighlightId);
  merged.widgetHighlightCustomHex = coerceWidgetHighlightHex(
    parsed.widgetHighlightCustomHex,
  );
  merged.prePrayerReminderMinutes = coercePrePrayerReminderMinutes(
    parsed.prePrayerReminderMinutes,
  );
  merged.notificationSound = coerceNotificationSoundId(
    parsed.notificationSound,
  );
  // Migrate locationMode: 'gps' was renamed to 'automatic' in v1.5.52+
  if ((merged.locationMode as string) === 'gps') {
    merged.locationMode = 'automatic';
  }
  // Task #18: location presets always present (default empty array). Active
  // preset id is preserved if it points at an existing preset, dropped otherwise
  // (defends against a deleted-preset reference surviving in plaintext storage).
  if (!Array.isArray(merged.locationPresets)) {
    merged.locationPresets = [];
  }
  if (
    merged.activeLocationPresetId !== undefined &&
    !merged.locationPresets.some(p => p.id === merged.activeLocationPresetId)
  ) {
    merged.activeLocationPresetId = undefined;
  }
  // Each location's own prayer-time source; settings from before it get
  // every location seeded with the one choice they shared.
  merged.locationProviders = coerceLocationProviders(
    renameProvider(
      merged.locationProviders,
      REMOVED_PRAYTIMES_DEV,
      'local_adhan',
    ),
    PRAYER_DATA_PROVIDER_IDS,
  );
  Object.assign(merged, seedLocationProviders(merged));
  // Saved accent colours: absent on every blob written before they
  // existed, so an upgrade lands on an empty shelf rather than on
  // `undefined` — and anything that is not a hex is dropped rather than
  // guessed at, because there is no honest correction for "blue".
  merged.savedAccentColors = coerceSavedAccents(merged.savedAccentColors);
  // Minimal wears the classic colours (minimalLook.ts).
  return noteSecureRead(minimalLook(merged), secureFailed);
}

/**
 * Save settings — splits sensitive fields off to encrypted storage.
 *
 * The plaintext AsyncStorage blob is GUARANTEED to never contain
 * coordinates after this call. The regression test
 * `__tests__/secureStorage.migration.test.ts` confirms this invariant.
 */
// Write serialization — a single in-order queue for ALL settings saves.
//
// `updateSettings` fires `saveSettings(next)` for every change, and `next` is
// always derived from the latest state (functional setState). But each save is
// two async writes (encrypted + plaintext) with no ordering guarantee, so two
// rapid changes — e.g. removing a saved location and then picking a new place —
// could complete out of order and leave the OLDER snapshot on disk. The user
// then sees their location change "not take" and has to redo it. Chaining every
// save through one promise guarantees they land in call order, so the most
// recent state always wins. (Mirrors the write-mutex used in prayerStorage.)
let _saveQueue: Promise<void> = Promise.resolve();

async function performSave(settings: PrayerAppSettings): Promise<void> {
  // Before the write, not after: a read that starts during the write must
  // not be handed the promise that started before it.
  invalidateInflightLoad();
  setCalculationPreferences(settings);
  let plan: SavePlan = {
    secure: extractSecureFields(settings as unknown as Record<string, unknown>),
    secureTarget: 'store',
    plaintext: stripSecureFields(
      settings as unknown as Record<string, unknown>,
    ),
  };
  if (unreadLocation) {
    plan = await planSaveWithUnreadLocation(
      unreadLocation,
      plan.secure,
      plan.plaintext as Record<string, unknown>,
    );
  }
  if (unreadPlaintext && plan.plaintext) {
    // Only what was changed since the defaults were handed out, onto what is
    // on disk — and nothing while that still cannot be read.
    const onDisk = await readPlaintextOnDisk();
    const base = unreadPlaintext.handedOut;
    const mine = plan.plaintext;
    if (!onDisk) {
      plan = { ...plan, plaintext: null };
    } else {
      const out: Record<string, unknown> = { ...onDisk };
      for (const k of new Set([...Object.keys(mine), ...Object.keys(base)])) {
        if (sameJson(mine[k], base[k])) continue;
        if (mine[k] === undefined) delete out[k];
        else out[k] = mine[k];
      }
      plan = { ...plan, plaintext: out };
    }
  }
  // Persist secure fields first. saveSecureSettings now writes to a plaintext
  // AsyncStorage fallback if the encrypted store rejects (task #141), so
  // user coordinates / presets survive a broken Keychain. We still want the
  // plaintext settings save to proceed regardless — non-secure fields like
  // theme, language, and method changes shouldn't be blocked by a Keychain
  // outage. Catch and log; do not re-throw.
  if (plan.secureTarget === 'store') {
    try {
      await saveSecureSettings(plan.secure);
    } catch (e) {
      console.warn(
        'saveSettings: secure save failed, fallback engaged. Continuing with plaintext save.',
        e,
      );
    }
  } else if (plan.secureTarget === 'fallback') {
    await saveSecureFallback(plan.secure);
  }
  if (plan.plaintext) {
    await AsyncStorage.setItem(KEY, JSON.stringify(plan.plaintext));
  }
}

export function saveSettings(settings: PrayerAppSettings): Promise<void> {
  // Chain onto the queue regardless of whether the previous save resolved or
  // rejected, so one failed write can't wedge every later save.
  const next = _saveQueue.then(
    () => performSave(settings),
    () => performSave(settings),
  );
  _saveQueue = next.catch(() => {});
  return next;
}

/**
 * Hard reset — task #85.
 *
 * Wipes EVERY persisted store the app owns:
 *   • Plaintext settings blob (`prayerapp.settings.v1`)
 *   • Encrypted location store (`prayerapp.location.v1`)
 *   • Encrypted journal entries (`prayerapp.journal.v1`)
 *   • Encrypted fasting entries (`prayerapp.fasting.v1`)
 *   • Prayer-times cache and any miscellaneous AsyncStorage keys we wrote
 *
 * Used by the "Show onboarding again" entry in Settings, which is now a
 * destructive reset gated behind a confirmation Alert. After this call
 * returns, the next `loadSettings()` will see a virgin state and the
 * onboarding flow will run from scratch.
 */
export async function resetAppData(): Promise<void> {
  // Plaintext: clear EVERYTHING we own. AsyncStorage.clear() is too broad
  // (it would also nuke other libraries' storage), so we enumerate keys
  // we authored.
  const asyncKeys = [
    'prayerapp.settings.v1',
    'prayerapp.prayer.v1',
    // Mushaf one-time-download flag — task #130. Clearing forces the
    // download prompt to re-appear on first mushaf open after reset.
    'mushaf.assets.v1.complete',
    'mushaf.assets.v2.complete',
    'mushaf.assets.v3.complete',
    // Plaintext fallback for secure storage — task #141. If the user's
    // Keychain was rejecting writes, secure data ended up here. Reset
    // must wipe it too.
    'prayerapp.location.fallback.v1',
    // Cached reverse-geocode results from the Sweden/non-Sweden gate —
    // task #138. Not sensitive but resetting makes the next session
    // re-fetch fresh.
    'islamiska_forbundet.reverse.v1',
    // Where the last Tilāwah listen stopped (quran/audio/listenProgress).
    'mihrab.listenProgress.v1',
    // The prayer-times cache itself (`prayerStorage.ts`) and its legacy
    // key: every slot is keyed by the coordinates it was fetched for.
    // ('prayerapp.prayer.v1' above is a name nothing ever wrote to.)
    'prayer_times_cache.v2',
    'prayer_times_cache',
    // Where the phone has been, city by city (`cityRegistry.ts`).
    'mihrab.cityRegistry.v1',
  ];
  invalidateInflightLoad();
  // Nothing left to protect: the reset is the one write meant to erase it.
  unreadLocation = null;
  unreadPlaintext = null;
  try {
    await AsyncStorage.multiRemove(asyncKeys);
  } catch (e) {
    console.warn('AsyncStorage reset failed:', e);
  }

  // Encrypted: wipe the three known keys. Use dynamic require so test
  // environments without the native module don't blow up.
  try {
    const EncryptedStorage =
      require('react-native-encrypted-storage').default ||
      require('react-native-encrypted-storage');
    const secureKeys = [
      'prayerapp.location.v1',
      'prayerapp.journal.v1',
      'prayerapp.fasting.v1',
    ];
    for (const k of secureKeys) {
      try {
        await EncryptedStorage.removeItem(k);
      } catch {
        // missing keys throw on some platforms — non-fatal
      }
    }
  } catch (e) {
    console.warn('EncryptedStorage reset failed:', e);
  }
}

/** Test seam: forget a failed location read from an earlier test. */
export function _resetSettingsStorageForTests(): void {
  unreadLocation = null;
  unreadPlaintext = null;
  inflightLoad = null;
}
