/**
 * The native muṣḥaf line view (src/quran/native/MushafLineNativeComponent.ts),
 * a host component on Android and iOS. The desktop has no such view:
 * nativeMushafLineAvailable() answers false on 'web', so the reader draws
 * each line with <Text>, the fallback the app keeps for exactly this. This
 * stands in for the codegen spec so the bundle resolves; it never renders.
 */
export default function MushafLine() {
  return null;
}
