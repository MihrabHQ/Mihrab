/** The preload's bridge, or null outside Electron (a plain browser). */
export const desktop = () =>
  (typeof window !== 'undefined' && window.mihrabDesktop) || null;

/**
 * A playable/loadable URL for something the app names by path. On the
 * phones a local file is `/path/on/disk` or `file:///…`; here it goes
 * through the `mihrab://files/` scheme, which the main process serves.
 */
export function mediaUrl(url) {
  if (typeof url !== 'string') return url;
  const d = desktop();
  if (url.startsWith('file://')) url = decodeURIComponent(url.slice('file://'.length));
  if (d && (url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url))) return d.fs.fileUrl(url);
  return url;
}
