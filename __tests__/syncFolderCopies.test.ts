/**
 * The Android folder module must never take another device's file for a
 * copy of the one it is writing (reported 2026-11-05).
 *
 * An invite is named after the device it is FOR — `mihrab-<Mac>.invite.json`
 * — and the Mac's own snapshot is `mihrab-<Mac>.sync.json`. Matching by the
 * id in front ("mihrab-<Mac>") took the snapshot for a "duplicate" of the
 * invite: the phone deleted the Mac's file, or wrote its invite over it,
 * every round, and never heard a word from the Mac. The rule the module
 * implements is mirrored here and checked against the Kotlin source.
 */
import { readFileSync } from 'fs';
import path from 'path';

const kotlin = readFileSync(
  path.join(__dirname, '..', 'android/app/src/main/java/com/prayer_times/SyncFolderModule.kt'),
  'utf8',
);

/** `isCopyOf` in SyncFolderModule.kt, line for line. */
function isCopyOf(childName: string, exact: string): boolean {
  if (childName === exact) return true;
  const bare = childName.replace(/ \(\d+\)/g, '');
  return bare === exact || bare.startsWith(`${exact}.`);
}

describe('which files are copies of the one being written', () => {
  const sync = 'mihrab-C55SWQ6ZJFEB.sync.json';
  const invite = 'mihrab-C55SWQ6ZJFEB.invite.json';

  it('never takes a device’s snapshot for an invite addressed to it, or the other way round', () => {
    expect(isCopyOf(sync, invite)).toBe(false);
    expect(isCopyOf(invite, sync)).toBe(false);
    expect(isCopyOf('mihrab-C55SWQ6ZJFEB.sync (1).json', invite)).toBe(false);
  });

  it('still finds what a provider made by renaming on create', () => {
    expect(isCopyOf('mihrab-C55SWQ6ZJFEB.sync (1).json', sync)).toBe(true);
    expect(isCopyOf('mihrab-C55SWQ6ZJFEB (2).sync.json', sync)).toBe(true);
    expect(isCopyOf('mihrab-C55SWQ6ZJFEB.sync.json.txt', sync)).toBe(true);
    expect(isCopyOf('mihrab-C55SWQ6ZJFEB.invite (1).json', invite)).toBe(true);
  });

  it('is what the module does, in write and in remove', () => {
    expect(kotlin).toContain('val bare = childName.replace(Regex(" \\\\(\\\\d+\\\\)"), "")');
    expect(kotlin).toContain('return bare == exact || bare.startsWith("$exact.")');
    expect(kotlin).toContain('val ours = copiesOf(folder, name)');
    expect(kotlin).toContain('val matches = copiesOf(folder, name)');
    expect(kotlin).not.toContain('childrenWithStem');
    expect(kotlin).not.toContain('stemOf(');
  });
});
