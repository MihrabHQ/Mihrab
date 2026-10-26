# The colours of the day — the hero and the two Sky tracks

Written 2026-10-26, against v2.33.0 (292) plus the hero work of the same
day (02d3ad84, 47f60554), at Hassan's request: *"focus on the colours, both
the hero colours and the two sky themes… make the best use of the colours
of the different times of the day and reflect that in the most beautiful
way possible, making every moment of the day have a unique and great
feeling each time it is opened… the colour of the UI is very important but
so is the accent colours of the texts."*

This is the analysis and the plan. Nothing in the app was changed for it.
The evidence is on the Mac: `/tmp/colour-audit.txt` (every token of both
tracks at every eighth of every passage: contrast ratios, OKLCH, the hero's
ink margins) and the sweeps `/tmp/sheet-{vib,real}-{today,settings}.png`
(Stockholm, 26 Oct, 03:00–18:00, both tracks, Today and Settings).

Companion reading: `docs/design/sky-palette.md` (the reasoning the theme was
built on), `ARCHITECTURE.md` §6, `src/theme/skyMoods.ts` (the colours),
`src/screens/home/skyModel.ts` (the passages), `src/screens/home/skyLight.ts`
(the sun's real light).

---

## 0. The short version

The Sky theme is a good system with three structural limits, and the
limits are what make the day feel like three looks rather than a hundred:

1. **The colours are a function of the prayer passage's progress, not of
   the sun.** The same "midday" ice is painted at a Stockholm December noon
   (the sun 7° up, gold all day) and a Makkah noon (80°, white). The same
   "evening" switches on halfway from Asr to Maghrib — at 15:00 in
   Stockholm in October, with the sun 12° up; in June, two hours before a
   22:00 sunset. The sun's altitude is already computed for the hero's own
   disc (`skyLight.ts`) and the moods never ask for it.
2. **Two of the five passages are flat.** The night is one navy (Realistic)
   or one indigo (Vibrant) for eight to fourteen hours, whatever the moon
   is doing; the day is one blue from mid-morning to mid-afternoon. The
   "no two moments the same" test is true by a few units of OKLab and false
   to the eye.
3. **The seams between moods go grey.** The mid-morning haze and the late
   afternoon are mixes whose middle stop and accent lose their chroma
   (heroMid C 0.03–0.05; Realistic's accents #5B5C86 slate and #6A5070
   mauve at C 0.06–0.08) — the two hours of the day the app looks washed.

The plan keeps the architecture (six moods, anchors between them, OKLab
mixing with chroma held, the dark/light switch as a crossfade, the AA
floors the test walks) and changes what the anchors are keyed to and how
the two tracks are defined:

- **Realistic becomes the physical sky**: colour by the sun's altitude and
  the twilight's depth, the night by the moon's phase and height, the page
  a paper lit by that sky. Every latitude and season then paints its own
  day without a single new anchor being hand-picked.
- **Vibrant stays the designed set**, re-timed to the sun (the evening
  begins at Maghrib, not at mid-afternoon), its seams carried round the
  wheel instead of through grey, and its accent given a continuous track
  of its own so the hand's colour moves with the hour too.
- **The accent gets a rule per track** (§4), because today it has none:
  Vibrant's night accent is the sky's complement, its midday the sky's own
  hue; Realistic's are both analogous and, in the seams, nearly neutral.
- **The hour reaches past the hero** (§5): the other tabs carry a breath of
  the sky where chrome is allowed to move, and nothing where reading is.

---

## 1. What exists

**The hero's gradient is the mood's, in every theme.** `TodayCard.paint()`
calls `themedSkyFrame(frame, mood)` for every look — Sky (both tracks) and
System/Light/Dark alike (the latter take Realistic's moods with the page as
the foot). `skyModel.ts`'s own `KEYS` (the "real" two-stop sky) and `GLOW`
are computed and then overwritten: dead code since the Sky theme shipped,
kept only for `luminance`, `skyColorAt` and `skyInkAt`. The hero's ink is
pure white or pure black by the painted sky's luminance under each line
(`INK_SWITCH_LUMINANCE` 0.18), which is sound and stays.

**A mood is twenty tokens** (`SkyMood`: three hero stops, the body's light,
the stars' glow, page, card, control, border, text, muted, accent, its
highlight, on-accent, two accent surfaces, a hairline, danger, overlay).
Six named moods per track; thirteen anchors (variations of a mood with its
ink and accent kept); five timelines of segments between anchors; the mix
in OKLab, with `mixHexVivid` holding the chroma for the stops, the body and
the accent. The palette is quantised to `PALETTE_STEPS` (16) per segment so
a re-render of every screen happens at most sixteen times a passage.

**The switches.** Sunrise (dawn 1.0 → day 0.0) and the middle of the
Asr→Maghrib passage (sunset 0.5) are the only two instants the page turns
dark/light, each a 650 ms crossfade of the whole screen.

**The floors.** `__tests__/skyTheme.test.ts` walks every mood and every
2 % of every passage: text and muted on page/card/control, the accent on
page/card/control/highlight, on-accent on the accent — all ≥ AA; heroTop,
accent and body chroma ≥ 0.075/0.13/0.08 through the day's and the
sunset's first halves. Everything passes today (the audit's lowest: Vibrant
sunset accent on control 4.77, dawn accent on highlight 5.10).

