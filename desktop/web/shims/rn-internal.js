/**
 * React Native's own internal modules (`react-native/Libraries/...`), which
 * react-native-web does not have. The app reaches for them only behind a
 * platform check that is false here (src/theme/androidUiFont.ts patches the
 * Android Text and TextInput), so nothing reads this; it exists so the
 * bundle resolves.
 */
export default undefined;
