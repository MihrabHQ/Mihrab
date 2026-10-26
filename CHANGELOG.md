# Changelog

All notable changes to this project are documented here. The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **The IndoPak muṣḥaf** (#109). Settings → Quran → Reading traditions, and the pill in the reader, offer a second way to read Ḥafṣ: the 15-line IndoPak print, 610 pages, line for line as the Taj Company sets it, in the Indo-Pakistani script with its own stop signs and rukūʿ marks. It is downloaded once (about 2.2 MB: the text and its font, from DigitalKhatt under the MIT and OFL licences, fetched from Mihrab's own copy first), checked against the Ḥafṣ text the app carries at every one of the 6,236 ayahs before a word of it is drawn, and can be removed again from Downloads. Each of its 610 pages has been drawn on a phone and checked against the print: every line in its place, none past the margin, the surah endings at the foot of a page set short as the print sets them, and al-Fātiḥah's sixth ayah carrying the print's mark for the disputed ayah end over its number. Every word was also shaped with the text engine of every Android release since 7 and with iOS's, and two faults of Android 10, 11 and 12 are put right there: the numbered medallion with a stop sign or rukūʿ mark after its number came apart into an empty circle beside the number, and the 79 words carrying the madda wājib that those versions do not know (أُولٰٓىِٕكَ, الْمَلٰٓىِٕكَةُ, the opening letters of Maryam and ash-Shūrā among them) were drawn in broken pieces; they are now drawn whole, with the ordinary madda, on the page, in the ayah sheet and on the share card, while copied and shared text stays as written. Recitations, translations, tafsir, bookmarks, the khatmah and your last-read place carry over by ayah, and a reminder, link, widget, the index or the go-to-page field opens the page of the print you read, not the Madani page number; the page bar, the scrubber, the index and the khatmah's "of 610" follow the print. Word-by-word highlighting and tajweed colours stay with the Madani pages for now.

### Changed
- **The Sky theme follows the sun, not the clock.** Its colours were a function of how far through the prayer passage the clock was — the same "midday" at a Stockholm December noon (the sun 7° up) and a Makkah one (80°), and the evening switching on halfway from Asr to Maghrib: three in the afternoon in October, two hours before a June sunset, with the sun drawn high and yellow over a dark page. Both tracks are now keyed to where the sun is: by day its altitude (a low winter sun keeps its gold and haze all day; a high sun reaches a deep azure the north never sees), by night its depth under the horizon through the three twilights, and the deep night's own arc after them. The page turns dark at Maghrib and light at sunrise — the two moments the app's day is cut at — and the golden hour is light to the last minute. A white night (Stockholm in June, the sun never under civil twilight) stays in the afterglow's violet all night, as it does.
- **Realistic is the sky as it is, derived.** The track that used to be a second hand-picked set is now computed from the sun's altitude, the twilight's depth and the moon: the blue overhead and the colour of the horizon for that sun, a page that is a paper lit by that sky (warmed toward a low sun's haze, cooled under a clear one), and an accent that is the hour's own light lifted to read — terracotta at a low morning sun, ochre, a clear blue at a high one, amber toward the evening, a moonlight blue by night. Every latitude and season paints its own day.
- **The night has its moon.** A moonlit night is a lighter room than a moonless one — the ground, the cards and the sky come up a little under a bright moon, the accent goes toward silver, and the stars go the other way, fewer and fainter. And with a location set the moon is drawn where it stands: its height from its altitude, its place from its azimuth, only while it is up — a crescent that sets two hours after the sun now sets two hours after the sun, and a full moon rises at dusk and crosses the whole night.
- **No grey hours.** Mid-morning and the late afternoon were mixes whose horizon and accent lost their colour — a slate accent at nine, a mauve-grey one at half past two, the washed hours of the day. The colours that carry the hour now keep their chroma through every mix, and the accent's hue travels round the wheel away from green: a cyan night and a coral dawn meet in violet, an ochre morning and a blue noon by way of rose.
- **A breath of sky on every tab.** The hour lived in one view on one screen. Under the Sky theme the strip under the status bar on the Qur'an, Tasbih, Duas, Log and Settings tabs is now a sliver of the hour's sky running into the page — the same sky the palette wears, turning with it at sunrise and Maghrib. The reader, the duas and the translations carry none of it.
- **The alert that wakes the phone wears the app's sky.** Under the themes that are not Sky, the full-screen alert drew a two-colour sky of its own that the app itself never showed; it now takes Realistic's at the prayer's hour.
- **Coming back to Today is a run, not a jump.** Back from another app, from the Qur'an tab, from Settings — the hero's clock stops while it is out of sight, and it came back by jumping from the numbers it was left at to now: "Asr in 2h 14m" to "1h 51m" in one frame, the rail a step along, the sky an hour on. After a quarter of a minute or more away it now runs there, as a cold start runs from the prayer: the countdown counts fast and settles on now, the rail slides, the sky turns — from what it showed when it was left, or from the start of the new interval when a prayer has come meanwhile. A few seconds away, it simply picks up. Not under Reduce Motion, and off with the launch animation setting. The app's own work on coming back — the day's resync, the widget, the auto-sync — waits for the run, so it draws every frame.
- **Today opens sooner.** The screen was held back, with the day's times already in hand, for a reading of the stored-times cache that only decides whether to top it up in the background — and that reading first waited for the downloaded correction lists, read one file at a time. The screen is published first now and the top-up decided after it, and the lists are read in one go: on a Pixel 10 Pro the first frame of Today comes about 140 ms earlier, and the hero's launch run with it.
- **The sky's halo stays out of the status bar.** A full moon high in its band, or the noon sun, lit the clock and the battery and the Qibla chip like a torch. The glow now fades out under the top row, so it is a glow in the sky and not on the chrome; the gradient looks exactly as before.
- **The moon comes in with the stars and goes out with them.** It appeared the instant Isha came and vanished the instant Fajr did. It now fades in at its rising point through the dusk, as the stars do, and fades out at its setting point through the dawn.
- **An aimed countdown says so.** After a tap on a row, the hero counted down to that prayer and looked exactly as it does for the next one; a reader who had forgotten the tap saw the app counting to the wrong prayer. The line above the countdown now reads "Isha in · chosen", and a tap on it hands the countdown back to the next prayer, as a second tap on the row does.
- **Android 12 and later: the moment between the launcher and the app is the page's colour.** The system's splash, a grey card for a tenth of a second, is now the page's own dark or light.
- **The muṣḥaf's reading-tradition control is always there.** The header's pill naming the riwayah appeared only once a second muṣḥaf was on the phone, so a reader who had never downloaded one had no way to find them from the page. In its place, beside the back arrow, an open muṣḥaf on its stand: the same size and ink as the controls on the right, always shown, opening the list of traditions with the ones not yet on the device marked "tap to add". Beside an iPhone's vertical bar it stands in the bar's column, under the back arrow. The one-time notice shown on the first switch to a tradition is now the app's own dialog, in the app's theme, rather than the platform's grey box.
- **The page-tone control has an icon per tone.** It cycled through four text characters — a sun, a half-lit disc for sepia, a moon and the letter A — drawn at different weights, and the disc said nothing about warmth. Each stop is now a drawing in the stroke of the controls beside it: a sun for the light page, a sun on the horizon for sepia, a crescent with a star for night, and a half-lit disc for following the app's theme. The page bar's pill carries the same icon beside the name.
- **The town lookup sends a town's precision, not a doorstep's.** With automatic location the app asks OpenStreetMap which town you are in, and it now sends your position rounded to about a kilometre; the prayer times still use the exact position. The privacy policy, the site, the onboarding text and the store listings now list every request the app makes — including AlAdhan receiving your coordinates where it is the source, and the update files read from GitHub — instead of saying coordinates never leave the phone.

### Fixed
- **The moon's dark side is sky.** The unlit part of the moon was filled with the colour at the very top of the sky, while the moon itself is drawn lower, where the sky is lighter and its own glow lightens it more — so on every night but the full moon's the moon was a black disc with a sliver of light on it. Only the lit part is drawn now; the sky shows through the rest, as it does.
- **The stars are a field, not two rows.** On the phone a third of the stars were laid along one line at the moon's height and two along the row of chips, because they were placed by the rule that keeps the sun and the moon clear of the countdown. They have their own spread over the open sky now, in the same places every night.
- **The sun rises and sets.** Through the whole of the dawn and the last minutes before Maghrib the sun stood whole on the horizon line — a full disc four minutes before sunrise. It now comes up out of the horizon, half out as sunrise arrives and clear of it over the following quarter of an hour, and goes down into it the same way at Maghrib, finishing under it as the dusk begins — on Today and in the launch run alike.
- **Today's notices keep clear of the iPhone's vertical bar.** Beside the bar, a notice at the top of Today — the clocks having changed, the source falling back, a permission turned off — ran under it, and its Dismiss with it, so it could not be closed. The notices now end where the bar begins, as the rest of the page does.
- **Today's sky reaches the top of the screen again.** A band of the page's own colour, a dozen points tall, ran across the top of Today above the sky — white over a daytime sky, a flat navy at night. It was the room kept between the notices and the countdown, kept even with no notice to show. It is only kept now when a notice is there.
- **Today's countdown stands on one line.** The seconds sat high beside the hours and minutes, on the phone and the iPad alike, and the time of the prayer it counts to was pressed against them. The countdown is now set on one baseline, and the time stands at the far end of the line, over that prayer's name at the end of the bar, on the same baseline — on the right in English, on the left in Arabic.
- **The muṣḥaf opened from a reminder or a widget has a way back.** With the app closed, the khatmah reminder or a reading widget opened the reader with nothing under it: no back arrow in its header, and Android's back closed the app. A page opened that way now has its tab under it (the Qur'an tab under the reader, Today under the month and the Qibla, Log under fasting, Settings under pairing and backups), so the arrow is there and back lands where it would by hand.
- **A fast taken off a day stays off.** Unmarking a fast keeps a record of the removal so it reaches your other devices, and the Log's grid and the month's "Fasted" count were reading that record as a fast: the day kept its fasted ring, and "Mark as fasted" wrote onto the removed record without bringing it back, so nothing on the screen could change it. The grid, the counts and Home now skip removed fasts, and marking the day again restores it.
- **The two pages of a spread stand level.** Unfolded, on an iPad or a Mac, the right-hand page sat about a line lower than the left: the row over it carries the juz or surah name and the row over the facing page was empty, so shorter. The empty row now keeps the same height, and in fullscreen with the reading lock on, the badge's height too.
- **The three Quls are read one surah at a time.** The morning, evening, after-prayer and bedtime cards for al-Ikhlāṣ, al-Falaq and an-Nās showed the first line of each, run together. Each surah is now a segment of its own with its whole text from the app's muṣḥaf, the basmalah above it, its pronunciation and its meaning; where it is "three times each" the counter counts that surah and moves on to the next when it is done.
- **The Juz tab answers the search field.** A name typed on the Juz tab — "Kahf" — left all thirty parts standing under "0 ayah matches", as if none held al-Kahf. It now keeps the parts that hold a matching surah, or the part whose number was typed.
- **Foldables: the Quran reader follows the fold.** Opened on the cover screen and then unfolded, the reader stayed the phone's — one page zoomed to the full inner width, five lines a screen — and opened unfolded and then folded, it stayed the two-page spread on the cover screen without the page bar. Folding or unfolding now swaps to the reader the screen is for, on the page you were reading.
- **Onboarding shows the times Today shows.** "You're ready — Today in Stockholm" and the madhab step calculated on the phone, and with a published source (Islamiska Förbundet, Habous, the Algerian ministry, MUIS, JAKIM) that could be a minute off: Asr 2:49 there, 2:50 on Today. They now show the source's own day once it has answered. Where the source publishes one Asr, the madhab step shows that one time on every row and says so, instead of a Hanafi time Today never shows.
- **iPhone: the launch no longer opens on a zoomed-in countdown.** The kept picture of Today the app opens on drew its posed countdown three times its size on a 3× screen, then cut to the real one once the app had started. It is drawn at the screen's scale now, so the launch opens on Today as it will be.
- **Tilawah's page card shows the muṣḥaf you are reading.** With a riwayah chosen whose text is not on the phone (Warsh set on another device, say), the reader shows Ḥafṣ but the card under the player drew the absent muṣḥaf: no text, no message, a blank card under "p. 499". It now follows the muṣḥaf the reader would show, and a riwayah on the phone is read in when the card is opened first, before the reader has been.
- **The ayah sheet shows the muṣḥaf you are reading.** With a riwayah chosen whose text is not on the phone, the reader shows Ḥafṣ, but the ayah sheet set the ayah in plain text and its Tajweed tab found no rules. It now follows the muṣḥaf on screen, as do the tajwīd guide and settings.

### Added
- **The full Eid takbir.** Next to the short takbir, Eid now has the full form recited before the prayer: the takbir, the additions al-Shāfiʿī recommended ("Allāhu akbaru kabīrā…", "lā ilāha illā-llāhu waḥdah, ṣadaqa waʿdah…"), and the salawat it is commonly closed with, with its sources.
- **Foldables held half open.** As a book, Today becomes two pages — the day on one, the Quran shortcut and the day's summary on the other — and the other screens, sheets and dialogs keep to one page instead of lying across the crease. Standing on a table, Today's sky fills the upright half down to the hinge and the prayer rows lie on the flat half. The tasbih stands its count up the same way, and the flat half becomes the pad you tap, with the next set and the controls under it. Unfolded flat, Today's sky runs to both edges of the screen with the countdown and the times kept to a phone's measure in the middle, the app's bottom sheets — the settings pickers, the location switcher and the Quran's dialogs among them — keep a phone's width in the middle of the screen, a wide screen gives the location name on Today room before it is cut short, and the walkthrough centres its steps. Android only; folded, and on every other phone, nothing changes.
- **iPhones with a vertical bar (iOS 27.1).** Where the system keeps a bar down one side of the screen, the app's tabs move into it, Today's location and Qibla buttons sit at its top, and the reader's back, recitation and page-tone buttons with them; pages, sheets, dialogs, pickers and the walkthrough stop at the bar while Today's sky runs on under it; the muṣḥaf takes the whole width beside it and scrolls down the page. Every other iPhone, the iPad, the Mac and Android are unchanged.
- **Play this ayah, and Play on repeat.** The ayah sheet's Play section has three ways to hear the ayah: Play from here, Play this ayah (once), and Play on repeat — the ayah over and over until stopped, the lock screen and the screen going off included; the mini-player shows ↻ ∞ while it loops, and anything else played, or stop, ends it. "Repeat this ayah" was the memorisation drill in disguise: it played the ayah the number of times the repeat setting said, which with the setting at 1 was once.
- **Hide, next to Cancel, on the download strip.** A long download (the mushaf's pages, a whole reciter) no longer has to sit across the top of every Quran screen until it is done: Hide puts the strip away for the rest of the run; the download goes on, the notification and the settings rows still count it, and the next download brings the strip back.
- **The Sky theme comes in two colours: Vibrant and Realistic.** With Sky picked under Appearance or in the walkthrough, a "Sky colours" choice appears under it, the way the colour theme does under the other looks: each colouring shown by its six skies, tapped to pick. Vibrant is the theme as it first shipped: bold, representative colours for each hour. Realistic follows the sky as it looks: a navy night under a moonlit blue, a slate-blue dawn with a rose horizon, a clear blue day, an amber afternoon, a blue evening over the red horizon. It sits over a page that is nearly neutral, tinted only toward the hour, with calmer accents. Both change at the same moments of the day and meet the same contrast floors, and the full-screen alert and the widgets follow the choice. Realistic is the default.
- **Automatic knows the country by its border, not by a rectangle.** It picks a country's own source — Sweden, Morocco, Algeria, Singapore, Malaysia, Indonesia, Diyanet in Türkiye — from the country's outline (Natural Earth, simplified to a few hundred metres, with the few places it is itself off by a town corrected), so a border town, a strait or a split island gets the source of the side it is on. The rectangles it replaces gave Islamiska Förbundet's times to Riga, Turku, Tampere, Vaasa, Narvik and Bodø, Morocco's to Gibraltar, Tarifa and northern Mauritania, and Morocco's to Tlemcen; Haparanda and Tornio, Johor Bahru and Singapore, Tawau and Nunukan on Sebatik, Kaş and Kastellorizo, Brunei and Timor-Leste are now each their own. Northern Cyprus now gets Diyanet, which lists its districts, and the Republic of Cyprus does not. Ceuta and Melilla stay with Morocco's ministry, which publishes them. The same outlines choose Automatic's calculation method, so the two always agree.
- **Each location keeps its own prayer-time source.** "My location" and every saved location remember the source picked for them — or Automatic — on their own: changing it for one changes nothing for the others, and switching location brings that location's choice back (the source picker says which location it is choosing for, and the location lists show each one's source). A source picked by hand is kept for as long as it covers the location; when it does not — "My location" has travelled out of its country, or a place was picked outside it — that location goes back to Automatic, which picks the source that fits best there (it used to fall to AlAdhan). Settings from before start every location on the choice they all shared, so nothing changes until you choose.
- **The app says when a calculation is not current, and keeps its corrections current by itself.** Sweden's, Diyanet's, Morocco's, Algeria's and Indonesia's times are each authority's method with a correction list, and a list covers the dates the authority's tables did when it was made. A newer list for the method the app computes is now downloaded from MihrabHQ/mihrab-methods within a day and put in force (the file must match the certification that names it, and the times stored under the old one are computed again). Where the phone cannot be current it says so — on Today (dismissible), under the source in Settings, and on the month table: past the list's last day (the method alone, on the published minute nearly always and on a rare day a minute off); when the authority has published tables still being checked; and when the method itself has been updated and Mihrab needs updating.
- **Diyanet as a prayer-time source, worldwide, on Diyanet's printed minute.** Diyanet publishes a table for every place it lists: Türkiye's districts and thousands of places abroad. All of them use one method, the 2021 Prayer Times Congress method, the same one behind Sweden's tables. The phone now gives the table of the Diyanet place nearest you: the method at that place's point, with Isha at its country's angle (16° in most of Europe, Russia, Central Asia, China, the US and Canada; 17° elsewhere). Abroad that is the place's own point. In Türkiye and Northern Cyprus each prayer is calculated at a point of its own in the district, and those points shift slightly from year to year, so the app carries each district's points per year. A correction list covers the few times Diyanet's program rounds the other way. Checked against Diyanet's tables, 2024–2027, for all 880 districts of Türkiye and Northern Cyprus, Sweden's 159 places and 7,252 places in 197 other countries — 8,291 of the 8,528 places Diyanet lists: every time on the printed minute (0 of 69,999,603 off; 99.987 % by the method alone). 192 of those tables are printed on a clock other than their place's zone — Alberta's keep summer time from 2026, Mexico's had it in 2025, Queensland's and Western Australia's have it in 2024, 2025 and 2027, Xinjiang's are Beijing time — and the method reads each one's clock off the table, at the place's own point. Further from any listed place, the method is calculated for your own location, and Settings says so. Also worked out: from about 44.4° north, midsummer is taken as the takdir's day where the dawn still forms; and a table prints the whole day in that day's clock. Automatic now picks it in Türkiye and Northern Cyprus, and anywhere else within reach of a place Diyanet lists (25 km) where the country has neither a source nor a calculation method of its own — London, Paris, Berlin, New York, Vienna and Amsterdam among them, but not Mecca, Cairo, Tehran or Moscow — unless you have chosen a calculation method yourself, which it would set aside; further from any listed place Automatic stays with AlAdhan. A pinned Diyanet is never redirected. Hanafi Asr is a toggle.
- **Türkiye's method (13) is now Diyanet's, computed on the phone.** "Turkey (Diyanet)", and the Automatic method in Türkiye, used to be asked of AlAdhan, whose version uses Isha 17° everywhere and none of Diyanet's summer rules. It is now the same calculation as the Diyanet source, and needs no network.
- **A prayer-time source from a newer version no longer strands the settings.** One picked in a newer build and brought over by sync or a backup now lands on Automatic. Before, it fell to the on-device calculation on every fetch, under a name the screens could not show.
- **Indonesia's own calculation method — Kemenag's, as its tables are computed.** Method 20 now computes what the ministry's tables for all 517 regencies and cities show: a precise sun at each prayer's own moment, Fajr 20° and Isha 18°, sunrise and Maghrib at −1° (−2° in its highland regencies), and every time rounded up after the ministry's margins. The phone's times are on the ministry's printed minute for 99.47 % of 266,772 times, and every one within a minute.
- **Morocco's own calculation method — the Ministry of Habous and Islamic Affairs's, as its tables are computed.** Method 21 now computes what 77 days of the ministry's tables for its 164 located cities show: a precise sun taken at each prayer's own moment, Fajr 19° rounded down, Isha 17°, Dhuhr five minutes after noon, and sunrise and Maghrib each with the city's own horizon (the ministry's eastern and western horizons differ), the sun's semidiameter taken from its distance that day. The method alone is on the printed minute for 99.1 % of 75,768 times; a correction list of 665 times covers the rest, so at the ministry's cities every time is the printed one (0 of 75,768 off, 27 August → 11 November 2026). The old stand-in was up to three minutes off at hill towns.
- **Algeria's own calculation method — the Ministry of Religious Affairs and Wakfs's, as its timetable is computed.** Method 19 now computes exactly what the Ministry's table shows, read off all 68 cities of its 1448 AH table: the Sun from NOAA's formulas (which fit the table far better than a precise ephemeris), Dhuhr at the transit, every other time from the declination at that prayer's own moment, Fajr 18° and Isha 17°, Asr from the noon shadow with its sign, Maghrib three minutes after sunset, and every time rounded up to the minute. The phone's times are on the Ministry's printed minute for 99.37 % of 101,184 times, and every one within a minute; the rest fall within about a second of a minute's edge.
- **The app's methods are checked against the authorities' tables every week** (`tools/verify-methods`). Each table the builders fetch — Sweden, Morocco, Algeria, Singapore, Malaysia, Indonesia — is compared day by day with what the phone computes for that authority; the report tells a wrong angle from a wrongly placed town from a single wrong day, a known difference can be accepted with a note, and an authority that disagrees gets an issue that updates while it does and closes when the two agree. The reports are published under `data/prayer-times/verification/`. What the first run found is now in the method: **a town on a hill** — the Moroccan ministry lowers the horizon for every city by its height, JAKIM computes its five summit zones at altitude, Kemenag gives 56 highland regencies a flat four and a half minutes — so the places carry their heights and the stand-in's sunrise and Maghrib move with them, computed for the listed place rather than the reader's own spot; **32 Kemenag regencies** moved to the point the ministry computes them at (an archipelago's seat, not its centroid); and **the Algerian ministry's Asr**, which takes the noon shadow with its sign, so south of the Tropic its Asr comes early about the June solstice — thirteen minutes at In Guezzam — and the phone's now does too. All six tables agree with the phone within a minute on every row, and to the minute on 90–100 % of them.
- **Sweden's own calculation method — the International Prayer Times Congress method, as Diyanet computes it.** Method 24, "Sweden (Islamiska Förbundet)", under Calculation method, and what Automatic computes in Sweden. Islamiska Förbundet's tables turn out to be Diyanet's own, republished; the method is the one the Istanbul congress of 2021 set down (Fajr 18°, Isha 16°, sunrise seven minutes early and Maghrib seven late, Dhuhr five late, Asr four late; the day and the night never shorter than five hours; where the 18° dawn no longer forms, a third of the sharia night carried through the summer and eased in over twenty minutes) — together with everything the published text leaves unsaid, read off Diyanet's genuine tables for all 160 Swedish places, 2024–2027: the exact sun Diyanet uses (Meeus's elements, the true longitude, the apparent obliquity, taken once a day at 0h UT), the points it computes each town at, Asr printed at Dhuhr when it never forms, and floored times that never step back through the midnight-sun season. The phone's times are on Diyanet's printed minute for 99.94 % of 1.39 million times, and every one within a minute; the rest are a fraction of a second the other side of the rounding point. Until now the stand-in was the Muslim World League's angles — an hour from the table on a midsummer night.
- **Singapore, Malaysia and Indonesia as prayer-time sources, 1:1 from the authority.** Singapore's MUIS timetable, from the government's open-data portal; Malaysia's JAKIM e-Solat table for the zone you are in, all 59 zones; Indonesia's Kemenag timetable for your regency or city, all 517. All are served exactly as published, bundled in the app for the published window and refreshed weekly from the project's open datasets; Automatic picks them there. Past the window — JAKIM publishes the current year only — the authority's own method is calculated on the phone, never a neighbour's.
- **The app says when it is standing in for a table.** A source that serves an authority's table can have no row for the day — Malaysia's ends every 31 December, a regency before its first download, any date past a published window — and the phone then computes the authority's own method. The provider row in Settings and the month table's subtitle now say so; before, only the hidden statistics panel did.
- **Custom angles.** A method of your own: the Fajr and Isha twilight angles a mosque publishes (“we use 16° and 14°”), between 10° and 24°, calculated on the phone and asked of AlAdhan as its method 99.
- **The summer-night rule is a setting.** North of about 48° the sun does not sink far enough on summer nights for Fajr and Isha, and a rule stands in: AlAdhan's three — angle-based, middle of the night, seventh of the night — under its names. Angle-based by default, and now the same online and on the phone: the phone computed middle-of-the-night while AlAdhan served angle-based, an hour apart at Stockholm on midsummer night.
- **Six more calculation methods:** Dubai, Malaysia (JAKIM), Indonesia (Kemenag), Tunisia, Portugal and Jordan — every national convention AlAdhan has, each calculated on the phone too, within a minute of AlAdhan.
- **Türkiye Takvimi (namazvakti.com) as a prayer-time source.** The cautious times many Turkish communities follow, with their own Imsak, temkin and high-latitude rule, for every city the site lists — worldwide. The app finds the nearest listed city within 75 km from a city index the project keeps current, fetches that city's year once and keeps it; only the city's number is sent to the site. Without the site the same calendar is computed on the phone, within a few minutes of the published tables. Hanafi Asr (asr-i sani) is a toggle. Where the site has no city with times near you — it publishes nothing north of about 62° — Settings and the list of sources say so, as they do for the national sources, and the calendar's method is calculated on the phone.
- **The Sky theme.** Appearance has a fourth look beside light, dark and system: the whole app painted from the sky over the countdown, so the page, the cards, the controls, the reader's chrome and the widgets wear the hour — a cyan-lit indigo night with a field of stars, a violet-and-coral dawn, a cream morning, an ice-and-azure midday, a golden afternoon, a magenta-on-purple evening — mixed minute by minute between anchors so no hour is a grey in-between, and held as one look whether the phone is in light or dark mode. The sun, the moon and the stars are drawn in the hour's own light; the next prayer's row and the selected segment sit in their hour's composition and clear AA; a flip of the palette's polarity crossfades rather than cuts. It is the look a new install starts in; the walkthrough's theme control opens on Sky with its six skies under it, and they go when another look is picked, the colour theme coming in their place. Somebody who was here before it keeps the look they had and is shown the six skies once on the home screen — Try Sky, or Not now.
- **Five prayers, five skies on the full-screen alert.** Under the Sky theme the Android alarm screen takes the hour of the prayer it is sounding: Fajr's dawn, Dhuhr's midday blue, Asr's gold, Maghrib's magenta, Isha's indigo.
- **The launch run is a setting, on by default.** Off, the picture the app opens on is the screen as it was left, and it simply fades into the live one. On, a launch opens on the last Today screen, posed at the prayer it counts from, and the countdown, the rail and the sky sweep the whole way to now.
- **Log: "Mark late logs as late"** (#74). Optional: a log from a notification, the alarm or a widget in the second half of the prayer's window is recorded late rather than on time.
- **Prayer widget (Android): with the times hidden, the next prayer fills the card.** It grows into the segment the table would have taken — the name and the time as large as the row allows, the countdown fitted after them, never bigger than the name — so the card is not a headline over empty space.
- **The reading lock, for every hand and every platform** (#75, on #72). The touch lock was a sub-switch of the volume buttons — Android only, and it made the whole page dead. It is its own switch now, in Settings → Quran, on iPhone, iPad and the Mac too, and a lock button on the muṣḥaf — in the page bar beside ⛶, in the header on the iPad and the Mac — with "Show the lock button": off by default, turned on with the volume buttons, and always shown on a locked page. A locked page does not turn or scroll away under the hand, a tap does not hide or show the controls, and the footer and the jump do nothing — but a tap or a hold on a word still opens its āyah (tafsir, translation, play), because that is what somebody holding a page is there for; "Also ignore taps on the words" freezes the page entirely, for a pocket or a child. Unlocking is a hold, never a tap: in fullscreen a padlock sits in the band beside the page number and a disc fills under it for a second and a half; the bar button unlocks the same way. A touch on a locked page says so — "The page is locked. Hold the lock to unlock." — and the first lock explains itself once. On Android with the buttons turning pages, they still turn a locked page. A swipe along a line, locked or not, no longer counts as a tap on the word it ended over.

### Changed
- **On its side, a phone reads the mushaf fullscreen.** Turning a phone to landscape in the mushaf goes fullscreen, and turning it back returns to how upright was (windowed, if it was). Fullscreen can still be left on its side with ✕, a tap or back; the next turn starts fullscreen again. Tablets are unchanged.
- **On a screen too short for the page, the page scrolls instead of shrinking.** Upright, a mushaf page is fitted to the screen, and a short one — a small phone, the player up, a split screen — pulled its lines together until marks ran into the next line and the outermost were cut (on the Warsh, Qālūn and Shuʿbah pages the type shrank instead). The page now keeps its readable size and the print's line spacing, the same fifteen lines broken where the book breaks them, and its column scrolls, as it does on its side; the header, the page bar, the player and the download strip stay outside it, and the recitation scrolls the page along. A screen tall enough for the page is unchanged.
- **"Hide while reviewing" is offered only in the translation view.** It masks each ayah card's Arabic or translation until tapped, which the mushaf has no cards for; the ayah sheet opened from the mushaf showed it anyway, as a setting that changed nothing.
- **The range player ends at the ayah you opened, and sits with its repeats.** Under an ayah's sheet, "Play a range" is 1 to that ayah (it was 1 to the end of the surah), and it comes right after the speed, with "Repeat the range" and "Repeat each ayah" under it and the pause between repeats after them — the range and how it repeats in one place, rather than the repeats under a separate heading above it.
- **Portrait pages start at their own ink.** Above the first line and below the last of a portrait page sat a reserve for the tallest mark in any page's font, half of the stretch that fits fifteen lines to the screen, and the font's ascent past what the page's first line actually reaches — a finger's width of nothing at the top and bottom of every page. Each page's own reach is now measured (for the Hafs page fonts, glyph by glyph; for the Warsh, Qālūn and Shuʿbah pages, by shaping every ayah on the edge rows), and, out of fullscreen, the page is placed so its first line's ink starts a hair below the header and its last ends a hair above the page bar, with the room given to the lines; the gaps above and below the page are smaller too. Fullscreen is as it was.
- **Automatic keeps a country's own calculation method.** In Saudi Arabia, the United Arab Emirates, Qatar, Kuwait, Bahrain, Oman, Iran, Iraq, Jordan, Egypt, Pakistan, India, Bangladesh, Russia, Tunisia and Portugal, Automatic gives AlAdhan's times with the country's own method (Umm al-Qura, the Gulf's, Karachi's and so on), as it did before Diyanet was a source, rather than Diyanet's table for being near a place Diyanet lists. Mecca, Medina, Riyadh, Dubai, Doha, Tehran, Najaf, Amman, Karachi, Delhi, Moscow, Cairo, Tunis and Lisbon are among the cities this moves back. A Diyanet you picked yourself is kept.
- **A calculation method you chose is kept in Türkiye, Malaysia, Singapore and Indonesia.** Automatic gave Diyanet, JAKIM, MUIS or Kemenag there even when you had chosen a method by hand, and set your method aside without a word; with a method of your own it now computes that method there, as it already did near a place Diyanet lists. With the method on Automatic nothing changes.
- **Where Diyanet's times are used only because it lists a place near you, the calculation method can be chosen.** Settings hid the method under Diyanet; outside Türkiye, where Automatic picks Diyanet for a listed place nearby, the method is offered, and choosing one gives AlAdhan's times with it (Automatic again goes back to Diyanet).
- **Hanafi Asr with Indonesia's times.** Kemenag's times are the ministry's method computed on the phone, so the Hanafi Asr switch is now offered there and gives the Hanafi Asr from the same method; the other times stay the ministry's. Singapore's and Malaysia's tables print a single, Shafi'i Asr: with a Hanafi school chosen, Settings now says so where the switch would be.
- **PrayTimes.dev is no longer a source.** Its public API has gone (every request is a 404; prayertimes.dev is now a UK-only service behind an API key), so a phone set to it was quietly calculating on the device under PrayTimes.dev's name. A location set to it moves to Automatic, which picks the source that fits where it is.
- **The home screen's sky, in every look.** The hero under System, Light and Dark now has the Sky theme's design — the horizon's glow low in the sky, the fuller stars, the countdown's halo by night — in Realistic's colours, and runs into the page instead of stopping at it with an edge; where the page is the other polarity (a night sky over Light's paper), the whole countdown stays on the sky and only the band under it fades. Realistic's sky is a little richer — a deeper blue, a warmer glow at the horizon — over the same calm page. A change of Sky colours now repaints the hero at once rather than at its next minute.
- **The Mac and iPad muṣḥaf: one tone control, a fullscreen button, the reading tradition over the page.** The page tone is changed from the header's chip only; the page no longer carries a second tone pill in its corner. The header chip gains a fullscreen button: the spread reader had none, only a tap on the page's margins or header strip. With the surah index showing, the reading tradition's chip sits on the same bar as the page's controls, at the start of the page opposite them, rather than above the surah list beside the back arrow.
- **Sky theme: the countdown's glow is no longer cut square.** By night the digits' halo was clipped to each number's box, a hard edge most visible to the right of the minutes on the Mac.
- **Morocco, Algeria and Indonesia: the ministries' times, calculated on the phone, on their printed minute.** Each is now computed with the ministry's own method at the point it computes the nearest listed place, plus a small correction list for the few times its program rounds the other way: 665 for Morocco, 642 for Algeria, 84 for Indonesia (where Karawang's Asr, Maghrib and Isha are now computed at the second point the ministry uses for them). Over the tables checked, every time is the printed one: 0 of 75,768 off for Morocco, 0 of 101,184 for Algeria's 1448 AH year, 0 of 266,772 for Indonesia. Nothing is downloaded for these countries any more, and the app no longer bundles their tables, so they work offline for any date. Earlier versions, which read Sweden's, Morocco's and Algeria's times from files in this repository, now find there what the current app computes (`tools/compat-feed`, refreshed daily, three months ahead), so they keep the printed minute too and never fall back to asking Islamiska Förbundet's site. The statistics panel no longer lists their servers.
- **Morocco's, Algeria's and Indonesia's methods are the ministries' own wherever they are used.** Picked by hand under Calculation method (21, 19, 20), or by Automatic in those countries, with any source: inside the country they are now computed for the nearest listed city or regency with the ministry's correction list — the same times as the Morocco, Algeria and Indonesia sources — and elsewhere for your own location. Morocco's and Indonesia's methods were asked of AlAdhan, whose versions are the angles alone. Times stored before are recomputed.
- **Sweden: Islamiska Förbundet's times, calculated on the phone.** Sweden's times are now computed on the device with Diyanet's method for the nearest of Islamiska Förbundet's 108 cities, with a small correction list for the handful of times Diyanet's own arithmetic rounds the other way — on the printed minute for every time of Diyanet's and Islamiska Förbundet's timetables over 2024–2027 (1.39 million times; 99.98 % by the method alone). Nothing is downloaded for Sweden any more, and it works offline for any date. The method is open: [MihrabHQ/mihrab-methods](https://github.com/MihrabHQ/mihrab-methods). Ystad is computed where its timetable is (43 km west of the town), and Torsby's point is refitted.
- **Türkiye Takvimi's yearly tables from Mihrab's own mirror.** A daily job now mirrors namazvakti.com's year for every city it lists (about 118,000), packed small and published with this repository's releases; the phone reads its city's year from there and asks the site itself only for a city the mirror does not have yet. The city index the phone finds its city in is now complete (121,775 cities located).
- **Every prayer-time table comes from Mihrab's repo, never from the authority directly.** Sweden, Morocco, Algeria and Indonesia serve their mirrored tables again (the app's own calculations, checked weekly, now fill only the days a table does not have, until each is ready to take over — [the plan](docs/prayer-times-sources.md)); Sweden no longer reads Islamiska Förbundet's widget from the phone. Malaysia and Singapore read the repo first and ask JAKIM's e-Solat or data.gov.sg themselves only for a day the repo's copy lacks; past that, Malaysia computes the zone's own times.
- **Malaysia's calculation by JAKIM's zones.** Past the year JAKIM has published, the phone now computes a zone's times as JAKIM's tables show them made: each time the latest of the times at a few points of the zone (the earliest for sunrise), with the precise sun, a margin and the minute rounded up — and Johor's and Pahang's Asr from the noon shadow of 00:00 UT, as Kemenag's. Fitted per zone and prayer on JAKIM's 2025 and 2026 years, it is on the printed minute about 95 % of the time and within a minute for 99.9 %; the old stand-in, one town's point with fixed angles, was within a minute nine times in ten and up to ten minutes off. Some states' Dhuhr and Asr, and Kedah's times, follow a rule not yet read. JAKIM's table is still what is served while it covers the day.
- **Indonesia's calculation on Kemenag's minute, near enough every time.** Kemenag's method now takes the precise sun (as JPL's to a tenth of a second; Meeus's short series was a second out, and that alone left one time in two hundred a minute off), Asr's noon shadow from the sun's declination at 00:00 UT of the day — an almanac's daily entry — with the hour angle from the sun at Asr and a whole two-minute margin like the rest, and every regency at the point its table fits, latitude and longitude together. The phone's times are on the ministry's printed minute for 99.965 % of 266,772 times (94 off, was 1,418), and every one within a minute.
- **Türkiye Takvimi's calculation on the site's minute.** The phone's calculation of the calendar now takes a precise sun (VSOP87, as JPL's to a tenth of a second — Meeus's short series drifted a second over the year, which alone put one time in fifty a minute off), Asr's shadow from the noon sun, and the site's own rule for the first and last held summer nights (Cologne's autumn resumed a night late). Where the phone holds a year the site published for the city, it reads the city's own point and temkin back from it — the site's files cut a point to the arc-minute, and it computes with a finer one — and computes there: across 118 saved cities from 42°S to 60°N the result is the site's printed minute for all but 418 of 301,392 times (0.14 %), 46 cities with none off.
- **Türkiye Takvimi computed as the site computes it.** Without the site's year — offline before the first fetch, past the year it serves — the phone now computes the calendar's own rules, read off a year of 54 cities: one exact temkin per city (the time the solstice sun takes to sink 1.462° at its 250 m, 1.719° at 500 m), Sabâh at 18° with none, sunrise and Maghrib two minutes beyond the level horizon, every time rounded the site's way, at the city's own point. It lands on the site's minute about 95 % of the time and within a minute otherwise — the site's files give a city's point only to the arc-minute; before, about half the times were a minute or more off.
- **Indonesia's times are the app's own calculation**, as for Sweden, Morocco and Algeria: Kemenag's method for the nearest regency, at the point the ministry computes it, offline and for any date — no longer only the months the ministry has published. Its table is kept for the weekly check, which now holds the method to the minute.
- **Morocco's times are the app's own calculation**, as for Sweden and Algeria: the ministry's method for the nearest listed city, at the point and horizon the ministry computes it, offline and for any date — no longer only the month the ministry has published. Its table is kept for the weekly check, which now holds the method to the minute.
- **Algeria's times are the app's own calculation.** As for Sweden: the phone computes the Ministry's method for the nearest listed city, at the point the Ministry computes it, offline and for any date — no longer only until the end of the published Hijri year. The Ministry's table is kept for the weekly check, which now holds the method to the minute.
- **Sweden's times are the app's own calculation.** Rather than serving Islamiska Förbundet's published table, the phone computes Diyanet's method for the nearest listed city, at the point Diyanet computes it — offline, for any date, and without the site's faults. The site's and Diyanet's tables are kept for the weekly check, which now compares against Diyanet's own tables to the minute and sets aside rows where the site's copy differs from Diyanet's.
- **Muṣḥaf: fullscreen in the page bar, the page tone up in the header.** The two buttons swapped places, each restyled for where it now sits: fullscreen is the one toggled daily, so it is at hand in the page bar; the paper/sepia/night tone is a setting made once, so it lives in the header.
- **The page's accent is the page bar's.** The frame, the beginning of a sūrah and the marks are painted from the theme rendered for the PAGE's mode, as the page bar already was, so a night page under a light app no longer mixes two accents.
- **Launch: faster and truer.** React Native starts from `Application.onCreate` on a window start, with a shorter grace and fade before the hero runs — the live screen about 60 ms sooner and the run about 140 ms sooner on a Pixel 10 Pro. The kept picture matches the system language, the clock, the Material You colour and the system night mode (the last only when the theme follows it); a window is a launch, so the app opened again after being swiped away gets the picture and the run; a widget's tap is a plain launch and gets them too. The run is timed by the frames drawn rather than the clock, so a stall of the JS thread pauses it instead of eating it, and the sky is animated off the JS thread by one native-driven value.
- **Sunnah: Isha carries one sunnah muʾakkadah** — the two rakʿāt after it — so the full rawātib make a complete day of six (#73).

### Fixed
- **The namazvakti.com mirror no longer fails on cities the site has no table for.** The site answers some cities — the Samoan places on the date line — with the city's header and no year, and fifty of those at the head of a run stopped it as "the site is failing". They are now recorded as having no table and asked again when due, and the run carries on with the rest.
- **Fullscreen, rotation and the player no longer leave the page or the rail drawn where the last layout had them.** Going fullscreen during a recitation could leave lines of the page over the surah band or in the wrong order, and turning the phone and back could leave the page rail across the middle of the page with the fullscreen button gone, until the page was turned. Each layout now gets the page and the rail drawn afresh for it.
- **A phone in Morocco with stale zone data is told what to do (#82).** On a phone whose zone data still runs Morocco at GMT+1 — every Huawei without updates among them — the clock runs an hour ahead of the ministry's and the app's times, written on that clock, read 06:09 for the ministry's 05:09. Today now says so, once, with the setting that puts it right until a software update does: the time zone set by hand to GMT, which the reporter found himself. A phone whose clock was set back by hand instead already gets the ministry's times.
- **The mini-player's chips no longer slide under the ⏮ button.** With a long reciter name and the page, speed and repeat chips all showing, the last chip was drawn behind the transport. The name now gives way (ellipsised) and the chips keep their size.
- **The surah name in a page's band sits in the middle of the band.** It was drawn low, in every riwayah: the band centred the font's box, whose middle in Amiri Quran is well above where the letters sit, so a name with a letter under the line (the ح of نوح, the ج of الجن) ran into the art, and the tails could be cut flat along the inner rule. Each name's ink is now measured and centred, and sized so the tallest name fits.
- **The Republic of Cyprus is no longer given Diyanet.** Automatic gives Diyanet to a place within 25 km of one Diyanet lists, and Northern Cyprus's districts brought Nicosia south of the line, Larnaca and Limassol within reach, though the Republic does not pray by Diyanet's tables. They get AlAdhan now; Northern Cyprus keeps Diyanet, and a Diyanet picked by hand is kept.
- **Imsak is never a time the clock skips.** Imsak is ten minutes before Fajr, and it was taken off the clock face: on the morning the clocks spring forward, a Fajr just after the change put Imsak inside the hour that does not exist (Fajr 03:05, Imsak 02:55). The phone's own calculation now takes the ten minutes off Fajr's moment, which reads 01:55 that morning and the same as before on every other.
- **Türkiye Takvimi no longer spends seconds on every launch working out a city's point.** Where the site's year has no row for a day, the calendar is computed at the city's own point, fitted from its year — about six seconds of a phone's time per city, spent again on every launch. The fit is now kept beside the city's year and redone only when the year is fetched again.
- **Sweden's source keeps the printed Asr beyond the listed cities too.** Islamiska Förbundet's, Morocco's and Algeria's ministries each print one Asr, the standard shadow, so with those sources the Hanafi switch is hidden and Settings says so to a Hanafi reader. Past Sweden's listed cities, though, the stand-in computed the Hanafi Asr while the note said it was not shown. It gives the standard one now, as the listed cities do.
- **Summer time no longer counts as "the clocks changed", and after a flight the place you landed in is the one checked.** The check behind the "clocks changed" notice compared only the phone's UTC offset, so every change to or from summer time showed the notice and dropped the stored year of times for the current place — costly offline — though nothing in them was wrong. It now compares the phone's time zone and what that zone's own rules said the offset would do: a zone's summer time is not a shift, while a new zone, or a rule change the phone's zone data did not foresee (Morocco abolishing GMT+1), still is. And the check ran on the launch's paint of the last GPS fix: after a flight that was the city left behind, whose year was dropped, and the check was then used up, so the city you were in was never checked. The last fix now only looks; the check runs on the place the new fix finds (or on the place on screen, when no new one comes).
- **Switching to a saved place reschedules the end-of-day prompt, the adhkār reminders and the quiet windows.** They are rewritten only when something they depend on changes, and that check looked at the day, the time zone and the settings but not at the times: a switch within a minute of the last rewrite left them on the old place's times. The times are part of the check now.
- **A saved place in another time zone gets its own day from every source the phone calculates.** The on-device calculation, Diyanet's method, your method offline, Türkiye Takvimi's calendar and Islamiska Förbundet's method away from its cities wrote a saved place's times on the phone's clock, so a time near midnight landed on the wrong day: on a phone on UTC, Stockholm's midsummer Fajr was the evening before. They now write the place's day on the place's clock — the time zone AlAdhan names for it, the country's own where the app knows its borders, otherwise the hour of its longitude — as the authorities' tables always have. Türkiye Takvimi's published days are read on the city's clock too (Istanbul's no longer three hours out on a phone elsewhere), and AlAdhan is asked for the place's own date when the date line lies between you. The place you are in is unchanged.
- **A saved place far from your time zone lists its times on the right day.** With the phone in Stockholm and Jakarta saved, Jakarta's Fajr — the evening before on the phone's clock — was listed after that day's Isha: the widget and the Live Activity showed it last, its alert and countdown came a day late, and the Fajr snooze ran backwards to that morning's sunrise. The widgets, the Live Activity and the alerts now take each of the place's times on the phone's day it falls on, in the order they happen, so every prayer comes once a day at its own moment — Kolkata with New York saved, or Pago Pago with Singapore, as much as Stockholm with Jakarta. Nothing changes for the place you are in.
- **One ʿIshāʾ alert a night when ʿIshāʾ passes midnight.** In a high-latitude summer, on the night the season carried ʿIshāʾ from 23:59 to 00:02, the alerts, the widgets and the countdown read the 00:02 as that morning's — two adhans three minutes apart, then each night's a few minutes off — while the day's rollover and the quick log read it as the evening's. Every part of the app now reads an ʿIshāʾ (and the first third of the night, and the Mālikī boundaries) past midnight as the evening it belongs to; opened after midnight, the app still counts down and alerts to last night's ʿIshāʾ.
- **A border town is no longer given its neighbour's calculation method.** The outlines that tell Automatic it is in a country with a method of its own reached up to ten kilometres and more over a land border, so Badajoz, Tui, Imatra, Narva, Jericho, Rafah, Eilat, Daraa, Zaranj and Astara got Portugal's, Russia's, Jordan's, Egypt's or Iran's method rather than the Diyanet place they are beside. The other country's land along those borders is now told apart, to within a few hundred metres.
- **Abroad, a district in Türkiye is used only within 25 km.** A district's table reached 40 km, which is right inside Türkiye but gave Svilengrad Edirne's table, Chios's and Rhodes's countryside Çeşme's and Datça's, and Syrian, Armenian and Georgian villages a Turkish district's, 25 to 40 km over the border or the sea.
- **Offline, Automatic computes a country's own method.** In Saudi Arabia, Egypt, Pakistan, India, Bangladesh, Iran, Kuwait, Qatar, the United Arab Emirates, Russia, Tunisia, Portugal and Jordan, the phone's own calculation — off the network, or behind a failing AlAdhan — used the Muslim World League's angles: Mecca's Isha came 10 to 20 minutes early, in Ramadan 50, and its Fajr 3 minutes late. It is now the country's own method, as AlAdhan's Automatic computes there.
- **A location not yet set no longer moves a source picked by hand to Automatic.** Until a place is chosen, and while the location store cannot be read at launch, the settings hold 0, 0, which was taken for a place outside every national source's country.
- **A saved place in another time zone alerts at its own times, whichever source answered.** An authority's table, and AlAdhan, write a city's times on the city's clock (Rabat's Fajr at the ministry's 05:05 GMT), but the alerts, the countdown, the widgets and the Live Activity read every time on the phone's clock: a saved Rabat on a phone in Stockholm sounded Fajr at 05:05 Stockholm time, two hours early in October, and the same city could be an hour apart from one source to another. Each answer now says which clock it is written on, the stored days keep it, and every moment is worked out on that clock. The Today card shows the place's own times, and a day the phone filled in is shown on the same clock as the rest of the week; the alerts, the countdown, the widgets and the Live Activity come at the right moment. The widgets and the Live Activity write the times on the phone's clock. Days stored by an earlier version are read as before until they are fetched again.
- **One alert, not two, when two prayers share a minute.** In the polar night Diyanet's and Islamiska Förbundet's tables print Asr at Dhuhr's time, since it never forms — at Tromsø on 21 December both are 11:47 — and the phone rang two alerts, and played the adhan twice, at once. It now rings once, for Dhuhr (or for Asr, if Dhuhr's alert is silenced). The times themselves are the tables'.
- **A saved place across the date line gets its own day.** The times the phone computes for Morocco's, Algeria's, Sweden's and Indonesia's cities, saved on a phone on another clock, were the city's times for the phone's date. Across the date line those are a day apart for most of the day: on a phone on Kiritimati, Rabat's "today" was Rabat's tomorrow. The day is now the place's own; wherever the two clocks are less than twelve hours apart nothing changes.
- **Morocco's times on a phone whose clock was set back by hand** (#82). A phone with time-zone data from before Morocco left GMT+1 runs an hour ahead; set back by hand to match the clocks on the wall, it showed every prayer an hour late. The app now compares the phone's clock with the time the servers it already talks to report, and where the phone is exactly that hour behind it writes Morocco's times on GMT, as the ministry prints them, so they match the wall clocks and the alerts come on time. A phone on network time keeps its own clock, as before. Settings now says, under the source, when the phone's time-zone data still puts Morocco at GMT+1.
- **Reading a surah ahead of the khatmah leaves the khatmah where it was** (#84). Near the end of a plan the portion being read can run to the end of the book, and every page turned inside it counted for the khatmah however the muṣḥaf was opened — so opening An-Nāziʿāt from the index to memorise it, fifty pages before the end, moved "Continue khatmah" there and left the pages in between as a gap. A reading opened from anywhere but the khatmah now counts for it only from where the plan stands: today's pages read from the index still count, and a surah read ahead is reading, not khatmah progress. Opened from "Continue khatmah", reading ahead in the portion counts as before.
- **The recitation runs on from ayah to ayah.** Each ayah is its own recording, and eighteen reciters' recordings carry silence at both ends — about two seconds at every join for Husary, the default, as much as three and a half for the mujawwad recitations — so a continuous listen stopped between every ayah. That silence was measured for every file of those reciters, and the player now starts each ayah just before its first sound and moves on just after its last, leaving a breath; a pause inside an ayah is the recitation and is untouched. Husary's Muʿallim keeps its gaps, which are there to recite back in. Android keeps the joins in the player itself, so they hold with the screen off.
- **Warsh and Qālūn readers hear the ayah that is lit** (#83). Every recording is cut by the Ḥafṣ count, Warsh's own included, and Warsh and Qālūn count the ayahs the Madani way — An-Nāziʿāt's 37 and 38 are one ayah for them — so from the first difference in a surah the reciter read the end of the ayah before the highlighted one, to the end of the surah; 136 places in 59 surahs. Each ayah is now played from the files it is recited in: an ayah made of two Ḥafṣ ayahs plays both and stays lit through them, the two halves of a split ayah play their shared file once, the range, the ayah buttons and Tilawah's surah bar count the reader's ayahs, and al-Māʾidah 121 and 122 can be played at all.
- **"Pause between repeats" rests.** The memorisation drill's gap — hear the ayah, recite it back, hear it again — never came: the setting was saved and the player went straight on. It now rests after each ayah of a drill for the ayah's length × the setting (½×, 1×, 2×; at most 30 seconds) by playing silence, not by stopping, so it keeps going with the screen off on both Android and iPhone. The ayah stays lit through its rest, and the ayah buttons step over it. Only a drill rests — an ayah or the range repeated — never a plain listen. Until the reciters' recordings are measured again, the length is estimated from the ayah's words.
- **A Warsh or Qālūn reader's listening place resumes on the ayah it reached.** A place saved before the fix for #83 was in the Ḥafṣ count, so from the first difference in a surah Tilawah picked up an ayah or more past where the listen had got to (An-Nāziʿāt 79:40 for Warsh 79:39). The place now remembers its riwayah, and an old one is put into the reader's count once, the first time it is read.
- **A streamed recitation no longer skips, repeats or swaps ayahs.** The next few ayahs are fetched together and put in the queue as files as they arrive; two arriving at once could interleave and leave the queue out of order (heard as 3, 5, 4). They now go in one at a time.
- **The Log widget turns to the new day by itself** (#81). After midnight it kept showing yesterday's prayers and ticks until the app was opened. On Android and iOS it now starts the new day from the times it already holds, with nothing logged, and the app fills in the rest the next time it runs.
- **Tajweed colours on older Androids** (Play review, Android 9: "tajweed cannot apply"). Android 9 and earlier cannot draw the colour fonts the Ḥafṣ colours are in, so the switch turned on, the pages downloaded and nothing changed. There the colours are unsupported: the switch is greyed out and says why, the colour pages are neither downloaded nor offered, and a switch turned on on another phone and synced over colours nothing; Warsh's colours, which are plain text colour, still work. On Android 10 to 12, which draw the colours but paint the letters themselves black, the night page lost its letters and showed only coloured fragments; its fonts now carry the night ink. And turning the colours on before the plain muṣḥaf had finished downloading now starts the colour pages once it has, instead of never.
- **The day under the bar is the day the bar names.** The days behind today load a moment after the first paint, and every page of the Today card moved by that many while the pager stayed where it was, so an evening launch could show yesterday's rows (with yesterday's log) under "Tomorrow" until the day was turned by hand. The pager now goes back to the day it is on whenever the pages move.
- **Four Indonesian regencies were in the wrong place.** Gresik sat on Bawean island, and Seruyan, Kepulauan Selayar and Pekajang (Lingga) were each well away from the seat the ministry computes; all four are where its tables put them.
- **Two Moroccan cities were in the wrong place.** Ikss sat beside Casablanca, so people on Casablanca's edge could be matched to a High Atlas village 300 km away; and Assa sat 70 km south of the town. Both are where the ministry's own tables put them.
- **Sweden: 2027 served as 2026, and Kiruna served as Umeå.** Islamiska Förbundet's site, asked for a 2027 date, answers with 2026's — an hour early between the two years' clock changes and up to ten minutes off through the summer, since the share of the night the method carries is fixed afresh each year — and its Kiruna table is Umeå's, hours from Kiruna's on a midsummer night. Neither reaches the phone now that it computes Sweden's times itself; the dataset builder still drops such rows (checked against the sun's noon and against the method), and the weekly check counts them as the site's, not the method's.
- **Nine Swedish cities were placed wrongly.** Kiruna, Jokkmokk, Gällivare, Pajala, Ludvika, Sollefteå, Lysekil, Hultsfred and Avesta sat 11–46 km from the towns in the app's list, which decided both the nearest city and where its times were computed; every listed city is now at the point Diyanet computes it, which is the town. Ystad stays at the town: Diyanet computes it 43 km to the west, three minutes late.
- **Umm al-Qura in Ramadan, offline.** The method holds Isha 120 minutes after Maghrib in Ramadan rather than 90; the phone's own calculation used 90 all year, so offline it was half an hour early every Ramadan.
- **A square at the start of Fajr when the app reopened.** The posed hero was captured without its bleed, so the picture the launch opened on had a hard edge where the sky ran under the status bar; it is captured whole now, bleed and all, and the posed twin follows the interval it is given rather than the one it was mounted with.
- **A hiccup as the hero drew from sunrise toward Dhuhr, and the same for the other passages.** The run starts from the current prayer's start whatever picture the launch drew, and the sky is moved by native from where the run is to its end, so the colour changes every frame instead of only at the end.
- **The Sky theme no longer opens on three palettes.** The day's times are stored with the theme and restored with the settings, so a launch opens in the hour's colours once.
- **No Live Activity card over the hero when the app opens.** The rich notification is held back while the app is in front — from `onCreate`, so a launch's restart holds it too — and posted when the app goes to the background.
- **Log: with the Mālikī second times on, a log after the preferred time ends is the late one,** not the half-window (#74).
- **A clock that jumps is noticed on the hero's next tick,** not on the watchdog's next look — a day set back showed a countdown of thirty-odd hours for up to half a minute.
- **Mac: the app is laid out from the window's measured size,** not the stale one Catalyst reports at launch.
- **The stored year is found at once after a restart where a newer correction list was downloaded.** Days stored under a correction list the app had downloaded were missed for the first moments after a restart, because the downloaded list had not been read back yet: the widget could come up empty and a fill fetched again what was already on the phone. Reading stored times now waits for that list.
- **Stored prayer times no longer pile up.** Times stored by earlier versions under a layout the app no longer reads (2.31's, and any stored under an earlier correction list), and the Swedish, Moroccan and Algerian timetable files the on-phone calculation replaced, stayed on the phone for good and were read and rewritten with every update of the stored times. They are now cleared once after the update, and the store is held to about 1.2 MB, the places looked at longest ago making way first.
- **Days worked out on the phone while offline are fetched again.** When the prayer-time source could not be reached, the app filled the gap with its own calculation and kept that day for good, even once the phone was back online, so a day could stay a minute or two off the source. Those days are now remembered and, once the phone is online, fetched again from the source a few at a time.
- **A year of AlAdhan times is stored in twelve requests, not hundreds.** Filling a location's year asked AlAdhan for each day on its own, four at a time: about 365 requests, slow on a weak connection and quick to hit AlAdhan's rate limit. A whole month now comes in one request, each day checked as before; a day that fails the check is asked for on its own.
- **Singapore and Malaysia: a damaged timetable download no longer breaks the times.** A downloaded city file with no days in it was kept, and every read of the table then failed until the next server build; it is now refused, and one kept by an earlier version is ignored. And when several days were missing from the timetable at once, the app downloaded the authority's whole year once per missing day, four at a time; it now asks once.
- **Türkiye Takvimi: the first times come quickly on a network that does not answer.** On a connection that accepts requests and never replies, such as a captive portal, the first times could take more than a minute, waiting out every request to the mirror and to namazvakti.com. The first answer now waits a few seconds at most and the year is fetched again in the background. While the times load, the week shown first is now the Türkiye Takvimi calendar's own calculation, not the calculation method from Settings, so nothing jumps by ten minutes or more when the real times arrive.
- **Türkiye Takvimi: every city's year reaches Mihrab's mirror, and next year's is ready by January.** Thirteen of the 512 files of the 2026 mirror never reached it (about 3,000 cities), because their upload was refused by GitHub's rate limit and nothing checked, so phones there asked namazvakti.com itself. Each run now checks the mirror against what it built and rebuilds anything missing first. From 1 December the mirror is also built for the coming year, from the files the site serves for it.
- **Prayer alerts are rescheduled right after an app update.** Alerts are scheduled a few days ahead, and only from the Today screen, so after an update the previous version's alerts kept going off at the times it had worked out until Today was next opened; opening the app from a widget onto another tab never rescheduled them. The first start of a new version now reschedules them, and refreshes the widgets, before any screen opens. On Android this also happens straight after the update, without opening the app.
- **Custom angles, the calculation method, the source setting and the per-prayer offsets are checked when settings load.** A custom Fajr or Isha angle saved empty — by a backup, a sync from another phone, or an edited file — came back as 10°, nearly an hour away from the angle meant; it now comes back as the default angle. A method this version does not know now loads as Automatic, an automatic-source setting that is not on or off loads as Automatic, and offsets that are not minutes are dropped, so none of them can reach a calculation.
- **Syncing or restoring settings keeps each saved location's prayer-time source.** Settings carry the source chosen for every saved location, but the saved locations themselves only come over when Location is ticked, which it is not by default. A settings-only sync or restore from a phone with other saved locations replaced the whole list of choices with that phone's, so every saved location here quietly went back to Automatic. Each location now keeps its own choice; another phone's choice comes over for a location both phones have, and for its own saved locations when they come over in the same sync.
- **A locked Keychain at launch no longer erases your location on the next change.** Your coordinates and saved locations are kept in the phone's encrypted store, and when it could not be read — a phone not yet unlocked since a restart, for one — the app opened without them, as it should, but the next change to any setting wrote that empty state back: the location at 0, 0, the saved locations gone, and each one's prayer-time source reset to Automatic. Now nothing about the location is written until it can be read again; other changes are still saved, and a location you set in the meantime is kept without being written over the one you had.

## [2.30.0] — 2026-10-10

_From the release notes._

- Opens faster: the Today screen you last saw is the first thing on screen, and the countdown, sky and progress fast-forward to now.
- Algeria: prayer times from the Ministry of Religious Affairs and Wakfs' timetable for 68 cities (#70).
- Hijri calendar: Indonesia (Government & NU, and Muhammadiyah) besides the standard one, plus a day adjustment that moves only the Hijri date.
- Widgets get their own Settings → Widgets page; the text colour applies to every widget, in the app and on each widget's own settings screen.
- Prayer-times widget (Android): show or hide the city, countdown and the day's times, and size the times.
- Quran: a download manager, a Downloads settings page and content mirrors.
- Muṣḥaf: volume down now turns to the next page (a setting flips it), an optional touch lock stops accidental swipes, and the first swipe no longer stutters (#72).
- Arabic countdowns keep hours, minutes and seconds in order, and prayer times no longer clip (#71).
- Warsh tajweed: a missing madd at 67:9 is coloured (#64).

## [2.29.0] — 2026-10-06

_From the release notes._

- Snoozing an adhan now re-alerts with different wording, and offers a 1-hour option.
- Snooze choices follow the time left in the prayer; the last one becomes “Last chance to pray”.
- Settings → Notifications → Prayer sounds: pick adhan, alert or silent for each prayer (#66).
- Quran: download tafsir and Arabic meanings of harder words for offline reading; the āyah sheet is reworked around them.
- Muṣḥaf: turn pages with the volume buttons, an opt-in Quran setting (#68).
- The home screen offers the full-screen alert, silencing the phone and the Live Activity once, and skips what the first-run walkthrough already asked.
- Warsh tajweed: the end of an āyah is a stop, so nothing carries into the next āyah, and idghām of a sākin nūn before a doubled yāʾ or wāw is coloured (#64).
- A removed khatmah no longer keeps sending reminders on your other devices.
- A prayer you log while its alerts are still being scheduled no longer gets an “ending soon” alert (#69).
- Android: before Android 15, the alarm screen paints the status and navigation bars in the prayer's sky (#63).
- New snooze and download wording is translated into every language.

## [2.28.2] — 2026-10-04

### Added

- **Mac: the Qur'an's bundled files load again.** The tajweed rules in the āyah sheet read "not available" on the Mac, because the app looked for its bundled data one folder above where a Mac bundle keeps it. The sūrah text, the translations and both riwāyāt's tajweed files all use the right path now. Android and iPhone were never affected.

## [2.28.1] — 2026-10-04

### Added

- **Smaller Snooze chips on the Android alarm screen.** Under Snooze 10 min and Log prayer, three small chips snooze for 5, 15 or 30 minutes instead.
- **Tajweed accuracy.** Warsh (#64): iqlab inside a word, taqlīl on the nūn, prefixed madd badal and the disjoined letters. Ḥafṣ: the madd, ikhfāʾ and saktah gaps in quran.com's markup are filled, and the small alif, stops at pause signs and tafkhīm follow the colours of the page font.
- **Landscape mushaf follows the recited line.** On a phone in landscape the line of the highlighted word scrolls to the top, without jumping back to the start of the āyah, and a following bookmark settles on the āyah where the recitation stopped.

## [2.28.0] — 2026-10-02

### Added

- **Tilāwah keeps its own place, and suggests what to put on.** Listening no longer moves the reading marker, and the reading no longer moves the listening: Tilāwah remembers the surah, āyah and reciter it was left on, on this device. Come back after half an hour and the player steps aside for a slim panel — carry on from where you were, shuffle into something new, or pick from what the sunnah recommends at that hour: Al-Kahf from Thursday's maghrib to Friday's, As-Sajdah and Al-Insān on Friday morning, Al-Mulk, the last two āyāt of Al-Baqarah and the Muʿawwidhāt at night. An ✕ beside the ⓘ dismisses the current playback.
- **Help Mihrab, under Settings → About.** Rate the app where you got it (with Play offered to every Android install, F-Droid and GitHub included), tell family and friends, and share the month sheet through an in-app link. A small heart beside "Fajr in" on Today opens into a line pointing there, folds back after fifteen seconds, and can be turned off from the page.

### Fixed

- **Polar days no longer show NaN times, and no longer crash the app on launch** — issue #61.
- **The prayer's name shows whole on the always-on display.** A long name such as Maghrib was cut to "M…" by a title box sized for an earlier name; on the countdown design it now sits in the fixed-width label beside the time.
- **The iPhone lock screen and Control Center treat the recitation as long-form spoken audio.** The audio session is set up as Apple asks for it — playback, spoken audio, long-form route sharing — so another app's spoken prompt pauses the recitation rather than talking over it; pulling the headphones out pauses it, as Android always has; the in-app adhan pauses it instead of playing on top; and dismissing a prayer notification no longer cuts it off. The lock-screen artwork is the square icon, without the white corners.
- **Arabic and Urdu on iPhone and iPad.** Text that sets no alignment starts on the right, as it does on Android; the Quran tab's first card opens square; the transport controls in Tilāwah and the muṣḥaf's mini player run left to right; surah rows keep the left-to-right layout so the calligraphic names line up on their first letter; and every pushed page but the muṣḥaf has its back chevron on the right, as the settings pages do, with no "Home" beside it.
- **No band across the bottom of a pushed page.** Tilāwah, Khatmah, Manage downloads, the tajweed guide, the month table and its sheet, the compass, Backup, Sync and Fasting run to the bottom edge instead of reserving a strip that the list slid under. Khatmah and Sync no longer start under the iOS title bar.
- **Manage downloads follows a reciter's download while it runs**, and "continue download" resumes it.
- **The month sheet's export shows its progress**, PDF included.
- **Switches have a white thumb everywhere**, not the system's pink.

## [2.27.2] — 2026-09-30

### Changed

- **The Android widgets are drawn by Jetpack Glance, and the widgets you already placed come with them.** Every widget keeps its place, size and settings through the update: the old widget classes now draw with Glance, so nothing has to be removed and placed again, and the RemoteViews drawing code — about 3,900 lines — is gone. A widget placed before payload v2 existed asks the app to write it on the first redraw after the update, without the app being opened; if that is refused it says "Open Mihrab" until the app is opened once.
- **No refresh button on the iPhone, iPad and Mac prayer widget.** It could only redraw the payload already on disk, which the widget's own timeline does on schedule; on Android the glyph starts a sync round and stays.
- **The Mac app needs macOS 12.1 (Monterey) or later.** It asked for 10.15 before. Apple's current Xcode cannot build a Mac app for anything older than macOS 12, and staying on the previous Xcode to keep Catalina and Big Sur was holding the Mac back from each release's tools. Homebrew now installs it from Monterey on too — the cask asked for macOS 13, a guess made when the tap was set up, never the app's own need. The Mac app is universal, so Homebrew now installs it on Intel Macs as well as Apple silicon, and its widgets need macOS 14, as they always have.
- **Turning the phone with the muṣḥaf open is one clean change, not a stutter.** The page used to be covered only once the app had heard about the rotation — by which time the phone had already drawn the old layout stretched into the new shape, the rail at the wrong width, so those frames showed — and then it cut straight to the new layout. Now the phone itself puts the page colour over the screen at the moment it turns (Android, iPhone, iPad), and the new layout fades in over it once it has settled, with the same short fade fullscreen uses. On the Mac, where a window is resized rather than turned, the page fades back in after a resize. Opening the muṣḥaf is unchanged.

### Fixed

- **The Today carousel opens on today in Arabic and Urdu on Android.** A right-to-left layout reversed the horizontal list under its own index, so it opened days away from today; the pager is laid out left to right with its days reversed.
- **Mihrab opens on iOS 27 and iPadOS 27 again.** From 2.22.0 (all but 2.24.0) the iPhone and iPad app was built with Apple's iOS 27 tools, which refuse to launch an app that still manages its window the pre-2019 way — so on a device updated to 27 it closed the moment it was opened, before drawing anything. Older iOS versions and the Mac were never affected. The app now uses the scene life cycle iOS 27 requires; a widget tap still opens the page it points to, whether the app was running or not. The App Store build is checked for this before it is uploaded.
- **Android widgets ask for new prayer times when your time zone changes.** A widget whose times were worked out for another UTC offset — you travelled, or the zone's own rules changed — now starts the app's refresh by itself instead of showing the old table until the app is opened.
- **The First Third after midnight is placed on its own night** on the widgets and the Live Activity, not read back as that morning.
- **The Live Activity counts to the right minute on the night the clocks change, and moves on to tomorrow by itself on iPhone.** Both platforms took the next prayer's time as text and worked out the moment from it, which was an hour off across the change. On iPhone, once ʿIshāʾ had passed the card waited for the app to be opened before it showed tomorrow's Fajr; it moves on by itself now.
- **Two khatmahs started on two devices become one.** If your phone and your Mac each started a khatmah before they had synced, both survived the sync and every screen showed the one started first — the other plan, and whatever you had read in it, stayed hidden until the first was finished or deleted. Now the plan with more reading in it is kept, even if it was started later; if neither has more, the one started last is kept. The other is set aside the same way on every device, and when you finish or delete the khatmah it goes with it — there is only ever one. Starting a new khatmah also properly ends the one it replaces, so another device can no longer bring the old plan back.
- **"Previous day" works on a khatmah paced to a date.** It used the arithmetic of a plan by length, so on a plan with a finish date a "done" pressed twice on the first day went back to the very beginning, and on a plan behind its schedule the button did nothing at all. It now takes back the last portion "done" finished, as it always did on a plan by length — and it no longer refuses when a page has been left unread behind you.
- **No "done" button that does nothing.** With every portion read but a page you skipped on the way, the khatmah card and the reader still offered to finish the last day, and pressing it did nothing. They now leave it to the skipped pages, which is what is left.
- **The reader's "finish day" pill follows the day.** Left open across maghrib on a khatmah paced to a date, the pill and the marker at the portion's end stayed on the day before until something else changed, while pressing it finished the new day.
- **A khatmah's days keep their dates past the night the clocks go back.** On a plan that ran across the end of summer time, every day after that night was named a day early — "finish day 26 (tomorrow)" for the day after tomorrow — because the dates were counted in 24-hour steps and that night is 25 hours long. They are counted on the calendar now, and so is the day a re-paced plan counts from.

## [2.27.1] — 2026-09-26

### Changed

- **Mihrab has a new home: [github.com/MihrabHQ/Mihrab](https://github.com/MihrabHQ/Mihrab).** The repository moved into its own organization, and the app's links to its source, releases, fonts, recitation timings and prayer-time datasets point there now. GitHub redirects every old address, so builds already installed keep working. The Homebrew tap moved with it: `brew install --cask mihrabhq/tap/mihrab`.
- **Mihrab describes itself as what it has become: the Muslim companion.** The store listings on Play, F-Droid and the App Store, the website in all thirteen languages, the README and the tagline on shared month sheets now lead with the whole app — prayer, the Qur'an and the remembrance in between — rather than prayer times alone, and the Play listing is generated from the same files F-Droid reads so the two can no longer drift. `branding/IDENTITY.md` is the one place this is written down.

## [2.27.0] — 2026-09-26

### Added

- **Tajweed colours on the Warsh muṣḥaf** — issue #58. The same switch colours the Warsh pages: the rules Warsh shares with Ḥafṣ in the Ḥafṣ inks, and Warsh's own — the hamza moved by naql or softened by tashīl, taqlīl, the light rā, the heavy lām, madd al-badal and the līn before a hamza — with their own, each explained in the guide and in the āyah's Tajweed section in all thirteen languages. The rules are computed ahead of time from the King Fahd Complex's Warsh text and checked against the cases raised on the issue, each cited to a published reference on Warsh's uṣūl; a word is coloured only if its text on the device is the one the rules were computed on.
- **Fullscreen reading has its own way out.** An exit ✕ sits in the status band opposite the surah name — stepped inward past a corner camera — with the page number beside it (tap to jump). The page rail is hidden in fullscreen on phones, and going in and out happens behind a short fade of the page's own colour, so the chrome and the re-layout never show their in-between frames; the band of green that flashed at the bottom on Android is gone.
- **Tajweed colours download as soon as you turn them on**, in the background and over Wi-Fi — leaving the settings or the app does not stop it — and a download already on disk is skipped rather than fetched again.
- **A one-time offer of the Quran's two optional features**, tajweed colours and the word reader, for readers who have neither on.
- **The āyah sheet shows the āyah in the muṣḥaf's own page font**, plain or tajweed, as the page is.

### Fixed

- **The khatmah options no longer run off the card** on narrow screens; the chips wrap.

## [2.26.0] — 2026-09-24

### Added

- **The phone can go quiet for the prayer itself, and come back on its own (Android)** — issue #60. Settings → Notifications → "Silence the phone at prayer time" puts the phone on Do Not Disturb around each prayer you pick — from the adhan or a few minutes before, for as long after it as you set — and lifts it again. Jumuʿah has its own length and, for a mosque that holds it at the same time all year, its own fixed time. It is a Do Not Disturb rule the app owns, so alarms and whatever you already let through still come through, and an ongoing notification says until when, with an "End now". Off by default, and it asks for Do Not Disturb access the first time. iOS gives apps no way to switch silent mode or a Focus, so it is Android only.
- **A release's note can be copied, with data statistics on.** With "Show data statistics" on (Settings → About), each entry in What's new carries a copy button that puts its note on the clipboard exactly as shown.
- **Tajweed colours, and what each one asks of you.** Off by default; Settings → Quran → Tajweed colours turns it on. The Ḥafṣ muṣḥaf is then drawn from the King Fahd Complex's own colour-coded page fonts (QPC V4 Tajweed): the same pages, the same lines, every letter painted for the rule it falls under — grey not sounded, green a hum, four reds by the length of the madd, light blue a bounce, dark blue a heavy letter. The page's own ink still follows the paper, sepia or night tone, and a night page gets the fonts' dark palette. Tap an āyah and its sheet has a Tajweed section: the āyah in colour, then each rule in it with what to do and the words it happens in, each a tap from being read aloud. A guide — from the Qur'an tab, from settings, from the sheet — explains every colour with an example you can hear or open on its page, in all thirteen languages. The coloured pages are their own download, fetched as you read or all at once for offline, and listed separately under Manage downloads.

### Fixed

- **The muṣḥaf's word spacing follows the print.** The space between words was a nominal quarter em, so the page read airier and smaller than the printed muṣḥaf. It is measured from the King Fahd Complex's page scans now (`scripts/mushaf/measure_print_spacing.py`): the print adds nothing between the words of its widest line, so neither does the app, and the page is set larger for it.
- **A muṣḥaf line no longer loses a word or clips its own ink.** Each line was an ordinary text paragraph, so Android could break a line a hair wider than its box and drop its last word, every line carried slack to guard against that, and a swash reaching past the line's end was cut at the margin. Lines are drawn natively now, on Android and on iPhone, iPad and Mac, so nothing breaks, nothing is clipped, and the page gets its width back.

## [2.25.1] — 2026-09-22

_From the release notes._

- Word reader: hold a word in the mushaf, slide to another if you like, and lift to hear that one word. Turn it on in Settings → Quran → Word reader.
- The mushaf's night page is true black.
- The mushaf header shows the riwayah beside the back arrow and the recitation on the right, and the title stays centred on a phone in landscape.
- Khatmah by a date: the days after today are laid out in pages, and once today is done, the marker shows where tomorrow's portion really ends.
- Sync no longer undoes khatmah reading done on your other device.
- Android: the app keeps its own text when a system theme font is set, and the ayah number sits inside its rosette. (#16)
- Android: the download from GitHub for Obtainium is smaller, and is now for ARM devices only.

## [2.25.0] — 2026-09-21

_From the release notes._

- Khatmah by a date: choose when to finish, and each day's portion is worked out from what is left. Switch between pacing by days and by a date at any time from the ⋯ menu. (#53)
- Pull down on Today to refresh the prayer times, or use the new row in Settings that does the same.
- Which mushaf you read can be chosen in Settings.
- When the clocks change where you are, prayer times refresh at once. (#56)
- A download cut off by the connection keeps what it has: continue it, or it resumes by itself on Wi-Fi. (#55)
- Sync no longer brings back a khatmah marker you removed, or pulls your progress back.
- The khatmah options no longer overlap the clock at the top of the screen.

## [2.24.1] — 2026-09-20

_From the release notes._

- Mac: the mushaf no longer shows three page columns, with the left one running under the index, after switching back to it from another full-screen app.
- Mac: the bar above the page is the colour of the page, and the surah name is centred over the page rather than over the window.
- Mac and iPad: in fullscreen the surah name is shown in full again, instead of a letter and an ellipsis.
- The left and right arrow keys turn pages again after searching in the index.

## [2.24.0] — 2026-09-18

### Added

- **The day can begin at maghrib, if you ask it to.** The Islamic day starts at sunset, so an evening of khatmah reading belongs to the day that has just begun and a sitting that runs past midnight is one day rather than two halves. Mihrab counted from midnight, in five separate copies of the same function, which is the real reason it had never been changed: there is one definition now, and Settings → Quran → "Start the day at sunset" turns it on. Off by default — nobody's counting moves under them. It governs what is counted in a day and nothing else: the prayer table still turns after the last time of the day, and the Log still runs on the calendar. An Islamic event follows it, because Laylat al-Qadr is a night. With no prayer times to hand, the answer is the calendar day, exactly as before.

### Changed

- **Three trails through one book: what you opened owns the reading.** A reader keeps several places at once — a khatmah, a surah read now and then, Al-Mulk every evening — and every page turn had to answer which of them just moved. It answered by position, the nearest marker claiming the turn, which cannot be right once there are two bookmarks a few pages apart. It answers by intent now: whatever you opened owns the visit. A bookmark can follow your reading or stay pinned, with its own switch; a bookmark visit never touches the continue-reading marker, because a bookmark is already a kept place. Khatmah progress is the set of pages actually read rather than a high-water mark, so a page can be marked read or unread beside the surah name, pages skipped behind you are counted and can be gone back to, and two devices reading different parts keep both instead of the furthest winning.

### Fixed

- **The Live Activity never appeared for anyone on a 24-hour clock (iOS).** Turning it on did nothing at all: no Lock Screen card, no Dynamic Island, and no error anywhere a user would find one, because the failure was a rejected promise the app caught. The payload carries each prayer row's time twice, once to parse and once to draw, and the second is only sent when it differs from the first — so on a 24-hour clock it was absent, and the Activity's decoder refused the whole payload over the missing field. Both ends are fixed: the field is always sent, and a missing optional field can no longer take the Activity down with it.

## [2.23.0] — 2026-09-17

### Added

- **The screen stays on while you read, and there is a switch for it.** Mihrab already held the screen awake in the mushaf and in Tilawah, on by default — but not in the surah reader with the translation under each verse, which is the one people read ALONG WITH the recitation. Following the verses while the audio played was exactly when nobody was touching the screen, so it slept, and the feature looked like it did not exist (issue #52). All three screens hold it now, through one counted lock so they cannot switch it off under one another. And it is answerable from Settings → Quran rather than only from the coffee button inside Tilawah's player, which was not where anyone would look for it — and not reachable at all for somebody who never opens Tilawah. Both controls drive the one preference, so they can never disagree. Your phone's own screen timeout is left alone throughout.

### Changed

- **System colours no longer need the System theme.** Material You on Android and Liquid Glass on iOS were answerable only while the appearance followed the device, on the reasoning that there is nothing dynamic to follow once Light or Dark is pinned. That conflated two different things: the appearance preference decides WHICH MODE is drawn, and this decides where that mode's colours come from. "Dark, in my wallpaper's colours" was a reasonable thing to want and there was no way to say it. The toggle is now live under Light and Dark as well; a colour theme still takes precedence, because two sources for one palette cannot both win.
- **The khatmah card stops counting days it is not counting.** It said "18 days left" on a plan whose thirtieth day fell in fourteen, and no one can read that as anything but a countdown to a date. The number was never the calendar's: it counts PORTIONS of the book remaining, which is why skipping a day does not spend one — nothing is reconciled at midnight and no day is ever moved into a "missed" state, so a reader who falls behind is never handed an impossible quota the next morning. The label now says "days of reading left", and beside it, when there is one, the deficit: "24 pages behind". That number already existed and was already on the widget; it had simply never reached the screen the reader was looking at, which left the widget the more honest of the two (issue #53).

### Fixed

- **Deleting a khatmah no longer undoes itself.** On a phone paired with another device, an abandoned plan came back within a sync round or two, indefinitely. Deleting it dropped the row locally and nothing else — and the merge unites both devices' plans by id, where a plan absent here and present there is indistinguishable from one the other device has just made. So the union put it straight back: a delete that did not survive contact with the folder, which is word for word what removing a paired DEVICE used to do before it was given a dated record of its own, and what un-logging a sunnah used to do before an emptied day learned to keep its timestamp. Abandoning a plan now writes that same kind of fact — a date, which travels sealed to the other devices and outranks any copy that has not heard yet — and the row is dropped for good after ninety days, once no device could still be arguing about it. Progress made elsewhere before the news arrived still merges; the plan still stays gone.

## [2.22.0] — 2026-09-16

### Added

- **A colour theme, and it lives inside the theme card.** Appearance now carries one row of colours under light/dark/system — green, teal, blue, amber, rose, violet — and picking one themes the app in it. There is no separate switch to find first: the colour IS the switch, and Classic, the half-paper half-ink circle at the head of the same row, is how you put it back. It is the alternative to the system palette rather than a companion to it, so Material You and Liquid Glass are unavailable while a colour is picked and say why, and a custom hex belongs to Classic. Light mode is deliberately left alone — the app's own paper and ink, unchanged — because a tinted page is what made the earlier attempt look washed rather than themed. Dark mode is where the colour goes: every surface from the page up through the cards, the controls and the hairlines is a step on one perceptual ladder built from the hue you picked, so the theme reads clearly at every depth instead of as a single flat tint, and the deepest surface still sinks toward black on an OLED screen. The system palette gets the same treatment in dark mode, so Material You is as pronounced as the presets are. New installs open on green; an app that is already installed stays Classic until it is asked otherwise.
- **The muṣḥaf page bar and the start of a sūrah take the theme's colour.** The scrubber along the foot of the page and the ornament that opens each sūrah were painted from whatever the app's palette was at that moment, which on a night page under a light app meant a deep light-mode accent on near-black — invisible, and the sūrah bubble fell apart. Both now read the selected theme rendered for the PAGE's own mode rather than the app's: a night page gets the theme's dark accent and dark chrome whether or not the app around it is dark, and a paper page keeps its printed gold and its own light chrome, because the colour of a paper page is the print's, not the theme's.

### Changed

- **A backup is a file now, at both ends.** Export handed you a wall of JSON to select and copy, and import wanted it pasted back in — which works on one device, in one direction, if nothing truncates it on the way. Export now offers Save to Files alongside the text, on every platform: Android opens the system's own create-document sheet, and iPhone, iPad and Mac hand it to the Files app, so the backup lands wherever you keep things — iCloud Drive, a folder that syncs, a USB stick. Import takes a file directly: Choose a backup file opens the picker, reads it, and shows you what is in it before anything is applied, with the paste box still there for the times a file is not what you have. Neither end invents a format — it is the same snapshot it always was, in a file rather than on a clipboard.

## [2.21.1] — 2026-09-14

_From the release notes._

- Save a location without naming it: leave the name blank and it takes the city's own name.
- Switching between saved locations is instant, and flipping quickly back and forth no longer stalls on a blank screen.
- "Add new location" from the location chip on Today switches to the place you add, on automatic location too, not only manual.
- Searching for a city now says "Location selected", making it clear the place is only saved when you tap Save.
- Adding a location when you already have the most saved locations allowed no longer loses the new one.
- A manually chosen city no longer takes the place of your automatic location.

## [2.21.0] — 2026-09-14

_From the release notes._

- The mushaf is now the reader. The verse-by-verse list is a setting, already turned on if you were using it, and first launch asks which you prefer. Opening the verse-by-verse reader in the middle of a surah goes straight to the place.
- Today turns to tomorrow once the last prayer time of the day has passed.
- The A− A+ text size control for the translation and tafsir sits in the bar of both readers, not at the top of the surah.
- Sharing an ayah asks what to send, like the rest of the app, and can include the tafsir.
- The widget's setting has moved to Appearance.
- A faster start.
- Android: a smaller download.
- The back arrow points the right way in Arabic and Urdu.
- A khatmah keeps counting instead of quietly stopping.
- Android: tab labels stay clear of rounded screen corners.

## [2.20.0] — 2026-09-13

_From the release notes._

- Two Warsh reciters, and tapping an ayah while reading Warsh now shows and shares the Warsh wording instead of the Hafs wording.
- Today's reading target is shown in the reader, beside the page number.
- The adhkar keep the way back on screen, and sharing a dua asks what to send, in the app's own sheet.
- Sheets scroll again. The changelog and every other sheet ignored a slow finger and moved only for a quick flick.
- In the mushaf, back now leaves fullscreen instead of leaving the app.
- A khatmah no longer freezes when one fast swipe crosses several pages.

## [2.19.0] — 2026-09-13

### Added

- **The app tells you what changed after an update, and keeps the whole changelog.** There was no such screen: the changelog lived on the marketing site, and people who already used the app learned what was new by noticing. The first launch after an update now opens a sheet with the version you have just installed at the top, marked new, and every release before it underneath in one continuous list going back to the first — fifty-eight of them, each with its date, set as a proper list rather than a wall of text. It is a scroll, not a slideshow: nothing has to be clicked through, and it is dismissed by the button at its foot, by the page behind it, or by the back gesture. The notes are the ones the app stores are given, so a release cannot ship without them; they are translated wherever the store listing is translated, and in English elsewhere rather than blank. Settings → About opens the same list at any time, with nothing marked new, because from there nothing is. It catches up somebody who skipped three releases, and a fresh install never sees it: they have just been through setup.
- **The translation, the tafsir and the pronunciation are the size you want them.** A `− A +` in the sūrah reader's header and above a dua's, and the long-form text under every āyah and every dua grows with it: the translation, the tafsir, a dua's meaning and the Latin pronunciation, in one setting shared across both — one pair of eyes should not have to set it twice. Seven sizes, from a step below what the app has always drawn to twice it; the A between the buttons says which it is set to by its colour and puts it back when tapped. It applies on top of the phone's own text size rather than instead of it, so somebody who has already made everything bigger keeps that and gets this as well. The Arabic does not move: an āyah is typeset rather than styled, every size hand-paired with the line height that keeps a fatḥa or a kasra unclipped, and the muṣḥaf page has its own zoom. Neither do the glanced-at cards — the verse of the day, a search result — which live in fixed boxes, nor a shared āyah image, which should look the same wherever it was made.

### Changed

- **First launch asks the four things that decide whether the app is right for you, and shows you each answer in your own times.** It used to ask one — where you are — across three or four pages of paragraph-and-a-button, then drop you on Home and start a second, four-slide welcome. Meanwhile the two settings that decide whether the app is CORRECT for a person were never raised: the school, so a Ḥanafī user's ʿaṣr was three quarters of an hour early every day until they found it in Settings, and whether the app may notify at all. Setup is now six screens — the salām with the language in the corner, where you are, how you pray, whether it may notify you, an optional shelf of things to make it yours, and your own day. The school screen shows your ʿaṣr and moves it as you tap, so nobody has to know what a shadow ratio is to see what the choice does; picking Mālikī offers the second times there and nowhere else. The alerts screen asks the system, writes the setting when the answer is yes, lets you choose an adhan — seventeen ship and the default was the system tone — carries the advance reminder, and folds Android's exact-alarm grant into a row instead of a page of its own. The shelf is skipped in one tap and writes nothing when it is: sunrise, Islamic midnight and the last third with their times beside them, the morning and evening adhkār, the theme and the accent. The last screen is your city and your times rather than four slides describing them, with the three settings most people change next a tap away. Every answer is written as it is made, so a setup left half-done keeps what you already said; leaving is a decision rather than a swipe; and the step counter is a hairline now. Settings keeps every one of these and now meets you with them already answered — the school sits above the calculation method, where people look for it.

### Removed

- **Mihrab · Sky, the Android home-screen widget, is gone.** It was a second drawing of the Today hero — a port, in another language, of a scene the app had already learned to draw properly — and the two had started to diverge in the way that matters: the app's moon now takes its phase from the real elongation and its tilt from where you actually are, and the app's sun takes its colour and its light from the altitude it has climbed through the air, while the widget went on painting a five-colour table and a mean synodic month. Closing that gap needed the one piece of data this app keeps off disk for everyone's sake — your coordinates — in a place a home-screen widget could read them. That is a trade worth refusing, and a drawing worth having in one place rather than two. If you had the Sky card on a home screen it will disappear when the app updates; every other Mihrab widget is unchanged, and the sky itself is where it always was, behind the countdown when you open the app.

### Fixed

- **In Urdu, a dua's pronunciation and meaning were set backwards.** Both are Latin script — the pronunciation by definition, the meaning because it is bundled in English for every language the app speaks — and the app lays Urdu out right to left, so both paragraphs hugged the right edge with a ragged left one and each full stop came out at the start of its line rather than the end. It is not subtle: it is most of a card of English set the wrong way round. They run left to right now, inside the mirrored page, with the full stops where they belong. Arabic readers are shown neither line, so this was Urdu's alone.

## [2.18.5] — 2026-09-11

### Changed

- **Two doors back into the Qur'an, on Today and on the Qur'an tab.** The card offered one "Continue" and did not say which place it meant. It now offers the khatmah's next page and the reading marker, each when it is true — one row each in the same low card on Today, one card of the same rows at the top of the Qur'an tab, from one selector so the two cannot disagree. A marker riding with the plan gets no second door; two doors to one page is one too many. The khatmah card on the Qur'an tab keeps its account of the plan and its "done" button, and hands the way in to the card above it.
- **The passed-prayer sheet is one card, one level deep.** Each answer was a bordered button of its own — four outlines on a card that already had one. The day sits as a label over the prayer's name, the question is the one line of prose, the answers are divided rows, and cancel is the quiet last row rather than a button at the corner.

### Fixed

- **A surah's recitation download survives the sheet, and the phone says how it is going.** Downloading one surah's tilāwah was started from an ayah's panel and owned by it: closing the panel — or turning the phone, or tapping another ayah — cancelled the download without saying so, and since nothing about it ever reached the notification shade, it was a download you could start, not watch, and not get back to. It belongs to the app now, beside the muṣḥaf's own download and a reciter's whole Qur'an: a progress notification with a bar that names the surah and the voice, an "Al-Baqarah is ready" when it lands, a line across the top of the Qur'an tab and of the reader itself with the percentage and a Cancel, and a Cancel in the panel too — which was not possible while closing the panel was the only way to stop it. It queues the ayahs that are missing rather than the whole surah, so the count is the work left. And the shade keeps up: every update used to wait on the notification channel being re-declared before it could post, and fire without waiting for the one before it, so the bar ran seconds behind the app and carried on climbing after the download had finished. One post at a time now, the newest state always the next to go out, and the bar appears on the tap rather than on the first file that arrives.
- **The surah names in the Qur'an list are one weight now, not some bold and some light.** The Complex's calligraphers drew each of the 114 names on its own, to fill the header of a printed page, so the pen is heavier in some than in others: measured off the outlines, the main stroke of ٱلْبَقَرَة is 1.94 px at the size the list sets where ٱلنِّسَاء is 1.42, and the two sit four rows apart. A drawing cannot be un-bolded without redrawing it, and these are not ours to redraw — so the heavier names are set a little smaller, the way a printer evens a page up, each at the size that brings its stroke to the lightest the font offers. The spread of weights across the 114 closes from ×1.37 to ×1.20. No name grows, so none can outgrow the room its row measured for it, and none falls below 28 point; the line height does not follow the size, so the rows are all still the same height. Measured on a device afterwards, every name draws at its full width to within one per cent — nothing is cut.
- **A permission notice no longer sits under the clock and behind the camera.** The banner is the first thing on Today, and on a phone Today runs to the top edge of the screen — so the notice was drawn through the status bar, with the camera cutout over its first line and the clock's white glyphs on its pale tint. It clears the bar now: the strip runs up behind it in the notice's own colour, so the clock sits on the notice rather than on a band of page above it, and the bar's glyphs take the page's ink because with a banner up there the sky is no longer what they sit on. The hero gives up the inset and the bar's ink for as long as the notice is there, and takes both back when it goes.
- **A check whose prayer has not come says so, instead of doing nothing.** The ring is drawn at a whisper before its prayer's time and could not be pressed at all, which at one in the morning — when none of today's prayers has come — is five controls that look live and answer nothing; it was reported as a broken button. The tap is taken now and the day's own line answers it ("Not yet — its time has not come") for a moment, in the line the Hijri date sits on, so nothing moves under the thumb. The one state that still takes no press is a journal that has not been read yet: there is nothing to answer with, and it lasts a moment rather than half a day.
- **"Continue reading" lands on the ayah, and is a trail of its own — issue #41.** It opened the surah at the top for any ayah past the first screen: the rows load after the list has mounted, so the position was asked for before there was anything to scroll, and the one retry went as far as the list had measured — eight rows — and stopped. Worse, the row at the top wrote itself over the place being returned to before the scroll had a chance. The landing is driven once the rows exist, asked for again until the list has measured that far, and nothing is recorded until the reader has arrived. Then the larger fault: the place the app kept was the last page looked at, whatever the reason for looking — an evening in the khatmah erased the afternoon's place in Al-Kahf, and a glance at a bookmark erased both. There are two trails through the book now. The khatmah's next page is one; the reading marker is the other, and the khatmah's own reading leaves it where it is (unless it was riding along with the plan, in which case it comes along, so nobody with one trail loses their place). A jump — the rail, jump-to-page, a bookmark, a search result — does not move it either; the next page turned from the one beside it does, which is what reading looks like. "Continue reading from here" on an ayah's panel pins it by hand, beside the khatmah's own pin, and a pinned marker is drawn on the page — a terracotta wash and the ayah's number-medallion in the same ink, so it shows through a bookmark's or the khatmah's colour on an ayah that carries both. Long surah names no longer hide the verse: the reference is set in its own text and never shortened.
- **The check asks what the moment actually leaves open — issue #40.** A tap on a prayer whose time has passed offered two answers, on time or made up, and that fitted one moment and no other. With the Mālikī second times on, a prayer whose first time has gone while its second still runs can only have been prayed in the first time or after it: nothing is missed and nothing is qaḍāʾ while the prayer can still be prayed in its own time, so those are the two the sheet now offers, under a question that says which boundary has passed. Once the whole window has gone — with those times or without them — all four of the Log's statuses are there instead: on time, late, missed, make-up. Someone who had prayed late, or missed the prayer outright, previously had to accept one of two wrong answers on Today and correct it on the Log. Inside the window one tap still records the prayer on time and asks nothing, which is the whole point of the check.
- **A tapped adhkār reminder opens the adhkār — issue #39.** The morning and evening reminders have carried the category they are for since the day they were written, and nothing in the app read it: the tap opened whatever screen the reader was last on, and the duas they had just been reminded of were somewhere they had to go and find. Each one lands on its own page now — the evening reminder on the evening duas, the morning on the morning — on a cold start and with the app already running, and the tab bar stays off that page as it does when the category is opened by hand. Which it did not, for a moment, even by hand: the navigator shows the bar as a tab takes focus, and a category left open while the reader visited another tab got the bar back on return. A name that is not a category opens the index rather than the reader's last screen, because a reminder is about duas whatever else is wrong with it.

## [2.18.4] — 2026-09-09

### Changed

- **A day bar under the hero, and a hero that knows when to stop.** The line that named the day is now the way through the week: a drawn chevron at each edge steps a day, the day itself sits between them in both calendars, and once the table has been turned off today that block is the way back — a word in the accent rather than a tinted pill, because nothing else on this page is in a box either. The arrows are ink with a hit slop, not glyphs in a circle. And on a tablet held upright the hero stops growing: the phone's rule handed the sky six hundred points of empty middle and put the hero's white status-bar ink over the page's cream margin, so past that size the hero takes a measured height as an inset panel, the status bar takes the page's own ink, and the whole day — hero, bar, rows, Quran row — centres itself in the page.

## [2.18.3] — 2026-09-09

### Changed

- **The day's table turns both ways, and says which day it shows.** The week strip is gone — seven chips that could only look forward, and that answered "which day am I looking at" with a highlighted number. In its place, one line: the weekday, the date in both calendars, and on the trailing edge a mark that reads "Today" while the table shows today and becomes "Back to today" once it has been swiped off it. The table itself swipes a week back as well as a week ahead, from what the phone already holds — turning back never fetches anything, and for the Swedish and Moroccan datasets it reads the dataset itself, which the cache never holds. On a past day every prayer carries its check, so a prayer missed on the day is logged where it happened rather than on the Log tab; the alert bells stay on today's rows, where they mean something.
- **The check asks, once a prayer's time has passed.** Inside the window one tap still records it on time. After the window — later the same day, or on a day the table has been turned back to — the tap asks whether it was prayed on time or made up, and writes the answer. It used to write "late" on its own, which was the clock's answer and not the reader's. A second tap un-logs either way, without asking.
- **The Quran card is only the door, and a lower one.** It no longer shows the ayah of the day when nothing has been started — Today is the times, and a verse is a reading — but "Start reading" with the khatmah offer beside it, the same shape as continue and the khatmah's next page. One row, smaller type, a thinner bar; the table above it has the height.
- **The rows sit on the page's own edges.** The table and the line above it were still drawn a step in from the screen on both sides, inside the ghost of the card they used to sit in; the rows now run edge to edge with the hero's own inset — the name starts where the hero's text starts, the time ends where its rail ends, and the current prayer's tint reaches the screen's edge. The date under the countdown is gone, since the line under the hero now says it.

## [2.18.2] — 2026-09-09

### Fixed

- **A prayer log that could not be read is no longer written over — issue #38.** Every writer of the journal read it, added one entry and wrote it back, and every one of them treated a read that FAILED — a Keystore or Keychain that would not answer for a moment — as a journal that was EMPTY. The screens did the same: a failed read hydrated them onto three empty stores, they drew a blank record with nothing to say it was blank by mistake, and the next tap wrote "blank plus this prayer" to disk. Weeks of someone's record, replaced by the one prayer they had just logged; the sunnah log survived only because nothing wrote it that day. The store now keeps a plaintext witness that a record has been written on this device, and a reader that is about to write treats a failed read of a witnessed record as an error rather than as nothing there — the Log, Today's checks, the notification's Log button, the evening reminder's "log the day", and the sync merge all refuse to write until the record can be read, and the Log offers to try again. A first launch still reads as a first launch. Two more doors on the same room closed with it: the check on Today could record before the journal had been read (it is drawn as not-yet until then, and refuses regardless), and a value published while a read was in flight fabricated the other stores as empty and announced them as loaded (it is held and laid over the read when it lands).
- **Once a prayer's preferred time has passed, its row says when the second time ends — issue #38.** The Mālikī line under a prayer read "First time until 21:06" all evening, a boundary already behind the reader, and how long the second window ran was nowhere on the card. On today's card the line now follows the clock: the first window's end while it is open, then the second window's end — the next prayer, in the book's own terms; Maghrib's and Ishāʾ's at tomorrow's Fajr — for as long as the prayer is unlogged, then the first boundary again as a fact of the day. The turn happens at the boundary itself, not at the next re-render. The line never goes away — a row is the same height at 05:00 as at 23:00 — so the table does not shrink as the day is logged and leave a void under itself by evening.
- **In Arabic, the sun and the moon crossed the card in opposite directions.** The app mirrors its layout for right-to-left languages, and the moon was mirrored with it while the sun was not. The sky is not a row of text: it reads the same way in every language now.
- **The sun crosses the sky once a day, instead of three times.** Its place on the card came from how far through the current passage it was — the dawn, then sunrise to Asr, then Asr to Maghrib — so it swept the same short stretch of sky three times over, jumping back at each boundary and, at Asr, up into the sky to set a second time. It is one arc now, from where it rises to where it sets: it comes up at the point the day begins from, climbs to its height at Dhuhr — the middle of sunrise and Maghrib is solar noon — and reaches the horizon exactly as Maghrib arrives. The passages do what they are good at, the colours and the fading in and out. The arc is drawn across the whole card, too, rather than its middle third.

## [2.18.1] — 2026-09-09

### Added

- **A check beside each prayer on Today records it.** One tap logs the prayer as prayed now, with the status the Log would give it — on time inside the prayer's window, late once it has closed — and a second tap un-logs it. A prayer whose time has not come cannot be tapped. Fajr's window ends at sunrise, Isha's at the next day's Fajr. The write goes through the Log's own path, so the graph, the evening reminder and the second-time alerts all follow.
- **The sky behind the countdown is the day itself.** One continuous scene drawn from the clock, in five passages that meet at the prayer times: night from Isha to Fajr, with the moon crossing the top of the card in its actual phase — one of the eight — for that night; dawn from Fajr to sunrise, from the dark through the saturated rose and orange of the horizon to first light, the sun rising into the card near the end; the day from sunrise to Asr, the sun climbing to its height about Dhuhr and starting down; sunset from Asr to Maghrib, deepening orange and red until the sun has set completely; and dusk from Maghrib to Isha, the afterglow darkening through purple into night as the stars come out. It changes minute by minute and is never seen to jump. It is true to the hour, not the theme — night is dark at night in a light app, noon bright at noon in a dark one, whatever Material You has done to the accent — and the hero's text takes its ink from the sky at its own height, pure white where the sky is dark and pure black where it is light, switching at the one luminance where both clear WCAG AA; the test sweeps every minute of every passage to prove it.
- **Surah names in calligraphy.** The Quran list and the Tilawah page show each surah's Arabic name as the King Fahd Complex's calligraphers drew it — the name alone, vocalised, one glyph per surah, the same glyphs quran.com titles its chapters with — at one size everywhere it appears.

### Changed

- **Today is one screen.** The hero runs to the top edge of the phone — the sky reaches up under the status bar, whose clock and icons take the sky's ink — and carries the location and the Qibla bearing as its first line, so the page opens on the drawing rather than on a chip above it. Under it, the week and the day's times sit on the page itself: the rows are flatter, the alert control is its icon alone, and the whole day is on screen without a scroll. What was below the fold has gone where it belongs: the data source's footer and the statistics card to Settings → Prayer times, and the practice graph to the Log, which is its page. The Mālikī second times and the month link stay. The tab bar is a flat band the content ends at rather than a pill floating over it, and every tab's title bar is painted in the page's own colour with no edge under it, so the bar and the page read as one surface. Wide windows — the iPad and Mac dashboard — keep the card layout.
- **No title bar on any tab.** Quran, Tasbih, Duas, the Log and Settings begin at the status bar, as Today does: no title repeating the word under the thumb, no arrow back to Today — the tab bar is the way between tabs, and the hardware button still goes home. What the bars held moved into the pages: Quran's Tilāwah and sync controls are its first row; the Log's sync is in its options; inside a dua category the arrow up to the index and the category's name are the page's own first line. The playing bar, when something plays, clears the status bar itself. Pushed pages keep their bar in the page's colour.
- **The Log is one screen too.** The graph, the day and nothing under it: the three fill-and-reset actions, the end-of-day reminder switch and the pointer to sync are behind a ⋯ on the day's card (with "Sync now" once sync is set up), the fasting section is one line — the state and iftar time open the fasting page, the action beside them — and the prayer rows sit tighter. "Mark all on time" stays in view.
- **The days on Today turn under a living hero.** Choosing another day used to swap the whole card for a date and a "first prayer" pill — the one living thing on the screen became a dead panel the moment anyone looked at Wednesday. The sky and the countdown are always today now; the table under the day strip pages sideways between the seven days, the strip selects and tracks it, and only today's page carries the checks, the bells and the next-prayer emphasis. The Quran shortcut — continue reading, start, or the khatmah's next page — is back under the table, because it fits.
- **Today fills the phone, and the sky has the room.** The hero grows to take whatever the table and the Quran shortcut leave, so the page ends at the tab bar with no band of nothing under the rows; the countdown block sits at the hero's foot and the sun, moon and stars are laid out in the open sky between the location row and that block — never under the status bar or the camera, never behind the text. The ink for each line is taken where the line actually is.
- **The Log fits the screen.** The stepper is the day card's own first line, with the ⋯ beside it; "Mark all on time" moved into that menu; the status chips are shorter and the rows tighter; the fasting line is one line. On another day the title is the way back to today.
- **Tilāwah is a row under the khatmah.** What is playing — or what pressing play would start, where the reader left off — with play/pause and the next surah beside it; the row itself opens the player. Sync, once set up, sits at the end of the downloads line.
- **The muṣḥaf can follow the app theme.** The tone control cycles paper → sepia → night → auto; on auto the page is paper in a light app and night in a dark one, Material You included. A fresh install starts on auto; an existing choice is kept.
- **The prayer alerts say more, and look like the app.** The header carries the prayer's clock time; the body says whose time it is; the expanded card names the next event and its time; the tint is the app's accent (Material You included) rather than the grey of a system notice; the card is shown in full on the lock screen and ranked as an alarm when it carries the adhan. The pre-prayer reminder shows the prayer's time too.
- **A dua category is a page of its own.** Inside one the tab bar goes away and the list takes its height, the category's name is centred over the list with the arrow back to the index beside it, and a "back to the top" arrow appears when the reader turns back up a long list — the same one Tilāwah's surah list has.
- **Today makes room for more rows without losing the hero.** Turning on the extra times or the Mālikī second times lengthens the table; the hero gives up its open sky first (and the sun or moon steps out rather than sit behind the countdown), keeps its own text whole, and the page scrolls only the little that is then left over.
- **The Log's status chips are smaller** — footnote type under a callout line, rather than a headline that outweighed the prayer it belonged to.
- **The Tilawah page is a player.** One hero (the surah, its name in calligraphy, the reciter as a line), one bar with the ayah count and the clock on a line, a transport of ayah · surah · play · surah · ayah, and one quiet row for speed, sleep timer, shuffle, keep-awake and show-the-page — each a chip that says its value and cycles on a tap. The intro paragraph sits behind an ⓘ; the surahs are divided rows rather than a card each.
- **The whole app is quieter to look at.** A redesign pass over every screen, planned in `docs/design/redesign-plan.md` and carried out in five phases. The tab bar no longer sits on top of the last row of a list: a fade in the page colour runs up from it, so content ends where the bar begins. Titles are in sentence case. A screen is one level of container deep — cards hold rows and tiles, never other cards — and the rows inside a group are separated by an inset hairline rather than by each row being its own card. The colour is reduced to one accent: the cyan, the gold and the second greens that had accumulated in the Log, the Qur'an page and the practice heatmap are gone, and a chosen chip is the one thing on a row painted in ink; the suggested one has a tint, the rest have nothing. Prose that explained a control — the Maliki note, the sync introduction, the compass cross-check — sits behind an ⓘ or clamps to two lines. Spacing, radii and type come from tokens, checked by `scripts/tokens-audit.js`, which went from 1,483 findings to none. The tab bar's hide and show is a spring, and honours Reduce Motion. The Qibla screen is one instrument: the bearing, a drawn dial with the signal as an arc around it, one line of status. In the muṣḥaf the header and status bar take the page tone on Android as they did on iOS, the header's words are icons, and the row above the page (juz, tone) folded into the bar under it — which now takes the page's own colours rather than the app theme's, so a dark theme on a paper page no longer puts black boxes on white.

### Fixed

- **Android widgets: "Could not load widget data (ArrayIndexOutOfBoundsException)" — issue #31.** With Sunrise and all three night marks on, the prayer card has nine rows; the array that names each row's highlight box had eight entries. The ninth row threw, and the Next-prayer, Prayer-times and Prayer-times-(tall) widgets all showed the error. The four column arrays are the same length now, the binder indexes the boxes defensively, and a test pins both. On the way: the strip sized its times as if nine columns shared its width when it has six, so they came out a third smaller than the row could hold.
- **Every Android widget now fails as a Mihrab card, never as the launcher's.** Only the Next-prayer card caught its own render; a fault in the Streak, Continue-reading, Hijri, Tasbih or Log card showed the launcher's "Can't load widget" with nothing to go on. All of them now show a card in your own colours reading "Couldn't load widget" with the class of what went wrong — enough to diagnose from a screenshot — and log the rest.
- **Opening the app redrew every Android widget about ten times in its first second.** The payload is pushed from more than one place while the app settles, and each push — nearly always identical to the last — fanned out a full redraw of every placed card, three size variants each. An unchanged payload arriving within a minute of a drawn one is now stored and left alone; opening the app after longer still refreshes every card, a prayer time passing or a tap on a card still redraws at once.
- **The Hijri and Tasbih widgets adapt to their height like the others now.** Squeezed to one short row, the Hijri card kept the year and the next-month column and cut them through the middle; the Tasbih card did the same to its "today" line. Each now drops that line at the short sizes and draws one variant per size the launcher can show, so rotating the phone never leaves the wrong one up.
- **Android widgets are drawn for every size the launcher can show them at.** Each size-dependent card (prayer times, log, streak, continue reading) now hands the launcher one drawing per size it may use — Android 12's size map — instead of one drawing for a guessed "current" size read out of an options bundle whose two heights are the two orientations. Rotating the phone, resizing the card, or a launcher that reports sizes the card was never tuned against no longer picks the wrong variant. Below Android 12 the single measured size still applies, with the orientation resolved as before.
- **A line of the muṣḥaf drew short, with a void at each end.** Page 177's twelfth line — Al-Anfāl 8:6–7 — asked for a word space a whisker wider than the band the renderer allows, and rather than setting it at the widest the band permits, the renderer gave up and set it at the ordinary space: the line came out at 81% of the measure and was centred, with a gap either side. Every one of the 604 pages was then measured: ten lines are affected, on pages 177, 205, 400, 443, 511 and 604, and every one of them is an ordinary line the print sets flush to the measure. They now follow the print, however wide a space that takes. The framed plates — the Fātiḥah and the opening of Al-Baqarah, whose short lines are short in the print too — are unchanged.
- **The muṣḥaf's automatic tone now shows an "A".** The page's tone control cycles paper, sepia, night and automatic, and in the page bar it shows the next step as a glyph alone. Automatic was a half-lit disc filled on the opposite side from sepia's — a few pixels apart at that size, and easy to take for the same thing. A letter cannot be mistaken for a phase of the sun or the moon, and it is the honest distinction: the other three are tones, and this one is a rule.
- **And the same on every other tab.** No tab draws a title bar any more, so on Quran, Tasbih, Duas, the Log, the Settings and the pages inside them, whatever was at the top of a scrolled page rode up behind the clock and the status icons. The strip on those pages is the page's own colour — the content starts below it — so it is simply covered now: nothing changes at rest, and nothing is drawn through the system's own text again.
- **Scrolling Today drew the city and the Qibla bearing through the clock.** The sky runs up under the status bar, which is the point of it — but the hero's top row rode up into that strip as the page moved, and the two sets of text were drawn on top of each other. The strip stops being clear as soon as anything would pass behind it: it takes the sky's own colour at that exact height, so nothing about the page at rest changes and the row simply disappears behind it. Past the hero it takes the page's colour instead, and the clock and battery change from light to dark with it.
- **The location on the Today screen sat away from the edge of the page.** The chip filled the space between the edge and the Qibla button and centred itself in it, so the city stood out of line with the countdown and the date beneath it. It sits on the same edge as the rest of the hero now.
- **A hairline of the page showed down the right edge of the Today hero.** The sky is drawn at the size the layout measures, and that measure is a fraction of a point — on a 1280-pixel screen at 3x it is 426.667 — which the drawing surface rounds down, leaving the last two pixels of the screen uncovered. It is rounded up now.
- **Two surah names drew as a speck on iPhone and iPad — Maryam and Al-Qāri'ah.** The name in the calligrapher's hand came out at about 4pt in the Quran list, the same two names on every launch, while the other 112 were right; Android and Mac were unaffected, and the font was not at fault. The list asked iOS to shrink the name to fit if it had to — a net meant for very large text settings — and on iOS that search has no floor the app can set: when it ends without a size it likes, it falls back to a fixed 4pt, which is what those two names got. A name is a drawing, so nothing shrinks it now; it keeps its width and the row's words give way, as they already did for the longer names.
- **The first letter of سورة يوسف was cut off in the surah calligraphy.** The glyph draws a quarter of an em past its own advance width, so the box a Text measures for it ended inside the ي. The font's advances were rebuilt so every name's ink ends 40 units inside its box — Yūsuf by the quarter em it needed, a dozen others by a hair. The drawings are untouched.
- **The sky is right at every minute of every kind of day, and says so.** A test now walks a mid-latitude autumn, Makkah, a Stockholm June with Isha after midnight, a December with eight hours of light and a near-polar summer, minute by minute, with every extra-times toggle and the Mālikī boundaries in the map, and asks of each: night at night, the passages in order and meeting at the prayer times, the ink readable wherever the text lands, every body inside the open sky on every phone height. It found three things: with Isha after midnight the sky skipped the dusk and began the night at Maghrib; the hero's rail read that Isha as already passed at eleven and ran from Isha to Isha with nothing in it (and before Fajr it showed nothing at all, when "how far into the night" is the one time it is most use — it now runs from last night's Isha); and on a tight band the moon could poke a pixel out of it. All three are fixed.
- **Today adapts to the phone and to the table.** On a window under 720dp, or a table past six rows — the extra times, the Mālikī boundaries, which add a line to every prayer — the rows go dense. On a tablet held upright the hero grows to the page's foot as it does on a phone; it had stopped a third of the way down over a void.
- **The Log fits more phones.** The graph's legend moved behind the ⋯ ("What the graph shows"); Witr and Qiyam are one line under Isha; on a window under 760dp the stat tiles drop their third line and the graph is drawn at four fifths. The day's card keeps its size everywhere. A 640dp phone still scrolls a little — five prayers with their four statuses cannot be shorter than they are.
- **The sky no longer turns to noon at one in the morning when the Sunrise row is off.** The row's toggle removes Sunrise from the day's map, and the sky read a missing sunrise as "no timings" and painted a plain day. It now takes the raw day, Sunrise included, and — should it ever be missing — assumes a dawn of an hour and a half rather than giving up.
- **The sky reaches the hero's foot after the countdown turns over.** The gradient was drawn at "100%" of its box and did not follow it when the hero grew — the next prayer's rail, the extra-times toggle — so the date line sat on a band of the page colour. The sky is drawn at its measured size now, and the hero keeps a moon's worth of open sky whatever the table asks for.
- **The Live Activity countdown previews stay inside their card.** The seven-digit countdown ran out of the miniature; it fits to the room it has now, and nothing drawn in a preview can leave it.
- **The translation reader no longer wears the muṣḥaf's title bar.** The two readers share one route and swap on the toggle, and the muṣḥaf's paper/sepia/night header tint was left behind on the translation list — a sepia bar over a dark app page. The translation reader is the app's: its header and content take the app's colours.

## [2.18.0] — 2026-09-08

_From the release notes._

- Dhikr reminders: set your own, with words you choose, at any time of day, fully offline (#29).
- Reminders for Surah Al-Kahf on Friday, Al-Mulk at night, and the morning and evening adhkar (#36).
- Pick your school (Hanafi, Maliki, Shafi'i or Hanbali), and the times and prayer names follow it (#21, #22).
- A second Spanish translation of the Qur'an: Isa García, alongside Cortés (#37).
- Duas: all nineteen categories on one screen, grouped, with a header that shows where you are (#33). The lavatory and dressing duas are added (#34).
- Tapping a notification or a prayer widget now opens the screen it is about (#27).
- The Notifications page shows what is scheduled to fire (#32).
- Downloading a recitation also brings its word data, and Mihrab shows how much of each surah is actually on your device (#30).
- The data panel can be folded away, and stays folded.
- Fixed: the widget picker showed two 4×1 widgets, and a widget that fails to draw now says why (#31).

## [2.17.1] — 2026-09-07

_From the release notes._

- The practice graph fills the widget it is drawn on. It was sized for two thirds of the available space, so it floated in the middle with empty space above and below; a 4x4 widget now shows eight rows of history where it showed six.
- Fixed: on the Log widget the graph was slightly too large for its box, so every square was scaled down and the grid stood away from both edges.

## [2.17.0] — 2026-09-07

### Added

- **A dua and a tafsir passage can be sent to someone** — issue #24. An ayah could already go, as text or as a card; the other two could not go at all. Both hand the phone plain text rather than an image, because that was the ask: a picture of a dua cannot be pasted into Notes, searched, or read aloud on the other end. A dua travels with its transliteration — the point of sending one is that the person receiving it can say it, and someone who does not read Arabic cannot say it from the Arabic — and with the title and translation in the language the sender is reading, not the English underneath it. Tafsir shares from where it is read, credited to both the edition and the ayah it explains. Every one of the three carries its source: the builder refuses to produce a body without one, so a quotation cannot leave the app with nothing behind it.
- **The Continue Reading widget resumes the recitation, not just the page** — issue #25. Picking up where you left off meant opening the bookmark, finding the reciter and pressing play. The card now carries a play control beside the surah name: one tap opens the position and starts reciting from it. Tapping the card itself still opens the page in silence, because that is what most taps mean. On iPhone and iPad the control is on the medium widget only — the system routes every tap on the small and lock-screen sizes to the card itself, so a button drawn there would quietly do the wrong thing.
- **A prayer the Live Activity changed for one occasion says so on the home screen, and offers the way back.** The card's button can put the upcoming prayer — or Sunrise, or a night mark — on a different alert for that one time. The row went on showing the standing setting regardless: silence Fajr from the lock screen at midnight, open the app, and it still said Adhan. The app held two answers about the same prayer and had no way to reconcile them. The row now shows what will actually happen at that time, with a line under the name naming the exception and undoing it — "Alert just this once · Reset". It follows the occurrence rather than the name, so an override set after Isha appears on tomorrow's card where that Fajr is, and never on the one that has already been and gone. Reset clears both halves — the app's and the card's — puts the prayer back on its standing setting, and the card's button drops its "· once" the moment it is pressed.

### Changed

- **The app is 14.3 MB smaller to download.** The thirteen Qur'an translations were compiled into the JavaScript bundle, and Android does not compress a `.bundle` — it is stored in the APK at full size, so those sixteen megabytes were paid in full by everyone who installed the app, including the twelve editions they would never open. They ship as ordinary assets now, where they compress like the JSON they are: the bundle went from 26.0 MB to 6.3, and the download from 50.1 MB to 35.8. The Qur'an's own text went the same way — one hundred and thirteen per-surah files that were reached through a hundred-and-thirteen-branch `require` switch, now a filename. They are still inside the app and still read with no network, so nothing about reading the Qur'an offline changes — only where the bytes sit and what it costs to send them. A retired Arabic tafsir that had been sitting in the repo unreferenced went with them.
- **A silenced prayer no longer announces its Mālikī boundary.** The ikhtiyārī-window alerts were built from their own opt-in list and never asked what the prayer was set to, so someone who silenced Fajr to avoid being woken at 04:30 was woken at 05:00 instead by "Fajr's first time ends at 05:15" — an alert about the prayer they had just switched off, in the same sleep. Silence means no alarm is registered; the pre-prayer reminder already obeyed that and these now do too, both the lead-in and the end of the window. The two opt-ins pull opposite ways and the more specific one wins: turning a boundary alert on is a standing choice about a boundary, silencing a prayer is a choice about that prayer. This applies to the row's own setting and to the Live Activity's one-occurrence override alike — silencing tonight's Ishāʾ silences tonight's boundary and says nothing about tomorrow's.
- **The Live Activity's button is the home row's control now, for one prayer.** It said "Mute next adhan": two states, and the only thing it could say was "not the adhan". That was written before the five prayers had modes of their own, so it was answering a question the home screen had already answered — somebody whose Fajr was set to the plain alert was still offered a mute for an adhan that was never going to play, and somebody who wanted silence could not get it from the card at all. The button now starts from whatever that prayer is actually set to and cycles the same three, in the same order, with the same words: Adhan, Alert, Silent. Sunrise and the night marks get two of them; the call to prayer is not theirs to make. What has not changed is that it is temporary — it speaks for THIS Fajr and never for Fajr, it is gone the moment that time passes, and it never writes the standing setting. While one is live the button says so ("Alert · once"); cycle back to what the row was set to and the marker goes with it.

### Fixed

- **A prayer time no longer breaks across two lines.** Reported with a screenshot: on the Today card "Last Third" showed `02:2` with a `3` underneath it, while the five prayers beside it were fine. What separated the broken rows from the working ones was which digits they contained. The time column is sized by the longest time on the card, and length stands in for width only while the numerals are tabular — which is a request to the font, and Android lets people choose a system font that does not honour it. On a handwriting face the column was sized by `00:46` and asked to hold `02:23`, which is wider in that face. A row now sizes to its own time whenever the card's sample is no longer than it, which is right in any font, and neither text may wrap.
- **The Tasbih widget does not slow down as the count grows, and cannot stall the app.** Every tap wrote one record per bead, and the widget cannot reach the app's store — so each tap read the whole queue back out, parsed it, appended, re-serialized all of it and rewrote the file, then parsed it again to redraw. A set is thirty-three beads and a fortnight of counting without opening the app is thousands, so the cost grew with the count: measured at 47ms a tap on an empty queue and 182ms on a full one. Past a point the taps arrive faster than the phone retires them and the app stops responding. A run of taps is now one record whose count goes up, so bead three thousand costs what bead one did — 94ms a tap before the change on a full queue, 10-20ms after, which is less than an empty queue used to cost.
- **The Continue Reading widget fits the size it ships at.** At its default 4x1 the last line was cut off — the page and juz on a plan, "3 pages left" without one. One launcher row leaves the card 69dp for its content and the two columns wanted 65 and 70, so one was over the edge and the other was inside a rounding error of it. Height now picks a tier: the smallest scales the type down and drops the line that repeats the counter beside it, and the largest scales up rather than leaving three rows of card mostly empty. It can also be dragged past two rows now, which the old resize ceiling forbade.
- **A Qur'an download can no longer hang for ever.** Recitation, word timings, page fonts, tafsir and reader-supplied riwayah datasets each reached the network without a deadline. That mattered most on exactly the networks it was meant to survive: the audio and font stores fall back to a second transport when the first one fails, and the fallback was the untimed one — so a connection that is accepted and then stalls left a spinner with no end and no error. Every one of them has a deadline now, and tafsir retries once.
- **A prayer silenced from the Live Activity stays silenced when its time is recalculated.** The override knew which occurrence it meant by the exact millisecond the card was counting down to — and an instant is the one thing about a prayer that is not fixed. Nudge a per-prayer offset, change calculation method or provider, or let automatic location resolve somewhere new, and the prayer moves a minute or two; the override then matched nothing, and no match means the prayer falls back to its standing setting, which is usually the adhan. Silencing Fajr from the lock screen and hearing it anyway was the one failure this control exists to prevent. It is keyed to the occurrence now — the prayer and the day it falls on, which is what "this Fajr" meant all along. This also fixes a case where the marker never appeared at all for a First Third of the night that lands after midnight: its row sits on the evening's card while its instant belongs to the next day, and only the scheduler's own reckoning gets that right.
- **Silencing a prayer from the Live Activity now silences its advance reminder too.** The 15-minute heads-up is a separate alert, and the card's button used to leave it standing until the app was next opened. Eventually is the problem: the case this control exists for is silencing an early Fajr the night before, and the phone then stays locked until morning — so the prayer was silent and the reminder went off fifteen minutes before it anyway, which is louder than doing nothing. It goes with the prayer now, and comes back with it.
- **Both writers of a prayer alert put it on the clock the same way.** The scheduler asks AlarmManager for the exact alarm type when the permission is granted and the inexact allow-while-idle type when it is not; the Live Activity's button passed a hand-written flag that asked for neither, so a prayer re-created from the card could be scheduled less punctually than the same prayer scheduled a minute earlier by the app. One trigger builder, in a module both can reach.
- **"Play adhan as an alarm" survives the Live Activity's button.** That setting is not a flag on a channel — a channel's sound and audio attributes are frozen when it is created, so the ringer-proof version is a separate channel — and the payload the card's button works from was resolving the ordinary one. Cycling a prayer back to the adhan from the lock screen re-created it on the stream a silenced phone silences, which is the exact thing the setting exists to prevent, undone by the control meant to be putting it back. The button also now checks the channel is actually there before posting to it: the alarm twin is created on the sync after the setting is turned on, and a notification posted to a channel that does not exist is dropped by Android with no error and no sound — a plain alert is the better failure, and the next resync restores the right one.
- **Pressing a Live Activity button no longer throws the card backwards.** The countdown walks itself onto the next prayer while the app is closed — that is the whole reason it can run for a day without being opened — but that walk lived only in the running service's memory. Both buttons rebuild the card from the payload on disk, which was whatever the app last wrote, so pressing one an hour after closing the app rebuilt a card for an event that had already passed: the wrong prayer's name over a countdown running backwards (`-40:19`), and the alert-mode button aiming at an instant nobody can be alerted at any more. It also gave the rescheduled alert the wrong prayer's name. The advance is written down now, from both places that make one — including the wake alarm, which in deep sleep is the only one that runs, and is therefore the case that mattered.

## [2.16.0] — 2026-09-06

### Added

- **Today and the Log say which day it is, in both calendars.** The Hijri date was on the widget and nowhere in the app — issue #23. Today's card carries it under the countdown, and the tracker under the day it is logging, where the line above reads "Today" and says nothing about which day that is.
- **Al-Kahf and Al-Mulk have a door on the Qur'an page** — issue #23. The two surahs read on a schedule rather than looked up, reachable without scrolling eighteen and sixty-seven rows or typing a name that has four spellings in Latin letters.

### Changed

- **The practice graph on the Android widgets is a run of days, not a wall of weeks.** Seven rows of week-columns is the shape the in-app heatmap uses, and on a home screen it cost more than it returned: every day was a speck, and reaching the card's far edge took six months of them. The days run left to right now and wrap like text, ending on today, at a size where the fast ring and the sunnah mark on a square mean something. The rows follow the card: make it shorter and it loses a row rather than shrinking every day in it.
- **One line between the times and the graph, and the same line on both cards.** The streak had a row of its own with the number at 26sp, so the two widgets each spent three lines of small grey text on the band between their times and their graph — and the right-hand half of two of them said the same thing ("2 of 5 logged", "2 of 5 today"). It is one line now: what is next on the left, how the week has gone on the right, ruled off the same way and set at the same size on the prayer-times card and the Log card. Islamic Midnight and the Last Third moved above that rule, where they belong — they are times, and under the streak line they made the band two lines on one card and one on the other. The prayer-times widget is about forty points shorter for it, and the graph now appears from two launcher rows up rather than three.

### Fixed

- **The graph reaches the edge of the card.** On a 4x4 it stopped about eighty pixels short of the right-hand edge that the divider and every line of text reach, which reads as a graph being clipped. The column count was derived from the card's HEIGHT — a number the widget can only estimate — and then drawn at a different cell size again, so the two shapes had no reason to agree. The cell comes from the width now, which the card does know, divided exactly among its columns; the height only decides how many rows fit.
- **An edge square is a whole square.** Every ring in the graph is drawn centred on a cell's boundary and today's reaches a whole stroke outside it, so on the first and last column the outer half fell off the bitmap: a flat left side and a hairline half the thickness of its neighbours'.
- **The times across the top of the prayer widget no longer run into each other.** They are declared with an auto-size that AppWidget hosts do not reliably honour, and the 12-hour clock in 2.15.0 made every one of them half again as wide — six of them collided. The size is measured against the column now and set explicitly, and the meridiem is set at 62% so the digits keep nearly the size the 24-hour clock has. The Log widget's times get the same treatment.
- **The alert bells on the Today card line up.** The control sits beside its time, and the time column was as wide as its own time — so on a 12-hour clock the one row with a two-digit hour ("11:09 PM") pushed its bell a digit to the left of the other six, and a column of controls read as a ragged edge. Every row is now sized by the widest time on the card. The dot that marks a prayer you aimed the countdown at holds its place on every row too, rather than nudging that one row's control aside.

## [2.15.1] — 2026-09-05

### Fixed
- **A prayer you have logged is no longer told it is late.** The second-time alerts were built from prayer times and nothing else, so someone who prayed ʿAṣr at 16:35 and recorded it was still told at 18:40 that ʿAṣr's preferred time had closed, and at sunset that ʿAṣr was now qaḍāʾ — the app contradicting its own journal, from data it was already holding. The schedule now skips a boundary whose prayer the journal has answered, keyed by the day the window belongs to rather than by "today", and logging a prayer drops what is already scheduled rather than waiting for the next resync. Where two prayers share one alert — Ẓuhr and ʿAṣr expire together at Maghrib, Maghrib and ʿIshāʾ at the next Fajr — logging one redraws the notification naming the other, instead of cancelling it and taking the other's warning away. A prayer recorded as missed counts as answered too. Reported in #23.

### Changed
- **The Moroccan timetable is refreshed** from the Ministry of Habous.

## [2.15.0] — 2026-09-04

Tilāwah: the Qur'an as something you put on. Plus the Mālikī second times answering what was actually asked for, morning and evening adhkār, and a 12-hour clock.

### Added
- **Tilāwah — listening, as its own page.** The reader already played audio, but only ever the passage in front of you, and only until that surah ended. Listening is a different act: put a recitation on in the car or at night with the screen off and it runs surah into surah, from the lock screen, without the app open or even alive. Pick a reciter, start anywhere, scrub by ayah or by surah, set a speed or a sleep timer, and follow along on a live preview of the muṣḥaf page with the recited word lit. Downloads share the reader's own folder, so a reciter fetched for a flight makes play-from-here work offline in the same act.
- **Morning and evening dua reminders.** In the windows the adhkār themselves name — after Fajr before sunrise, after ʿAṣr before sunset. There is no time to choose, deliberately: those windows move with the sun by hours over a year, so the app works the time out from the day's own prayer times instead of asking anyone to keep a clock preference in step with the seasons.
- **The Mālikī second times (ikhtiyārī / ḍarūrī), from *Al-Murshid al-Muʿīn*** — issue #19. Each prayer's preferred window and where it closes, computed on the device from your coordinates whichever source your times come from, with the two that are a model of a colour marked as approximate. Announce any of them, and — new — be told when a prayer becomes qaḍāʾ. Showing them and announcing them are separate decisions, because the reporter wanted the second without the first.
- **A 12-hour clock** — issue #18. Settings → Appearance → Time format: Automatic, 12-hour or 24-hour. Automatic follows the device's own switch; an explicit choice overrides both it and the app language. Every surface that prints a time follows it.
- **Each prayer decides how it speaks** — adhan, plain notification, or silent, a row at a time.
- **The player travels with you.** A bar under the title bar on every screen while something is playing: what it is, a progress bar for the surah, and a way to pause it or open Tilāwah without finding the tab again.

### Changed
- **Settings is an index of seven sections**, not twelve cards in one scroll, and each long page is split into sub-pages that carry their own explanations.
- **The remote next/previous move by surah.** A track is one ayah, so the lock screen, the media keys and a headphone button used to advance six seconds at a time — 286 of them to leave Al-Baqarah. They now do what the app's own big arrows do; the small pair still steps by ayah.
- **Titles are centred on both platforms.** Sub-pages and tabs alike, rather than centred on iOS and left on Android because nobody had said which.
- **The Moroccan timetable is refreshed** from the Ministry of Habous.
- **The player costs almost nothing while nobody is looking.** Position polling, the word-highlight probe and the page preview all stop when the app is backgrounded or the page is off screen; the JS thread went from 21% to below the measurable floor with audio playing in the background.

### Fixed
- **The home-screen widgets were cutting off their last line.** The prayer strip lost its next-prayer countdown and Log Today lost its footer, squeezed to a few points of half-drawn text on any phone whose launcher row is about 147dp — every 480dpi Pixel. The height budgets were measured before `widget_card_inset` gave every card a 6dp gutter, and nothing told them the layout had lost 12dp; they are host-view relative now, and each is a threshold and a budget at once so a variant can no longer be chosen on one number and filled from another.
- **The Mac shows what is playing.** `MPNowPlayingInfoCenter.playbackState` is optional on iOS and required on macOS, and the audio library never set it — so a Mac Catalyst build published a complete Control Center entry that macOS discarded: no panel, no media keys.
- **The keep-awake toggle holds the Mac's display awake.** It set the iOS idle timer, which macOS ignores; with the cup lit, `pmset` listed no assertion owned by Mihrab at all.
- **Cards no longer sit flush against each other** on the duas, fasting, backup, sync and Qur'an-download pages. The gap between them separated the scroll view's direct children, and since the reading column went in there has been exactly one of those.

## [2.14.3] — 2026-09-03

The muṣḥaf reads right: twenty pages had words drawn in the wrong face, lines were losing the bottom of their ink, and the page rail is rebuilt.

### Changed
- **The page rail on phones is rebuilt.** Dragging it no longer re-renders the muṣḥaf on every touch sample — the knob and a readout follow the finger, the reader peeks at a page once the finger rests on it, and the place is committed on release. Slide the finger up, away from the rail, to slow the scrub to half, a quarter and a tenth, so a single page out of 604 can be chosen on purpose; the readout names the surah, juz and page under the thumb and the speed it is in. The thirty ajzāʾ are marked on the rail, a touch on the knob picks it up without jumping, and the rail can be stepped a page at a time with a screen reader.

### Fixed
- **Twenty pages of the muṣḥaf were drawing words in the wrong face.** Pages 120–122, 145, 531–533, 564, 567, 569, 575, 583, 586, 588, 590, 592, 593 and 598–600 had fonts on the release cut short of the page: the words the font lacked came out in the system's Arabic face as rows of letter pairs — "له مج مح مخ" at the foot of Al-Qalam, an ayah of Al-Aʿlā turned to "هي يج يح يخ يم يى". The fonts are rebuilt from the layout the reader actually draws (so the two cannot disagree again), the app now checks every font it holds against a manifest of the release's sizes and quietly re-fetches the twenty on devices that already had them, and the release-upload script replaces a changed font instead of skipping it by name.
- **The bottom of a line is no longer cut off.** The page fonts' calligraphy reaches further below the baseline (and above it) than their metrics say, and both platforms keep only what falls inside a line's box; each line now has room for its ink, on every platform.
- **Turning the phone keeps the page.** On Android, rotating on a page past the middle of the muṣḥaf — page 589, say — could land the reader hundreds of pages back, and turning back kept it there: the scroll that re-anchors the page was executed before the pager had been laid out at the new width, clamped to the old strip, and then believed. A re-anchor the list did not honour is now issued again once the layout is there, and the pager no longer settles on an offset it was not sent to — on every platform, for the spread reader's rotations and window resizes too.

## [2.14.2] — 2026-09-03

The muṣḥaf, mostly: it opens faster, it follows the reciter, and it reaches the edges of the screen.

### Added
- **A tap on a word opens its ayah** — translation, tafsir, bookmark, recitation, khatmah position, all from the page itself. Fullscreen moved to the margins and the header strip.
- **A sepia page**, between paper and night.
- **The recited word lights up on the page**, and in landscape the column follows it down as the recitation goes.
- **Reading starts the moment the download does.** Pages arrive as their fonts do, with a slim line saying how the rest is going.
- **A page rail on phones**, so getting to juz 20 is not three hundred swipes.

### Fixed
- **The word highlight works on Android.** The timing file is fetched over a transport that works on every network, and a fetch that fails is retried instead of being believed for the life of the app.
- **The page reaches the bottom of the window.** The mini player was reserved twice, which left a band of nothing above it; and the Android navigation bar now takes the page's own colour, so a sepia or night page runs to the edge instead of stopping in a strip of app grey.
- **Turning the phone shows one page, not two.** The reader used to reveal the page waiting off-screen for the length of the rotation.
- **On iPhones with a Dynamic Island**, the surah name and the tone pill sit either side of the cutout instead of below it, and the ayah sheet clears it when the phone is on its side. An ayah can be selected in fullscreen at all.
- **Under Liquid Glass the tab bar has its icons back.**
- **The khatmah advances** when you set an ayah as its position or press the day's done button, not only when you read at its frontier.
- **Automatic location and saved locations are not alternatives** — you can keep the phone's location and still look up the places you saved.
- **The monthly sheet names the place** instead of printing coordinates.

## [2.10.1] — 2026-08-24

Sync could not accept the folder people were most likely to pick.

### Fixed
- **Choosing a Nextcloud folder — or any folder whose provider will not make a subfolder — no longer fails.** Mihrab asks for a `Mihrab` directory inside whatever you choose, purely to keep its file out of the way of yours. Plenty of providers refuse that while being perfectly happy to hold a file, and refusing the whole folder over it turned the most obvious choice — the synced folder you made for exactly this — into an error. It now writes into the folder you picked instead, and only stops you when nothing can be written there at all.
- **A folder you already named `Mihrab` is used as it is.** Choosing one made a `Mihrab` inside your `Mihrab`, so your sync client watched one folder while the app wrote to another one inside it — sync doing nothing, from a folder whose name said it should be working.
- **A folder that genuinely cannot be used says so in words.** The screen was showing the underlying failure verbatim: `java.io.FileNotFoundException: could not create a folder in there`, which names a Java class and tells nobody what to do. It now says which folders work.

## [2.10.0] — 2026-08-24

Your record on every device you own, without an account and without anyone else holding it.

### Added
- **Sync between your own devices.** Pair two devices by scanning a code — or by copying it, if the camera is not convenient — and from then on your journal, streaks, fasts, notes and settings stay in step. There is no account, no server of ours, and nothing to sign up for: the devices write sealed files into a folder you already keep in sync (Syncthing, a Nextcloud folder, whatever you use), and each one holds a key that never leaves it, so what passes through that folder is unreadable to everything but the devices you paired. Choose how often it runs — when the app opens, every fifteen minutes, hourly, daily, or not at all.
- **The Log Today widget grows up.** At its tallest it now carries the practice graph and a countdown to the next prayer, not just today's tally, and there is a picker entry for that size instead of leaving you to resize it and hope.
- **The prayer times widget in three sizes,** from a single row up. The one-row card drops its header rather than its times, so the thing you put it there for is the thing that survives.
- **Widgets speak the app's language.** All thirteen, on both platforms — and they follow the language *you* chose in the app, not the one the phone is set to, which is the whole point of choosing.
- **Seconds on the Home countdown, and a countdown you can aim.** Tap a prayer to count down to that one instead of the next.
- **Days you never filled in are marked as such** on the graph, instead of being drawn the same as days you deliberately left empty.

### Changed
- **The Quran download belongs to the app, not to the screen you started it from.** It keeps going when you leave the page or put the phone down, with a progress notification you can watch, and finishes on its own.
- **The app starts in the phone's language** until you pick one yourself. Previously it started in English and waited to be told.
- **On the Mac, the wordmark and the location share one bar** at the top of the window instead of taking a row each.

### Fixed
- **Manage downloads shows what is actually on the device.** It was reading the store the Quran reader stopped using in 2.8.0, so a device holding the entire mushaf — 179 MB of it — was told it had nothing downloaded and given no way to reclaim the space. Both stores are listed now, the current one and whatever an upgrade left behind.
- **The Fajr countdown is back in the Android widgets.** After the last prayer of the day the countdown had nothing left to count to, so it showed nothing at all — through the whole evening, which is when it was most likely to be looked at.
- **The widget picker previews are the cards you will actually get,** at every size, rather than a drawing that stopped matching them several releases ago.
- **The practice graph appears at the size that has room for it** and nowhere else; the smaller cards fill their space with what fits instead.
- **The practice grid in the widget scores a day the way the app does.** It had its own rules, so the same day could be a darker square in the widget than in the app.
- **Five of the Android widgets ignored the appearance settings** — the accent, the OLED background, the highlight — and had no way to reach them.
- **Four languages were naming prayers after meals or after strangers.** Those names are now the ones people actually use.
- **On the Mac, sync works on the Homebrew build.** Secure storage had nowhere to keep the device's identity, so it could not stay paired; it has a Keychain now. And the Mac introduced itself to every other device as "iPad", because that is what macOS answers when a Catalyst app asks for the device name.

## [2.9.1] — 2026-08-21

The widgets tell the truth again — including while the app is closed.

### Fixed
- **Widgets update without the app open.** The home-screen cards were only ever written while a particular screen was on the phone, so a prayer logged from a notification, a tasbih counted on the widget itself, or simply a new day arriving could leave every card sitting on old numbers until you next opened the app on that screen. The cards are now written from the app's own records, whatever you happen to be looking at, and every one of them is refreshed together.
- **A widget with nothing left to show asks to be opened instead of pretending.** When a card ran past the end of the times it was carrying it kept redrawing the last day it knew under today's date. It now says so plainly and asks you to open the app, which is the one thing that fixes it.
- **The practice graph in the widget is the same calendar as the one in the app.** It was filling squares in the order the days arrived rather than by their date, so a gap in your record shifted everything after it by a day. Weeks start on Monday now, in the widget and on the Mac, exactly as they do in the app, and days that have not happened yet are drawn as empty rather than as missed.
- **Nothing is drawn outside the card any more.** The streak widget's graph spilled over the edge of its own background at some sizes, and the count of prayers left to make up was pushed off the end of the line at the size most people use. Both are measured against the space the card actually has.
- **On iPhone and iPad, one unfamiliar value no longer empties every widget.** All six cards shared a single reader that gave up entirely the moment it met something it did not expect; a card now keeps everything it could read and only leaves out the part it could not.
- **The widget picker shows each widget at the size it will be**, rather than two of them cropped to a box that was the wrong shape.
- **Widgets survive a restore to a new phone.** A backup could carry another device's pending taps and a stale set of times across with it; those are now left behind where they belong.

## [2.9.0] — 2026-08-19

Sunnah prayers, your own adhan, and an app that finally reaches the edges of the screen.

### Added
- **The sunnah prayers.** The rawatib around each fard, logged beside it rather than instead of it: a prayer row now carries the fard and the sunnah that belongs with it, and the graph draws the sunnah as a line around the day's square instead of spending another colour on it. Only the ones whose time has actually come are offered, so Isha's sunnah is not asking to be logged at noon. "Log with sunnah" is on the notification too, for the times you answer the alert instead of the app.
- **Your own adhan.** Pick any audio file on the phone and every prayer alert plays it. On iPhone the notification plays the first thirty seconds — Apple's limit, not ours — and the full recording plays when the app is open. The seventeen bundled adhans are all still there; this is an eighteenth row in the same list, with the file's name under it so you can see which one you chose.
- **Export and import your whole record.** The old export carried settings only, which meant a new phone got your calculation method and none of your prayers. It is now the journal, the streaks, the fasts and the notes as well, in one file you can keep or move.
- **The best streak, beside the current one.** A number that only ever goes down is discouraging by construction; the record you have already set stays on the screen next to it.
- **Four stat tiles above the graph,** and a mode inside it that shows only what you owe — the days carrying a prayer you meant to make up later, which were previously buried in a green square.

### Changed
- **The app draws to the edges of the screen.** Android has been enforcing this on new phones for a while and will stop offering the opt-out entirely; the app now does it everywhere, on purpose, instead of behaving one way on new devices and another on old ones. The tab bar floats over the page again, slightly see-through, so a list sliding underneath it tells you there is more to read without spending a line saying so.
- **The system navigation bar and the app's own bar are one piece.** Behind the three-button navigation the band now matches the tab bar's material rather than being a solid slab, and on older Android it looks like it does on new Android.
- **Every prayer row speaks one language.** The controls on a row had drifted into three different ways of saying the same thing depending on where you tapped.
- **The practice graph's colours are a real scale.** The five shades were picked by eye and two of them were nearly the same; they are now an even ramp, so four prayers and five look as different as one and two.
- The tip jar is gone, everywhere.

### Fixed
- **The streak no longer reads zero every morning.** It counted today as a broken day from midnight until the first prayer went in, so the number you woke up to was wrong every single day.
- **The graph opens on today, in every language.** In Arabic, Urdu, Persian and Hebrew it could open on an unrelated month and make you scroll back — and dragging towards this week was read as reaching for more history, which then shoved the view sideways.
- **Nothing sits under the navigation bar any more.** The last row of every picker in Settings — the language list, the alert sounds, the calculation methods — was half under the system navigation bar and could not be tapped. On Android the buttons were being drawn over the app, because the bar reports itself as half the height it actually paints.
- **"System" appearance follows the system.** The app asked a copy of the setting that can lag behind, and a light/dark switch that happened while the app was in the background could leave it on yesterday's answer.
- **The widget stops going blank** when its schedule runs out — it now carries a month of prayer times instead of a few days.
- **871 strings that were still English** in the other twelve languages are translated.
- On Mac, the location chip sits in the column with the cards instead of floating over them.

## [2.8.10] — 2026-08-14

Words were going missing from the mushaf. They are back.

### Fixed
- **The mushaf was dropping the last word of some lines.** A reader wrote in about Surat An-Nisa and was right, and it was not only An-Nisa: about one line in eight, on nearly every page. The text and the fonts were never wrong — the renderer asked the phone to set those lines a little tighter than the space character it draws the gaps with, and on some devices the request was ignored, so the line came out wider than the page it had been measured for and the phone quietly cut the last word off the end of it. The gap is now made narrow instead of asked to shrink, which no device can decline. Every line of all 604 pages is checked against this on every build.
- **The graph scrolls the right way round in Arabic, Urdu, Persian and Hebrew.** It opened parked on the oldest week you have instead of on today, dragging towards this week was read as reaching for more history, and the history that arrived shoved the view sideways. Right-to-left now gets the mirror of the left-to-right behaviour rather than the reverse of it.
- **Quran files left behind by an update are cleared out.** Up to 120 MB of page images from the reader replaced in 2.8.0 could sit on the phone indefinitely if you had ever opened the reader and declined the download. They are swept at launch now. The page fonts also record which release they came from, so a corrected font reaches everyone instead of only new installs.

## [2.8.9] — 2026-08-14

The Log, made to work the way people were already trying to use it.

### Added
- **The Log opens by swiping, not only by the arrows.** The day panel is one card you can throw sideways; the arrows stay for one day at a time. Forward still stops at today — the card rubber-bands rather than refusing silently, so the gesture is visibly received and visibly declined. Arabic and the other right-to-left languages mirror it, as the arrows either side of the date already do.
- **"Fill in earlier days" and "Fill the past three months".** Someone who has prayed for years and installed the app on Tuesday met a wall of empty squares that was wrong about them. The first button fills from the day the app was installed up to yesterday; the second reaches further back, and pays for that reach by only ever writing to days holding nothing at all — no status, no note, no fast. Both ask first, and the question shows the exact number of days, the exact range, and how many days are being left untouched. Today is never filled: it still holds prayers that have not happened.
- **A day that owes a prayer is marked on the graph.** `missed` is how people note that a prayer will be made up later, which makes the day a to-do — and a to-do you cannot find is not one. A day of four on time and one missed used to draw a strong green square with no sign of the missed one in it. It now carries a dot in the corner, and screen readers are told as well.

### Fixed
- **The "Log prayer" button on a prayer notification actually logs the prayer.** It had been on every alert for three versions and wrote nothing: the only code listening for it lived on the Log screen, and someone pressing a button on a notification is not looking at the Log screen. With the app closed it did nothing at all. It now records the prayer from the background, and the alert carries the day it is for — so an Isha answered after midnight credits the evening it belonged to instead of blanking it. Pressing it twice cannot overwrite a status you set deliberately.
- **The evening prompt no longer asks about a day you have already finished logging.** It is retired the moment the fifth prayer goes in, and days already complete are skipped when the week is scheduled.
- **The graph scrolls on the first try, and on the Today screen at all.** The first drag used to be yanked sideways by the journal finishing loading underneath it. On Home the graph could not be scrolled at all — the card had become one large button, and a press target wrapped around a scrolling grid fights it for every gesture. The button is now a row at the foot of the card, and that graph reaches back through your history like the one on the Log.
- **The graph fills the width with history.** When it is narrower than the space it has, the weeks used to hug one edge with a gap after them; they now sit against the edge today is on, so the visible width carries as much past as exists.
- **The Today screen lists only what you have actually logged.** It used to read "0 of 5 prayers logged · No fast recorded · 0 dhikr sets completed" at seven in the morning — a list of the day's failures compiled before the day had begun.

### Changed
- The two switches on the Log moved below the prayers they are about, rather than sitting between the date and the day's rows. The cards on that page have space between them again.

## [2.8.8] — 2026-08-07

A Mac-only release. Nothing on Android or iOS changes.

### Added
- **The Mac app installed with Homebrew has the widget.** The prayer-times widget can be placed in Notification Centre, showing the same day's times as the iPhone one — small, medium and large. It reads the times the app has already worked out, so it costs nothing and keeps working offline; open the app once after installing and the widget fills in. Live Activities stay iOS-only, because macOS has nothing to show them on.

### Fixed
- **The Homebrew build no longer claims a Keychain group it cannot use.** Claiming it did not degrade quietly — macOS refused to start the app at all, before any of its own code ran. On this channel the journal, the fasting log and your coordinates continue to be stored the way they were before, which is the same as every previous Homebrew build; the App Store and Play builds are unaffected and still use the Keychain.

## [2.8.7] — 2026-08-03

### Added
- **The Log opens any day you have ever logged, not just today.** Arrows either side of the date step a day at a time, and every square in the practice graph is now a button that opens the day behind it — so a day months back is one tap, not a hundred. Everything on the screen follows: the four statuses, the private note, the fast, "Mark all on time". It writes to the day you are looking at, and it stops at today, because a log of the future is a plan. The prayer times shown next to each name are that day's, read back out of the local cache and put through your own per-prayer offsets; a day older than the cache simply shows no times rather than the wrong ones. A fast back-filled inside Ramadan is still recorded as a Ramadan fast, not a voluntary one.
- **The practice graph reaches the first day you ever logged, and scrolls.** It was thirteen fixed weeks, defended at the time on the grounds that a hard month should scroll out of view rather than stand as a monument — which protected you from your own record and took the record with it. A year in, every square earned before April was simply gone. The grid now runs from the Monday of your earliest entry to this week, with a month name over each column that opens one (and the year on every January), and it opens parked on today so the default view is still the recent one. Fasts count towards the span as well as prayers, so a Ramadan logged before you ever used the journal still pulls the graph back to itself.

- **The graph on Home, behind a switch.** Off by default — Home answers "when do I pray next", not "how has the month gone". The switch is on the Log tab next to the graph and in Settings → Appearance. The copy on Home is a picture, not a control: no day selection, no legend.

### Fixed
- **The graph now shows what you actually logged.** Depth came from the NUMBER of entries, so a day marked missed five times drew the darkest green on the chart — the app congratulating you for a day you had just told it went badly. It is now weighted by status: on time counts fully, late and make-up count for less but still count (flattening them to zero would tell a traveller who made up Dhuhr on the road that the day was a write-off), and missed counts for nothing. A day that was recorded but kept nothing is marked in a colour that is not the colour of success, rather than left as blank paper — blank is for days nobody opened the app on, and losing that difference loses the point of logging a bad day at all.
- **The graph updates on the tap, not on the disk write.** Every screen used to wait for the encrypted journal to finish writing before any of them saw the change, which on a journal with a year in it is long enough to sit and watch. The value is now published to every screen the moment it is entered, with the write carrying on behind it and putting the old value back if it fails.
- **A prayer whose time has not come cannot be logged.** Its four buttons are greyed out until the adhan time passes, and they open themselves the minute it does rather than waiting for the next launch. "Mark all on time" obeys the same rule instead of being the loophole around it — a button that quietly wrote "on time" against an Isha four hours away would put a claim in your own record that you never made. A prayer that somehow already carries an entry stays editable, so nothing gets trapped behind a dead row.
- **The graph scrolls back as far as you want to go.** It reached the first day you had logged and stopped, so the months the arrows could walk into were not on the chart at all. It now also covers whichever day you have open, and dragging to the oldest column loads another half-year — repeatedly, with the dates under your thumb staying where they are instead of lurching forward as the new columns arrive.

### Changed
- **F-Droid.** Mihrab is in the F-Droid repository — the recipe merged upstream on 1 August. The website and the README carry a "Get it on F-Droid" button pointing at the listing, and the merge-request link they used to track is gone from both.

## [2.8.6] — 2026-08-02

Two things the 2.8.5 design pass got wrong on real devices.

### Fixed
- **The tab bar's labels were cut off the bottom of the screen.** On an iPhone they were gone entirely; on Android they sat on the gesture handle. The bar sets its own height, and a tab navigator that is given a height returns exactly that — it stops reserving the safe area underneath, which the pill's bottom offset had been written to subtract from. Subtracting an inset nobody reserved hung the bar ten to twenty points off the bottom edge. The offset is now the whole gap and nothing is taken away from it: the pill tucks inside a home-indicator strip, which is a handle it only has to clear, and sits fully above a three-button navigation bar, which is real chrome. A test pins it, because this is a fault that no build log reports and every screenshot of the top of the app hides.
- **Home fits an iPad without scrolling.** The day card — countdown, week strip, six times, month link — is the tallest thing on the screen and uses almost the whole window on its own, so the Quran card stacked beneath it fell off the bottom: the one card on Home you are meant to act on was the one you had to go looking for. It now sits at the top of the side column, which was half empty. The foot of the page also carried a safe-area inset a second time, under a bar that had already spent it, and that dead air is gone everywhere.

## [2.8.5] — 2026-08-02

A design pass over the whole app, and the mushaf finally works in Arabic.

### Added
- **Six tabs across the bottom.** Today, Quran, Tasbih, Duas, Log, Settings. "More" is gone — a More tab is an admission the deciding was never finished, and with Find a masjid removed and Month folded into Settings there was nothing left for it to hold. Tasbih and Duas are separate now: one is a counter you tap fifty times, the other is a library you read, and bundling them saved a tab at the cost of ever finding either. On a phone the bar is a floating pill and the page runs underneath it, so a list that would otherwise stop dead at a solid edge tells you there is more below.
- **A page rail in the mushaf, on every device.** Six hundred and four pages is too many for a pair of chevrons — reaching juz 20 by tapping ‹ three hundred times is not navigation. Drag the rail and it ticks once per surah, not once per page: pages are two-per-pixel on a phone and would be a continuous buzz carrying nothing, while surahs are what people actually navigate by, and their uneven spacing is the signal. Al-Baqarah is forty-eight pages of silence; the last juz is a tick every few millimetres. Drag slowly and each boundary lands firmly enough to stop on; sweep and the ticks go light, because a firm knock twenty times a second is just a vibration. The surah under your thumb is named while you drag. Next to the rail, and on the Quran screen itself, a button to type a page number.
- **An end-of-day reminder that logs the day in one tap.** Ten minutes after Isha, optionally, a notification asks whether the day's five prayers went as planned; one button answers it without opening the app. It carries the date it was scheduled for, so the prompt you slept through and answered the next morning still logs the right night — which is the entire point, given Isha in a Swedish summer lands near midnight. It only fills prayers you haven't already recorded: a day where you marked Asr as missed keeps that record. Off by default; the switch is on the Log screen and in Settings.
- **The mushaf on iPad and Mac gets an index beside the page.** Surahs, juz and bookmarks in a sidebar, searchable by name or page number, with the page you are reading marked and the khatmah pinned at the foot. Facing pages are paired the way the print pairs them.
- **Al-Ajmi, and thirty more reciters.** Ahmed Al-Ajmi was in the catalogue all along, but the picker matched on a raw substring — so "alajami", the spelling most people type, found nothing and he read as missing. Search now folds case, punctuation, the al-/el- article and Arabic harakat, and checks a list of alternate spellings per reciter. The list is alphabetical.

### Changed
- **The Today screen is one card instead of four.** It used to be a hero, a table, a Quran bar and a tile row — four shadowed slabs on warm paper, so nothing grouped "today" apart from "tools" and the eye re-entered four times. The countdown is now the headline it should always have been (you roughly know when Dhuhr is; what you opened the app for is how long you have got), the seven-day strip is visible rather than hidden behind six-pixel dots, and the Quran card states where you actually are — continue reading, khatmah progress, or today's ayah — instead of a button labelled "Open the Quran" carrying no information at all.
- **Tasbih answers back.** The counter was a four-hundred-point white void with a number in it: no hint that it was the tap target, and nothing given back when you tapped. The count now sits inside a ring that fills, the ring is the tap target and says so, and the dhikr's meaning sits under the Arabic instead of a second Latin spelling of the same words. Reset is a text link rather than a third identical button, one of which destroyed your count. "Set 2 of 6" and a peek at what comes next turn six disconnected screens into one sequence.
- **Prayers, fasting and the practice graph share one screen.** The Log tab: thirteen weeks of history, the day's five prayers with a private note each, and the fast.
- **A single tap in the mushaf clears the chrome.** It used to open the ayah panel if the tap happened to land on a word, which is most of the page — so a reader trying to get the chrome out of the way was interrupted by a sheet instead. Tafsir, "play from here", repeat and share are a long press on the ayah now.
- **Sizes on the Mac follow the Mac.** Catalyst scales the whole canvas down for a desktop, and type designed for a tablet held at thirty centimetres was arriving on a display sitting at seventy. The tab bar, the navigation title and the Quran sidebar are sized for the distance they are read from.

### Fixed
- **The mushaf was blank in Arabic.** Only in Arabic — Swedish and English were fine, which is what made it look like a rendering fault rather than a layout one. An app running right-to-left measures a horizontal pager's scroll offset from the right, and the pager's own arithmetic counted from the left, so it opened parked six hundred pages past the end. Every page was laid out correctly and painted where nobody could see it. Right-to-left page turning was never the pager's job in the first place — that is the mushaf's own reading order, and it was already handled.
- **The mushaf can be read in landscape, and no longer disappears upside down.** Rotation is allowed in the reader; the accidental fourth orientation, which drew nothing at all, is not.
- **The Arabic weekday initials were unreadable.** Cutting each name to three letters gave الأحد and الأربعاء the same stub.
- **Twenty-seven strings showed English to everyone but English readers** — including "CHOOSE" in the middle of an Arabic screen. They are translated into all thirteen languages, and a test now fails if a new one appears.
- **Today's ayah is the same ayah everywhere.** The Quran screen and the notification each drew their own.
- **The Quran sidebar no longer sits under the window controls, or over the page.** On the Mac its tabs were behind the close/minimise/zoom buttons; on iPad the pages were sized to the whole window while the sidebar took a fifth of it, so the left-hand page of every spread ran underneath and was clipped mid-line.
- **The Duas screen wasted a header's worth of space at the top.** It reserved room for a transparent navigation bar it stopped having when it became a tab, so the header was counted twice. Tasbih had the same.

## [2.8.3] — 2026-07-31

### Changed
- **Downloading the mushaf is about five times faster.** Every page's typeface was being fetched three times over: the transport that writes straight to disk fails outright on some networks, so each file spent two doomed attempts and nearly a second asleep before falling back to the slower path that works. Across 604 files that is over a thousand pointless requests and nine minutes of waiting, in bursts that made the progress bar look frozen. The fallback existed all along — nothing remembered it. Now one failure is enough to learn from for the rest of the download.
- **A surah opens the way it does in the print.** It used to just start: the name sat in a plain rounded box the width of the name, and the basmalah under it was small grey text. In the Madinah mushaf a surah opens with a band — a rectangle ruled twice, ornament worked into the course between the rules, a rosette closing each end, and the name written in the middle across the whole text block. That is what you get now, drawn rather than traced: the printed illumination is gold and lapis across a wide field, and a bad imitation of it at the height of one line of text is worse than none. The basmalah is set at the page's own size in the page's own ink, with the same eight-pointed seal at a quarter of the size on either side.
- **The mushaf asks before it downloads, and clears out what it replaces.** Opening the Quran now shows a plain "Download mushaf" and nothing else until it is on your device — on a fresh install and after an update alike, so nobody finds 180 MB on their bill because they opened a page. Pressing Download also removes the older copy of the mushaf that an updated app is still carrying from before 2.8.0, which nothing reads any more; the screen tells you how big it is before removing it. Downloading it once means a page never pauses to fetch its own typeface again.
- **The mushaf is lighter to read.** Going in and out of fullscreen used to lay every page on screen out four times over — once for each stage of the chrome getting out of the way, and again because a tap handler was rebuilt on every render of the screen and carried all the way down to each of a page's fifteen lines, so nothing could be reused. Each of those passes re-derived a page's ~260 drawn pieces, justified every line and re-shaped every paragraph, and three of the four were thrown away before anything was ever drawn at that size. A page is now laid out once per toggle, at the size it actually ends up. Nothing on the page changed: same text, same justification, same taps.

### Fixed
- **The Quran's buttons work again after reading in fullscreen landscape.** Leave the reader after it had been fullscreen and turned, and the surah list and the button that opens the Quran looked completely normal and did nothing at all. 2.8.2 claimed this was fixed; it was not — that release closed a leftover menu window, which was a real problem but not this one. The cause was underneath the app: when the screen turns, every screen in the stack is asked to report its position again, but the ones sitting in the background behind the reader are not on screen to answer, and nothing asked them again afterwards. They went on being drawn in the right place while the part of the app that decides whether a touch is a press believed they sat a header's height lower. A perfectly still touch is never re-checked against that position and still worked, which is why a test tap always succeeded and a finger — which always moves a little — never did. Background screens now report their position again once the screen has turned.
- **The reader's title is readable on a night page on iPhone and iPad.** The header there is transparent and sits over the page, and its title was painted in the app theme's text colour — so a light app theme reading a night page put near-black lettering over a near-black page. The title, the back arrow and the blur now follow the colour of the page rather than the theme.

## [2.8.2] — 2026-07-31

### Fixed
- **The mushaf's lines are the print's lines again.** Every line was losing its last word. The page fonts carry no space character, so the gap between two words was being drawn by whichever system typeface the phone happened to fall back on — at a width the app had never measured, and a different one on Android than on iPhone. Lines came out wider than the box they were sized for, and the word that no longer fitted was simply dropped: `مَّقْبُوضَةٌۭ` off the first line of page 49, `ٱلسَّمَٰوَٰتِ` off the fourth. The gap is now drawn in a typeface the app ships and whose measurements it knows, so a line is exactly as wide as it was planned to be, on every device. Justification then works the way the print does — the space between words opens or closes to fill the measure, within a fixed band, and a line that cannot reach the measure honestly is centred rather than pulled apart. The previous release's attempt at this could not have worked: it scaled each line after the layout was already decided, which cannot recover a word the layout had thrown away.
- **A word in the wrong place in ayah 2:2.** The verse rendered as `لَا ۛ فِيهِ ۛ رَيْبَ` instead of `لَا رَيْبَ ۛ فِيهِ ۛ`, and the ۞ marks throughout the mushaf sat one word later than they should. Direction-override marks had been placed around words of more than one glyph but not around single glyphs, which left the single ones to be reordered. The page data is already in reading order, so the overrides were the error — they are gone, and the text reads as it is printed.
- **A menu left open when you leave the reader no longer swallows taps.** Closing the reader while the ayah menu was open tore that menu down without ever hiding it, and the leftover window went on absorbing every tap. Anything open is now closed before the screen goes. *(This was originally written up as the fix for the surah list and the home screen's Quran button going dead. That was wrong — those had a different cause, which is fixed in the next release.)*
- **The page reaches the edge of the screen.** A strip of the app's background showed along the edge of the mushaf, and nothing allowed for the camera cut-out on the side where it sits. The page now runs to all four edges, and its text keeps clear of the cut-out without moving off centre.
- **The reader's title follows the page you are on.** It kept naming the surah you opened at, however far you read past it.
- **Revisiting the Quran no longer wears the reader out.** Each visit held on to one of a limited set of font slots without giving it back; after roughly two dozen visits every page rendered blank until the app was restarted.

## [2.8.1] — 2026-07-31

### Changed
- **Mushaf lines run edge to edge again.** Each line was drawn at its natural width, so the page ended with a ragged margin where the print has a straight one. Lines are now fitted to a single, consistent measure — by a margin small enough that the letterforms are unchanged to the eye. A line that would have to stretch further than that is left as it is rather than distorted, and the last line of a surah still stops where the text stops.
- **The opening pages are bigger.** Pages 1 and 2 carry only seven or eight lines in the space a normal page gives fifteen, so they now use a wider block and the text is correspondingly larger.

## [2.8.0] — 2026-07-31

### Changed
- **The mushaf is drawn as text now, not as pictures of pages.** Every page renders from its own official KFGQPC page font — one glyph per word — instead of a 2600-pixel image. It is sharp at any zoom because there is no resolution to run out of, a page on screen costs a fraction of the memory, and rotating is a re-layout rather than a re-decode. The reader also opens straight away: a page needs only its own ~300 KB font, so the 120 MB up-front download is no longer a gate — pages arrive as you read, and the ones either side are fetched ahead of you. Page-for-page and line-for-line identical to the printed Madinah mushaf, as before. The old page-image reader stays selectable for one release.
- **The reader is split by device.** Phones get one view that serves portrait and landscape without remounting between them, so rotating keeps your page and repaints immediately. iPads and Macs get a facing-page spread where the pair itself is the unit that turns.

### Fixed
- **Turning pages in landscape no longer skips one.** Landscape used a page strip whose offsets were measured from a moving anchor, so a turn could land a page off.

## [2.7.43] — 2026-07-30

### Fixed
- **Rotating the mushaf on a phone is fast and stable again.** The landscape reading zoom sized every page it kept in memory to the full screen width, which pushed the page images past the size where the app keeps its sharpened copies — so each rotation decoded three full-resolution pages at once (~130 MB). That made rotating slow and, on tighter devices, crashed the app. Now only the page you're reading is zoomed (the ones queued either side stay at portrait size), the zoom is capped to what the sharpening cache can serve, and rotation reuses the copy from the previous orientation instead of falling back to the full-resolution original. Same zoom on screen, a fraction of the memory.

## [2.7.42] — 2026-07-30

### Changed
- **Two unused permissions removed (Android).** `WRITE_EXTERNAL_STORAGE` and `READ_EXTERNAL_STORAGE` came in from a networking library's manifest; Mihrab only ever writes to its own app-private storage (mushaf pages, caches, recitation audio), so both are now stripped from the merged manifest. Raised in the F-Droid review.
- **Store listing rewritten** to match the app as it is today — including an explicit note on what is optional and online (prayer-time providers, OpenStreetMap Nominatim place search, Quran downloads) and what stays on device.

### Fixed
- **macOS menu bar says "Mihrab"**, not "PrayerApp" — macOS reads a different bundle key than the iOS home screen, and that one still carried the Xcode target name.

## [2.7.41] — 2026-07-29

### Fixed
- **Landscape reading on phones.** Turning a phone sideways in the mushaf no longer opens a cramped iPad-style two-page spread (tall phones are wide enough in landscape to have triggered it) — and on some phones that spread failed to draw at all, leaving a blank page. Landscape now shows ONE page zoomed to the full width and scrolled vertically, with every gesture intact: tap for fullscreen, long-press an ayah for the actions sheet, swipe to turn the page.
- **Full Arabic surah names in the Quran list.** Two-word names ("آل عمران") were wrapping at the space on narrow rows and losing the second word — Aal-i-Imran showed only "آل".
- **Settings gear on macOS.** The location chip and Settings button sat inside the window's title-bar drag region, so clicks were sometimes swallowed as window drags ("works sometimes, sometimes doesn't"). They now sit just below it and respond every time.

## [2.7.40] — 2026-07-27

### Added
- **One choice for what appears under each verse.** Translation and tafsir are now a single app-wide preference: pick the mode (translation ⇄ tafsir) and the edition once, and it applies everywhere a verse is shown — the reader (both view modes, including tafsir under each ayah in the translation view), the verse of the day, the verse action sheet, and the daily-ayah notification. The selector lives in a new "Under each verse" card on the Quran page, in the reader header, and in Settings — all in sync. Editions are grouped by language (Arabic and English first), every shipped translation and tafsir is offered regardless of app language, and picking one applies it in a single tap.
- **Battery-optimization warning (Android).** When Android's battery optimization is restricting Mihrab — which can delay or silence adhan alerts, especially after turning the Live Activity off — Settings → Notifications shows a fix-it row that jumps straight to the system exclusion screen.

### Fixed
- **Adhan alerts no longer stop after a couple of days without opening the app.** Alerts were only scheduled for today and tomorrow, so if the app wasn't opened for 2+ days every alarm silently lapsed — the Live Activity's background service used to mask this by keeping the app active, which is why turning it off could "kill" the adhan. Alerts now cover four cached days.
- **Tools grid no longer collapses to two narrow columns on some phones.** On devices whose screen width lands on a fractional dp value (e.g. 440 dpi), a sub-pixel rounding overflow wrapped the third tile; the grid now rounds down and uses native gutters, so rows always fill.
- **al-Muyassar is a tafsir, not a translation.** It no longer appears in the translation list (it remains available as a tafsir); an old stored pick falls back cleanly.
- **Cross-language edition picks now stick.** Choosing a translation or tafsir in a different language than the app UI no longer silently reverts to the default.

## [2.7.39] — 2026-07-16

### Fixed
- **Home spacing regression (all platforms, since 2.7.36)**: the centering wrapper collapsed the Home cards into one container, disabling the 12pt inter-card gap — most visibly the day-carousel page dots overlapping the day table and the "Open the Quran" button. Rhythm restored on phones, iPad (portrait + landscape), and Mac.
- **Tools grid on phones back to 3 columns** — the auto-flow grid crammed four undersized tiles per row on common phone widths.

### Changed
- **Play Console recommendations (Android)**: the widget configure screen no longer locks to portrait (Android 16 ignores such locks on large screens); resource shrinking enabled for the Play flavor (AAB ~2.7 MB smaller) with ABI splits gated off during bundling to dodge AGP's shrunk-resources bundling bug. The remaining flagged items (edge-to-edge Window color APIs, Fresco decode paths) live inside React Native/Fresco internals and await upstream releases.

## [2.7.38] — 2026-07-16

### Added
- **Mihrab for Mac via Homebrew** (`brew install --cask hassan-ps/tap/mihrab`). The iPad app now also builds as a real macOS app with Mac Catalyst — same feature set as the App Store "Designed for iPad" experience (widgets/Live Activity stay iOS-only on both). Every release now ships a `Mihrab-macOS-<version>.zip` built by `scripts/build-catalyst.sh`; the cask lives in the `Hassan-PS/homebrew-tap` repo. Ad-hoc signed until Developer ID signing + notarization are wired in (first launch may need right-click → Open).

### Changed
- **Desktop zoom & alignment**: past the width cap the Home dashboard scales uniformly to the window (capped 1.45×) instead of floating small in a fullscreen Mac window; the day table's width now matches its sibling cards exactly at every window size; native chrome (the header location chip) follows the app's resolved theme on Mac.
- **iPad/Mac layout, round 2** (docs/adaptive-layout-v2-plan.md). Home dashboard: content now vertically centers in the window (no more dead bottom half), the hero scales up to anchor the two columns, the tools grid flows in balanced larger tiles instead of 5-across with an orphan, and the two-column form only engages at ≥1180pt. Mushaf: the dual-page spread carries ONE chrome set (single Juz label at the outer right, single night pill at the outer left — they were duplicated per page), hover/click chevrons at the screen edges turn pages for trackpad and mouse users (there was no pointer affordance at all), and the spread threshold rises so facing pages never render cramped.

### Fixed
- **Quran index no longer pins to the right edge of wide windows (RTL).** The width cap moved from the list's content container (where it's ignored and pinned to the flow edge) onto the header and rows themselves, so the column truly centers in any language.
- **Home data-freshness line no longer scrambles in Arabic.** The embedded time/date is bidi-isolated and formatted in the app language.
- **Adhan/Sunrise alerts no longer fire 1–2 minutes off (with a duplicate at the real time).** If a notification sync ran shortly after midnight while the app still held the previous day's times in memory (e.g. a brief phone wake before the day-change refetch landed), yesterday's clock times were pinned onto today's date — the alert fired at yesterday's minute, and the next resync scheduled a second alert at the correct time. The schedule is now anchored to the calendar day the times were fetched for, so a stale map lands on its own (past) day and the "tomorrow" map correctly covers the actual today. A sync whose data is entirely stale now keeps the existing alarms instead of wiping them.

## [2.7.37] — 2026-07-15

### Added
- **Mihrab is now a real iPad app — and runs on Mac.** The whole app adapts to the window size: on a wide iPad (or a resizable window on Apple Silicon Macs) the Home screen becomes a two-column dashboard, reading content stays centred and comfortably measured instead of stretching, and the tools grid, Settings, and month schedule reflow to fill the space; narrow it and everything gracefully returns to the single-column phone layout.
- **Dual-page Quran (mushaf) in landscape.** When the window is wide enough, the mushaf shows two facing pages side by side like a printed copy; in portrait or on a phone it stays single-page.
- **Tafsir selector in Settings.** Pick your tafsir edition in Settings, or from any verse on the Quran page — the two stay in sync.
- **Hide the Live Activity from the lock screen (Android).** The prayer-countdown Live Activity now has a second action, next to "Mute next adhan," that hides or shows it on the lock screen / always-on display while keeping it in the notification shade. It's separate from the on/off setting.
- **Snooze a prayer alert.** Prayer notifications now have a Snooze action — tap it to be reminded again in 5, 10, 15 or 30 minutes, or type any number of minutes right in the notification (Android). iOS offers the same via an inline text field.

### Fixed
- **Your tafsir choice now sticks.** Choosing a tafsir edition used to revert to the default every time you reopened a verse; the selection now persists across the app.
- **Day carousel on large screens.** On iPad/Mac the day cards no longer clip or show a sliver of the neighbouring day — each day fills its page cleanly and swiping between days works.
- **Stale prayer notifications cleared (Android).** A fired prayer's notification now auto-dismisses when the next prayer arrives, so an old "Prayer time" alert can no longer linger on the lock screen next to a different, current prayer.
- **Sunrise notification wording.** The Sunrise alert no longer says "Prayer time" (Sunrise isn't a prayer) — it now shows the time instead.

### Changed
- **Qibla compass is temporarily hidden** while the iPad/Mac layout work lands (there's no magnetometer on Mac). It will return in a later update.

## [2.7.35] — 2026-07-08

### Fixed
- **Removed deprecated edge-to-edge calls (Android).** Under the enforced edge-to-edge mode on Android 15+, the native theme code still called the deprecated `Window.navigationBarColor` / `setDecorFitsSystemWindows` / `isNavigationBarContrastEnforced` setters — no-ops on those versions that tripped Play Console's "deprecated edge-to-edge API" recommendation. They're now guarded behind API < 35; the still-valid light/dark nav-bar icon appearance is applied on every version, so there is no visual change.

## [2.7.34] — 2026-07-08

### Fixed
- **Prayer times now follow you across borders reliably.** Fixed a feedback loop where a completed location fetch re-triggered the whole GPS cycle and raced itself, which could leave the screen showing the previous city's times after you'd moved (e.g. travelling Sweden→abroad updated the city name but not the times). The displayed times, city name, and data source now switch together. Verified Stockholm→London→Stockholm: the Swedish source (Islamiska Förbundet) and the global source (AlAdhan) swap correctly, and returning to a recent city reuses its cached week with no re-download.
- **"Approximate location" (Android 12+) now works.** If you grant *Approximate* rather than *Precise* location, automatic mode previously treated it as denied. It now accepts a coarse grant — which is plenty for prayer times and is exactly the Wi-Fi positioning used when GPS is unavailable.
- **Defence-in-depth for the Swedish source.** Coordinates far from any covered Swedish city (bounding-box edge cases like Åland) now miss the prepared dataset and fall through to the live/computed sources instead of being pinned to a distant Swedish city.

### Changed
- **More reliable automatic location.** The app now asks the OS for a fast Wi-Fi/cell fix first (works indoors, resolves in ~1 s, and on the Play build taps the network locator) and refines it with GPS — instead of forcing a GPS lock that often never resolved indoors. The Android location provider is pinned to the platform `LocationManager` so the Wi-Fi/network path is used and the F-Droid build stays free of Google Play Services. Cross-flavor safe: on de-Googled builds it still falls through to GPS.
- **Resourceful handling of location changes.** Each city gets a stable anchor coordinate, so moving *within* a city no longer re-downloads the same prayer times. When the city actually changes, the new city's times are fetched while the previous city stays cached for a week in case you return; cities you only pass through (active less than a day) are dropped a day after you leave, so travelling through many cities doesn't hoard data.
- **Location chip shows the current city in both modes.** In automatic mode it now names the reverse-geocoded city (e.g. "Göteborg") with an "Auto" badge, not just coordinates; manual mode still shows the saved location.
- **Faster first-time Quran (mushaf) download.** The 604 page images now download 8-at-a-time (was 3), roughly tripling throughput, with the existing per-page retry/fallback intact.

## [2.7.33] — 2026-07-07

### Fixed
- **iOS version bump only.** After the 2.7.32 build was delivered to App Store Connect, that pre-release train closed, so a later build couldn't reuse version 2.7.32. Bumped to 2.7.33 so iOS delivery succeeds. No functional changes from 2.7.32.

## [2.7.32] — 2026-07-06

### Changed
- **Sweden prayer times are now served from a prepared dataset instead of being requested on every device.** A scheduled server-side job prepares Islamiska Förbundet's timetable as per-city JSON on a CDN (+ a compact seed bundled in the app), and the app reads that — with the live source, AlAdhan, and on-device calculation kept as fallbacks. Result: the flaky origin is off the normal path, times work offline, and a day cached earlier from a fallback auto-upgrades to exact IFiS times once the server's coverage reaches it. Client refresh is index-driven (polls a tiny `index.json`, pulls only when the server publishes a newer build; ±jitter, atomic-commit-safe).

### Added
- **Hidden data-statistics panel** (unlock with 5 taps on the version in Settings, à la developer mode): a card at the bottom of Home showing the current source (server dataset / offline bundled / live source / AlAdhan / on-device), days stored, last-updated and next-check times, and the last/next server-run status. Wrapped in an error boundary so it can never affect the prayer screen.

### Infrastructure
- Weekly GitHub Actions job builds + commits the dataset with coverage safeguards: warns by email under 40 days of per-city coverage and hard-fails under a 30-day floor. Karlshamn (unsupported by the widget) dropped from the city table; its coordinates map to the nearest supported city.

## [2.7.31] — 2026-07-06

### Added
- **Custom khatmah length**: alongside the 30/60/90-day presets, a "Custom…" chip opens a small dialog to start a plan of any length (1–604 days); the daily portion adjusts accordingly.
- **Verse of the day: translation ⇄ tafsir toggle**: the card now lays the ayah on its own row with the companion text below it, and a small toggle chooses whether that second row shows the translation or real tafsir (Ibn Kathir et al., cached offline like the ayah panel). The choice persists.

## [2.7.30] — 2026-07-06

### Added
- **Data-freshness indicator on the Home hero**: a quiet line under the countdown showing when prayer times last landed from the provider and how many days are stored offline.

### Changed
- **Sweden provider (Islamiska Förbundet) fails over instantly**: if the source is down, the SAME request now silently serves AlAdhan instead of waiting for three failed sessions before the 12 h cooldown engaged. Retry chain shortened (2×6 s instead of 4×7 s) so the failover is quick; the existing cooldown still stops repeat probing.
- **Home layout swap**: the wide shortcut under the day carousel now opens the **Quran** (with a new open-mushaf icon) — one of the app's main thoughts. The month view moved to a calendar chip right next to "Today" and a tile in the tools grid (replacing the old Quran tile).
- **Hero tint matches the palette under dynamic colors too**: the slim rule + "NEXT PRAYER" label followed a fixed time-of-day hue under Material You, clashing with the wallpaper accent. They now always follow the current accent.
- **Mushaf pages 1–2 render sharp**: the page scaler's single bilinear step landed in the pixel-skipping 0.5–0.7× zone exactly at those pages' display size. The scaler now downscales progressively (≈0.71× per step, area-filter quality at any factor); the render cache regenerates itself (v2) on first open.

## [2.7.29] — 2026-07-06

### Changed
- **Fullscreen keeps the essentials**: the surah name (replacing the Juz label, since the nav header is hidden), the night/light toggle, and the tappable page number stay visible in fullscreen reading.
- **Fixed a brief chrome misform when exiting fullscreen**: the page was sized against the stale fullscreen viewport for a few frames, letting text run under the reappearing bars; measurements are now tagged with the mode they were taken in.
- **Full mushaf pages stretch vertically to fill the screen**: the Madinah page is a fixed ~0.61 aspect while phones are ~0.45, so a width-fit page always letterboxed above and below — especially in fullscreen. Full-text pages (3+) now stretch their text block vertically into that space (capped at 1.25× — fullscreen would need ~1.35× to fill completely, which reads as drawn-out calligraphy), bounded by the real measured page viewport so text never runs under the Juz marker or the page-number frame. Ayah highlights and long-press hit-testing map through the same stretch; the render cache keys off the display height so stretched pages stay pixel-sharp. Pages 1–2 keep their decorative plates undistorted.

## [2.7.28] — 2026-07-05

### Added
- **Real tafsir**: classical tafsir in the ayah panel — Ibn Kathir (abridged) and Maarif-ul-Quran in English, al-Muyassar and Ibn Kathir in Arabic, plus Urdu and Bengali Ibn Kathir. Fetched per ayah on demand (spa5k/tafsir_api mirror of the Quran.com corpus, attributed in About) and cached for offline re-reading.
- **Manage downloads screen** (Settings → Data & privacy, and from the Quran screen): disk usage and one-tap delete for mushaf pages, per-reciter audio, and the tafsir cache.
- **Khatmah upgrades**: a Continue button that jumps straight to your current page; a Reset menu (today's reading / restart the plan / delete it); and an explicit "Set as my khatmah position" pin in the ayah panel, shown on the mushaf in a reserved cyan highlight. Automatic page tracking still works alongside.
- **Khatmah daily reminder**: optional notification at a chosen time with today's portion and where to continue.
- **First E2E test suite** (Maestro): home, Quran reader, and settings smoke flows (`npm run e2e`).

### Changed
- **Mushaf gestures**: single tap toggles fullscreen; long-press selects the ayah. The header button is now labeled "♪ Audio" and opens the same ayah panel scrolled to the recitation controls — translation, tafsir, bookmarks, khatmah pin, playback, and memorization all live in one sheet. The view toggle is now labeled "Translation" (it shows translations; tafsir is the new separate feature).
- **Bookmarked ayahs are now highlighted in full** on the mushaf page in their bookmark color (translucent, ink stays readable) — the old margin marker sat at the *start* of the ayah, which read as the previous ayah.
- **Pages 1–2 render ~60% larger**: the ornamental Fatihah/Baqarah plates occupy only ~59%×42% of the source canvas; the reader now crops to the content box.
- **Regular pages use more of the screen**: a safe uniform crop (union of all 602 page content boxes, so nothing can clip) plus slimmer reader gutters make the text ~6% larger edge to edge.
- **Sharper mushaf rendering**: a new native `MushafPageScaler` module (Kotlin + Swift) caches each page at the exact display pixel size using high-quality multi-step scaling, so the GPU no longer minifies the 2600px source in one aliasing-prone step — strokes render pixel-perfect. Cache lives inside the managed mushaf store (covered by Manage downloads).
- **Fullscreen lost its ✕ button** — a single tap toggles fullscreen in both directions; the overlay button looked bolted-on.
- **Gapless recitation**: upcoming ayahs are prefetched to disk during playback and swapped into the queue, so longer sessions play without network gaps between ayahs.
- **Adhan reliability (Android)**: prayer triggers now always ride AlarmManager (exact when permitted, allow-while-idle otherwise) instead of falling back to WorkManager, which OEM battery managers defer.
- **Sweden provider cooldown**: after 3 consecutive failures the Swedish city source rests for 12 h (AlAdhan + cache serve meanwhile) instead of being retried noisily every fetch.
- **Fasting reminders** now resync on every app foreground (previously only when visiting the Fasting screen, letting the 60-day window drain).
- **"Show onboarding again" no longer wipes data** — it simply replays the welcome flow; the destructive wipe moved to its own clearly-labeled "Reset app data" row.
- Word-highlight coverage audited: all 9 recordings with public quran-align data are wired; the other 12 have no published alignment (documented in `reciters.ts`).

### Removed
- Stale Scheherazade New references (the font was never bundled): attribution row and scaffolding notes.

## [2.7.27] — 2026-07-05

### Added
- **16 new reciters** (21 total): As-Sudais, Ash-Shatri, Ar-Rifai, Al-Tablawi (all four with word-level highlight), Maher Al-Muaiqly, Saad Al-Ghamdi, Ahmed Al-Ajmi, Muhammad Ayyub, Muhammad Jibreel, Yasser Ad-Dossari, Ali Al-Hudhaify, Nasser Al-Qatami, Abdullah Basfar, Fares Abbad, Salah Al-Budair, and Abdullah Al-Juhany. All verified against EveryAyah; reciters without word timings fall back to ayah-level highlight.
- **Searchable reciter picker**: switching reciters is now a dedicated sheet with type-ahead search (Latin or Arabic) and a "word highlight" badge — reachable from the recitation settings *and* by tapping the reciter name in the player.
- **Ayah of the day notification**: opt-in daily notification at a chosen time with a randomly drawn ayah (uniform over all 6,236) and its translation in your active edition. Settings → Notifications → Ayah of the day.

### Changed
- **The mushaf is now the default reading view** — opening a surah lands on the raw Arabic page; the header toggle still switches to the translation view and remembers your choice (applied once to existing installs).
- **Night/light toggle is a labeled pill** on the mushaf page header (was a small glyph), and its icons stay monochrome.
- **Sleeker recitation player**: floating card matching the app chrome, accent-filled circular play button, ayah progress hairline, tappable reciter name.
- **Bookmarks are deletable** from the Bookmarks tab (and stars removable) with an ✕ on each row.
- Updated the in-app attributions for the expanded reciter set.

### Fixed
- **Recitation sheet in mushaf view**: the header ♪ button now opens the recitation settings in mushaf mode (it silently did nothing before).
- **Rose/Violet accents no longer reset to green after an app restart** (settings validation list was missing the two new accent ids).

## [2.7.26] — 2026-07-05 — Quran Reader v2 (docs/quran-reader-plan.md)

### Added
- **Feature tour for new users**: a swipeable four-slide walkthrough (welcome, prayer times, Quran, customization) shows once after onboarding completes; replayable any time from Settings → "Show the app tour". Fully localized in all 13 languages and palette-aware.
- **Rate Mihrab**: a Settings row that opens the native in-app review sheet on iOS (SKStoreReviewController), the Play Store listing on Google Play builds, and the GitHub project page on F-Droid builds — no trackers, no SDKs.
- **Live Activity "Markers" design (Android 16+)**: a third look for the countdown notification — the day progress bar gains a dot at each prayer boundary and a crescent tracker that travels along the track, using the native ProgressStyle points API. Keeps the status-bar chip and Always-On Display, like the other designs.
- **Data survives uninstall → reinstall (Android)**: all settings, journal, fasting log, tasbih, Quran bookmarks/khatmah are now covered by Android Auto Backup (cloud + device-to-device transfer), and uninstalling on Android 10+ offers a "Keep app data" checkbox — reinstalling later restores everything without redoing setup. Downloaded mushaf pages/audio are excluded (re-downloadable, would blow the backup quota).
- **Interactive mushaf**: tap any ayah on the page → highlight + action sheet with translation peek, play-from-here, repeat, colored bookmarks (5 colors), star, share (text or a rendered image card). Word-accurate ayah geometry (quran.com ayahinfo data) validated pixel-perfect against the KFGQPC page images.
- **Audio recitation**: 5 reciters (Al-Husary, Alafasy, Abdul Basit, Al-Minshawi, Al-Shuraim) streamed per-ayah from EveryAyah, with lock-screen/notification controls, background playback, speed control (0.75×–2×), and per-surah offline downloads. The playing ayah is highlighted on the mushaf and auto-turns pages; the translation view highlights the live word using quran-align timings (CC BY 4.0, re-hosted on this repo's `quran-timings-v1` release).
- **Memorization (hifz) tools**: repeat each ayah ×N, repeat a range ×M, pause-between-repeats (recite-back gap), explicit range player, and hide/reveal masking of Arabic or translation per ayah.
- **Khatmah tracking**: 30/60/90-day plans with daily portion, progress bar and gentle catch-up hints, advanced automatically by sequential mushaf page turns.
- **Navigation**: Surah / Juz / Bookmarks tabs, continue-reading resume card, go-to-page jump, verse of the day, diacritic-insensitive Arabic + translation search.
- **Night mode** for the mushaf (clean page inversion) + keep-screen-awake while reading.

### Added — look & feel upgrade
- **Real Arabic typography**: the bundled Amiri fonts are now actually registered and applied — ayah text renders in Amiri Quran (classical mushaf letterforms with correct stacked diacritics) and surah names / duas in Amiri Naskh, on both platforms. Previously everything fell back to the system Arabic face.
- **Depth**: every card in the standard light theme gets a soft warm shadow lift (`cardEdgeStyle`); dark themes keep the calm border-only look, dynamic/glass chrome untouched.
- **Time-of-day awareness (principle 5)**: the Home hero now carries a slim tinted rule + eyebrow label whose hue follows the prayer day — pre-dawn indigo, morning amber, midday teal, golden Asr, sunset rose, violet dusk. Felt, not announced.
- **Two new accent colors**: Rose and Violet join the picker (deep ink tones in light mode, lifted variants in dark), mirrored to the home-screen widget as a custom hex so no native changes were needed.

### Changed
- **Mushaf storage** moved from the evictable OS image cache to a managed on-disk store with a manifest, partial-download resume and a retry-missing-pages path (fixes blank pages after cache eviction).
- **Translation view virtualized** (FlatList) and translation JSON loading deferred off the navigation transition — Al-Baqarah opens instantly.
- Mushaf chrome now follows the app palette (was hardcoded light) and reflows correctly on rotation.
- New deps: react-native-track-player (Apache-2.0, patched for Kotlin 2 nullability), react-native-blob-util (MIT), @sayem314/react-native-keep-awake (MIT). All FOSS, no Google Play Services — F-Droid-safe.

## [2.7.25] — 2026-06-27

### Changed
- **Live Activity countdown is now identical on the Always-On Display and when the screen is on (Android 17)**: the countdown keeps the same MetricStyle layout in both states (the earlier dashed-seconds AOD variant used a different layout, which looked inconsistent).

## [2.7.24] — 2026-06-27

### Changed
- **Live Activity countdown on Always-On Display (Android 17)**: on the AOD the seconds now show as a dash (e.g. "4:23:-") instead of ticking; the full live H:MM:SS returns as soon as the screen is on.

## [2.7.23] — 2026-06-27

### Fixed
- **Live Activity countdown on Always-On Display (Android 17)**: the countdown showed a coarse "4h" on AOD; it now shows the full hours and minutes. The metric uses the system chronometer format, which renders H:MM:SS while the screen is on and H:MM on AOD (no per-second churn).

## [2.7.22] — 2026-06-27

### Fixed
- **F-Droid build**: the Android 17 Live Activity APIs (MetricStyle countdown, etc.) are now invoked via runtime reflection, so the app compiles against the Android 16 SDK on F-Droid's build server (which doesn't yet have the Android 17 SDK) while keeping every feature on Android 17 devices. No user-facing change; the GitHub/Play builds still target the Android 17 SDK.

## [2.7.21] — 2026-06-27

### Fixed
- **Live Activity now follows the app language immediately**: changing the app language re-pushes the notification, so the metric labels ("In"/"At"/"Since"), the mute toggle and the Hijri month all switch language right away instead of staying in the previous language.
- **Arabic Hijri date**: when the app language is Arabic, the Hijri date uses Arabic-Indic numerals (e.g. ١٢ محرم ١٤٤٧) so the whole date reads in Arabic.

## [2.7.20] — 2026-06-27

### Changed
- **Live Activity fully localized**: the countdown metric labels ("In", "At", "Since") and the Hijri month names now translate into all 13 app languages, so the entire Live Activity reads in the user's chosen language.

## [2.7.19] — 2026-06-27

### Changed
- **Android 17 Live Activity polish**: the countdown design now keeps its larger, two-row layout even with no second metric, so the Hijri date always has room. Changing a Live Activity option (design or second metric) now refreshes the notification immediately. The "Mute next adhan" toggle is now translated into all 13 app languages.

## [2.7.18] — 2026-06-27

### Added
- **Hijri date in the app**: the Today card and every day in the upcoming-week carousel now show the Hijri date beneath the Gregorian date (iOS + Android). On Android it also appears next to the next prayer in the Live Activity, and rolls over to the new day automatically.
- **Android 17 Live Activity**: a dedicated Android 17 path using the platform Live Update APIs. Two designs — a refined ProgressStyle prayer-day timeline and a MetricStyle countdown (system-ticked; live seconds while the screen is on, battery-friendly adaptive format on Always-On Display). Adds an optional second metric on the countdown (prayer time / time since last prayer), a "Mute next adhan" toggle action, and a brief "it's prayer time" state when a prayer arrives. Android 16 keeps its existing implementation unchanged.

## [2.7.17] — 2026-06-25

### Fixed
- **Prayer times follow your location's region (provider auto-switch)**: the Swedish source (Islamiska Förbundet) only has data for Swedish cities, so for a location outside Sweden it produced wrong times. The data source now switches by region — Sweden uses the Swedish source, everywhere else uses the global source — in both automatic mode and when the Swedish source is pinned manually. (Outside Sweden a pinned Swedish source falls back to the global source for that location.)
- **Location changes apply on the first try**: settings saves are now serialized, so two quick changes — e.g. removing a saved location and then picking a new place — can no longer land out of order and leave the older coordinates on disk. Previously a location change could appear not to "take" and had to be redone.

## [2.7.16] — 2026-06-25

### Changed
- **Live Activity comes back after being dismissed (iOS)**: if you swipe the prayer Live Activity away (or clear it) while the feature is enabled, it's now re-shown automatically the next time you open the app — from any screen, not just Home. (iOS doesn't let apps make a Live Activity un-dismissible or start one in the background, so this revives it on every foreground rather than truly pinning it.)

## [2.7.15] — 2026-06-21

### Added
- **Full adhan on iOS (compliant)**: iOS caps notification sounds at 30s, so the prayer notification can only play a 29s clip. The complete adhan now plays in-app when you **tap** an adhan notification (which opens the app) or when a prayer notification arrives **while the app is open**, and when you **preview** an adhan in Settings. Uses a foreground-only audio player (no background audio mode), so it's App Store-compliant. Android is unchanged (its notification channel already plays the full adhan).

## [2.7.14] — 2026-06-19

### Fixed
- **Crash on launch (Android)**: 2.7.13's F-Droid build compiled notifee's core from source, which turned out to be binary-incompatible with notifee's current wrapper at runtime and crashed immediately on launch. Reverted to notifee's published `core` library so the app starts normally again.

## [2.7.13] — 2026-06-19

### Changed
- Maintenance release rolling up the recent theme fixes (iOS header chrome follows the in-app theme; "System" theme no longer lags on the opposite appearance) and internal test-suite updates for React 19.

## [2.7.12] — 2026-06-19

### Fixed
- **"System" theme no longer lags or sticks on the opposite appearance (Android & iOS)**: when following the system light/dark setting, the app could stay on the previous (now-opposite) theme after the OS appearance changed — most often when the change happened while the app was in the background. The app now re-reads the authoritative current appearance on every system appearance event and whenever it returns to the foreground, so the theme tracks the OS without lag.

## [2.7.11] — 2026-06-19

### Fixed
- **iOS header now follows the in-app theme (location + settings chip)**: when the app's appearance is set to the opposite of the system (e.g. app Light on a Dark device), the navigation-bar material behind the header location-pin and Settings gear used to follow the system appearance while the chip's own text/icons used the app theme — a mismatched header. The app now forces the iOS window's interface style to its chosen appearance so all native chrome matches.

## [2.7.10] — 2026-06-17

### Changed
- **F-Droid build now compiles notifee's core from source** instead of using the prebuilt `core` AAR notifee ships. The notifee source (a community fork that reproduces the `app.notifee:core` engine without Google Play Services) is vendored as the `notifee_fork` git submodule, and `android/settings.gradle` builds it as `:notifee_core` when the submodule is present. Play/local builds without the submodule checked out continue to use the bundled AAR unchanged.

## [2.7.9] — 2026-06-16

### Fixed
- **Content no longer clipped by the see-through navigation bar (Android)**: with the nav bar now transparent and the app drawing edge-to-edge, the Home, Settings, Monthly times, and Quran reader screens now pad their scroll content by the bottom safe-area inset, so the last row of cards/tiles/ayahs sits fully above the navigation buttons instead of being hidden behind them.

## [2.7.8] — 2026-06-16

### Changed
- **See-through navigation bar (Android)**: the 3-button navigation bar is now fully transparent and integrated — the app's background flows underneath it (the OS contrast scrim is disabled), while content stays above the buttons. Button icons still follow the light/dark theme.

## [2.7.7] — 2026-06-16

### Changed
- **Small widget is now a compact 2×1**: laid out as one row with two columns — next prayer name + time on the left, time remaining + location on the right.

## [2.7.6] — 2026-06-16

### Changed
- **Widget polish**: the large widget's prayer list fills its height again (no large empty area below) and defaults to a more compact size; the small widget is now a 1×1 countdown (next prayer name + auto-sizing time).

## [2.7.5] — 2026-06-16

### Changed
- **Home-screen widgets — cleaner, better-proportioned layouts**: The large widget's prayer list is now a tidy top-anchored list instead of rows stretched into big gaps; the small widget fills its space; the next-prayer time auto-sizes to use the available room; prayer names show in full ("Maghrib", "Sunrise") instead of abbreviations; and each size shows a "time remaining until next" caption. The default green highlight now matches the app's emerald accent.

## [2.7.4] — 2026-06-16

### Changed
- **System colours (Android) now recolour only the accent**: Enabling system colours keeps the standard theme's design (surfaces, text, bordered chrome) and just overrides the accent with the live Material You wallpaper colour, instead of swapping the whole Material 3 surface palette. It now also applies without a restart.
- **Live Activity tint follows the app accent**: The Android Live Activity uses the app's actual accent — the brand emerald on the standard theme (previously it was stuck on an old lime green and ignored the setting), or the Material You colour when system colours are on. With system colours on it re-resolves the live system accent on every update (and on configuration changes), so the notification colour tracks a wallpaper/colour change without reopening the app.

## [2.7.3] — 2026-06-16

### Changed
- **Live Activity timeline shows only the five prayers + Sunrise**: When Islamic Midnight / Last Third (Qiyām) are enabled they no longer add a gap to the Android Live Activity timeline — the bar stays at the six prayer/Sunrise gaps. They still drive the countdown: when one is the next event, the title's inline countdown (and the Countdown design) targets it.

## [2.7.2] — 2026-06-16

### Changed
- **Live Activity timeline — one gap per prayer**: The Android day-timeline is now a clean segmented bar with a separator at each of the six events (Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha) — no milestone dots, tracker thumb, or start/end icons. The bar is anchored at the middle of the night so every prayer (including Fajr and Isha) sits as its own gap rather than at an edge, with the night shown as the two end pieces. Short intervals are floored to a minimum width so all six gaps stay readable; the filled/unfilled boundary still marks "now".
- **Live Activity "Countdown" design reverted to the chip-safe layout**: On Android 16 a larger shade countdown can't coexist with the status-bar chip and always-on display (a custom view or enlarged title disqualifies the promoted-ongoing chip), so the Countdown design keeps the standard layout that preserves both.

### Fixed
- **Location onboarding (App Store guideline 5.1.1)**: The "Set your location" step no longer has a "Skip for now" exit, and the GPS button is now neutrally labelled "Use my location". Users can still avoid the OS prompt by entering a location manually.

## [2.7.1] — 2026-06-16

### Added
- **Android Live Activity — new "Countdown" design + style picker**: A second Live Activity layout for Android that puts the live countdown front-and-centre as the large title, with the next prayer's name and clock time beneath it. Both designs keep the Android 16 status-bar chip and the always-on display. Choose between **Timeline** (the prayer-day progress bar with a marker at each prayer) and **Countdown** under Settings → Live Activity, with a live preview of each. Android only.

### Changed
- **Live Activity countdown includes the night times**: When Islamic Midnight / Last Third are enabled, the Live Activity now counts down to them (and shows them on the Android timeline) as well as the five prayers and sunrise.

## [2.7.0] — 2026-06-15

### Added
- **Islamic Midnight & Last Third of the night (Qiyām)**: Two optional pre-dawn times, computed on the classical Maghrib→Fajr basis (Islamic Midnight is the midpoint of the night; the Last Third marks the start of the final third, the time of Qiyām al-Layl). Off by default; when enabled they appear in the prayer table and fire notifications. Like Sunrise, they use the default notification sound (never the adhan).
- **Sunrise toggle (kill-switch)**: A new toggle (on by default) to hide Sunrise from the prayer table, notifications, and the Live Activity.

All three live under Settings → Notifications → "Additional times", translated across all 13 locales.

### Changed
- **F-Droid build no longer depends on jitpack**: The Liquid-Glass blur is iOS-only, so `@react-native-community/blur` (which pulled `BlurView` from jitpack) is excluded from Android autolinking entirely. The F-Droid/Android build is now fully resolvable from standard repositories; iOS keeps the blur.

## [2.6.0] — 2026-06-15

### Changed
- **Android Live Activity — live ticking countdown + true-to-time day timeline**: The notification title now shows the next prayer with an inline countdown that ticks every second while the screen is on (`Asr · 2:18:42`) and drops to `H:MM` on the always-on display to save power; the actual prayer time sits in the subtext. The day-timeline segments are now sized from the exact number of seconds between each pair of prayers (previously minute-resolution), including the overnight Isha→Fajr stretch, and the tracker advances continuously, so the spacing stays proportional to the real time of day. The progress line uses the device's system (Material You) colour when system colours are enabled in the app, otherwise the default system tint. The status-bar chip now also shows seconds.

## [2.5.0] — 2026-06-15

### Added
- **Android Live Activity — native day-timeline (Android 16)**: The Live Activity now uses the platform `Notification.ProgressStyle` "Live Update" API to render the whole prayer day as a segmented timeline — accent-filled progress with a point marker at each prayer, a tracker dot at the current moment, and sunrise/crescent icons bookending the dawn→night cycle. The upcoming prayer's marker is highlighted in the accent colour. Falls back to a plain progress bar when the day cycle can't be resolved, and to the existing custom layout on pre-Android-16 devices.
- **Header location chip on Android (parity with iOS)**: The current location is shown next to the Settings gear whenever a manual location is set — with or without saved presets. Tapping it always opens the location selector, which now includes an "Add a new location" action that jumps to Settings and briefly highlights the Saved Locations section.
- **iOS Live Activity follows the system theme**: When Liquid Glass / system colours is selected, the Live Activity uses the dynamic iOS system tint (adapting to light/dark on its own) instead of the brand accent, so it matches the in-app theme.

### Changed
- **Refined standard theme (light + dark)**: Warmer, more reverent neutrals (deep ink-blue at night, warm paper by day); a calmer Next-Prayer hero (neutral surface with the countdown carrying the accent, instead of a saturated colour block); a refined deep/lifted emerald accent in place of the old neon green; softer, unified card radii; and a gentler active-row indicator.
- **Android navigation bar follows the app theme**: The system navigation bar icons now match the selected light/dark theme (previously always dark).
- **Themed restart prompt**: The "Restart required" dialog shown when toggling System colours is now a custom themed modal instead of the stock system alert.

## [2.4.0] — 2026-06-14

### Added
- **Multi-day schedule for the home-screen widget + Live Activity**: The app now pushes a multi-day schedule (`days[]`, one dated entry per day) instead of a single-day snapshot. Each native renderer selects the day matching the device's wall-clock date and rolls forward on its own. This fixes prayer times going stale ~24 hours after the app was last opened (previously they only refreshed when the app was reopened). Applies to the iOS widget (timeline now spans every supplied day), the Android widget (selects today's entry; also arms a midnight rollover refresh — previously no refresh was scheduled after Isha), and the Android Live Activity (recomputes next/previous prayer from the absolute dated schedule, including the overnight Isha→Fajr interval).
- **iOS Live Activity — redesigned**: Rebuilt the Lock Screen and Dynamic Island presentations with a live countdown (`Text(timerInterval:)`) and an auto-filling progress bar (`ProgressView(timerInterval:)`) spanning the previous → next prayer, plus a prayer strip with the upcoming prayer accented — mirroring the Android Live Activity feature set. Adopts `ActivityContent(staleDate:)` on iOS 16.2+. Background rollover of the highlighted prayer is handled **locally with no server** via `BGTaskScheduler` (the app stays local-first; APNs/push was explicitly ruled out — see `docs/ios-live-activity-push.md`). The Live Activity setting is labelled **experimental** on iOS (localized across all 13 locales).
- **CI**: Added a GitHub Actions workflow that runs the TypeScript typecheck and the Jest suite on every push/PR (there was previously no automated test run).

### Changed
- **Android Live Activity — advances during deep sleep**: The foreground service now schedules an exact `setExactAndAllowWhileIdle` wake alarm at the next prayer, so the countdown/progress roll over even while the device is dozing (the `Handler` ticker is suspended during sleep).
- **Fewer Android notification channels**: Only the selected adhan channel and the default channel are created (and surplus channels are cleaned up), instead of creating all 17 adhan channels on every sync.

### Fixed
- **Sunrise no longer plays the adhan**: When an adhan sound is selected it now plays for the five daily prayers only; Sunrise (which is not a prayer) uses the default notification sound and drops the "Stop adhan" action.
- **Test suite + typecheck restored to green**: Fixed the half-finished `accentSolid` palette typing and an RTL-title style cast, converted directional CSS in the Quran reader to start/end, and refreshed stale tests (tasbih presets, Quran loader, the relocated LocationChip) that had drifted from the shipped source.

## [2.3.14] — 2026-05-14

### Fixed
- **Android Live Activity — advance past Isha to tomorrow's Fajr**: When the app process was killed (user force-stopped the app) while the foreground-service Live Activity was running, the service's internal 60-second ticker would find no rows after Isha and freeze the notification permanently on "Isha" until the app was reopened. The ticker now wraps around to Fajr after Isha: it locates the Fajr row in the cached payload and calls `parseHHMMToEpochMs`, which automatically places Fajr 24 hours ahead when today's Fajr is already in the past. This matches the behaviour of every other prayer transition (Fajr→Sunrise→Dhuhr→Asr→Maghrib→Isha all advanced correctly via the same ticker logic; Isha→Fajr is the only after-midnight roll-over the ticker needs to handle itself when JS is not running).

## [2.3.13] — 2026-05-12

### Changed
- **Android Live Activity — reverted to standard template (chip preserved)**: Removed the `DecoratedCustomViewStyle` + custom view experiment from v2.3.12. Back to the chip-compatible standard layout: countdown (`↓ 1h 23m`) in `setSubText`, percentage appended to the end of `setContentTitle` (`الفجر · 02:48  ·  52%`) so it is always the last element reading left-to-right on the content row. Progress bar via `setProgress`.

## [2.3.12] — 2026-05-12

### Changed
- **Android Live Activity — platform `DecoratedCustomViewStyle` + percentage far-right**: Uses `Notification.DecoratedCustomViewStyle()` (platform API 36, not compat) with `setCustomContentView` so the prayer title sits LEFT and `52%` sits far RIGHT on the same content row. Countdown (`↓ 1h 23m`) stays in `setSubText` in the header. The platform style wraps the custom view in standard Material You chrome and may allow chip promotion where a bare custom view does not. Progress bar rendered by the custom view's `ProgressBar` (no double bar).

## [2.3.11] — 2026-05-12

### Changed
- **Android Live Activity — layout refinement (chip preserved)**: Countdown (`↓ 1h 23m`) is now shown alone in `setSubText` (right of app name in header row). Percentage (`52%`) moves to the content title row, appended to the prayer name: `"الفجر · 02:48  ·  52%"`. Progress bar remains below. `setCustomContentView` is intentionally absent — assigning a custom content view (even post-build) excludes the notification from chip promotion on Android 16.

## [2.3.10] — 2026-05-12

### Changed
- **Android Live Activity — post-build `contentView` injection (chip + same-line layout)**: Instead of calling `builder.setCustomContentView()` (which flags the notification as "custom template" and causes the builder to suppress `FLAG_PROMOTED_ONGOING` during `build()`), the notification is now built as a standard template so chip state is fully preserved, then `notif.contentView` is assigned directly on the built `Notification` object post-build. This sidesteps the builder's template-type tracking entirely. Also injects `android.requestPromotedOngoing = true` and `android.shortCriticalText` into extras post-build as belt-and-suspenders, and clears the standard progress extras to prevent a double progress bar when the custom `ProgressBar` is in use.

## [2.3.9] — 2026-05-12

### Changed
- **Android Live Activity — same-line layout on Android 16 with chip preservation attempt**: Restored `setCustomContentView` on the Android 16 path so prayer title and countdown+percentage (`↓ 1h 23m  |  52%`) appear on the exact same line again (left / right). The Android 16 chip is preserved via post-build flag injection: `FLAG_PROMOTED_ONGOING` and `android.shortCriticalText` are written directly onto the built `Notification` object after `builder.build()`, bypassing any template-type resolution that might strip them during the build phase. Falls back to standard template (subText countdown) if the custom view fails.

## [2.3.8] — 2026-05-12

### Changed
- **Android Live Activity — compact layout on Android 16**: The countdown and percentage (`↓ 1h 23m  |  52%`) are now placed in `setSubText`, which pins them to the right of the notification header row. The prayer title (`الفجر · 02:48`) gets the full content row below it, and the Material You progress bar sits below that. This is the most compact layout achievable with the standard notification template that also preserves the Android 16 status-bar chip (`setRequestPromotedOngoing`) — `setCustomContentView` / `RemoteViews` breaks chip promotion and cannot be used on this path.

## [2.3.7] — 2026-05-12

### Fixed
- **Android Live Activity — chip regression (v2.3.4–v2.3.6)**: The root cause was `setCustomContentView()` itself on the Android 16 path, not just `DecoratedCustomViewStyle`. Setting a custom content view changes the notification template type internally and prevents `FLAG_PROMOTED_ONGOING` from being applied, which kills the status-bar chip. Fixed by removing `setCustomContentView` entirely from the Android 16 (`buildAndroid16`) path. The standard two-line template (prayer title / countdown+percentage) is used on API 36+ to preserve the chip. The same-line `RemoteViews` layout is kept on pre-36 devices where no chip exists.

## [2.3.6] — 2026-05-12

### Fixed
- **Android Live Activity — chip regression (v2.3.4–v2.3.5)**: Adding `DecoratedCustomViewStyle` in v2.3.4 broke the Android 16 status-bar chip. The style's internal `apply()` call during `build()` was overwriting the promoted-ongoing state set via reflection (`setRequestPromotedOngoing`). Fixed by removing `DecoratedCustomViewStyle` from the Android 16 notification path — on API 36 the system shade renders the header chrome (app icon, app name) automatically without needing an explicit style, so the style was unnecessary and harmful.

## [2.3.5] — 2026-05-12

### Fixed
- **Android Live Activity — double progress bar**: When the custom `RemoteViews` content view is active, `setProgress()` on the builder was also rendering a second progress bar below the custom view. Fixed by skipping `setProgress()` on the builder when the custom layout is in use (the `RemoteViews` `ProgressBar` is the only bar now).
- **Android Live Activity — RTL layout flip with Arabic prayer names**: Arabic text in the prayer title (`الفجر · 02:48`) caused the notification's `LinearLayout` to flip to RTL, putting the prayer title on the right and the countdown on the left — the opposite of the intended layout. Fixed by setting `android:layoutDirection="ltr"` on the row `LinearLayout` to lock the left-prayer / right-countdown widget order, while keeping `android:textDirection="locale"` on each `TextView` so Arabic and Urdu glyphs still render correctly.

## [2.3.4] — 2026-05-11

### Changed
- **Android Live Activity — prayer title and countdown on the same line**: Replaced the two-line layout (title / countdown+percentage) with a custom `RemoteViews` content view using `DecoratedCustomViewStyle`. The prayer title is now left-weighted and the `↓ 1h 23m  |  52%` text is right-pinned on the exact same line. The progress bar sits below, full-width. The standard `setContentTitle`/`setContentText` fields are kept as fallback for hardened shells (GrapheneOS, some MIUI builds) that strip custom `RemoteViews` silently.

## [2.3.3] — 2026-05-11

### Changed
- **Android Live Activity — countdown + percentage in content area**: Moved the `↓ 1h 23m  |  52%` line from the notification header row (`setSubText`, far from the content) into `setContentText` so it sits directly below the prayer title on the same visual block. Layout: line 1 = "Asr · 17:08", line 2 = "↓ 1h 23m  |  52%", progress bar below. Applied to both the Android 16 and legacy (pre-36) notification paths. The legacy path also drops the chronometer/countdown-timer display in the header row in favour of the explicit text line.

## [2.3.2] — 2026-05-12

### Changed
- **Android Live Activity — Material You progress bar**: Reverted the Unicode text bar back to the system `setProgress()` bar, which Android 12+ (Pixel) renders with Material You styling — rounded ends, accent tint, smooth fill. The percentage is shown as `setContentText("52%")` directly above the bar so they read as a single visual unit.

## [2.3.1] — 2026-05-12

### Changed
- **Android Live Activity — progress bar with inline percentage**: Replaced the system `setProgress()` bar (which gives no control over placement) with a Unicode text bar rendered directly in the notification content line: `████████████░░░░░░  52%`. The bar and percentage are now on the same line with no gap between them, exactly as intended. Works on all Android shells including hardened ones (it is plain `setContentText`, not a RemoteView).

## [2.3.0] — 2026-05-12

### Changed
- **Android Live Activity — single notification**: Replaced the dual-notification architecture (a hidden IMPORTANCE_NONE FGS placeholder + a separate rich notification) with a single notification. The rich prayer-countdown notification is now the foreground service notification itself — no more phantom entry in the "silent" section of the notification settings. The trade-off is losing the Android 16 status-bar chip; the cleaner single-notification UX is the correct call.
- **Android Live Activity — progress percentage placement**: Moved the `52%` from the notification title (`"Asr · 17:08  ·  52%"`) to `setSubText`, which places it in the notification header row next to the app name. The title is now cleanly `"Asr · 17:08"` and the progress bar + percentage are visually grouped at the header level.

## [2.2.0] — 2026-05-11

### Fixed
- **Android Live Activity — disappears after app update**: When Android installs an update it kills the app process, stopping the foreground service. The last payload was held only in memory, so the Live Activity notification was gone until the user opened the app. Fixed by persisting the payload to SharedPreferences on every `display()` call and clearing it on `cancel()`. A new `MihrabRestartReceiver` handles `MY_PACKAGE_REPLACED` (fires immediately after an OTA update in the fresh process) and `BOOT_COMPLETED` (fires after a device reboot). Both cases read the persisted payload and restart the service without requiring the app to open.
- **Android build — fdroid APK got ABI splits when building play and fdroid tasks together**: The `wantsPlayRelease` guard in `build.gradle` matched "bundleplayrelease" as a substring when both tasks were run in the same Gradle invocation, enabling ABI splits for the fdroid flavor too. Replaced the substring check with an explicit allowlist of play-flavor task names so fdroid always produces a single universal APK.

## [2.1.9] — 2026-05-11

### Fixed
- **Settings — "Apply coordinates" button too prominent**: The button was using the `primary` filled-accent variant, giving it the same visual weight as a main-screen call-to-action. Switched to `secondary` (outlined accent, transparent fill) so it sits at the same visual level as the rest of the settings surface.

## [2.1.8] — 2026-05-11

### Fixed
- **Settings — "Apply coordinates" button visual consistency**: The manual-coordinates Apply button in the Location card was rendered as a raw `Pressable` with a solid accent fill and no pressed-opacity handler, making it appear brighter and heavier than every other action button in settings. Replaced with the shared `Button` component so it gets the same pressed-state opacity (0.85), typography, padding, and border-radius as all other primary buttons.
- **F-Droid recipe — build entries out of order**: The `rewritemeta` linter sorts `Builds:` entries by `versionCode` ascending and fails if it has to reorder them. Builds 2.1.4 / 2.1.5 / 2.1.6 were added in the wrong order (2.1.6 → 2.1.5 → 2.1.4). Reordered to correct ascending sequence so `rewritemeta` is a no-op.

## [2.1.7] — 2026-05-11

### Fixed
- **Android Live Activity — wrong prayer after Sunrise (background advance)**: The foreground service ticker that auto-advances the countdown when a prayer passes while the app is closed was not including Sunrise in its candidate row list. When `nextKey="Sunrise"` and Sunrise passed with the app closed, the ticker's index-of lookup returned -1 (Sunrise absent from `rows[]`), causing it to scan from Fajr, find it in the past, and advance +24h to **tomorrow's Fajr** instead of today's Dhuhr. Fixed by injecting `sunriseRow` into the ordered list immediately after Fajr before the candidate scan, so the full six-point sequence [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha] is searched correctly.

## [2.1.6] — 2026-05-11

### Fixed
- **Android Live Activity — progress bar starts at ~20% at Isha adhan**: After Isha passes, `buildWidgetPayload` rolls the widget over to tomorrow's prayer data. The previous `prevEpochMs` computation iterated through those tomorrow-rows and — because tomorrow's Isha in Stockholm (May, days getting longer) is slightly later than today's — it mis-identified tomorrow's Maghrib as the most recent past prayer, inflating the initial progress to ~23%. Fixed by passing the raw `today` TimingsMap directly to `computePrevPrayerEpoch`; it now always scans the actual current-day `HH:MM` strings (Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha) and correctly finds today's Isha as the previous anchor, so the bar resets to 0% at rollover.

## [2.1.5] — 2026-05-11

### Changed
- **Settings — Live Activity description**: The help text beneath the Live Activity toggle now notes that iOS support is experimental. Updated across all 13 supported locales.

## [2.1.4] — 2026-05-11

### Fixed
- **iOS Live Activity — race condition on launch**: Multiple React Native effects (`useFocusEffect`, settings change, next-prayer advance) firing simultaneously at app launch could race each other into a create/dismiss spiral, leaving no visible Live Activity. Fixed with two complementary guards: an 800 ms JS-side debounce that coalesces concurrent `syncLiveActivity` calls so only the freshest payload executes, and a Swift-side serial `DispatchQueue` + `isStarting` flag that skips duplicate in-flight `start()` calls. Existing activities are now updated in-place (`act.update(using:)`) instead of stop-then-restart, eliminating the flash-and-disappear on the lock screen.

## [2.1.3] — 2026-05-11

### Added
- **Home screen — Mihrab logo in header**: The app name in the home screen navigation bar now shows a transparent-fill pointed-arch icon (matching the launcher icon geometry) alongside the text. The arch interior shows through to the navigation bar background, adapting to light and dark themes automatically.

### Fixed
- **Home screen — title always "Mihrab"**: The home screen header title is now always the proper app name "Mihrab" regardless of the selected language. Previously it was translated (e.g. "محراب" in Arabic), which obscured the brand name.
- **iOS Live Activity — next-prayer advance**: When a prayer passes while the app is open in the foreground, the Live Activity now immediately updates to show the next prayer and a fresh countdown. Root cause: `syncLiveActivity` was not re-triggered when the "next prayer" pointer advanced; adding `nextInfo` to the effect dependency array fixes this.

## [2.1.2] — 2026-05-11

### Fixed
- **Android notifications — status-bar icon**: All notifications (prayer alerts, fasting reminders, Live Activity) now show a refined mihrab arch icon whose Bézier shoulder curves and eight-pointed star are derived directly from the launcher icon geometry, replacing the previous straight-line approximation.

### Changed
- **Android Live Activity — notification prayer names**: Prayer names in the Live Activity notification now correctly use the app's selected language (e.g. Arabic) instead of always falling back to English. Root cause was a lowercase key lookup (`prayer.fajr`) that missed the capitalised keys (`prayer.Fajr`) used in all 13 locale files.
- **Android Live Activity — auto-advance**: When a prayer time passes while the app is in the background, the Live Activity foreground service now automatically advances to the next prayer and updates the notification without requiring the app to be opened.
- **Android Live Activity — compact mode permanent**: The compact single-row layout is now the permanent default; the compact mode toggle has been removed from settings.

## [2.1.1] — 2026-05-11

### Changed
- **Android Live Activity — localised notification strings**: Channel name, channel description, and FGS placeholder text are now translated into all 13 supported locales (ar, bn, de, es, fr, hi, id, ru, sv, tr, ur, zh) via Android `strings.xml` resources. Previously these were hardcoded English strings shown in Android Settings → Notifications.

## [2.1.0] — 2026-05-11

### Added
- **Android Live Activity — status-bar chip (Android 16+)**: The prayer countdown now appears as a Live Update chip in the Android 16 status bar alongside the clock. Implemented via `setRequestPromotedOngoing` and `setShortCriticalText` (reflected from `Notification.Builder` API 36).
- **Android Live Activity — dual-notification architecture**: The foreground service now posts two notifications — a minimal silent placeholder via `startForeground()` (keeps the process alive) and a rich chip notification via `notify()`. This is required because `FLAG_FOREGROUND_SERVICE` and `FLAG_PROMOTED_ONGOING` are mutually exclusive in Android 16's NMS; only `notify()` notifications can be promoted to the chip.
- **Android Live Activity — progress percentage**: The notification content text now shows the elapsed percentage (e.g. "52%") above the progress bar, giving a quick at-a-glance sense of where the prayer window stands.
- **Android Live Activity — compact single-row layout**: Prayer name and time are now combined on one line ("Asr · 17:08") instead of separate title/body rows, matching the clean Material style of system apps like EasyPark and Uber.
- **Android Live Activity — `POST_PROMOTED_NOTIFICATIONS` permission**: Declared in `AndroidManifest.xml`; auto-granted at install (`prot=normal|appop`). Required by Android 16's `api_rich_ongoing_permission` feature flag.
- **FGS channel `mihrab_fgs_v1`** (`IMPORTANCE_MIN`): Dedicated silent/hidden channel for the foreground-service placeholder notification so it never appears in the user-facing shade.

### Fixed
- **Android Live Activity — chip blocked by `FLAG_FOREGROUND_SERVICE`**: Previous single-FGS-notification approach permanently blocked chip promotion. Split into FGS placeholder + regular `notify()` chip notification.
- **Android Live Activity — `setSilent` compile error**: Removed `.setSilent(true)` from the platform `Notification.Builder` path (API 36); it only exists on `NotificationCompat.Builder`. The `mihrab_live_activity_v3` channel already sets `sound=null` and `vibration=false`.

### Changed
- **Android Live Activity — notification design**: Removed the InboxStyle prayer table from the expanded notification. The notification is now compact-only — a single title row + percentage text + progress bar + chronometer countdown — matching Material Design ongoing-activity conventions.

## [1.5.46] — 2026-04-28

### Fixed
- **Android medium widget — refresh button placement**: The ↻ button now sits in the empty space at the right end of the left panel, vertically centred next to the divider line. Previously it was at the top-right corner of the whole widget, floating above the prayer-times list.

## [1.5.45] — 2026-04-28

### Fixed
- **Android widgets — refresh on wallpaper/theme change**: All three widget variants (small, medium, large) now listen for `ACTION_WALLPAPER_CHANGED` and re-render immediately when the system wallpaper or Material You color palette changes. Previously the widget could stay the wrong accent color for up to 30 minutes.
- **Android widgets — refresh after reboot**: Widgets now listen for `ACTION_BOOT_COMPLETED` and repopulate as soon as the device finishes booting. Previously they stayed stale until the user opened the app or the 30-minute system timer fired.
- **Android widgets — prayer-time highlight advance**: The AlarmManager alarm that fires at each prayer time now refreshes all three widget variants. Previously it only targeted medium widgets, so small and large widgets kept the wrong prayer row highlighted after a prayer time passed.
- **Android widgets — screen-on refresh scope**: `ACTION_SCREEN_ON` and `ACTION_USER_PRESENT` now correctly refresh all three widget variants. Previously if only a small or large widget was on the home screen (no medium), the screen-on refresh was a no-op.
- **Android medium widget — refresh button overlap**: The refresh button (↻) was positioned inside the left panel at `top|start`, overlapping the prayer name on the narrow 4×1 layout. Moved to the top-right corner of the whole widget so it clears the left-side content.

## [1.5.44] — 2026-04-28

### Fixed
- **Android medium widget — wrong size**: On Android 12+ (API 31) the medium widget placed at 4×3 instead of 4×1 due to the `xml-v31/prayer_widget_info.xml` override pointing to the large widget layout (`prayer_widget`) with `targetCellHeight="3"`. Corrected to use `prayer_widget_horizontal` and `targetCellHeight="1"`.

### Changed
- **Android medium widget — design**: Redesigned to match the large widget's visual style — `sans-serif-light` time, `sans-serif-medium` all-caps prayer name, a thin vertical divider between the next-prayer panel and the prayer list. Right panel rows made more compact (equal 1:1 weight split, 4dp row padding) to fit the 4×1 height.

## [1.5.30] — 2026-04-27

### Fixed
- **iOS widget — build**: `.kerning()` called after `.foregroundStyle()` resolves to the SwiftUI View modifier (iOS 16+) rather than `Text.kerning(_:)` (iOS 13+). Moved all `.kerning()` calls to be the first modifier on each `Text` view so the compiler picks the correct iOS 13+ method.

## [1.5.29] — 2026-04-27

### Fixed
- **Android widget — New Architecture**: `NativeModules.PrayerWidget` is not accessible in React Native New Architecture (bridgeless mode). The widget sync now uses `TurboModuleRegistry.get()` as the primary lookup, falling back to `NativeModules` for older builds. Added `@ReactModule` annotation to `PrayerWidgetModule` for proper TurboModule registry discovery.

## [1.5.28] — 2026-04-27

### Fixed
- **Android widget — doesn't load**: `requestUpdate` was using `sendBroadcast` which can be silently dropped by battery optimisation on Android 8+. Replaced with direct `AppWidgetManager.updateAppWidget()` calls throughout. The configure activity now also directly refreshes the new widget on Save (instead of relying on the broadcast reaching the correct ID). Also fixed `setBackgroundResource(0)` → `setBackgroundColor(TRANSPARENT)` which could throw on some ROM variants.

## [1.5.27] — 2026-04-27

### Fixed
- **iOS widget — build**: `.tracking()` (SwiftUI letter-spacing modifier, iOS 16+ only) replaced with `.kerning()` (iOS 13+) so the Xcode Cloud archive compiles on the app's minimum deployment target.

## [1.5.26] — 2026-04-27

### Fixed
- **Widget — fresh install**: widget would show "Open Prayer Times to load times" even after the app had loaded prayer data. The widget data is now also synced every time the Home screen gains focus (e.g. when returning after placing the widget), guaranteeing the widget is populated within seconds of opening the app.

## [1.5.25] — 2026-04-27

### Fixed
- **F-Droid CI**: trailing space on a `sudo` curl line in the v1.5.21 build recipe caused `fdroid rewritemeta` to produce a diff and fail the pipeline; whitespace removed.

### Changed
- **Month view — layout**: prayer times now displayed in an aligned column grid (day label + 6 prayer columns with abbreviated headers) instead of a single joined string; each column has a fixed-width header; Sunrise column rendered muted italic.
- **Month view — today highlight**: today's row shows the accent background and a leading accent bar; Friday rows use the card background to distinguish the day of Jumu'ah.
- **Month view — controls**: month nav, "This Month", refresh, and "Share" toggle are now compact pills in a single row; provider info and cache count shown in one meta line; column headers are fixed below the controls (not part of the scrollable list).
- **Month view — auto-scroll**: list jumps to today's row on initial load.
- **Share image — banner**: header background changed to brand dark green (`#14532d`) to match app identity.
- **Share image — Sunrise column**: Sunrise times rendered muted italic in both the header and data rows of the shareable table.
- **Share image — GitHub URL**: corrected from `github.com/hassan/PrayerApp` to `github.com/Hassan-PS/PrayerApp`.

### Release builds
- Android `versionName` **1.5.25**, `versionCode` **48**.
- iOS `MARKETING_VERSION` **1.5.25**, `CURRENT_PROJECT_VERSION` **48**.

[1.5.25]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.24...v1.5.25

## [1.5.24] — 2026-04-27

### Changed
- **Home screen — Next prayer card**: redesigned hero card with prayer name and time side-by-side, a countdown pill, and platform-specific corner radius (iOS 20dp, Android 16dp).
- **Home screen — Prayer table**: Sunrise row is now rendered in muted italic to distinguish it as a reference time, not a salah. The active prayer row gains a 4dp accent bar on the leading edge.
- **Home screen — layout**: switched to `gap`-based spacing for consistent vertical rhythm; month shortcut moved below the prayer table and spans full width.
- **Navigation (iOS)**: large title headers enabled on all screens (`headerLargeTitle`), matching iOS HIG expectations.
- **Widget (Android)**: left panel uses `sans-serif-light` for the large time (more elegant), prayer name rendered uppercase with letter spacing, subtle vertical divider separates panels, right-side prayer list uses `sans-serif-medium` for clarity.
- **Widget (iOS — small)**: added "NEXT" micro-label, prayer name shown above the time, location shown uppercase with tracking at top.
- **Widget (iOS — medium/large)**: left panel restructured with location top, "NEXT" label, uppercase prayer name, and day label at bottom; large time uses `.light` weight. Highlighted row gains a 3dp leading accent bar alongside the background tint. Divider between panels.

### Release builds
- Android `versionName` **1.5.24**, `versionCode` **47**.
- iOS `MARKETING_VERSION` **1.5.24**, `CURRENT_PROJECT_VERSION` **47**.

[1.5.24]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.23...v1.5.24

## [1.5.23] — 2026-04-27

### Changed
- **Notification icon (Android)**: status-bar icon replaced with a mosque silhouette (dome + two minarets) for a more recognisable prayer app icon.
- **README**: store badge buttons rendered in a fixed horizontal row.

### Release builds
- Android `versionName` **1.5.23**, `versionCode` **46**.
- iOS `MARKETING_VERSION` **1.5.23**, `CURRENT_PROJECT_VERSION` **46**.

[1.5.23]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.22...v1.5.23

## [1.5.22] — 2026-04-27

### Fixed
- **Compass (iOS)**: native `CompassModule` is now null-checked before constructing `NativeEventEmitter`, preventing a crash on builds where the module is not registered.
- **Settings persistence**: storage write failures are now logged instead of silently swallowed, making AsyncStorage errors diagnosable.
- **Prayer cache**: background cache-write and refresh errors are now logged so storage failures don't go undetected.
- **UK prayer times (PrayerTimes.dev)**: date-part variables initialised to `undefined` instead of `0`, preventing a wrong-epoch timezone offset when `Intl.DateTimeFormat.formatToParts` partially fails.
- **Sweden prayer times**: times read from Islamiska Förbundet's page are validated to be in strict chronological order; an out-of-order result now throws rather than silently storing corrupted data.
- **Sweden reverse-geocoding cache**: capped at 200 entries (FIFO eviction) to prevent unbounded memory growth.
- **Widget highlight ID**: native Android widget appearance value is validated against known IDs before being written to settings, removing an unsafe `as any` cast.
- **Language persistence**: settings storage now recognises all 13 supported languages; previously only `en`, `sv`, and `ar` were accepted and other languages were silently reset to English on restart.
- **Midnight rollover**: home screen now detects when the calendar date has changed during an active session and re-fetches prayer times automatically.
- **Widget (iOS + Android)**: after Isha, the "next prayer" left panel no longer falls back to showing today's Fajr time (stale data); it now stays blank until the app syncs tomorrow's payload.
- **Widget `getSnapshot` (iOS)**: snapshot now computes the real dynamic next prayer instead of passing `nil`, so the widget preview reflects live data.
- **Widget comment**: corrected stale comment that said "Sunrise is omitted" when Sunrise has been included in the row list.
- **Widget description (iOS)**: updated App Store widget gallery description to reflect six displayed times including Sunrise.

### Changed
- **Sunrise row (widget)**: Sunrise is now rendered in muted colour when it is not the current next item, visually distinguishing it as a reference time rather than a daily salah — consistent on both iOS and Android.
- **Widget (iOS)**: added `systemSmall` family — a compact view showing location, next prayer name, and time.
- **Widget (iOS)**: `computeDynamicNext` extracted as a module-level function shared by both `getSnapshot` and `getTimeline`, eliminating duplicated logic.
- **Widget info (Android)**: added `targetCellWidth`/`targetCellHeight` and `maxResizeWidth`/`maxResizeHeight` for correct Android 12+ grid sizing.
- **CI**: `release-android.yml` now builds both the F-Droid APK (`assembleFdroidRelease`) and the Google Play AAB (`bundlePlayRelease`) and attaches both to the GitHub Release.
- **HTTP User-Agent**: updated version string from stale `1.4.9` to `1.5.22`.

### Release builds
- Android `versionName` **1.5.22**, `versionCode` **45**.
- iOS `MARKETING_VERSION` **1.5.22**, `CURRENT_PROJECT_VERSION` **45**.

[1.5.22]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.21...v1.5.22

## [1.4.9] — 2026-04-24

### Added
- **Settings**: installed version now includes a tappable GitHub link at the bottom.

### Changed
- **Android dynamic theme**: use higher-contrast container colors to avoid low-contrast text with Material You palettes.
- **Android widget**: Android 12+ widget metadata now marks the widget as reconfigurable so launcher settings affordance appears on long-press.
- **iOS widget**: use native widget container background and internal padding for consistent edge rendering.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.9**.

### Release builds
- Android `versionName` **1.4.9**, `versionCode` **22**.
- iOS `MARKETING_VERSION` **1.4.9**, `CURRENT_PROJECT_VERSION` **21**.

[1.4.9]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.8...v1.4.9

## [1.4.8] — 2026-04-22

### Added
- **Settings (Android + iOS)**: show installed app version/build at the bottom of the Settings screen.

### Changed
- **Notifications**: Adhan sound options are bundled in-app for Android/iOS; help text updated to reflect built-in sounds.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.8**.

### Release builds
- Android `versionName` **1.4.8**, `versionCode` **21**.
- iOS `MARKETING_VERSION` **1.4.8**, `CURRENT_PROJECT_VERSION` **20**.

[1.4.8]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.7...v1.4.8

## [1.4.6] — 2026-04-22

### Added
- **Notifications (Android + iOS)**: bundled built-in Adhan sound assets are now shipped in the app (`adhan_makkah`, `adhan_madina`, `adhan_aqsa`) so sound options work out of the box on every build.

### Changed
- **Notification sound picker** copy now confirms voices are built into the app build.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.6**.

### Release builds
- Android `versionName` **1.4.6**, `versionCode` **20**.
- iOS `MARKETING_VERSION` **1.4.6**, `CURRENT_PROJECT_VERSION` **19**.

[1.4.6]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.5...v1.4.6

## [1.4.5] — 2026-04-22

### Added
- **Notifications**: selectable alert sound profile with default notification sound plus Adhan voice options (Makkah, Madina, Al-Aqsa) in Settings.

### Changed
- **Android notifications**: prayer alerts now use a dedicated monochrome status-bar icon instead of the generic fallback circle.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.5**.

### Release builds
- Android `versionName` **1.4.5**, `versionCode` **19**.

[1.4.5]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.4...v1.4.5

## [1.4.4] — 2026-04-14

### Changed
- **Compass (iOS + Android)**: improved diagnostics for weak/very weak signal and unstable movement, with actionable calibration guidance (move away from metal/electronics, remove magnetic accessories, do a slow figure-8, hold steady).
- **iOS compass permission UX**: clearer startup prompt guidance and explicit denied-permission messaging with direct path to system settings.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.4**.

### Release builds
- Android `versionName` **1.4.4**, `versionCode` **18**.
- iOS `MARKETING_VERSION` **1.4.4**, `CURRENT_PROJECT_VERSION` **18**.

[1.4.4]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.3...v1.4.4

## [1.4.3] — 2026-04-12

### Added
- **iOS**: **WidgetKit extension** (`PrayerWidgetExtension`) embedded in the app — home screen widget matches Android (five prayers + next-prayer highlight) via App Group `group.com.prayerapp`.

### Changed
- **Portrait only**: iPhone/iPad app **portrait** orientation; Android `MainActivity` and widget configure activity use **`screenOrientation="portrait"`**.
- **System colors (Material You / dynamic palette)**: setting and palette path are **Android-only**. On **iOS**, System theme uses standard surfaces with **brand green** accents (same as Light/Dark accent behavior).
- **iOS**: optional **tip / IAP** UI is **omitted** (tips remain on Android Play builds only). Support copy no longer names other app stores.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.3**.

### Release builds
- Android `versionName` **1.4.3**, `versionCode` **17**.
- iOS `MARKETING_VERSION` **1.4.3**, `CURRENT_PROJECT_VERSION` **17**.

[1.4.3]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.2...v1.4.3

## [1.3.7] — 2026-04-11

### Added
- **Android `fdroid` product flavor**: no Google Play Billing; F-Droid–friendly build (`assembleFdroidRelease`). **`play` flavor** unchanged for store/GitHub APK with optional tips.
- **Apache-2.0** [`LICENSE`](LICENSE) at repo root; `package.json` `license` field set.

### Changed
- **Donations / IAP**: hidden on **`fdroid`** builds via native `PrayerBuildInfo` + JS gating (`TipIapBootstrap` and settings “support developer” section omitted).
- **Android**: hardware back from Settings, Compass, and month view returns to the home screen instead of exiting the app.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.7**.

### Release builds
- Android `versionName` **1.3.7**, `versionCode` **11** — **`play`** APK + **AAB** (Google Play), **`fdroid`** APK (F-Droid / sideload without billing).
- iOS `MARKETING_VERSION` **1.3.7**, `CURRENT_PROJECT_VERSION` **11** (build in Xcode for App Store / TestFlight).

[1.3.7]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.6...v1.3.7

## [1.3.6] — 2026-04-11

### Changed
- **App theme**: When **System colors** is off (or theme is not System), accents use the app’s **brand green** again; Material You / dynamic path unchanged when System + System colors are on.
- **Home screen widget**: **In-app Settings** again control widget options — Android **background strength**, **highlight** presets (green / teal / blue / amber) plus **custom `#RRGGBB`**, synced to the widget; **iOS** gets the same highlight options via the app group. Next-prayer row uses the **phone accent** only when Theme is **System** and **System colors** is on.
- **Android widget configure** (long-press → gear): **Custom color** field; “match phone accent” toggle removed (use app Theme → System colors).
- HTTP `User-Agent` prefix **PrayerTimes/1.3.6**.

### Release builds
- Android `versionName` **1.3.6**, `versionCode` **10** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.6]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.5...v1.3.6

## [1.3.5] — 2026-04-11

### Changed
- **App accents**: Light/Dark (non–System-colors) mode now uses the platform **primary / tint** (`colorPrimary` / `tintColor`) and **primary container** surfaces so the UI matches **Material You** and wallpaper-derived colors on Android 12+ instead of a fixed green.
- **Android widget**: **Configure** from the launcher (long-press widget → settings / gear, or when adding the widget). Native screen for background strength, highlight preset, and “match phone accent”. Removed duplicate widget controls from in-app Settings (short hint only).
- HTTP `User-Agent` prefix **PrayerTimes/1.3.5**.

### Release builds
- Android `versionName` **1.3.5**, `versionCode` **9** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.5]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.4...v1.3.5

## [1.3.4] — 2026-04-11

### Changed
- **App accents**: when system **dynamic colors** are off, UI accent uses brand **green** (`#6BC98A`) aligned with the widget and launcher; dynamic/Material You path unchanged when System colors are on.
- **Widget highlight**: with **System colors** on, **only the next-prayer row** uses the system accent (Android `system_accent1_600` / theme primary; iOS `Color.accentColor`); presets apply when dynamic is off.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.4**.

### Release builds
- Android `versionName` **1.3.4**, `versionCode` **8** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.4]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.3...v1.3.4

## [1.3.3] — 2026-04-11

### Changed
- **Android home screen widget**: neutral dark background (not green-tinted); **only the next prayer** uses an accent color. **Settings** (Android): background strength (opacity) and next-prayer accent (green / teal / blue / amber), with an in-app preview.
- **Widget picker** (Android 12+): `previewLayout` shows sample prayer times in the widget gallery.
- **iOS widget**: same neutral shell with accent on the next prayer only (no extra settings yet).
- App **theme** copy updated so system/dynamic colors are described for the **app**; Android widget styling is separate.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.3**.

### Release builds
- Android `versionName` **1.3.3**, `versionCode` **7** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.3]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.2...v1.3.3

## [1.3.2] — 2026-04-11

### Changed
- **Home screen widget** uses a fixed green-tinted look (aligned with the launcher icon) instead of following system / dynamic theme; next prayer is highlighted in **#6BC98A**.
- Launcher icon pipeline: master resize cap **2048px** and bicubic downscale for sharper mipmaps when the source asset is high resolution.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.2**.

### Release builds
- Android `versionName` **1.3.2**, `versionCode` **6** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.2]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.1...v1.3.2

## [1.3.1] — 2026-04-11

### Changed
- **System colors** mode: stronger platform **background layering** (iOS grouped backgrounds; Android `colorSurface` vs `colorSurfaceContainerHighest`) so dynamic / Material You tints read more clearly.
- In system dynamic mode, **flat chrome**: no box borders or list hairlines; segmented controls use **filled** selection instead of accent outlines. Text fields rely on surface contrast instead of strokes.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.1**.

### Release builds
- Android `versionName` **1.3.1**, `versionCode` **5** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.1]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.0...v1.3.1

## [1.3.0] — 2026-04-11

### Added
- Optional **System colors** when the theme is set to System: platform semantic and dynamic colors (including Material You on Android) for the app and the home screen widget, with **Pure black (OLED)** still applied to backgrounds when enabled in dark mode.
- Widget appearance sync via native `setUiHints` when theme-related settings change (no need to reload prayer data first).

### Changed
- Android uses **Material 3** `DynamicColors` day/night theme so `PlatformColor` Material attributes resolve correctly.
- New launcher icon artwork; icon generator uses minimal zoom (1.0) for crop.
- HTTP `User-Agent` prefix updated to `PrayerTimes/1.3`.

### Release builds
- Android `versionName` **1.3**, `versionCode` **4** — release **AAB** for Google Play and **APK** for GitHub Releases.

[1.3.0]: https://github.com/Hassan-PS/PrayerApp/compare/v1.2.0...v1.3.0

## [1.2.0] — 2026-04-10

### Added
- In-app shortcut on Home for the full month view: calendar icon plus a clear label (translated: EN / SV / AR) so it is obvious that it opens prayer times for the whole month.
- `PRIVACY_POLICY.md` (Swedish and English) for store listings and transparency.

### Changed
- Settings control in the app bar uses a clearer cog-style icon instead of the previous shape that was easy to misread.
- On Home, the compass shortcut was removed from the row below the prayer times source; **Qibla** remains available from the top app bar next to Month and Settings.
- HTTP `User-Agent` for outbound requests (e.g. place search) updated to `PrayerTimes/1.2` to match the app version.

### Release builds
- Android `versionName` **1.2**, `versionCode` **3** — use the release **AAB** for Google Play and the **APK** for GitHub Releases or other distribution.

[1.2.0]: https://github.com/Hassan-PS/PrayerApp/compare/v1.1.0...v1.2.0