---

## 2. Findings

Read with the sweep sheets at hand; the time stamps are Stockholm, 26 Oct
(Fajr 04:34, sunrise 06:45, Dhuhr 11:37, Asr 13:41, Maghrib 16:19, Isha
18:14).

**F1 — The evening starts in daylight.** Both tracks switch to the dark
"sunset" mood at sunset-passage t = 0.5: 15:00 here, with the sun at ~12°
and the hero drawing it high and yellow over a magenta (Vibrant) or
indigo-and-ember (Realistic) sky under a dark page. In June the midpoint of
an 18:00 Asr and a 22:08 Maghrib is 20:04 — two hours of "evening" in full
sun. In Makkah, 17:15 against an 18:50 Maghrib. The switch was put there so
the evening palette would have time before Maghrib; it bought that at the
cost of the whole golden hour, which is the most beautiful light of the day
and is painted as night. *The dark switch belongs to the sun — at Maghrib,
or minutes before it.*

**F2 — Nine hours of one blue.** Realistic: heroTop hue 250–253 and L
0.63–0.67 from day 0.25 to sunset 0.25 (≈08:30–14:20 here; 06:30–17:00 in
June), accent #285C91 for all of it; the mood name is "midday" for
three-fifths of daylight. Vibrant: the same span at hue 248–250, accent
#0760AB. The page at L 0.97 C 0.01–0.02 in both. The Settings sheet shows
it plainly: the 09:00, 12:00 and 14:30 pages are the same page.

**F3 — Fourteen hours of one navy.** Night (dusk 0.5 → dawn 0.2): Realistic
heroTop hue 268–273, L 0.16–0.21; Vibrant 283–299, L 0.15–0.18; the accent
fixed in both. From Isha at 18:14 to Fajr at 04:34 — ten hours in October,
fourteen in December — nothing the eye can see moves. The moon's phase
(computed every minute for the hero's disc) and whether it is up (not yet
computed; see `docs/hero-plan.md`, the "truth" option) change a real night
completely: a full-moon night is a silver-blue room, a new-moon night is
black with stars. The theme does not know.

**F4 — The seams go grey.** Day 0.13 (≈08:00): Vibrant heroMid #DCD6EC at
C 0.04, Realistic heroMid #DAE4EF at C 0.03 and its accent #5B5C86 at
C 0.08 hue 303 — a slate. Sunset 0.13–0.25 (≈14:00–14:30): Realistic heroMid
passes hue 214 → 86 at C 0.04–0.05 (through grey), the page's hue through
146 at C 0.00, the accent #6A5070 at C 0.06 — a mauve-grey. These are the
09:00 and 14:30 tiles: the washed ones. The chroma test guards heroTop,
accent and body but not heroMid or the page, and its accent floor is
checked only for Vibrant.

**F5 — Realistic's page does not carry the hour.** By design ("a paper
warmed or cooled toward the hour by a few degrees"): bg at C 0.00–0.02 all
day. With the accent muted in the seams, a Realistic Settings page at 09:00
and at 14:30 differ by a hue of grey. The track that is the default is the
one that feels least like the day away from the hero.

**F6 — No latitude, no season.** Tromsø's December noon (sun 0°), Stockholm's
(7°), Jakarta's (80°) are the same ice. The hero's disc already reddens and
grows by altitude (`tintedBy`, `sunScaleAt`); the sky behind it does not.
This is the single largest source of "the same every time I open it".

