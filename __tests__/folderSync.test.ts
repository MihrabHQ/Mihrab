/**
 * Two devices, one folder, and the three things Hassan described.
 *
 * The pieces below this each have their own tests — the code, the envelope,
 * the peer list, the merge algebra. None of them proves the sentence the
 * feature is actually for: *take the code from A to B, and afterwards a
 * prayer logged on A shows up on B, and the page you reached on B is where
 * you carry on from on A.*
 *
 * So this runs two whole devices in one process. Each has its own secure
 * store, its own AsyncStorage, its own identity and its own peer list; the
 * folder between them is a Map. Everything else — the real snapshot, the
 * real merge, the real crypto — is the shipping code.
 */
type Store = { secure: Map<string, string>; plain: Map<string, string> };

const mockDevices: Record<string, Store> = {
  A: { secure: new Map(), plain: new Map() },
  B: { secure: new Map(), plain: new Map() },
};
let mockActive = 'A';

jest.mock('../src/storage/durableWrite', () => ({
  // The store announces writes; `recordChanged` subscribes on import.
  // A mock without it makes every module that saves anything fail to load.
  onDurableWrite: jest.fn(() => () => {}),
  durableEncryptedGet: jest.fn(
    async (k: string) => mockDevices[mockActive].secure.get(k) ?? null,
  ),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    mockDevices[mockActive].secure.set(k, v);
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockDevices[mockActive].plain.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockDevices[mockActive].plain.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockDevices[mockActive].plain.delete(k);
    }),
  },
}));

jest.mock('../src/sync/secureRandom', () => {
  const actual = jest.requireActual('../src/sync/secureRandom');
  const { randomBytes: nodeBytes } = require('crypto');
  return {
    ...actual,
    randomBytes: jest.fn(async (n: number) => new Uint8Array(nodeBytes(n))),
  };
});

import {
  forgetCachedIdentity,
  getDeviceIdentity,
  myPairingCode,
} from '../src/sync/deviceIdentity';
import { forgetCachedDeviceName, setDeviceName } from '../src/sync/deviceName';
import {
  acceptPeer,
  addPeerByCode,
  awaiting,
  forgetCachedPeers,
  forgetPeer,
  listPeers,
  peerIsStale,
} from '../src/sync/peers';
import { forgetCachedRemovals } from '../src/sync/removedPeers';
import { toBase64 } from '../src/sync/secureRandom';
import { buildSnapshot, emptyData, everything } from '../src/sync/snapshot';
import {
  forgetDeparted,
  inviteFileNameFor,
  isSyncFileName,
  syncFileNameFor,
  syncWithFolder,
  SYNC_FILE_PREFIX,
  type SyncFolder,
} from '../src/sync/folderSync';
import { JOURNAL_KEY, SUNNAH_KEY } from '../src/practice/practiceStore';
import {
  QURAN_STORAGE_KEY,
  __resetQuranStateForTests,
  flushQuranStateForTests,
  hydrateQuranState,
} from '../src/quran/quranState';

/** The shared folder: whatever software the user already trusts to move it. */
function memoryFolder(): SyncFolder & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    list: async () => [...files.keys()],
    read: async (name: string) => {
      const value = files.get(name);
      if (value === undefined) throw new Error(`no such file: ${name}`);
      return value;
    },
    write: async (name: string, contents: string) => {
      files.set(name, contents);
    },
    // Real folders can delete, so the fake must too — otherwise the one
    // place that removes anything is the one place with no test.
    remove: async (name: string) => files.delete(name),
  };
}

/**
 * Run `fn` as one device.
 *
 * Every module-level cache is dropped on the way in and out — identity,
 * peers, device name. Without that the second device inherits the first
 * one's keypair and the test proves nothing at all.
 */
