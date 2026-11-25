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
 * Read at the call, like the property access it replaces.
 */
import { NativeModules } from 'react-native';

// The one place the module is untyped: each caller casts to its own type.
export function nativeModule(spec: object | null | undefined, name: string): any {
  return spec ?? (NativeModules as Record<string, unknown>)[name] ?? undefined;
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