**F7 — The accent has no rule.** Vibrant: night cyan (hue 204) against an
indigo sky (285) — a complement; dawn coral (32) against violet (290–330);
midday azure (252) on a blue sky (250) — analogous; golden red (357) on
gold (15–50); sunset pink (355) on magenta (358) — analogous. Realistic:
night 262 on 270 (analogous), dawn 46 on 300, morning 44, midday 251 on
250, golden 26, sunset 50 on 20 — analogous except the dawn. Each pick is
defensible; together they are not a system, and the accent in the seams is
whatever OKLab's straight line gives. The texts coloured in the accent
(the next prayer's time, links, the active tab, "page 26", "Back to today")
are where the hour is read on every screen but Today — they deserve a track.

**F8 — The floors hold.** Nothing below AA anywhere in the audit; the dark
moods' accents sit at 6–13:1, the light ones at 5.4–7.6:1. Any change below
must keep `expectLegible` green at every 2 % of every passage, in both
tracks — the test is the contract.

**F9 — Dead colour.** `KEYS` and `GLOW` in `skyModel.ts` (120 lines of
hand-picked sky) are never painted. Either they go, or Realistic is rebuilt
on top of a physical model and they go anyway.

**F10 — The hero's small lights are right.** `bodyLight` per mood, the halo
×1.35 under the theme, the stars' glow per mood, the countdown's glow in the
accent by night: all consistent with the mood system and worth keeping as
the places the new tracks feed.

---

## 3. The two tracks, defined

### 3.1 Realistic — the physical sky

Realistic should stop being a second hand-picked set and become what its
name says: the sky as it is, derived, so that it is different in Tromsø and
Jakarta and in December and June without anyone picking colours for them.

**Inputs, all already on the phone:** the sun's altitude (`sunAltitude`,
`moon.ts`), the twilight depth (altitude below 0: civil −6°, nautical −12°,
astronomical −18°), the moon's illumination and bright-limb angle
(`moonView`), the moon's altitude (to add: the low-precision lunar position,
~40 lines; the "truth" option in `docs/hero-plan.md`), and the passage, for
the prayer-bound moments (Fajr, Maghrib) the app's own day is cut at.

**The sky's three stops, from altitude** — one continuous function, not
keyframes:

| sun altitude | top | mid (horizon) | what it is |
|---|---|---|---|
| > 50° | deep zenith blue, L 0.60 C 0.17 h 255 | pale blue, L 0.86 C 0.07 | a high sun, the sky darkest overhead |
| 20–50° | clear blue, L 0.65 C 0.15 h 252 | pale blue-white | a working day |
| 5–20° | blue paling, L 0.68 C 0.12 h 248 | warm haze, L 0.88 C 0.06 h 70 | a low sun: the whole day in Stockholm's winter, the morning and afternoon elsewhere |
| 0–5° | blue over gold, h 245 | amber to orange, L 0.80 C 0.13 h 55→40 | the golden hour, both ends |
| 0 → −6° | the blue deepening to indigo, L 0.45→0.30 h 265 | the horizon's orange going rose, L 0.70→0.55 h 30→350 | civil twilight: Maghrib's afterglow, Fajr's first light |
| −6 → −12° | indigo to navy, L 0.30→0.20 | rose to violet, L 0.50→0.35 h 330→290 | nautical twilight |
| −12 → −18° | navy | the last violet | astronomical twilight |
| < −18° | the night (§3.1, below) | | |

Morning and afternoon at the same altitude are not identical: the morning
air is clearer and cooler (haze L up, C down by a little), the afternoon
warmer — a small term on `daylight` (0 at sunrise, 1 at Maghrib) keeps the
asymmetry the current anchors have. Dawn and dusk at the same depression
likewise: dawn colder (more blue in the rose), dusk warmer (more orange).

**The night, from the moon:** the ground L between 0.16 (no moon, or set)
and 0.22 (a full moon up), the hue from 270 (moonless, cold) to 262 with a
touch more chroma under a moon (moonlit blue). The stars' opacity the other
way (dense and bright on a moonless night, fewer and fainter under a full
moon) — the hero already draws the field, it only needs the number. The
night's own arc stays — early night still holding the dusk's violet, the
small hours deepest, pre-dawn cooling toward the first astronomical light
(a hint of teal at the horizon from −18° on, which is what a real pre-dawn
does and no palette does today).

**The page, from the sky's light:** a paper, lit. By day L 0.97, hue the
horizon's, C 0.02–0.03 (today 0.00–0.02): enough that a 09:00 page is a
different paper from a 14:30 one. By night the ground is the sky's own top
tone two steps up the ladder. Cards white by day as now; by night a step
above the ground. The ink stays as it is (near-black / near-white, warmed
or cooled with the page). All of it derived from the sky's stops by fixed
offsets, so the AA floors are a property of the offsets and the test still
walks them.

