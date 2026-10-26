# Today on a phone: the page that fits

*Analysis and plan, 26 October 2026. Traditional phones only — foldables,
iPads and the Mac have their own layouts (`book`, `tabletop`, `roomy`,
`isDashboard`) and are out of scope here.*

## 1. What the page is

Today is six segments stacked in one column, and the column is the
viewport (`scrollContentBleed: flexGrow 1`, `cardBleed`, `heroWrapBleed`):

| # | segment | parts | today's height (411×914 dp, font 1.0) |
|---|---|---|---|
| 0 | status bar | system | 24 |
| 1 | **hero** | top row (location · Qibla), the sky's scene, eyebrow + Help chip, countdown + time, rail + labels, foot padding | 302 — grows to fill |
| 2 | **day bar** | chevron · weekday + date / Hijri · chevron | 56 |
| 3 | **the times** | 5 rows with a subline (58 each) + Sunrise (40) | 330 |
| 4 | **month link** | "Prayer times for the whole month →" | 42 |
| 5 | **Quran card** | one door, two lines, a bar | 72 (+ 12 gap above, 12 below) |
| 6 | tab bar | 6 tabs with labels | 62 |

Sum: **912 dp** — the Pixel's 914 dp fits with 2 dp to spare. The hero is
at its own natural height there, not grown at all: the page fits a 411×914
phone *exactly* and nothing smaller. That is the first finding, and it was
measured, not guessed (`~/Documents/mihrab-shots/matrix.sh` renders Today
at five phone sizes × four font scales on the emulator; the sheet is
`docs/design/home-matrix-2026-10-26.png`).

## 2. What the matrix shows

| phone (dp) | font 1.0 | 1.3 | 1.5 | 2.0 |
|---|---|---|---|---|
| iPhone SE class, 375×667 | cut at Asr | cut at Dhuhr | cut at Dhuhr | cut at Dhuhr |
| small Android, 360×720 | cut at Maghrib | cut at Asr | cut at Asr | cut at Asr |
| budget, 360×800 | month link under the bar | cut at Maghrib | cut at Maghrib | cut at Asr |
| Pixel, 411×914 | fits | month link under the bar | cut at Isha | cut at Isha |
| tall, 411×1006 | fits, 60 dp of sky to spare | fits | Quran card under the bar | cut at the card |

So: of twenty phone × text-size combinations, three fit. Everywhere else
the table is cut by the tab bar — and cut *mid-row*, with a half-visible
"Prayer times for the whole month" showing through under the bar, which
reads as a mistake rather than as a page that scrolls.

The reasons, in order of weight:

1. **The hero has no compact form.** It grows when there is room (good)
   but never gives anything back: the scene's floor is 64 dp, the top
   row, the eyebrow row, the countdown at 60 pt, the rail and its labels
   and the foot padding are all fixed. Its floor is ~300 dp, a third of
   the SE's screen, while the table underneath it is what is cut.
2. **Every row carries a subline.** "First time until approx. 06:09"
   under five of six rows is 5 × 18 dp = 90 dp of secondary text, read
   once and then ignored, and the rows are 58 dp where a row of a time
   needs 44. `dense` (padding 12 → 8) only triggers under 720 dp of
   window height and only saves 8 dp a row; the subline is the cost.
3. **The chrome between the segments is tall.** The day bar is two lines
   plus 20 dp of padding (56); the month link is a 42 dp row for one
   line of text; the Quran card is 72 dp plus two 12 dp gaps for one
   door; together 150 dp, a fifth of a small phone, on things that are
   not the times.
4. **Text size scales the wrong things.** The countdown is capped at
   1.3× (right); the "Help Mihrab grow" pill, the day bar, the rows'
   sublines and the tab labels scale to 2.0×, so at the largest text the
   pill squeezes "Stockholm" to "Stockhol…", the seconds to "3…", the
   tab labels to "Tod…"/"Setti…", and the sublines to "First time until
   appro…" — the page shows more ellipses than information.
5. **Nothing says "scroll".** When the page does not fit there is no
   signal — the cut is wherever the bar falls.

## 3. The look and feel, beyond the fit

Things the matrix made visible that are about the look, not the size:

