# AGENTS.md — read this before you change anything

For everyone who works in this repository: Claude and other AI agents,
contributors, and the maintainer on a tired evening. It is short on purpose.
The deep material lives in [ARCHITECTURE.md](ARCHITECTURE.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and
[scripts/copy/README.md](scripts/copy/README.md); this file is what must not
be forgotten.

## 1. What comes first

1. **Prayer times stay correct and available.** A wrong minute at Maghrib is
   the worst bug this app can have. Nothing ships that changes a time without
   a test that pins the new time and a reason it is right.
2. **What the app, the site and the listings say is true.** Every claim about
   accuracy or privacy has to be backed by the code, and is checked by a test
   (§4).
3. Everything else — features, polish, speed.

When two of these pull against each other, the lower number wins. When you are
unsure whether a change touches 1 or 2, assume it does.

## 2. Hard rules

- **Branch and pull request.** Never push to `main` directly. Merge only with
  every CI job green (test, Android, iOS simulator, Mac Catalyst) and the
  maintainer's go-ahead.
- **Commits are authored by the maintainer alone.** No `Co-Authored-By`, no
  session links, no "Generated with …" lines — in commits or in PR bodies.
- **Never** run `git checkout -- .` or `git stash` on a working tree that is
  not yours; never commit `desktop/`; never commit secrets, keystores or
  `.env` files.
- `unset NODE_ENV` before `npm ci` / `npm run` (a production `NODE_ENV`
  skips the dev tools and the tests run against nothing).
- **Releases** go through `scripts/release.sh` only, and only when asked: no
  store submission, no tag, no version bump on your own initiative. Small
  changes wait for a bigger release.
- **On a real device**, install over the existing app with
  `adb install -r --user 0`; never uninstall it (that deletes the user's
  journal). Never run a test build against real app data on a Mac — use a
  separate bundle id and `CFFIXED_USER_HOME`.
- **No analytics, trackers, telemetry or ads. Ever.** No new network host
  without §4.
- 13 locales in parity; no raw colours outside `src/theme/tokens.ts`
  (CONTRIBUTING.md has the rest).

## 3. Prayer times: the invariants

- **The computed methods** — Sweden, Diyanet, Morocco, Algeria, Indonesia —
  are developed and certified in
  [mihrab-methods](https://github.com/MihrabHQ/mihrab-methods): a method is
  used only at **0 times off** its authority's published timetable. The app
  carries copies (`src/providers/*Method.ts`, `src/providers/data/`). Change a
  method there first, certify it, raise its revision, then copy it here with
  the same revision in `src/providers/methodRevisions.ts`.
- **The live feed.** At run time the app reads mihrab-methods' `main`:
  `certification.json` and `data/corrections/<authority>.json`. Their shape
  is a contract with every installed app: add fields, never rename or remove
  one (`schemas/` in mihrab-methods; `methodCurrency.ts` here).
- **Don't change a default** (provider, calculation method, high-latitude
  rule, the riwayah fallback) without a test and a note in the PR on who is
  affected.
- **The riwayah on screen** is `resolveRiwayah(prefs.riwayah)`, never the raw
  preference (`__tests__/ayahSheetFollowsShownRiwayah.test.ts`).
- Time zones: use `zoneClock.ts`; never parse an offset from
  `timeZoneName` strings, and never rely on Node's own zone data in a test.

## 4. Claims must match the code

- **Accuracy figures** come only from `data/methods/certification.json`
  (synced from mihrab-methods) through the generators — never typed by hand:
  `node scripts/copy/sync-certification.js ../mihrab-methods`, then
  `node scripts/build-site.js` and `node scripts/build-copy.js`. Wording:
  "matches the published timetable of …", never "official"; no "the only"
  or "the first"; Mihrab is independent and not affiliated with any
  authority. Full rules: [scripts/copy/README.md](scripts/copy/README.md).
- **Privacy.** Every host the code names must be listed in
  [PRIVACY_POLICY.md](PRIVACY_POLICY.md) (`__tests__/networkHosts.test.ts`
  fails otherwise). If a change alters what is sent, or when, update in the
  same PR: the policy (English and Swedish), the site's privacy section
  (`docs/index.html`, `docs/sv/index.html`, `scripts/site/strings.json`),
  and the store paragraph (`scripts/copy/store/`).
- The website ships **no JavaScript, no webfonts, no third-party
  requests**. Generated content is written into the HTML at build time.

## 5. Before you say you are done

Run, and report what you ran:

```sh
npm run preflight        # tsc, the site and copy checks, the whole jest suite
```

Then:

- [ ] The PR says what changed for the user, what was **not** verified, and
      anything the maintainer must decide.
- [ ] A user-visible change has a line in `CHANGELOG.md` under Unreleased.
- [ ] Text in a language you do not read natively is marked for native
      review (in the PR, and `data-review="native"` on a page).
- [ ] CI is green on every job before merge.

If a check fails for a reason outside your change (a flaky native build, a
missing patch in `node_modules`), say so plainly in the PR; do not skip it or
weaken the test.

## 6. Where things are

| What | Where |
|---|---|
| Prayer providers, methods, correction lists | `src/providers/` |
| Which source a place gets ("Automatic") | `src/settings/effectiveProvider.ts`, `src/settings/regionalProviders.ts` |
| Method currency and the live feed | `src/providers/methodCurrency.ts`, `src/config/datasets.ts` |
| Quran reader | `src/quran/` |
| Website (static) | `docs/`, generated by `scripts/build-site.js` from `scripts/site/strings.json` |
| Store listings | `fastlane/metadata/`, generated by `scripts/build-copy.js` from `scripts/copy/store/` |
| Release | `scripts/release.sh`, `docs/DISTRIBUTION.md` |

## 7. Scheduled jobs and monitoring

- The scheduled workflows here (`national-tables`, `namazvakti-*`,
  `hijri-*`, `compat-feed`) write files installed apps download from `main`
  (`src/config/datasets.ts`). They stay in this repository, and those paths
  never move or change shape.
- Checks that only watch — the app's methods against the authorities'
  tables (`tools/verify-methods`), every source live (`tools/api-health`) —
  run daily in the maintainer's private monitoring repository, which also
  keeps the status board for every job in this repository and in
  mihrab-methods. A failing or stalled job opens an assigned issue there.
- A new scheduled workflow here must be added to that board: say so in the
  PR, for the maintainer to do.