**The accent, from the hour's light** — §4.

**The switch** moves to the sun: light while the sun is above the horizon
(from sunrise to Maghrib), dark from Maghrib to sunrise. Exactly the two
moments the app already cuts the day at and exactly where a person expects
the room to change. The crossfade stays.

### 3.2 Vibrant — the designed day, re-timed

Vibrant is the track that is *not* the sky: a prayer app painted in colours
chosen for the hour's feeling. It keeps its six moods and its anchors —
they are good, and the night's cyan on indigo, the dawn's coral on violet,
the evening's magenta are the reason people pick it — with four changes:

1. **Keyed to the sun, not the passage.** The same altitude/depression
   scale as Realistic decides *which* anchors are mixed and how far — so the
   golden mood is the golden hour (sun 0–10°, both ends), the evening begins
   at Maghrib, the midday mood reaches its deepest at the day's highest sun
   and never arrives in a Tromsø December. The anchors' colours do not
   change; their place on the clock does.
2. **The seams carried round the wheel.** Morning (coral, h 33) to midday
   (azure, h 252): today by way of a plum at low chroma. Instead: the hue
   travels the short way through rose and lilac (as the comment intends)
   with chroma held at ≥ 0.10 for the mids and ≥ 0.13 for the accent on
   the whole path — `mixHexVivid` applied to heroMid and the page tint as
   well as heroTop, and the two "late" anchors re-picked with chroma
   (morningLate's mid #DCD6EC → a lilac at C 0.07; afternoonLate's accent
   #7D3390 kept, its mid #E4D8EA → a mauve at C 0.07).
3. **A night that moves.** Three anchors (early, midnight, late) become
   five with the moon: the ground and the glow lifted a little under a
   bright moon (cyan toward silver), deepened on a moonless night (indigo
   toward black, the stars fuller). Same inputs as Realistic.
4. **The accent track** — §4.

---

## 4. The accent — a rule for each track

The accent is read as text (the next prayer's time, links, the active tab,
the "page 26" on the khatmah card, "Back to today", "Help Mihrab grow"),
so it is the hour's colour on every screen that is not Today, and it must
clear AA on the page and the card at every step — the floors do not move.

**Realistic — the light of the hour, lifted to read.** The accent is the
colour the sun or the moon is *giving* at that altitude (`tintedBy` already
computes the disc's colour; the halo's hue is the same), taken to the
lightness that clears AA on the page: by day, dark enough to read on paper
(L ≈ 0.47–0.52), keeping the hue — a terracotta at a low morning sun, an
ochre at 15°, a clear blue at the high sun (the sky's blue, since the sun's
own light is white then), amber again toward the evening; by night, light
enough to read on navy (L ≈ 0.78), a moonlight blue under a moon, a cooler
violet-blue without. One function of altitude and phase, no picks, chroma
floored at 0.09 so the seams never go slate.

**Vibrant — a companion hue on its own track.** A continuous hue schedule
through the day — night cyan (204) → dawn coral (32) → morning red-orange
(20) → midday azure (252) → golden amber (45) → evening magenta (355) →
night cyan — travelling the short way between neighbours *except* where
that way crosses green (coral → azure), which goes by rose and violet as the
sky does; chroma held ≥ 0.13 everywhere, lightness set per polarity (0.70–
0.87 on dark grounds, 0.46–0.53 on light). The accent then changes as
continuously as the sky, instead of standing at one hex for a whole mood,
and the active tab, the next prayer's time and every link drift with the
hour.

**Both tracks:** `accentBg` (the highlight), `accentSurface`,
`accentSurfaceStrong` and `accentHairline` stay derived from page × accent
as now; `onAccent` from `readableOn`. The countdown's night glow keeps using
the accent. The widgets (`widgetSkyColors`) take the track's accent at the
hour as now.

---

## 5. Past the hero — the hour on the other screens

Principle 5 of the design ("felt, not announced") and the rule in
`sky-palette.md` §2 (chrome may move, reading and data may not) decide the
scope:

- **A breath of sky at the top of every tab.** The hero's gradient is one
  view on one screen; the other five tabs open on a flat page. Proposal: the
  top 72 dp of each tab's page (under the status bar, behind the title row)
  takes the sky's top-to-foot gradient at a quarter of the hero's height,
  fading into the page — the same `frame` the hero publishes, so it is the
  same sky and costs one memoised view per tab. The status bar's ink follows
  it as on Today (`HomeStatusBand` already does the work). Not on the
  mushaf, not inside a dua or a translation card.
- **The tab bar's active tint is the accent** (already) and the inactive
  ink takes the page's muted — unchanged; with the accent on its track (§4)
  the bar moves with the hour by itself.
- **Section headers, the day bar's dot, the rail's fill, the chips' hairline**
  — every place that takes `accent` or `accentHairline` already follows;
  no new wiring.
- **The reader, the duas, the translations stay out**, as the rule says. The
  one thing they may take is the page bar's accent (they do).

---

## 6. Uniqueness, honestly

"A unique feeling each time it is opened" has to come from something real,
or it is noise. Three real inputs give it:

1. **The sun's altitude** (season × latitude × hour): the day's whole
   colour, the golden hour's length (minutes at the equator, hours in a
   northern winter), whether the midday blue ever arrives.