async function as<T>(which: 'A' | 'B', fn: () => Promise<T>): Promise<T> {
  mockActive = which;
  forgetCachedIdentity();
  forgetCachedPeers();
  forgetCachedRemovals();
  forgetCachedDeviceName();
  // The Quran store is read live by a round, so each simulated device
  // gets its own, hydrated from its own disk — and written back to it
  // through the store's queue before the switch.
  __resetQuranStateForTests();
  await hydrateQuranState();
  try {
    return await fn();
  } finally {
    await flushQuranStateForTests();
    forgetCachedIdentity();
    forgetCachedPeers();
    forgetCachedRemovals();
    forgetCachedDeviceName();
  }
}

async function publicKeyOf(which: 'A' | 'B'): Promise<Uint8Array> {
  return as(which, async () => (await getDeviceIdentity()).publicKey);
}

function journalOf(which: 'A' | 'B'): Array<Record<string, unknown>> {
  const raw = mockDevices[which].secure.get(JOURNAL_KEY);
  return raw ? JSON.parse(raw) : [];
}

function sunnahOf(
  which: 'A' | 'B',
): Record<string, Record<string, number | boolean>> {
  return JSON.parse(mockDevices[which].secure.get(SUNNAH_KEY) ?? '{}');
}

function quranOf(which: 'A' | 'B'): Record<string, unknown> {
  const raw = mockDevices[which].plain.get(QURAN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

beforeEach(() => {
  for (const store of Object.values(mockDevices)) {
    store.secure.clear();
    store.plain.clear();
  }
  mockActive = 'A';
  forgetCachedIdentity();
  forgetCachedPeers();
  forgetCachedDeviceName();
});

/** The user's flow: A's code, typed into B, once. A has not heard of B. */
async function pairBFromA(): Promise<void> {
  const codeOfA = await as('A', () => myPairingCode());
  await as('B', async () => {
    await setDeviceName('Tablet');
    const added = await addPeerByCode(codeOfA);
    expect(added.ok).toBe(true);
  });
  await as('A', () => setDeviceName('Phone'));
}

/**
 * The rest of that flow: B writes, A sees it waiting and accepts it on
 * the Sync screen after comparing the fingerprint. Two devices paired by
 * one code and one tap.
 */
async function pairBFromAAndAccept(folder: SyncFolder): Promise<void> {
  await pairBFromA();
  await as('B', () => syncWithFolder(folder));
  await as('A', async () => {
    await syncWithFolder(folder);
    const [waiting] = await listPeers();
    expect(waiting.pending).toBe(true);
    expect(await acceptPeer(waiting.pk)).toBe(true);
  });
}

/** Both codes carried, as someone does when they set two devices up. */
async function pairBothWays(): Promise<void> {
  const codeOfA = await as('A', () => myPairingCode());
  const codeOfB = await as('B', () => myPairingCode());
  await as('B', async () => {
    await setDeviceName('Tablet');
    expect((await addPeerByCode(codeOfA)).ok).toBe(true);
  });
  await as('A', async () => {
    await setDeviceName('Phone');
    expect((await addPeerByCode(codeOfB)).ok).toBe(true);
  });
}

describe('one code, carried once, in one direction', () => {
  it('shows A the device that announced itself, and shares nothing until it is accepted', async () => {
    const folder = memoryFolder();
    await pairBFromA();

    // A has never heard of B at this point — pairing was one-directional.
    expect(await as('A', () => listPeers())).toEqual([]);

    // B writes first. It has a recipient; A does not yet.
    await as('B', () => syncWithFolder(folder));
    // A reads with an empty peer list, which it must be allowed to do.
    const roundA = await as('A', () => syncWithFolder(folder));

    // B is on A's screen now — waiting. Not trusted: its file opened, which
    // proves only that it had A's code, and A's code is in the clear in
    // every file in this folder (reported privately against 91cabca0).
    expect(roundA.learned).toBe(1);
    expect(roundA.read).toBe(0);
    // B's snapshot and its invite to A: both opened, neither merged.
    expect(roundA.skipped.pending).toBe(2);
    const peersOfA = await as('A', () => listPeers());
    expect(peersOfA).toHaveLength(1);
    expect(peersOfA[0].via).toBe('announced');
    expect(peersOfA[0].pending).toBe(true);
    expect(peersOfA[0].name).toBe('Tablet');
    // And A wrote NOTHING: it has no accepted device to seal to.
    expect(roundA.wrote).toBeNull();
    expect(folder.files.has(syncFileNameFor(await publicKeyOf('A')))).toBe(false);

    // Accepted — one tap, after comparing the fingerprint — and the next
    // round seals to B and merges from it.
    await as('A', async () => {
      expect(await acceptPeer(peersOfA[0].pk)).toBe(true);
    });
    const roundA2 = await as('A', () => syncWithFolder(folder));
    expect(roundA2.read).toBe(1);
    expect(roundA2.wrote).toBe(syncFileNameFor(await publicKeyOf('A')));
    expect((await as('A', () => listPeers()))[0].pending).toBeUndefined();
  });

  it('pairs in the rounds the screens run by themselves: pair, check, accept, check', async () => {
    // What the user does: type A's code into B, accept B on A. Everything
    // else is the two Sync screens checking the folder on their own
    // (read-only rounds, nothing written), so nobody presses Sync now.
    const folder = memoryFolder();
    await pairBFromA();
    // B: pairing runs one round, which writes B's file and an invite to A.
    await as('B', () => syncWithFolder(folder));
    // A's screen, open, checks the folder: B is waiting. Nothing written.
    const checkA = await as('A', () => syncWithFolder(folder, { readOnly: true }));
    expect(checkA.wrote).toBeNull();
    expect(checkA.learned).toBe(1);
    expect(folder.files.has(syncFileNameFor(await publicKeyOf('A')))).toBe(false);
    // A accepts, which runs one full round: B merged, A's file written for B.
    const acceptRound = await as('A', async () => {
      await acceptPeer((await listPeers())[0].pk);
      return syncWithFolder(folder);
    });
    expect(acceptRound.read).toBe(1);
    expect(acceptRound.wrote).toBe(syncFileNameFor(await publicKeyOf('A')));
    // B's screen, still open, checks the folder: A has answered.
    expect((await as('B', () => listPeers()))[0].lastSeenAt).toBeUndefined();
    const checkB = await as('B', () => syncWithFolder(folder, { readOnly: true }));
    expect(checkB.read).toBe(1);
    expect(checkB.wrote).toBeNull();
    expect((await as('B', () => listPeers()))[0].lastSeenAt).toBeDefined();
    // Both know each other; nothing left to wait for on either.
    expect(awaiting(await as('A', () => listPeers()))).toBeNull();
    expect(awaiting(await as('B', () => listPeers()))).toBeNull();
  });

  it('does not act on removals a device that has not been accepted announces', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    // A stranger S who has A's public key (it is in every file) writes a
    // file to A announcing that B is removed.
    const codeOfA = await as('A', () => myPairingCode());
    mockDevices.S = { secure: new Map(), plain: new Map() };
    await as('S' as 'A', async () => {
      await setDeviceName('Stranger');
      expect((await addPeerByCode(codeOfA)).ok).toBe(true);
      const b = toBase64(await publicKeyOf('B'));
      // Written through the real path, so the file is exactly what a
      // hostile build could produce with A's public key alone.
      await forgetPeer(b).catch(() => undefined);
    });
    await as('S' as 'A', () => syncWithFolder(folder));
    const roundA = await as('A', () => syncWithFolder(folder));
    // S waits; B is still paired; S got nothing of A's.
    const peersOfA = await as('A', () => listPeers());
    const bPk = toBase64(await publicKeyOf('B'));
    expect(peersOfA.find(p => p.name === 'Stranger')?.pending).toBe(true);
    expect(peersOfA.some(p => p.pk === bPk && !p.pending)).toBe(true);
    expect(roundA.forgotten).toBe(0);
    const sPk = await as('S' as 'A', async () => (await getDeviceIdentity()).publicKey);
    const fileOfA = folder.files.get(syncFileNameFor(await publicKeyOf('A')));
    expect(fileOfA).toBeDefined();
    const envelope = JSON.parse(fileOfA as string) as { keys: Array<{ to: string }> };
    expect(envelope.keys.map(k => k.to)).not.toContain(toBase64(sPk));
  });
});

describe('a prayer logged on A', () => {
  it('shows up on B after a round each way', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);

    mockDevices.A.secure.set(
      JOURNAL_KEY,
      JSON.stringify([
        {
          date: '2026-08-22',
          prayer: 'Fajr',
          status: 'on-time',
          loggedAt: '2026-08-22T03:10:00.000Z',
          note: 'at the masjid',
        },
      ]),
    );

    // B announces itself, A reads that and writes its own file, B reads it.
    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));
    const roundB = await as('B', () => syncWithFolder(folder));

    expect(roundB.read).toBe(1);
    const onB = journalOf('B');
    expect(onB).toHaveLength(1);
    expect(onB[0]).toMatchObject({
      date: '2026-08-22',
      prayer: 'Fajr',
      status: 'on-time',
      note: 'at the masjid',
    });
  });

  it('does not duplicate it when the same file is read again', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);
    mockDevices.A.secure.set(
      JOURNAL_KEY,
      JSON.stringify([
        {
          date: '2026-08-22',
          prayer: 'Fajr',
          status: 'on-time',
          loggedAt: '2026-08-22T03:10:00.000Z',
        },
      ]),
    );

    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));

    // The merge is idempotent, and this is the test that says so end to end.
    expect(journalOf('B')).toHaveLength(1);
  });
});

