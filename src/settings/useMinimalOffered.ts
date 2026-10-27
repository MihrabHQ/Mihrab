/**
 * Whether Minimal is offered on this screen of this device — the switch,
 * the walkthrough's and Settings' layout pictures, Today's shortcut.
 *
 * Not on the Mac (MINIMAL_OFFERED, minimalLook.ts), and not beside an
 * iPhone's vertical bar: there the tabs are the bar's column and Minimal
 * stands down (MainTabs), so a choice of it would change nothing — and the
 * layout pictures would show a page the reader never gets. Checked on the
 * iPhone Duo simulator (AGENTS.md §8).
 */
import { useVerticalBar } from '../native/VerticalBar';
import { MINIMAL_OFFERED } from './minimalLook';

export function useMinimalOffered(): boolean {
  const vbar = useVerticalBar();
  return MINIMAL_OFFERED && !vbar;
}
