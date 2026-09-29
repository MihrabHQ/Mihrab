/**
 * THE CONTRACT BETWEEN THE APP AND ITS WIDGETS — payload v2.
 *
 * The one description of everything the app hands its home-screen widgets
 * and everything the widgets hand back. `scripts/gen-widget-contract.js`
 * turns it into TypeScript types, Swift `Codable` structs and Kotlin data
 * classes, checked in, and a jest test fails when those are stale.
 *
 * Why this exists (docs/rewrite-plan.md, Phase 1): three platforms each
 * kept their own idea of the payload's shape, and times crossed as
 * formatted text that sixteen hand-written parsers turned back into
 * numbers. The bugs were the gaps between those ideas — a Live Activity
 * that never appeared on a 24-hour clock because one field the app left
 * out was one the decoder required.
 *
 * ── RULES THE GENERATED READERS FOLLOW ──────────────────────────────
 *
 *   required  missing or the wrong type → the object it belongs to is
 *             unreadable. Kept for what a surface cannot draw without.
 *   default   missing or the wrong type → the default. The writer may
 *             leave it out when it IS the default (the payload is read on
 *             every widget redraw; size is real).
 *   neither   missing or the wrong type → null.
 *   lists     one unreadable element is dropped, not the list.
 *
 * So a mistake on the writing side costs one detail, never the widget.
 *
 * ── TIMES ────────────────────────────────────────────────────────────
 *
 * Wall clock, not instants: `minutes` after the local midnight that starts
 * the row's `dateKey` (1440 and past for the night after it). Every prayer
 * time the app holds is a wall-clock time in the clock of the place it
 * belongs to (see src/prayer/timezoneShift.ts, issue #56), and an instant
 * would redraw a stored place's table in the device's zone.
 * `Day.utcOffsetMinutes` says which offset the times were computed under,
 * so a reader can tell when the device's offset for that date has moved on
 * since.
 *
 * Turning minutes into text or an instant is done by one helper per
 * platform — WallClock.swift, WallClock.kt, src/widget/wallClock.ts — and
 * nowhere else.
 */

const t = {
  string: (o = {}) => ({ kind: 'string', ...o }),
  int: (o = {}) => ({ kind: 'int', ...o }),
  long: (o = {}) => ({ kind: 'long', ...o }),
  double: (o = {}) => ({ kind: 'double', ...o }),
  bool: (o = {}) => ({ kind: 'bool', ...o }),
  enumOf: (values, o = {}) => ({ kind: 'enum', values, ...o }),
  ref: (name, o = {}) => ({ kind: 'ref', name, ...o }),
  list: (of, o = {}) => ({ kind: 'list', of, ...o }),
};

const REQUIRED = { required: true };

