/**
 * A native module, as the wrappers in this folder have always held one.
 *
 * Every module of ours has a typed contract in `specs/` and is a
 * TurboModule on the native side (specs/README.md). The wrappers predate
 * that and keep their own, fuller types for what a call resolves with, so
 * they take the module through here rather than from the spec's default
 * export directly — for two reasons:
 *
 *  - ABSENT IS `undefined`, AS IT WAS. `TurboModuleRegistry.get` answers
 *    `null` for a module the platform does not have; `NativeModules.X`
 *    answered `undefined`, and thirty wrappers were written against that.
 *
 *  - THE OLD DOOR STAYS OPEN. If the typed lookup comes back empty the
 *    module is asked for by name the way it used to be. On a device that
 *    is the same module by the interop route, so a contract that fails to
 *    register costs its speed, not the feature; under Jest it is where a
 *    test's `NativeModules.X = …` is found.
 *
 *  - A METHOD THE PLATFORM DOES NOT HAVE IS NOT THERE. A contract is one
 *    for both platforms, so JavaScript is handed every method of it on
 *    each — including the ones only the other implements. The wrappers ask
 *    "can this phone do it?" by looking (`typeof native.saveFile ===
 *    'function'`, `native.takePending?.()`), and an answer of "yes" for a
 *    method that is not there is a crash on iOS (the first build of this
 *    did: `-[SystemClock readTimeZone:reject:]: unrecognized selector`)
 *    and a promise that never settles on Android. So the other platform's
 *    methods are hidden again here, by name — the two lists below, which
 *    `__tests__/turboModulesAreTyped.test.ts` holds to the contracts and
 *    to the native code.
 *
 * Read at the call, like the property access it replaces.
 */
import { NativeModules, Platform } from 'react-native';

/** Methods only Android implements, by module. Hidden on iOS. */
export const ANDROID_ONLY: Record<string, readonly string[]> = {
  SystemClock: ['readNetworkCountryIso', 'readTimeZone'],
  SyncFolder: ['saveFile'],
  CustomAdhan: ['pickSystemSound', 'ensureAlarmChannel', 'deleteChannel'],
  CompassModule: ['sensorsAccess', 'hasSystemCompass', 'openSystemCompass'],
  PrayerWidget: [
    'getAndroidWidgetAppearance',
    'renderPreviews',
    'setAndroidWidgetAppearance',
    'setAndroidWidgetSky',
    'setAndroidWidgetBackground',
    'setAndroidWidgetAppLook',
    'getAndroidPrayerWidgetDisplay',
    'setAndroidPrayerWidgetDisplay',
  ],
};

/** Methods only iOS implements, by module. Hidden on Android. */
export const IOS_ONLY: Record<string, readonly string[]> = {
  BackgroundLocation: ['requestAlways', 'takePending', 'finish'],
  PrayerWidget: ['setWidgetHighlightDynamic', 'setIosWidgetHighlightAppearance'],
};

const views = new Map<string, { of: object; view: object }>();

/** `module` without the methods this platform does not implement. */
function onThisPlatform(module: object, name: string): object {
  // On the two platforms with contracts only. The desktop and the browser
  // hand over modules of their own making (desktop/web/native), which have
  // exactly the methods they have.
  const os = Platform?.OS;
  const hidden = os === 'android' ? IOS_ONLY[name] : os === 'ios' ? ANDROID_ONLY[name] : undefined;
  if (!hidden || hidden.length === 0) return module;
  const kept = views.get(name);
  if (kept && kept.of === module) return kept.view;
  const view = new Proxy(module, {
    get(target, property) {
      if (typeof property === 'string' && hidden.includes(property)) return undefined;
      return (target as Record<string | symbol, unknown>)[property];
    },
    has(target, property) {
      if (typeof property === 'string' && hidden.includes(property)) return false;
      return property in target;
    },
  });
  views.set(name, { of: module, view });
  return view;
}

// The one place the module is untyped: each caller casts to its own type.
export function nativeModule(spec: object | null | undefined, name: string): any {
  if (spec != null) return onThisPlatform(spec, name);
  return (NativeModules as Record<string, unknown>)[name] ?? undefined;
}

/**
 * A module's constants. A TurboModule hands them over from
 * `getConstants()`; the interop route (and a test's stand-in) has them as
 * properties of the module itself.
 */
export function nativeConstants(spec: object | null | undefined, name: string): any {
  const module = nativeModule(spec, name);
  if (module == null) return undefined;
  return typeof module.getConstants === 'function' ? (module.getConstants() ?? module) : module;
}
