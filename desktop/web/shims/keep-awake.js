/**
 * Keep-awake on the desktop: Electron's powerSaveBlocker, which stops the
 * display sleeping while the reader asks it to — the same as the phones.
 */
import { useEffect } from 'react';
import { desktop } from './desktop';

export function activateKeepAwake() {
  void desktop()?.power.keepAwake(true);
}
export function deactivateKeepAwake() {
  void desktop()?.power.keepAwake(false);
}
export function useKeepAwake() {
  useEffect(() => {
    activateKeepAwake();
    return deactivateKeepAwake;
  }, []);
}
export default { activate: activateKeepAwake, deactivate: deactivateKeepAwake };