module.exports = {
  version: 2,
  types: [
    // ── The payload ─────────────────────────────────────────────────
    {
      name: 'Payload',
      doc: 'Everything the home-screen widgets draw. Written by the app, read on every widget redraw.',
      fields: [
        ['schemaVersion', t.int(REQUIRED), 'Always 2 for this shape.'],
        [
          'language',
          t.string({ default: '' }),
          "The app's language tag (`sv`, `ar`). Native chrome resolves its own strings against it, so one widget never speaks two languages.",
        ],
        [
          'clock',
          t.ref('Clock', { default: 'fallback' }),
          'How to write a time.',
        ],
        ['locationName', t.string({ default: '' }), 'Short place label.'],
        [
          'days',
          t.list(t.ref('Day'), REQUIRED),
          "Today first, then the days after it. Readers pick the entry whose `dateKey` is the device's local date, so a widget keeps rolling forward without the app.",
        ],
        ['seasonal', t.ref('Seasonal'), 'Jumuʿah, Ramadan, Eid accents.'],
        [
          'today',
          t.ref('Today'),
          "Today's five with their journal status — the Log Today widget.",
        ],
        [
          'practice',
          t.ref('Practice'),
          'Streak and the practice grid. Absent means "do not draw", never zero.',
        ],
        [
          'reading',
          t.ref('Reading'),
          'Where the reader left off, and what the khatmah asks of today.',
        ],
        ['hijri', t.ref('Hijri'), "Today's Hijri date and the month after it."],
        [
          'tasbih',
          t.ref('Tasbih'),
          'The dhikr counter, for the Tasbih widget.',
        ],
      ],
    },
    {
      name: 'Clock',
      doc: "The user's clock, resolved by the app (Settings → Appearance, else the device). Digits are always Latin; only the day-period marker is localised, exactly as src/utils/clockFormat.ts writes it.",
      fields: [
        ['hour12', t.bool({ default: false }), '12-hour clock.'],
        [
          'am',
          t.string({ default: 'AM' }),
          'Morning marker in the app language.',
        ],
        [
          'pm',
          t.string({ default: 'PM' }),
          'Afternoon marker in the app language.',
        ],
        [
          'periodFirst',
          t.bool({ default: false }),
          'Marker before the digits (下午5:31).',
        ],
      ],
    },
    {
      name: 'Day',
      doc: 'One local calendar day of prayer times.',
      fields: [
        ['dateKey', t.string(REQUIRED), 'Local YYYY-MM-DD.'],
        [
          'utcOffsetMinutes',
          t.int(),
          "The device's UTC offset at local noon of this date when the app built it. A reader whose own offset for the date differs is looking at times computed under rules that no longer apply (#56).",
        ],
        ['label', t.string({ default: '' }), 'Short day label ("Wed, Apr 9").'],
        [
          'prayers',
          t.list(t.ref('Row'), REQUIRED),
          'The five ṣalāh, Fajr to ʿIshāʾ.',
        ],
        ['sunrise', t.ref('Row'), 'Absent when the user turned Sunrise off.'],
        [
          'extras',
          t.list(t.ref('Row'), { default: [] }),
          'The night marks the user turned on — Islamic Midnight, the Last Third, the First Third — as the app groups them with this day.',
        ],
        [
          'estimated',
          t.bool({ default: false }),
          'True for a day the app had no times for, filled with the day before\'s. Only its Fajr is offered as "next", exactly as the app does.',
        ],
      ],
    },
    {
      name: 'Row',
      doc: 'One time on one day.',
      fields: [
        [
          'key',
          t.string(REQUIRED),
          '`Fajr`, `Sunrise`, `Midnight`, … — never localised.',
        ],
        ['name', t.string({ default: '' }), 'Full localised name.'],
        ['abbr', t.string({ default: '' }), 'Short label for narrow layouts.'],
        [
          'minutes',
          t.int(),
          'Minutes after local midnight of the day: 0–1439, or 1440 and more for a night mark that falls after the midnight ending the day (the First Third, some nights). Null when the time does not occur at this latitude; draw a dash.',
        ],
      ],
    },
    {
      name: 'Seasonal',
      doc: 'Seasonal accents.',
      fields: [
        ['jumuah', t.bool({ default: false }), 'Friday before Maghrib.'],
        ['ramadan', t.bool({ default: false }), 'Inside Ramadan.'],
        [
          'eid',
          t.enumOf(['fitr', 'adha'], { name: 'Eid' }),
          'Eid day, or null.',
        ],
      ],
    },
    // ── Blocks ──────────────────────────────────────────────────────
    {
      name: 'Today',
      doc: "Today's five as the Log Today widget needs them.",
      fields: [
        [
          'dateKey',
          t.string(REQUIRED),
          "Local YYYY-MM-DD. A widget that slept through midnight must not draw yesterday's ticks as today's.",
        ],
        ['logged', t.int({ default: 0 })],
        ['loggable', t.int({ default: 0 })],
        ['owed', t.int({ default: 0 }), 'Missed today and not yet made up.'],
        ['prayers', t.list(t.ref('TodayPrayer'), { default: [] })],
      ],
    },
    {
      name: 'TodayPrayer',
      doc: 'One prayer on the Log Today widget.',
      fields: [
        ['key', t.string(REQUIRED), 'Journal prayer key.'],
        ['name', t.string({ default: '' }), 'Localised name.'],
        ['minutes', t.int(), 'Its time today, as `Row.minutes`.'],
        [
          'status',
          t.enumOf(['on-time', 'late', 'missed', 'qadha'], {
            name: 'PrayerStatus',
          }),
          'Journal status; null when nothing is recorded.',
        ],
        [
          'due',
          t.bool({ default: false }),
          'Its time has arrived; only a due prayer takes a tap.',
        ],
      ],
    },
    {
      name: 'Practice',
      doc: 'Practice history.',
      fields: [
        ['streak', t.int({ default: 0 })],
        ['bestStreak', t.int({ default: 0 })],
        [
          'loggedToday',
          t.int({ default: 0 }),
          'Of the five, how many are logged today.',
        ],
        [
          'owed',
          t.int({ default: 0 }),
          'Missed and not yet made up, all time.',
        ],
        [
          'sunnahRate',
          t.double(),
          'Sunnah kept this month as a fraction; null before there is a denominator.',
        ],
        ['fastsThisMonth', t.int({ default: 0 })],
        [
          'days',
          t.list(t.ref('PracticeDay'), { default: [] }),
          'Oldest first, ending today; empty days omitted.',
        ],
        [
          'since',
          t.string(),
          'First day with a prayer entry, YYYY-MM-DD. Before it an empty square means "not started yet", after it "not filled in".',
        ],
      ],
    },
    {
      name: 'PracticeDay',
      doc: "One day's marks on the practice grid. Short keys: up to 210 of these ride in every payload.",
      fields: [
        ['d', t.string(REQUIRED), 'Local YYYY-MM-DD.'],
        [
          'kw',
          t.int({ default: 0 }),
          'Weighted score ×100 — on-time 100, late 70, qadha 45 — summed over the five, capped at 500.',
        ],
        ['l', t.int({ default: 0 }), 'How many of the five carry any entry.'],
        [
          'm',
          t.bool({ default: false }),
          'A prayer recorded missed and not made up.',
        ],
        ['f', t.bool({ default: false }), 'A completed fast.'],
        ['s', t.int({ default: 0 }), 'Sunnah units kept.'],
      ],
    },
    {
      name: 'Reading',
      doc: 'The Continue Reading widget.',
      fields: [
        ['surah', t.int({ default: 1 })],
        ['surahName', t.string({ default: '' }), 'Localised surah name.'],
        ['ayah', t.int({ default: 1 })],
        ['page', t.int({ default: 1 })],
        ['juz', t.int({ default: 1 })],
        ['pagesRead', t.int({ default: 0 })],
        ['totalPages', t.int({ default: 604 })],
        ['bookmarks', t.int({ default: 0 })],
        ['lastReadAt', t.long(), 'Epoch ms of the last page turn.'],
        [
          'mode',
          t.enumOf(['mushaf', 'translation'], {
            name: 'ReaderMode',
            default: 'translation',
          }),
          'Which reader a tap opens — decided by the app, which knows whether the muṣḥaf is on disk.',
        ],
        ['khatmah', t.ref('Khatmah')],
        [
          'started',
          t.bool({ default: false }),
          'False when the Qurʾān has never been opened.',
        ],
        [
          'downloaded',
          t.bool({ default: false }),
          'The muṣḥaf page images are on disk.',
        ],
      ],
    },
    {
      name: 'Khatmah',
      doc: "Today's share of the khatmah plan.",
      fields: [
        ['day', t.int({ default: 1 }), '1-based day of the plan.'],
        ['targetDays', t.int({ default: 0 })],
        ['pagesToday', t.int({ default: 0 })],
        ['doneToday', t.int({ default: 0 })],
        ['behindBy', t.int({ default: 0 })],
        ['daysLeft', t.int({ default: 0 })],
        [
          'skipped',
          t.int({ default: 0 }),
          'Pages left unread behind the reader.',
        ],
      ],
    },
    {
      name: 'Hijri',
      doc: "Today's Hijri date.",
      fields: [
        ['day', t.int(REQUIRED)],
        ['month', t.int(REQUIRED)],
        ['year', t.int(REQUIRED)],
        ['monthName', t.string({ default: '' })],
        ['label', t.string({ default: '' }), 'The whole date, localised.'],
        ['nextMonthName', t.string({ default: '' })],
        ['nextMonthInDays', t.int({ default: 0 })],
      ],
    },
    {
      name: 'Tasbih',
      doc: 'The dhikr counter.',
      fields: [
        ['presetId', t.string({ default: '' })],
        ['label', t.string({ default: '' }), 'Localised transliteration.'],
        ['arabic', t.string({ default: '' })],
        ['count', t.int({ default: 0 })],
        ['target', t.int({ default: 0 }), '0 means open counting.'],
        ['unbounded', t.bool({ default: false })],
        ['index', t.int({ default: 0 }), 'Position in the preset cycle.'],
        ['total', t.int({ default: 0 }), 'Cycle length.'],
        [
          'counts',
          t.list(t.int(), { default: [] }),
          "Every preset's count, in order.",
        ],
        [
          'labels',
          t.list(t.string(), { default: [] }),
          "Every preset's label — the widget steps the cycle in its own process.",
        ],
        ['targets', t.list(t.int(), { default: [] })],
        ['unboundedFlags', t.list(t.bool(), { default: [] })],
        [
          'todayTotal',
          t.int({ default: 0 }),
          'Beads counted today, across presets.',
        ],
        ['todayRounds', t.int({ default: 0 })],
      ],
    },
    // ── Back to the app ─────────────────────────────────────────────
    {
      name: 'LogQueueEntry',
      doc: 'One Log Today tap, queued by the widget until the app drains it. Same wire shape as v1.',
      fields: [
        ['d', t.string(REQUIRED), 'Local YYYY-MM-DD the tap was for.'],
        ['p', t.string(REQUIRED), 'Journal prayer key.'],
        [
          't',
          t.long({ ...REQUIRED, truncate: true }),
          'Epoch ms of the tap. Read with its fraction dropped: widgets before the contract wrote a fractional Double here, and a tap queued by one must survive the update.',
        ],
      ],
    },
    {
      name: 'TasbihQueueEntry',
      doc: 'One Tasbih widget action. Same wire shape as v1.',
      fields: [
        [
          'a',
          t.enumOf(['inc', 'reset', 'next'], {
            name: 'TasbihAction',
            ...REQUIRED,
          }),
          'Action.',
        ],
        [
          't',
          t.long({ ...REQUIRED, truncate: true }),
          'Epoch ms. Read with its fraction dropped, as the log tap is.',
        ],
        [
          'n',
          t.long(),
          'Run length for coalesced taps; absent means one. A long so an absurd count still reads, and is clamped by the rule rather than dropped by the reader.',
        ],
      ],
    },
  ],
};