describe('where you left off in the Quran', () => {
  it('carries the plain last-read position across', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);

    mockDevices.B.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lastRead: {
          surah: 12,
          ayah: 40,
          page: 244,
          mode: 'mushaf',
          updatedAt: 1_756_000_000_000,
        },
        bookmarks: [],
        starred: [],
        khatmah: [],
        prefs: {},
      }),
    );

    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));

    // No khatmah involved: someone who just reads, and expects to carry on
    // from the same page on the other device.
    expect(quranOf('A').lastRead).toMatchObject({
      surah: 12,
      ayah: 40,
      page: 244,
    });
  });

  it('carries khatmah progress, and takes the further-through position', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);

    const plan = {
      id: 'khatmah-1',
      startedAt: 1_755_000_000_000,
      targetDays: 30,
      pagesRead: 0,
      completedAt: null,
    };
    mockDevices.A.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bookmarks: [],
        starred: [],
        khatmah: [
          { ...plan, pagesRead: 40, position: { surah: 2, ayah: 30, page: 40 } },
        ],
        prefs: {},
      }),
    );
    mockDevices.B.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bookmarks: [],
        starred: [],
        khatmah: [
          { ...plan, pagesRead: 96, position: { surah: 5, ayah: 12, page: 96 } },
        ],
        prefs: {},
      }),
    );

    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));

    for (const which of ['A', 'B'] as const) {
      const khatmah = quranOf(which).khatmah as Array<Record<string, unknown>>;
      expect(khatmah).toHaveLength(1);
      // Progress is a high-water mark, so both devices land on the further
      // one rather than on whoever synced last.
      expect(khatmah[0].pagesRead).toBe(96);
      expect(khatmah[0].position).toEqual({ surah: 5, ayah: 12, page: 96 });
    }
  });

  /**
   * THE OTHER HALF OF THAT: what one device took AWAY (2026-09-20).
   *
   * The test above is the union doing its job. This is the case the union
   * cannot answer on its own — a pin taken off, a bookmark deleted, a star
   * removed — where "absent here, present there" used to read as "made
   * there" and the removal undid itself on the next round. Whole rounds,
   * real files, three of them, so a removal that only survives until the
   * next write would be caught.
   */
  it('and a pin taken off, a bookmark deleted and a star removed all stay gone', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);

    const shared = {
      id: 'khatmah-1',
      startedAt: 1_755_000_000_000,
      targetDays: 30,
      completedAt: null,
    };
    const now = Date.now();
    // B is the device that is BEHIND and still holds all three rows.
    mockDevices.B.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bookmarks: [
          { id: 'b1', surah: 2, ayah: 255, page: 42, color: 'emerald', createdAt: now - 7_200_000 },
        ],
        starred: ['2:255'],
        khatmah: [
          {
            ...shared,
            pagesRead: 40,
            position: { surah: 2, ayah: 30, page: 40 },
            positionAt: now - 7_200_000,
          },
        ],
        prefs: {},
      }),
    );
    // A read past the pin and cleared all three, afterwards.
    mockDevices.A.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bookmarks: [],
        bookmarksRemoved: [{ id: 'b1', at: now - 60_000 }],
        starred: [],
        starsRemoved: [{ id: '2:255', at: now - 60_000 }],
        khatmah: [{ ...shared, pagesRead: 96, position: null, positionAt: now - 60_000 }],
        prefs: {},
      }),
    );

    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));

    for (const which of ['A', 'B'] as const) {
      const state = quranOf(which);
      const khatmah = state.khatmah as Array<Record<string, unknown>>;
      expect(khatmah[0].position ?? null).toBeNull();
      // …and the reading the pin was dragging them back to is still there.
      expect(khatmah[0].pagesRead).toBe(96);
      expect(state.bookmarks).toEqual([]);
      expect(state.starred).toEqual([]);
    }
  });
});

