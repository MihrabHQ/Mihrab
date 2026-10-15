/**
 * Two prepared datasets, two server records.
 *
 * Algeria (the Ministry's year) and Morocco (Habous) are built by different
 * jobs on different cadences and cover different windows — most of a year
 * ahead against a couple of weeks. Datasets used to write their
 * `index.json` snapshot into one slot, so the statistics panel reported
 * whichever had polled last under a heading that named neither: one
 * country's eleven days of coverage, looking like another's broken server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDataStatus,
  recordDataSource,
  recordServerIndex,
  _resetDataStatusMemoForTests,
} from '../src/prayer/dataStatus';

const KEY = 'mihrab.dataStatus.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  _resetDataStatusMemoForTests();
});

const ALGERIA = {
  builtAt: '2026-08-17T03:17:00.000Z',
  serverStatus: 'ok' as const,
  minCoverageDays: 331,
  deadCities: 0,
};
const MOROCCO = {
  builtAt: '2026-08-21T04:41:00.000Z',
  serverStatus: 'ok' as const,
  minCoverageDays: 11,
  deadCities: 0,
};

describe('the two servers are recorded apart', () => {
  it('keeps both snapshots', async () => {
    await recordServerIndex('marw', ALGERIA, new Date('2026-08-21T12:00:00Z'));
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T13:00:00Z'));

    const s = await getDataStatus();
    expect(s.servers.marw.minCoverageDays).toBe(331);
    expect(s.servers.habous.minCoverageDays).toBe(11);
    expect(s.servers.marw.builtAt).toBe(ALGERIA.builtAt);
    expect(s.servers.habous.builtAt).toBe(MOROCCO.builtAt);
  });

  it('the later poll does not overwrite the other one', async () => {
    // The bug, in one assertion: Morocco polling after Algeria used to leave
    // Algeria reading 11 days.
    await recordServerIndex('marw', ALGERIA, new Date('2026-08-21T12:00:00Z'));
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T13:00:00Z'));
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T19:00:00Z'));

    const s = await getDataStatus();
    expect(s.servers.marw.minCoverageDays).toBe(331);
    expect(s.servers.marw.nextCheckDue).toBe('2026-08-21T12:00:00.000Z');
    expect(s.servers.habous.nextCheckDue).toBe('2026-08-21T19:00:00.000Z');
  });

  it('leaves the fetch source alone', async () => {
    await recordDataSource('cdn');
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T13:00:00Z'));
    expect((await getDataStatus()).lastSource).toBe('cdn');
  });

  it('starts a dataset that has never answered at unknown', async () => {
    await recordServerIndex('marw', ALGERIA, new Date('2026-08-21T12:00:00Z'));
    const s = await getDataStatus();
    expect(s.servers.habous.status).toBe('unknown');
    expect(s.servers.habous.minCoverageDays).toBeNull();
  });
});

describe('a blob written before the split', () => {
  it('drops the server fields rather than attributing them to a guess', async () => {
    // Nothing in the old shape says which server wrote it, and the whole
    // point of the split is not to show one server's number under the
    // other's name. The fetch source survives; the next poll refills the
    // rest, minutes later, on the screen that shows them.
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        lastSource: 'cdn',
        lastSourceAt: '2026-08-20T09:00:00.000Z',
        serverBuiltAt: '2026-08-19T04:41:00.000Z',
        serverStatus: 'ok',
        serverMinCoverageDays: 11,
        serverDeadCities: 0,
        serverCheckedAt: '2026-08-20T09:00:00.000Z',
        nextServerCheckDue: '2026-08-20T15:00:00.000Z',
      }),
    );
    _resetDataStatusMemoForTests();

    const s = await getDataStatus();
    expect(s.lastSource).toBe('cdn');
    expect(s.lastSourceAt).toBe('2026-08-20T09:00:00.000Z');
    expect(s.servers.marw.minCoverageDays).toBeNull();
    expect(s.servers.habous.minCoverageDays).toBeNull();
    expect(s.servers.marw.status).toBe('unknown');
  });

  it('survives a corrupt blob', async () => {
    await AsyncStorage.setItem(KEY, '{not json');
    _resetDataStatusMemoForTests();
    const s = await getDataStatus();
    expect(s.lastSource).toBeNull();
    expect(s.servers.habous.status).toBe('unknown');
  });
});