2. **The moon** (phase × up or down × hour): every night of the month a
   different night; the stars the other way.
3. **The twilight's depth**: the dawn and the dusk are long in June in
   Stockholm and short in Makkah, and their colours are the depression
   angle's, so a long dusk lingers in violet and a short one snaps to night.

Not used, deliberately: the weather (no network for the theme, and a cloudy
sky drawn blue is a lie the app has chosen to tell since the hero was
built), the date for its own sake (a random drift is the noise), and the
place's name.

---

## 7. The plan

Four waves, each shippable. Estimates are working days on the Mac with the
emulator sweeps (`~/Documents/mihrab-shots/sweep2.sh`, both tracks, three
cities — Stockholm, Makkah, Jakarta — at three dates: 21 Jun, 26 Oct,
21 Dec) and the audit script in `__tests__/` as the measure.

**Wave 1 — the sun decides (≈2 days).** The altitude/depression scale
(`skyLight.ts` has `sunAltitude`; add `twilightDepth`), the evening switch
at Maghrib for both tracks (new anchor `afterglow`: the dark evening's first
half-hour, the horizon's ember under indigo), the golden hour keyed to 0–10°
at both ends, the day's anchors mixed by altitude with the morning/afternoon
term. Tests: the switch instants (sunrise, Maghrib) at three latitudes;
`expectLegible` on both tracks; the "midday never in a Tromsø December"
assertion. Sweeps before/after. This wave alone fixes F1, F2 and F6.

**Wave 2 — the seams and the accent (≈2 days).** `mixHexVivid` for heroMid
and the page tint; chroma floors for heroMid/page/accent in both tracks in
the test; the two "late" anchors re-picked (Vibrant) and Realistic's day
accents derived from the light (§4, Realistic) with the hue schedule for
Vibrant; the Settings/Log sweep as the check that a 09:00 page and a 14:30
page are two pages. Fixes F4, F5, F7.

**Wave 3 — the night (≈2 days, with the moon's position).** The lunar
position (Meeus low-precision, tested against three cities' rise/set
tables), the night ground and stars by illumination × altitude, the pre-dawn
teal, the five night anchors for Vibrant. This also finishes the hero's
"truth" option from `docs/hero-plan.md` (the moon drawn where it is), since
the same number drives both. Fixes F3.

**Wave 4 — past the hero (≈1.5 days).** The sky band on the other tabs, the
status-bar ink there, the sweep across all six tabs in both tracks; the
`KEYS`/`GLOW` removal from `skyModel.ts` (F9); `docs/design/sky-palette.md`
and `ARCHITECTURE.md` §6 brought up to date; the site's and README's Sky
pictures retaken (the screenshot guide's procedure).

**Deferred, Hassan's call:** how dark the page may go *before* Maghrib (this
plan says not at all — the golden hour is light; the alternative is a
"dimming" from 2° down, a quarter-step toward the evening, which keeps the
crossfade at Maghrib but softens it); whether Realistic's page may take the
tint proposed in §3.1 (C 0.02–0.03) or must stay the near-neutral it is.

---

## 8. Verification, every wave

- `__tests__/skyTheme.test.ts` extended as above, green in both tracks;
  the audit script run and its table read for every passage.
- The sweeps: three cities × three dates × both tracks, Today and Settings,
  laid out as sheets and read against the previous wave's; the two switch
  moments recorded on the phone (the crossfade at Maghrib).
- The phone: the launch picture's look key is keyed by mood — a change of
  mood timing must not make every launch open on a mismatched picture
  (`setLaunchSnapshotLook`, `nightMatters`); the widgets' colours at six
  hours; the full-screen alert's `PRAYER_MOOD` per prayer.
- The contrast floors on a real display: Increased Contrast on, the
  countdown's glow off, every accent text read on the page and the card.