describe('a folder that will not list itself', () => {
  it('still reads a paired device, by asking for its file by name', async () => {
    // Not hypothetical: an Android 16 emulator returns an empty cursor for a
    // directory holding seven files, with both grants held, while happily
    // creating and opening files in it. Every device's filename comes from
    // its public key, so for a device we have already paired with there is
    // nothing to enumerate — we know what to ask for.
    const folder = memoryFolder();
    await pairBothWays();
    mockDevices.B.secure.set(
      JOURNAL_KEY,
      JSON.stringify([
        {
          date: '2026-08-21',
          prayer: 'Isha',
          status: 'on-time',
          loggedAt: '2026-08-21T19:40:00.000Z',
        },
      ]),
    );
    await as('B', () => syncWithFolder(folder));

    // The folder now has B's file and refuses to admit it exists.
    const blind: SyncFolder = { ...folder, list: async () => [] };
    const round = await as('A', () => syncWithFolder(blind));

    expect(round.read).toBe(1);
    expect(journalOf('A')).toHaveLength(1);
  });

  it('still introduces an unknown device, through an invite named after us', async () => {
    // The case that has no name to guess: A has never heard of B, so it
    // cannot ask for B's file. B therefore leaves one named after A, and A
    // knows its own id. This is what makes one code enough on a provider
    // that will not enumerate anything.
    const folder = memoryFolder();
    await pairBFromA();
    await as('B', () => syncWithFolder(folder));

    const blind: SyncFolder = { ...folder, list: async () => [] };
    const round = await as('A', () => syncWithFolder(blind));

    expect(round.learned).toBe(1);
    const peers = await as('A', () => listPeers());
    expect(peers).toHaveLength(1);
    expect(peers[0].via).toBe('announced');
    expect(peers[0].pending).toBe(true);
    expect(peers[0].name).toBe('Tablet');
  });

  it('writes the invite under the recipient’s own id', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);
    await as('B', () => syncWithFolder(folder));

    // Named for A, because A is the one who has to find it without a
    // listing. Naming it for B would be useless: A cannot guess B.
    expect([...folder.files.keys()]).toContain(
      inviteFileNameFor(await publicKeyOf('A')),
    );
  });

  it('stops inviting once the other device has answered', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);
    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));

    // A has now written a file sealed to B, so when B reads it B knows for
    // certain that A knows B — and there is nothing left to introduce.
    folder.files.delete(inviteFileNameFor(await publicKeyOf('A')));
    await as('B', () => syncWithFolder(folder));

    expect([...folder.files.keys()]).not.toContain(
      inviteFileNameFor(await publicKeyOf('A')),
    );
  });

  it('does not report a paired device that has never written as a problem', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    // B is paired and has written nothing. Asking for its file and being
    // told there is none is the normal first round, not a fault.
    const round = await as('A', () => syncWithFolder(folder));

    expect(round.read).toBe(0);
    expect(round.skipped).toEqual({
      notOurs: 0,
      notForUs: 0,
      unreadable: 0,
      alreadySeen: 0,
      pending: 0,
    });
  });
});

