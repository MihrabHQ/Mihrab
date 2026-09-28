/**
 * The layers `quranState.ts` was split into only import downwards.
 *
 * The file's khatmah "lifecycle" and "schedule" sections called each other
 * both ways, so moving either one out as a block would have made an import
 * cycle (docs/rewrite-plan.md, 2.1). The functions themselves had none, so
 * the pure khatmah model was cut into layers instead — units and progress,
 * then the schedule, then the plan's status, then the edits the writers
 * make — with the store on top. What writes through the store sits above
 * it again (the reader's marks, 2.3; the khatmah's writers, 2.4) and is
 * imported from where it lives, never through the store. These pin that
 * order, so a helpful import in the wrong direction fails here rather than
 * as an `undefined` at module load.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import * as store from '../src/quran/quranState';
import * as progress from '../src/quran/khatmahProgress';
import * as schedule from '../src/quran/khatmahSchedule';
import * as status from '../src/quran/khatmahStatus';

/** Bottom first: each may import only from the layers before it. */
const LAYERS = [
  'quranTypes',
  'khatmahProgress',
  'khatmahSchedule',
  'khatmahStatus',
  'khatmahEdits',
];

/** Above the store: they write through it, so it must never import them. */
const CLIENTS = ['readerMarks', 'khatmahActions'];

const localImports = (name: string): string[] => {
  const src = readFileSync(
    join(__dirname, '..', 'src', 'quran', `${name}.ts`),
    'utf8',
  );
  return [
    ...src.matchAll(/^(?:import|export)[\s\S]*?from '\.\/([\w]+)';/gm),
  ].map(m => m[1]);
};

describe('the split store', () => {
  it.each(LAYERS.map((name, i) => [name, i] as const))(
    '%s imports no layer above it, and never the store',
    (name, i) => {
      const above = [...LAYERS.slice(i + 1), 'quranState'];
      for (const from of localImports(name)) {
        expect(above).not.toContain(from);
      }
    },
  );

  it.each(CLIENTS)(
    'the store imports nothing from %s, which writes through it',
    client => {
      expect(localImports('quranState')).not.toContain(client);
    },
  );

  it('the store still answers for everything that moved', () => {
    // Importers are unchanged until step 2.5: every export of a layer the
    // store re-exports is the very same function the layer holds.
    for (const layer of [progress, schedule, status]) {
      for (const [name, value] of Object.entries(layer)) {
        if (name in store) {
          expect((store as Record<string, unknown>)[name]).toBe(value);
        }
      }
    }
    expect(store.khatmahDone).toBe(progress.khatmahDone);
    expect(store.khatmahPortion).toBe(schedule.khatmahPortion);
    expect(store.khatmahDay).toBe(status.khatmahDay);
  });
});
