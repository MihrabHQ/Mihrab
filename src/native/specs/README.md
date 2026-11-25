# The native modules' contracts

One file here for every native module of ours: what JavaScript may call on
it, with what, and what comes back. React Native's codegen reads these
(`codegenConfig` in `package.json`) and writes, at build time:

- **Android** — an abstract class `com.prayer_times.specs.Native<Name>Spec`.
  The Kotlin module extends it, so a method missing or of the wrong shape
  does not compile.
- **iOS** — a protocol `Native<Name>Spec` and the C++ class that calls it,
  in `<MihrabSpec/MihrabSpec.h>`. A module written in Objective-C adopts
  the protocol; one written in Swift has a small `.mm` beside it that does
  (`ios/PrayerApp/MihrabTurbo.h` says how).

That makes each a TurboModule: JavaScript calls it directly, loaded when
first asked for, with no bridge in between.

## Rules

- **The file is `Native<Name>.ts`, the interface is `Spec`, and the last
  line is `TurboModuleRegistry.get<Spec>('<Name>')`.** Codegen finds the
  module by exactly that.
- **Plain types only**: `string`, `number`, `boolean`, `Object`,
  `Array<Object>`, `| null`, `Promise<…>`. What a promise resolves with is
  typed properly in the wrapper (`src/native/<Name>.ts`), which is what
  the app imports — never a spec directly (`../nativeModule.ts`).
- **A number is a `double` on the native side**, whatever it means.
- **One contract for both platforms.** A method only one of them has is
  marked optional (`name?: (…) => …`): Android gets an empty default for
  it, and iOS does not implement it.
- **A module that sends events** declares `addListener` and
  `removeListeners`.
- **Changing a method changes three files**: the spec, the Kotlin, and the
  Swift or Objective-C (with its `.mm`). `__tests__/turboModulesAreTyped.test.ts`
  holds the three together.

Not here: the two native views (`GlassBlur`, `MushafLine`), which are
components, not modules; the location module and the notification engine,
which are other people's code kept in our tree as it was written.