describe('a folder that has stopped carrying files', () => {
  /**
   * The failure this was written for: a Nextcloud folder between a Mac and
   * a phone stopped syncing, and neither app noticed. Nothing in the folder
   * is ever deleted, so the peer's LAST file is still sitting there — still
   * readable, still mergeable — and every round opened it, counted it, and
   * reported a successful sync against a snapshot from the day before.
   *
   * The distinction that makes it visible: `lastSeenAt` keeps advancing
   * (we really are opening a file of theirs), `dataAt` does not (they have
   * not written a new one).
   */
  it('freezes the peer’s record age while re-reading its old file', async () => {
    const folder = memoryFolder();
    await pairBothWays();

    // A writes once, at a knowable time, and then goes quiet — or rather,
    // keeps writing somewhere B can no longer see.
    await as('A', () =>
      syncWithFolder(folder, { now: new Date('2026-08-25T14:29:59.711Z') }),
    );

    // B keeps syncing all the next day and keeps finding A's one old file.
    // The FIRST round genuinely reads it; every round after that opens the
    // same snapshot, recognises it, and steps over it — which is what stops
    // a dead device's file re-asserting itself against B's later edits.
    const rounds = [];
    for (const at of [
      '2026-08-26T09:00:00.000Z',
      '2026-08-26T12:00:00.000Z',
      '2026-08-26T14:45:00.000Z',
    ]) {
      rounds.push(
        await as('B', () => syncWithFolder(folder, { now: new Date(at) })),
      );
    }

    expect(rounds.map(r => r.read)).toEqual([1, 0, 0]);
    expect(rounds.map(r => r.skipped.alreadySeen)).toEqual([0, 1, 1]);

    const [a] = await as('B', () => listPeers());
    expect(a.lastSeenAt).toBe('2026-08-26T14:45:00.000Z');
    expect(a.dataAt).toBe('2026-08-25T14:29:59.711Z');
    expect(peerIsStale(a, Date.parse('2026-08-26T14:45:00.000Z'))).toBe(true);
  });

  /**
   * THE BUG THIS WAS ALL FOR. Reported twice, 2026-08-26 and again on the
   * 27th after the first fix: a sunnah cleared in the Log came back.
   *
   * The first fix — timestamped tombstones — was right and did not help,
   * because the thing re-asserting the count was not a live device. A Mac's
   * sync identity had been replaced, leaving `mihrab-ASWPFJBG07HZ.sync.json`
   * in the folder: a file nothing would ever rewrite, written by a build old
   * enough that its sunnah days carry no timestamps. Every round the phone
   * opened it, `mergeSunnah` fell back to `Math.max` for the undated day, and
   * the old count won. A device that no longer existed was undoing the user's
   * edits, several times an hour, indefinitely.
   */
  it('does not let a dead device’s file undo a later un-log', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    const day = '2026-08-25';

    // A is on an old build: Fajr's sunnah logged, and NO timestamp on the
    // day, because that build did not write one.
    mockDevices.A.secure.set(
      SUNNAH_KEY,
      JSON.stringify({
        [day]: {
          fajr: 1,
          dhuhr: 2,
          maghrib: 0,
          isha: 0,
          witr: false,
          qiyam: 0,
        },
      }),
    );
    await as('A', () =>
      syncWithFolder(folder, { now: new Date('2026-08-25T09:00:00.000Z') }),
    );
    await as('B', () =>
      syncWithFolder(folder, { now: new Date('2026-08-25T09:05:00.000Z') }),
    );
    expect(sunnahOf('B')[day]).toMatchObject({ fajr: 1, dhuhr: 2 });

    // A is never heard from again — reinstalled, re-identified, thrown in a
    // drawer. Its file stays in the folder for ever; that is the design.

    // On B, the user clears it. A tombstone, stamped, as 2.11.0 writes them.
    mockDevices.B.secure.set(
      SUNNAH_KEY,
      JSON.stringify({
        [day]: {
          fajr: 0,
          dhuhr: 0,
          maghrib: 0,
          isha: 0,
          witr: false,
          qiyam: 0,
          at: Date.parse('2026-08-25T14:31:00.000Z'),
        },
      }),
    );

    // And keeps using the app. Every one of these rounds re-opens A's file.
    for (const at of [
      '2026-08-25T14:35:00.000Z',
      '2026-08-25T16:00:00.000Z',
      '2026-08-26T08:00:00.000Z',
    ]) {
      await as('B', () => syncWithFolder(folder, { now: new Date(at) }));
      expect(sunnahOf('B')[day]).toMatchObject({ fajr: 0, dhuhr: 0 });
    }
  });

  it('catches the record up the moment the peer writes again', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    await as('A', () =>
      syncWithFolder(folder, { now: new Date('2026-08-25T14:00:00.000Z') }),
    );
    await as('B', () =>
      syncWithFolder(folder, { now: new Date('2026-08-26T14:00:00.000Z') }),
    );

    await as('A', () =>
      syncWithFolder(folder, { now: new Date('2026-08-26T14:30:00.000Z') }),
    );
    await as('B', () =>
      syncWithFolder(folder, { now: new Date('2026-08-26T14:31:00.000Z') }),
    );

    const [a] = await as('B', () => listPeers());
    expect(a.dataAt).toBe('2026-08-26T14:30:00.000Z');
    expect(peerIsStale(a, Date.parse('2026-08-26T14:31:00.000Z'))).toBe(false);
  });
});

