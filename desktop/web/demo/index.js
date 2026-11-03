/**
 * The website demo's entry: the browser's bridge first, and the app — the
 * desktop entry, unchanged — once the bridge knows the preloaded tree. The
 * desktop shims read `window.mihrabDesktop` when they load, so it has to be
 * in place before any of them is evaluated.
 */
import { ready } from './bridge';

ready.then(() => import(/* webpackMode: "eager" */ '../index'));