- **The hero is the busiest segment on a page whose point is calm.** Six
  things compete in it: the location chip, the Qibla chip, the sun, the
  eyebrow, the Help Mihrab pill, the countdown with its time, the rail
  with two labels. The pill is promotional, bordered, filled, and in the
  line the eye lands on before the countdown; the Qibla chip repeats a
  bearing most readers will never use from here. A minimalist hero is
  the city, the sky, the question and its answer.
- **The rows say the same thing six times.** A circle, a name, a bell, a
  time, and a subline. The bell is a control that is almost never
  touched from here (alerts are set in Settings and on the row's sheet);
  six bells is a column of grey glyphs down the middle of the page.
- **The month link and the day bar are two controls about the calendar
  stacked 330 dp apart.** The day bar already has the chevrons and the
  date; the month belongs to it.
- **The current row's tint block** (full-width fill with an edge bar) is
  the one heavy element in a table that is otherwise hairlines and type.
- **The Quran card is a card on a page that stopped using cards.** The
  times are full-bleed rows; the card under them is bordered, radiused,
  shadowed, inset — the last ghost of the old carded Home.

## 4. The rules

### 4.1 Every segment has three sizes

Each segment is designed at three tiers, and the page picks one tier for
the whole page (never mixed — a dense table under a roomy hero looks like
two apps):

| segment | **roomy** | **comfortable** (today's) | **compact** |
|---|---|---|---|
| hero scene | grows (the sky is the elastic segment) | 64 min | 40 min (a sun's halo still fits) |
| countdown | 60 pt | 60 pt | 52 pt; seconds 22 |
| hero foot padding | 20 | 20 | 12 |
| rail labels | shown | shown | shown (they are the rail's meaning) |
| day bar | 2 lines, 56 | 2 lines, 56 | 1 line, 44: "Monday 26 Oct · 15 Jumada I" |
| row | 14 padding, 62 | 12, 58 | 8, 44 — **no subline except the current row's** |
| month link | row, 42 | row, 42 | folded into the day bar (a calendar glyph at the trailing chevron's side) |
| Quran card | 2 lines, 72 | 2 lines, 72 | 1 line, 52; no gap above (the card sits on the month link's hairline) |

Compact total on the Pixel: 24 + 232 + 44 + (5×44 + 40) + 0 + 52 + 12 +
62 = **686 dp** — fits the 360×720 phone and the 360×800 one at 1.0 and
1.3, and the SE scrolls by ~20 dp instead of ~250. Comfortable fits the
Pixel at 1.0, as today; roomy is what a tall phone gets.

### 4.2 The page picks the largest tier that fits, before it lays out

Not by trying tiers and measuring (that flickers); by arithmetic. The
page knows everything the sum depends on: the window height, the insets,
the tab bar's height, the font scale (`PixelRatio.getFontScale()`, capped
per text the way the texts cap it), the number of rows (6, 7 with Duha or
an extra time, 8 with the Mālikī boundaries), whether the Quran card has
one door or two, whether the Ramadan card is in season, and whether a
permission banner is up. `homeBudget.ts` exports

```ts
export function pickHomeTier(input: HomeBudgetInput): HomeTier // 'roomy' | 'comfortable' | 'compact'
export function homeSegmentHeights(tier, input): HomeSegmentHeights // for the test, and for the hero's floor
```

with the per-segment constants in one table, and a test that pins each
constant to the style it mirrors (as `heroCountdownLine.test.ts` pins the
row's layout) so the arithmetic cannot drift from the styles. The rule:

```
need(tier) = status + hero.floor(tier) + dayBar(tier) + rows × row(tier)
           + monthLink(tier) + quran(tier) + gaps(tier) + tabBar
tier = the first of [roomy, comfortable, compact] with need(tier) ≤ window
```

`DENSE_BELOW_HEIGHT` and `DENSE_ABOVE_ROWS` (the two thresholds that decide
`dense` today) go; the budget decides.

### 4.3 When even compact does not fit, the page scrolls — honestly

The hero keeps its compact floor (never squashed below it: a hero whose
countdown is cut is wrong on every phone), the rows keep theirs, and the
page scrolls. Two things make the scroll read as intended rather than as
a cut:

- the last visible row is never half-visible: the table's bottom hairline
  and the tab bar's top edge are at least 8 dp apart or the page's bottom
  padding is grown until they are (a cheap rule: `paddingBottom` of the
  scroll content = `max(SPACING.xl, (window − need) mod rowHeight)` —
  make the overflow a whole row, not a sliver);
- the tab bar is opaque over a scrolling page (today it is a plane the
  rows pass under with their text showing through at the hairline).

### 4.4 Text size

Scaling is per segment, with a cap per role, and the caps are the design
rather than a side effect:

| text | cap | why |
|---|---|---|
| countdown, time, rail labels | 1.3 (as now) | tabular, one line, the page's reason |
| prayer names and times | 1.5 | the data; a row may grow to two lines of name, never of time |
| sublines, Hijri, month link, Quran card lines | 1.3 | secondary; past this they truncate anyway |
| the Help Mihrab pill | 1.0 | a pill; at ≥1.3 it is not shown in the hero at all |
| day bar | 1.3 | one line in compact must stay one line |
| tab bar labels | 1.3; at ≥1.5 the labels go and the glyphs grow | "Setti…" is not a label |

And the budget's arithmetic uses the capped scale per segment, so a
2.0× phone picks compact for the right reason.

### 4.5 Bigger phones: where the extra goes

Past the point where comfortable fits (≈ 914 dp at 1.0 on a 411 wide
phone), the extra height goes, in this order, each to its ceiling before
the next:

1. **the sky**, up to a scene of 160 dp (the sun's whole arc has room;
   past that a sky with one sun in it is empty);
2. **the rows**, from 12 dp padding to 14 (roomy); never more — a 70 dp
   row of one time is a list that has lost its rhythm;
3. **the Quran card** gains its second line where it has one to gain
   (the khatmah's progress, the bookmark's surah) — it does not grow
   otherwise;
4. **the sky again**, without ceiling. The sky is the one segment that
   can be any height and still be what it is; a tall phone shows more
   sky, as a tall window does.

Nothing is centred and nothing gets air at the foot: the page always
ends at the tab bar, and the segments keep their order and their
proportions; only the sky breathes.

## 5. The look: what goes, what stays, what moves

In the order they would ship:

1. **Sublines only on the current row** (all tiers). The row that counts
   says "First time until 13:41"; the others are a name and a time. The
   information is still one tap away on the row's sheet, and the table
   loses 90 dp and five lines of grey.
2. **The month link into the day bar.** A calendar glyph at the trailing
   chevron's side (the bar's hit targets stay 44 dp); the 42 dp row goes
   in every tier. Settings → Prayer times keeps its own link.
3. **The Help Mihrab pill becomes a heart.** Ink only, no fill, no
   border, no label, at the eyebrow's trailing end — the eyebrow row
   loses 16 dp of height and the hero one of its six voices. It still
   opens Help Mihrab; the setting still turns it off.
4. **The bell column goes quiet.** Drawn only on the row whose alert is
   off (a struck bell says something; six bells say nothing), in the
   muted ink. The row's sheet keeps the control.
5. **The current row's mark is the edge bar alone**, 3 dp of accent at
   the start, on a row with no fill — the table is hairlines and type
   from top to bottom, and the accent says "now".
6. **The Quran card loses its card.** The door sits on the page under
   the table's last hairline, in the rows' own grammar: a glyph, the line,
   the subline, the time-column slot carrying "page 26". Full-bleed like
   the rows, with the rows' inset. (The Ramadan countdown in its season:
   the same.)
7. **The Qibla chip to the top row's trailing end as a glyph + bearing**
   with no border — it is already ink on sky; the pill around it is the
   only other border in the hero once the Help pill goes.

Each is independent and small; 1 and 2 alone take the comfortable tier
from 912 to 780 dp, which fits the 360×800 phone at 1.0 and the Pixel at
1.5 with no tier change at all.

## 6. Order of work

1. `homeBudget.ts` + its test; wire `pickHomeTier` into HomeScreen →
   TodayCard (`tier` prop replaces `dense`); the three tiers' styles.
2. §5.1 and §5.2 (the sublines, the month link) — the big wins.
3. The text-size caps (§4.4), the tab bar's label rule.
4. The scroll rule (§4.3): whole rows, opaque bar.
5. §5.3–5.7, one commit each, each checked on the matrix.
6. Bigger phones (§4.5): the sky's ceiling-then-no-ceiling, roomy rows.
7. Rerun `matrix.sh`; the sheet goes into `docs/design/` as the
   reference for the next change to this page.

What does not change: the hero's sky and its animation, the day pager,
the rows' tap targets (44 dp minimum in every tier), the status band,
accessibility labels, and anything on the dashboard, book or tabletop
layouts.