describe('removing a device', () => {
  /**
   * A round deletes nothing, deliberately — it must not decide that a quiet
   * device is a gone device. A PERSON tapping Remove has made exactly that
   * decision, and the file they leave behind is not merely untidy: nothing
   * will ever rewrite it, so it is a snapshot frozen at the moment the
   * device left, still asserting a record everyone else has moved past.
   */
  it('takes the departed device’s files with it', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));

    const bKey = await publicKeyOf('B');
    const bFile = syncFileNameFor(bKey);
    expect([...folder.files.keys()]).toContain(bFile);

    const result = await as('A', () => forgetDeparted(folder, bKey));

    expect(result.removed).toContain(bFile);
    expect([...folder.files.keys()]).not.toContain(bFile);
    // And not A's own, which is the file that must survive.
    expect([...folder.files.keys()]).toContain(
      syncFileNameFor(await publicKeyOf('A')),
    );
  });

  it('takes the invite too, when one is still waiting', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);
    // B writes, and invites A because A has never answered it.
    await as('B', () => syncWithFolder(folder));
    const aKey = await publicKeyOf('A');
    expect([...folder.files.keys()]).toContain(inviteFileNameFor(aKey));

    const bKey = await publicKeyOf('B');
    await as('A', () => forgetDeparted(folder, bKey));
    // The invite is named after the RECIPIENT, so forgetting B does not
    // touch it — but forgetting ourselves-as-seen-by-B would. What matters
    // here is that B's own file went and nothing else did.
    expect([...folder.files.keys()]).not.toContain(syncFileNameFor(bKey));
  });

  /**
   * Asked for on 2026-08-27: "removing a device from a sync cycle should
   * delete its corresponding file and remove itself from the other
   * devices' sync list". The first half landed earlier; this is the half
   * that makes the button mean the same thing everywhere.
   */
  it('stays removed instead of coming back on the next round', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));

    const bKey = await publicKeyOf('B');
    expect(await as('A', () => listPeers())).toHaveLength(1);

    await as('A', () => forgetPeer(toBase64(bKey)));
    expect(await as('A', () => listPeers())).toHaveLength(0);

    // B's file is still in the folder, still sealed to A, still opening
    // cleanly — which is exactly how Remove used to undo itself.
    folder.files.set(syncFileNameFor(bKey), folder.files.get(
      syncFileNameFor(bKey),
    ) as string);
    await as('A', () => syncWithFolder(folder));

    expect(await as('A', () => listPeers())).toHaveLength(0);
  });

  it('tells the other devices, and they drop it too', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    await as('B', () => syncWithFolder(folder));
    const aRound = await as('A', () => syncWithFolder(folder));
    expect(aRound.wrote).toBeTruthy();

    // A removes B. B reads A's file and learns it is no longer in the set,
    // so it drops A in turn rather than going on writing files nobody will
    // open.
    const bPk = toBase64(await publicKeyOf('B'));
    await as('A', () => forgetPeer(bPk));
    await as('A', () => syncWithFolder(folder));

    const round = await as('B', () => syncWithFolder(folder));

    expect(round.forgotten).toBe(1);
    expect(await as('B', () => listPeers())).toHaveLength(0);
  });

  it('does not carry removals into an export', async () => {
    // A backup someone mails to a friend must not unpair the friend's
    // phones. Removals ride BESIDE the snapshot in a sealed envelope; the
    // snapshot itself — which is what `exportFile` builds — has no idea
    // they exist.
    const snapshot = buildSnapshot(
      emptyData(),
      everything(),
      '2026-08-27T10:00:00.000Z',
    );
    expect(Object.keys(snapshot)).not.toContain('removedPeers');
    expect(JSON.stringify(snapshot)).not.toContain('removedPeers');
  });

  it('is not an error when the folder cannot delete', async () => {
    const folder = memoryFolder();
    delete (folder as { remove?: unknown }).remove;
    await pairBothWays();
    await as('B', () => syncWithFolder(folder));

    // An older native side, or a read-only provider. Forgetting the device
    // still has to succeed — the pairing is gone either way.
    const bKey = await publicKeyOf('B');
    const result = await as('A', () => forgetDeparted(folder, bKey));
    expect(result.removed).toEqual([]);
  });
});

