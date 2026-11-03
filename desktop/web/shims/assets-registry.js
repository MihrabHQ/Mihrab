/**
 * @react-native/assets-registry for the desktop. Metro turns `require('x.png')`
 * into a number this registry resolves; webpack turns it into a URL string
 * instead, so no number ever reaches here. react-native-svg imports it for
 * the Metro case only.
 */
export function getAssetByID() {
  return null;
}
export function registerAsset() {
  return 0;
}
