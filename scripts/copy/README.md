# Copy generated from the certification record

Accuracy is Mihrab's headline, so every figure about it — on the website, in
the README and in the store listings — is generated from mihrab-methods'
record, `data/methods/certification.json`. Nothing is typed by hand.

| Script | Writes |
|---|---|
| `node scripts/copy/sync-certification.js <path or URL>` | `data/methods/certification.json`, from mihrab-methods |
| `node scripts/build-site.js` | every page under `docs/`: the figures, the accuracy table, the FAQ's JSON-LD, the country sections |
| `node scripts/build-copy.js` | `fastlane/metadata/**` from `scripts/copy/store/`, the README's accuracy block, `branding/badges/certification.svg` |

Both generators take `--check`; `__tests__/accuracyCopy.test.ts` runs them in
CI, so a stale page, a field over its limit or a figure the record lacks fails
the build.

## Writing a figure

- In HTML or Markdown: `<!--fig:KEY-->…<!--/fig-->`. The generator writes the
  value between the markers, formatted for the page's language.
- In `scripts/site/strings.json` (the generated pages): `{fig:KEY}`.
- In the store templates (`scripts/copy/store/`): `{{KEY}}`.

The keys are listed by `namedFigures` in `figures.js` (a CommonJS copy of
mihrab-methods' `scripts/figures.mjs` — keep the two in step): `total.times`,
`total.timesCompact`, `total.off`, `total.checkedAtLong`, and per authority
`<id>.places`, `.times`, `.off`, `.alonePct`, `.corrections`, `.span`,
`.years`, `.toMonthYear`, … A key the record does not have is an error: add
the figure to mihrab-methods' `tools/certify.ts`, never type it.

Figures cannot be generated inside an HTML attribute or JSON, so meta
descriptions and the app's JSON-LD carry no figures; the FAQ's JSON-LD is read
off the visible FAQ, figures included.

## The rules

1. **No hand-typed figures.** From the record, or not at all.
2. **No implied endorsement.** "Matches the published timetable of …", never
   "official times". Every store description and the FAQ say Mihrab is
   independent and not affiliated with any authority.
3. **Certification only for computed methods** — Sweden, Diyanet, Morocco,
   Algeria, Indonesia. Singapore (MUIS), Malaysia (JAKIM) and Türkiye Takvimi
   are published tables used as printed, and are described as such.
4. **No "the only" / "the first".** `build-copy.js` refuses them.
5. **The site stays static:** no JavaScript, no webfonts, no third-party
   requests. Generated content is written into the HTML at build time.
6. **The voice and the hero line stay:** "For every prayer, and everything
   between."
7. **Limits** (characters): Play title 30, short 80, full 4000; App Store
   name 30, subtitle 30, keywords 100, promotional text 170, description
   4000; F-Droid's summary is Play's short description (80) — F-Droid reads
   the same `fastlane/metadata/android` files.
8. **App Store keywords** name no authority and repeat nothing in the app's
   name.

Drafts in a language nobody on the project reads natively carry
`"review": "native"` in `strings.json` (and `"_review": "native"` in
`fields.json`); the page marks the section `data-review="native"` until
someone signs it off.
