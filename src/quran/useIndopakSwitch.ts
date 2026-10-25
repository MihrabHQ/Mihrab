/**
 * The IndoPak off switch, for a screen: open until told otherwise, and
 * asked once per session when the screen that offers the download mounts.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  indopakOffered,
  refreshIndopakSwitch,
  subscribeIndopakSwitch,
} from './indopakSwitch';

export function useIndopakSwitch(enabled = true): boolean {
  const offered = useSyncExternalStore(
    subscribeIndopakSwitch,
    indopakOffered,
    indopakOffered,
  );
  useEffect(() => {
    if (enabled) void refreshIndopakSwitch();
  }, [enabled]);
  return enabled ? offered : true;
}