describe('the folder is shared with things that are not us', () => {
  it('steps over strangers, junk and half-written files', async () => {
    const folder = memoryFolder();
    await pairBFromAAndAccept(folder);
    await as('B', () => syncWithFolder(folder));

    folder.files.set('shopping-list.txt', 'milk, dates');
    folder.files.set(`${SYNC_FILE_PREFIX}TRUNCATED.sync.json`, '{"format":');
    folder.files.set(
      `${SYNC_FILE_PREFIX}SOMEONEELSE.sync.json`,
      JSON.stringify({
        format: 'mihrab.envelope',
        version: 1,
        createdAt: '2026-08-22T00:00:00.000Z',
        sender: { pk: 'AAAA' },
        keys: [{ to: 'BBBB', nonce: 'CC', key: 'DD' }],
        nonce: 'EE',
        body: 'FF',
      }),
    );

    const round = await as('A', () => syncWithFolder(folder));

    // The stray text file is not even considered: the name does not match.
    expect(round.skipped.notOurs).toBe(1); // the truncated one
    expect(round.skipped.notForUs).toBe(1); // another pair's file
    expect(round.skipped.unreadable).toBe(0);
    expect(round.read).toBe(1); // B's, which is real
  });

  it('recognises its own file names and nothing else', () => {
    const key = new Uint8Array(32).fill(7);
    const name = syncFileNameFor(key);
    expect(isSyncFileName(name)).toBe(true);
    expect(name).toMatch(/^mihrab-[0-9A-HJKMNP-TV-Z]{12}\.sync\.json$/);
    expect(isSyncFileName('mihrab-backup-2026-08-19.json')).toBe(false);
    expect(isSyncFileName('shopping-list.txt')).toBe(false);
  });

  it('gives two devices different file names', async () => {
    await pairBFromA();
    expect(syncFileNameFor(await publicKeyOf('A'))).not.toBe(
      syncFileNameFor(await publicKeyOf('B')),
    );
  });
});

describe('a device with nothing to send to', () => {
  it('reads but does not write', async () => {
    const folder = memoryFolder();
    // Nobody has been paired at all.
    const round = await as('A', () => syncWithFolder(folder));
    expect(round.wrote).toBeNull();
    expect(round.read).toBe(0);
    expect(folder.files.size).toBe(0);
  });
});
