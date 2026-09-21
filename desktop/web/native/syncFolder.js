/**
 * SyncFolder on the desktop: a folder the user picks — a Syncthing,
 * Nextcloud or Dropbox folder, a USB stick — read and written by the main
 * process. The handle is the folder's path; the main process only touches
 * folders the user picked through its own dialog.
 */
import { desktop } from '../shims/desktop';

const need = () => {
  const d = desktop();
  if (!d) throw new Error('sync folders need the desktop app');
  return d.syncFolder;
};

export const SyncFolder = {
  defaultFolder: async () => null,
  pick: async () => need().pick(),
  hasAccess: async handle => need().hasAccess(handle),
  forget: async handle => need().forget(handle),
  list: async handle => need().list(handle),
  read: async (handle, name) => need().read(handle, name),
  write: async (handle, name, contents) => need().write(handle, name, contents),
  remove: async (handle, name) => need().remove(handle, name),
  pickFile: async () => need().pickFile(),
};
