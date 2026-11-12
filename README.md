<div align="center">
  <a href="https://github.com/Safouene1/support-palestine-banner/blob/master/Markdown-pages/Support.md"><img src="https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/banner-support.svg" alt="Stand with Palestine — ways to help" width="100%"></a>
</div>

<div align="center">
  <img src="branding/github-hero.png" alt="Mihrab, The Muslim Companion — for every prayer, and everything between. Calm, private, offline-first.">

  **A Muslim's daily companion — for every prayer, and everything between.**

  Prayer times that match the published timetables of Diyanet, Islamiska Förbundet, Morocco, Algeria and Kemenag to the printed minute — and around them the Madinah muṣḥaf with recitation and tajweed, a hifz tracker, duas, dhikr and a prayer journal. No ads, no account, no tracking, and every line of it open source.

  **[Website](https://mihrab.elghamri.se/)** · **[Open Mihrab Web](https://mihrabhq.github.io/)** <sub>— the app in your browser, nothing to install</sub>

  <sub>[Accuracy](#accuracy) · [Screenshots](#screenshots) · [Features](#features) · [Privacy](#privacy) · [Build](#build) · [Contributing](#contributing) · [Sources](#content-sources--thanks) · [License](#license)</sub>

  <br>

  <p><b>Apple</b></p>

  <p><a href="https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256"><img src="branding/badges/appstore.png" alt="Download on the App Store" height="60"></a></p>

  <p>Mac: <code>brew install --cask mihrabhq/tap/mihrab</code></p>

  <p><b>Android</b></p>

  <p>
  <a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.prayer_times%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FMihrabHQ%2FMihrab%22%2C%22author%22%3A%22Hassan-PS%22%2C%22name%22%3A%22Mihrab%22%7D"><img src="branding/badges/obtainium.png" alt="Add to Obtainium" height="60"></a>&nbsp;
  <a href="https://play.google.com/store/apps/details?id=com.prayer_times"><img src="branding/badges/googleplay.png" alt="Get it on Google Play" height="60"></a>&nbsp;
  <a href="https://f-droid.org/packages/com.prayer_times/"><img src="branding/badges/fdroid.png" alt="Get it on F-Droid" height="60"></a>&nbsp;
  <a href="https://github.com/MihrabHQ/Mihrab/releases/latest"><img src="branding/badges/github.png" alt="Get it on GitHub" height="60"></a>
  </p>

  <p><sub>Obtainium is recommended: first to get every update, and it updates itself. Don’t have it? <a href="https://github.com/ImranR98/Obtainium">Get Obtainium</a>.</sub></p>

  <p><b>Windows</b></p>

  <p><a href="https://apps.microsoft.com/detail/9N43KNMJHBWV"><img src="branding/badges/microsoft.png" alt="Get it from the Microsoft Store" height="60"></a></p>

  <p><b>Linux</b> <sub>(preview)</sub></p>

  <p>From your package manager, with Mihrab's signed repositories — updates come with the rest of your system:</p>

  <details><summary>Debian, Ubuntu, Mint (apt)</summary>
<pre>sudo curl -fsSLo /usr/share/keyrings/mihrab.gpg https://mihrabhq.github.io/packages/mihrab.gpg
sudo curl -fsSLo /etc/apt/sources.list.d/mihrab.sources https://mihrabhq.github.io/packages/mihrab.sources
sudo apt update &amp;&amp; sudo apt install mihrab</pre>
<p><sub>Remove: <code>sudo apt purge mihrab</code></sub></p>
  </details>
  <details><summary>Fedora (dnf)</summary>
<pre>sudo curl -fsSLo /etc/yum.repos.d/mihrab.repo https://mihrabhq.github.io/packages/mihrab.repo
sudo dnf install mihrab</pre>
<p><sub>Remove: <code>sudo dnf remove mihrab</code></sub></p>
  </details>
  <details><summary>openSUSE (zypper)</summary>
<pre>sudo zypper addrepo https://mihrabhq.github.io/packages/mihrab.repo
sudo zypper install mihrab</pre>
<p><sub>Remove: <code>sudo zypper remove mihrab</code></sub></p>
  </details>
  <details><summary>Arch, Manjaro, EndeavourOS (pacman, yay)</summary>
<pre>curl -fsSL https://mihrabhq.github.io/packages/mihrab.asc | sudo pacman-key --add -
sudo pacman-key --lsign-key 28BB36D6D8388A8EF15EEA24E19DCF135A3D8035
printf '\n[mihrab]\nServer = https://mihrabhq.github.io/packages/arch/$arch\n' | sudo tee -a /etc/pacman.conf
sudo pacman -Syu mihrab</pre>
<p><sub>Remove: <code>sudo pacman -R mihrab</code></sub></p>
  </details>

</div>

## Accuracy

<!-- accuracy:start -->
<div align="center">

<a href="https://github.com/MihrabHQ/mihrab-methods"><img src="branding/badges/certification.svg" alt="certified: 0 of 77,033,006 times off the printed minute"></a>

Prayer times computed with **[mihrab-methods](https://github.com/MihrabHQ/mihrab-methods)**, the authorities’ own methods checked against every time they have published.

</div>

| Matches the published timetable of | Times checked | Off the printed minute |
|---|---:|---:|
| Islamiska Förbundet (Sweden), and Diyanet’s tables for Sweden | 1,456,908 | **0** |
| Diyanet, Türkiye and worldwide | 71,630,078 | **0** |
| Morocco’s Ministry of Habous and Islamic Affairs | 94,350 | **0** |
| Algeria’s Ministry of Religious Affairs and Wakfs | 101,184 | **0** |
| Indonesia’s Kemenag | 362,934 | **0** |

<sub>Last checked 9 November 2026. Generated from mihrab-methods’ <code>certification.json</code> by <code>scripts/build-copy.js</code>. Mihrab is independent and not affiliated with any of these authorities.</sub>
<!-- accuracy:end -->

---

## Screenshots

<div align="center">

<img src="branding/readme/xplat.jpg" width="100%" alt="Mihrab on every device at once: a MacBook with Today, an iPad with the muṣḥaf open as a two-page spread, an Android foldable, an Android phone with the countdown to Maghrib and an iPhone in Minimal mode at dawn">
<br><sub>Android phones, tablets and foldables, iPhone, iPad, Mac, Windows, Linux and the web.</sub>

<img src="branding/readme/panels-phone.jpg" width="100%" alt="The eight store panels: For every prayer, and everything between — no ads, open source, no account, no tracking, works offline; to the printed minute, checked against the published timetables of Diyanet, Islamiska Förbundet, Morocco’s Habous, Algeria’s ministry and Kemenag; the Madinah muṣḥaf in tajwīd colour; Tilāwah, surah into surah; translation, tafsīr and tajwīd; hifz, revised on its own cycle; duas, tasbīḥ and fasting; and the adhan, full-screen alerts, widgets and the qibla">

<img src="branding/readme/panels-wide.jpg" width="100%" alt="One panel per platform: the iPad’s two-page muṣḥaf, Mihrab on a Mac, the remembrance between prayers on Windows, and the month on a Chromebook">

</div>

---

## Features

Each line opens to say how it works.

### Pray

<details><summary><b>Prayer times, online or off</b></summary>

Daily times and a full month view up to a year ahead. Cached on-device so the app opens instantly without a connection; falls back to on-device calculation when the network is away.

</details>
<details><summary><b>The day's own sky</b></summary>

Behind the countdown, one continuous scene drawn from the clock: night with the moon in its actual phase, dawn through the horizon's rose and orange, the day with the sun climbing to its height about Ẓuhr, sunset, and the afterglow darkening into night. It is true to the hour rather than to the theme — noon is bright in a dark app — and the moon's phase and the sun's light are computed from your own coordinates rather than approximated. Every look has it — light, dark and system as well as Sky: the horizon's glow low in the sky, the fuller stars, the countdown's halo by night, and a sky that runs into the page rather than stopping at an edge.

</details>
<details><summary><b>Minimal</b></summary>

Settings → Appearance → Minimal (or the first-run walkthrough) takes the chrome off Today: the sky, the countdown with the prayer's name and time under it, the rail, and one line saying where and which day. A drag up brings the day's times as a sheet — a check beside each salāh, the month's calendar, the Qibla and the place — that swipes from day to day as the full page's table does. The tabs become a row of dots, and the pages turn side by side as the muṣḥaf's do. On the phone and the iPad; the full page is a switch away.

</details>
<details><summary><b>Adhan & reminders</b></summary>

17 built-in adhan recordings (or import your own), a pre-prayer reminder window, and exact-alarm scheduling so the adhan lands on time even under aggressive battery managers. Each prayer decides how it speaks — adhan, a plain alert, or silent — and can be changed for just the next one from Today. On Android the adhan can play as an alarm, so it is heard with the phone on silent or vibrate.

</details>
<details><summary><b>Snooze that knows when the prayer ends</b></summary>

Snooze from the notification or the full-screen alert: 10 minutes at a tap, or 5, 15, 30 or 60. Only lengths that still leave at least 15 minutes of the prayer are offered; when none does, the button becomes "Last chance to pray …", which comes back 15 or 5 minutes before the time runs out. Fajr ends at sunrise, Isha at the next Fajr.

</details>
<details><summary><b>A full-screen prayer alert</b></summary>

Like an alarm clock, over the lock screen: the prayer, the next one under it, Stop, Snooze and Log prayer. On Android it is its own screen, painted in that prayer's sky; on iOS 26 and later it rings as an AlarmKit alarm, through silent mode and Focus. Offered in the first-run walkthrough, off until you say so.

</details>
<details><summary><b>Times that match your authority's timetable</b></summary>

**Sweden** (Islamiska Förbundet), **Diyanet** (Türkiye and its places worldwide), **Morocco** (the Ministry of Habous and Islamic Affairs), **Algeria** (the Ministry of Religious Affairs and Wakfs) and **Indonesia** (Kemenag) are calculated on the phone with the authority's own method from [mihrab-methods](https://github.com/MihrabHQ/mihrab-methods), on the printed minute for every time they were checked against (the table at the top). **Singapore** (MUIS), **Malaysia** (JAKIM) and **Türkiye Takvimi** (namazvakti.com) are their published tables, taken minute for minute from this repo for your nearest listed city, with the authority's own service as a backup. Everywhere else: AlAdhan, or calculation on the device (Adhan JS). "Automatic" picks the right one for where you are, and a source pinned for one country quietly gives way to AlAdhan outside it ([where each comes from](docs/prayer-times-sources.md)).

</details>
<details><summary><b>Says when it is standing in</b></summary>

If the table you chose has nothing for today, the phone calculates the day with that authority's own method and says so, on the source row and under the month. Türkiye Takvimi warns when no listed city is near enough.

</details>
<details><summary><b>24 calculation methods, or your own angles</b></summary>

The 17 AlAdhan methods plus Dubai, JAKIM, Kemenag, Tunisia, Portugal, Jordan and Sweden (the Istanbul congress method Diyanet computes Islamiska Förbundet's tables by, within a minute by the method alone and on the printed minute with its yearly correction list — [mihrab-methods](https://github.com/MihrabHQ/mihrab-methods)), each tuned to what that authority publishes and checked against it every week; hill towns are computed at their height, and Umm al-Qura's Isha moves to two hours in Ramadan as it does in Makkah. Or set the Fajr and Isha angles yourself.

</details>
<details><summary><b>High latitudes</b></summary>

Where the summer sun never sinks far enough for Fajr and Isha, choose the rule: the angle-based share of the night (the default), the middle of the night, or a seventh of it. Polar days and nights get times rather than blanks.

</details>
<details><summary><b>Tuned to your mosque</b></summary>

Per-prayer minute offsets, Hanafi or standard Asr, and the extra marks when you want them: sunrise, Islamic midnight, the last third of the night, and the first third after Isha.

</details>
<details><summary><b>Your madhhab</b></summary>

Hanafi, Maliki, Shafiʿi or Hanbali: the Asr shadow and the prayer names follow it, and the walkthrough shows each answer in your own times.

</details>
<details><summary><b>Maliki second times</b></summary>

Off by default: turn them on and each prayer gains a line saying when its preferred time (*ikhtiyārī*) closes and its late time (*ḍarūrī*) begins, computed on your device from your coordinates whichever source the times come from. From *Al-Murshid al-Muʿīn* (Ibn ʿĀshir). Fajr's and Asr's boundaries are marked approximate, and where the sun never reaches the angle nothing is shown rather than a guess.

</details>
<details><summary><b>Quiet for the prayer itself (Android)</b></summary>

Settings → Notifications puts the phone on Do Not Disturb around each prayer you pick, from the adhan or a few minutes before, and lifts it again on its own. Jumuʿah has its own length. Alarms and whatever you already let through still come through.

</details>
<details><summary><b>More to remember, if you ask</b></summary>

Dhikr reminders in your own words at any hour, fully offline; Surah Al-Kahf on Friday, Al-Mulk at night, the morning and evening adhkār; and a khatmah reminder carrying the day's portion. The Notifications page shows what is scheduled to fire.

</details>
<details><summary><b>Qibla compass</b></summary>

A live dial with signal strength, a hold-still prompt when the sensors need it, and a cross-check against the sun. Falls back to the bearing when the phone has no magnetometer.

</details>
<details><summary><b>Saved locations</b></summary>

Keep the places you check on and switch between them freely; automatic location and saved places are not alternatives, and the month sheet names the city rather than printing coordinates.

</details>
<details><summary><b>A month you can hand over</b></summary>

The whole month as a sheet, Hijri and Gregorian side by side, exportable as an image or a PDF in any of the app's languages, with a QR back to the app.

</details>
<details><summary><b>Live Activity</b></summary>

A pinned countdown to the next prayer: Android 16+ status-bar chip and always-on notification in three designs (countdown, timeline, or markers with a proportional bar for the next three events), iOS Lock Screen and Dynamic Island via ActivityKit. What it shows — Hijri date, location, sunrise, the lock-screen button — is yours to switch.

</details>
<details><summary><b>Home-screen widgets</b></summary>

Prayer times in three sizes, plus Log Today (with the practice graph — a row for each prayer, a column a day — and a countdown), Hijri date, streak, tasbih and reading widgets, on iOS, Android **and** the Mac. For a while after each adhan, if you ask, the prayer-times widgets count up from it — "12:34 since Dhuhr" — before going back to the next prayer. Per-prayer accents, dynamic colour, adjustable background opacity, a text colour of your own, and on Android the prayer-times widget shows or hides the city, the countdown and the day's times at the size you set — from Settings → Widgets or from the widget itself.

</details>
<details><summary><b>A countdown you can point</b></summary>

It runs to the second, and a tap on any prayer on Today makes it count down to that one instead.

</details>
<details><summary><b>Opens where you left it</b></summary>

The last Today screen is the first frame of a launch, and the countdown, the sky and the day's progress sweep up to now (or, with the launch animation off, open straight on now). Pull down on Today to refresh the times; when the clocks change where you are they refresh on their own.

</details>

### Read and listen

<details><summary><b>Interactive Madinah mushaf</b></summary>

All 604 pages, drawn as *text* from the official KFGQPC page fonts rather than as page images: sharp at any zoom, instant to rotate, and a fraction of the memory. Reading starts the moment the download does — pages arrive as their fonts do (~300 KB each) with a slim line saying how the rest is going. Paper, sepia or night; a page rail and a go-to-page jump; fullscreen from the margins.

</details>
<details><summary><b>A facing-page spread on iPad and Mac</b></summary>

the pair of pages is the thing that turns, with the keyboard and a surah sidebar.

</details>
<details><summary><b>Tajweed colours</b></summary>

Optional: the King Fahd Complex's own colour-coded page fonts, each letter painted for the rule it falls under. Tap an ayah to see its rules word by word and hear each word read; a guide explains every colour. The Warsh muṣḥaf has its own: the rules Warsh shares with Ḥafṣ in the same inks, and Warsh's own — naql, tashīl, taqlīl, the light rāʾ, the heavy lām, madd al-badal — each with its own.

</details>
<details><summary><b>The word reader</b></summary>

Optional: hold a finger on a word in the muṣḥaf and, when you lift it, that one word is read out. Slide to another word before lifting to pick it instead; a tap still opens the ayah.

</details>
<details><summary><b>Read your way</b></summary>

Volume buttons turn the pages (opt-in on Android), a reading lock — its own switch on every platform, with a lock button on the page when you want one — keeps the page from turning under your hand while a tap on a word still opens its āyah (hold the lock to unlock; or freeze the words too, for a pocket or a child), the screen stays awake while you read, the translation and tafsir take the size you set with `A− A+`, and bookmarks come in colours you choose.

</details>
<details><summary><b>Four riwāyāt</b></summary>

Ḥafṣ from the KFGQPC page fonts, and Warsh, Qālūn and Shuʿbah as bundled-typeface muṣḥafs downloaded on request from Quranpedia; Warsh can be heard as well as read. Your place carries across a switch: the ayah is the coordinate, not the page number.

</details>
<details><summary><b>The IndoPak muṣḥaf</b></summary>

A second way to read Ḥafṣ: the 15-line IndoPak print, 610 pages line for line as the Taj Company sets it, in the Indo-Pakistani script with its own stop signs and rukūʿ marks. About 2.2 MB, checked against the app's Ḥafṣ text at every one of the 6,236 ayahs before a word is drawn; recitation, translation, tafsir, bookmarks and the khatmah carry over by ayah.

</details>
<details><summary><b>Everything in one panel</b></summary>

A tap on a word opens its ayah: translation, real **tafsir** (Ibn Kathir, Maarif-ul-Quran, al-Muyassar and more) and the Arabic meanings of the harder words — both downloadable for offline reading — the tajweed rules in it, coloured bookmarks, star, share as text or a rendered image card, the khatmah position, and the full recitation controls. A tafsir and a dua can be shared as text too.

</details>
<details><summary><b>59 reciters</b></summary>

Al-Husary, Alafasy, Abdul Basit, Al-Minshawi, As-Sudais, Ash-Shatri, Ahmed Al-Ajmi, Yasser Ad-Dossari, Maher Al-Muaiqly, Saad Al-Ghamdi, plus mujawwad readings from Abdul Basit, Al-Minshawi and Al-Husary, streamed per-ayah or downloaded per-surah for offline listening; and 15 whole-surah recitations from mp3quran.net, among them Warsh, Qālūn and Shuʿbah readings, cut ayah by ayah with every cut checked on both sides. Every voice can be heard before it is chosen, and on a Warsh, Qālūn or Shuʿbah page the voices of that reading are a tap away. **Word-level highlight on the page itself** for nine of them — and in landscape the column follows the reciter down the page; prefetching keeps long sessions gapless.

</details>
<details><summary><b>Tilāwah — listening, as its own page</b></summary>

The reader plays the passage in front of you and stops where that surah does. Tilāwah is the other act: pick a reciter, start anywhere, and it runs surah into surah with the screen off, from the lock screen, without the app open or even alive. Scrub by ayah or by whole surah, shuffle, set a speed or a sleep timer (minutes, or the end of the surah), and follow along on a live muṣḥaf page with the recited word lit. Its downloads share the reader's own folder, so a reciter fetched for a flight makes play-from-here work offline in the same act. While anything is playing a **mini-player** sits under the title bar on every screen: what it is, a progress bar for the surah, pause, and a way back to Tilāwah. Tilāwah keeps **its own place**, apart from where you are reading; come back after a while and it offers to carry on, to shuffle, or **what the sunnah recommends at that hour** — Al-Kahf from Thursday's maghrib to Friday's, As-Sajdah and Al-Insān on Friday morning, Al-Mulk, the last two āyāt of Al-Baqarah and the Muʿawwidhāt at night. On iPhone it plays as long-form spoken audio, with the lock screen's controls, and pauses when the headphones come out.

</details>
<details><summary><b>Hifz — what you know by heart, and when to recite it again</b></summary>

Mark whole surahs on a grid of all 114 (Juz' 30 and Juz' 29 are one tap each), or any stretch from the reader with *Memorised up to here*. Each portion then carries its own revision schedule: **1 → 3 → 7 → 14 → 30 days**, capped at a week, a fortnight or a month — whichever you choose — because a flashcard can earn an interval of years and no hafiz leaves a surah a year. After reciting you say how it went: *Needed help* sends it back to daily, *Fine* moves it on, *Fluent* skips a step. A day's revision is a list as long as you asked for, with the rest waiting for tomorrow, a daily reminder carrying the count, a **Recite from memory** mode that checks off ayah by ayah, and **thirty cells for the thirty juz'** showing how much of each is by heart, counted in ayahs on the muṣḥaf's own boundaries. It rides the backup and the folder sync with everything else.

</details>
<details><summary><b>Memorization drills</b></summary>

Repeat each ayah ×N, repeat a range ×M, pause-between-repeats for recite-back, and hide-and-reveal masking of Arabic or translation. Finish a drill and it offers to mark that range memorised, so what you just learnt joins the cycle before you put the phone down.

</details>
<details><summary><b>Khatmah plans</b></summary>

30/60/90-day plans, your own length from the page you are on, or a finishing date with each day's portion worked out from what is left with automatic page tracking, a continue button, pin-your-exact-ayah positioning, a done button for the day, flexible resets, and an optional daily reminder with today's portion.

</details>
<details><summary><b>14 translation editions</b></summary>

Sahih International, Pickthall, Bernström, Hamidullah, Diyanet, Cortés, Isa García, Bubenheim, Ma Jian, Kuliev, Indonesian Ministry, Mujibur Rahman, Jalandhry, Suhel Farooq Khan — with diacritic-insensitive Arabic + translation search, and a verse-by-verse reading view that lights the recited word too.

</details>
<details><summary><b>Ayah of the day</b></summary>

On the Quran page, and optionally as a daily notification at a time you choose, with its translation.

</details>
<details><summary><b>Manage downloads</b></summary>

Exactly what is on disk — muṣḥaf pages, riwāyāt, tafsir, recitation audio — with sizes, and a way to remove any of it.

</details>

### Remember

<details><summary><b>Dua library</b></summary>

100+ duas across 19 categories (morning, evening, after prayer, food, sleep, travel, distress, gratitude, protection, and more) with Arabic, transliteration, translation, and Hisn al-Muslim sources.

</details>
<details><summary><b>Tasbih counter</b></summary>

Tap-to-count for the post-prayer dhikr plus open-ended Astaghfirullah and Salah on the Prophet ﷺ. Tabular numerals so digits don't shimmer on tick.

</details>
<details><summary><b>Fasting log</b></summary>

Tracks Ramadan + voluntary Sunnah fasts (Mondays, Thursdays, Ayyam al-Bidh, Arafah, Ashura, Six of Shawwal) with day-before reminders. Encrypted on-device.

</details>
<details><summary><b>Log a prayer from Today</b></summary>

A check beside each of the five: one tap inside the prayer's window records it on time, and once that window has closed the check asks whether it was prayed on time or made up. The table swipes a week back as well as a week ahead, so a prayer missed on the day is logged on the day it happened.

</details>
<details><summary><b>Prayer journal</b></summary>

Log each prayer as on-time / late / missed / qadha with private notes, a practice graph — a row for each prayer and a column a day — streaks and what is owed. Optional "Log prayer" action right on the prayer notification, an end-of-day nudge, and tools to backfill or fill whole months at once. Optionally, a prayer logged from a notification, the alarm screen or a widget after half its time has gone is recorded as late. And the log can be cleared for a day, a month, a year or all of it, without touching fasts, sunnah prayers or dhikr.

</details>
<details><summary><b>Sunnah prayers</b></summary>

The rawātib beside each fard prayer, Witr and the night prayer, logged on the same day and drawn in their own gold on the practice graph.

</details>
<details><summary><b>Hijri calendar</b></summary>

Throughout, with Ramadan, Eid and Jumuʿah treatments and a Ramadan countdown on Home. The standard calendar, or Indonesia's (Government & NU, or Muhammadiyah), with a day adjustment that moves only the Hijri date — and, if you ask, the day can begin at maghrib, so an evening's reading belongs to the night that has begun. Where an authority announces the month differently from the prediction (Indonesia's sidang isbat), the correction is published here and reaches phones within hours.

</details>

### Yours

<details><summary><b>Sync between your own devices</b></summary>

Pair by scanning a QR code (or copying it), and your journal, streaks, fasts, notes and settings stay in step. No account, no server of ours: the devices write **sealed** files into a folder you already keep in sync — Syncthing, Nextcloud, whatever you use — and each device holds a key that never leaves it, so what passes through that folder is unreadable to anything but the devices you paired. Choose how often it runs: on open, every 15 minutes, hourly, daily, or never.

</details>
<details><summary><b>Backup and restore</b></summary>

Export everything as a file you keep, and import it back, on any platform.

</details>
<details><summary><b>Your data survives reinstalls</b></summary>

Settings, journal, bookmarks and khatmah ride Android Auto Backup and device-to-device transfer; large re-downloadable content stays out of your backup quota.

</details>
<details><summary><b>Privacy by design</b></summary>

No ads, no analytics, no tracking, no account, and nothing sent to the developer. Location settings and sensitive records are encrypted on the device. Coordinates go only where an answer needs them — to AlAdhan where it is the source, and, rounded to about a kilometre, to OpenStreetMap to name your town — as the [privacy policy](PRIVACY_POLICY.md) lists in full.

</details>

### The app itself

<details><summary><b>Yours to look at</b></summary>

Light, dark or system, pure-black for OLED, six colour themes (green, teal, blue, amber, rose, violet) or your own hex, and the platform's own palette when you want it: **Material You** on Android, **Liquid Glass** on iOS. Or **Sky**, the look a new install starts in, which paints the whole app from the sky over the countdown and follows the sun — its height by day and its depth below the horizon by night, so a low winter sun keeps its gold and a moonlit night is lighter — in two colourings: **Realistic** (the default), the sky as it looks over a nearly neutral page, and **Vibrant**, bold colours for each hour. Each is shown by its six skies in the walkthrough and under Appearance, and the full-screen alert and the widgets follow the choice.

</details>
<details><summary><b>Real Arabic typography</b></summary>

Amiri Quran for ayah text with correct stacked diacritics, Amiri Naskh for duas, on both platforms.

</details>
<details><summary><b>13 languages</b></summary>

English, Arabic, Swedish, Bengali, Urdu, Hindi, French, Spanish, German, Turkish, Indonesian, Russian, and Chinese — every screen, every notification, every dua title, and the widgets too. Arabic and Urdu are fully RTL. The app starts in your phone's language and can be switched in Settings.

</details>
<details><summary><b>A Mac app, not a phone app in a window</b></summary>

The Catalyst build has the spread reader, keyboard paging, the surah sidebar and its own widgets in Notification Centre.

</details>
<details><summary><b>It tells you what it is doing</b></summary>

A data-statistics panel names the source in use, when each dataset was last rebuilt, how far ahead it reaches, and when the next check is due.

</details>
<details><summary><b>It tells you what changed</b></summary>

The first launch after an update opens What's new, with every release before it underneath; Settings → About keeps the whole list, and the data panel can be folded away.

</details>
<details><summary><b>A 12-hour clock</b></summary>

Or 24, or whatever your phone uses.

</details>
<details><summary><b>Open source</b></summary>

AGPL-3.0-or-later. Anyone who ships a fork, or runs it as a service, must publish their source too. The F-Droid flavor ships without Google Play Services. There are no in-app purchases in any build.

</details>

---

## Privacy

Where you are, five times a day, is the most sensitive thing a prayer app touches. So there is no account, and the code carries no analytics, no ad network and no crash reporter.

- **Stays on the device** — settings, saved places (encrypted at rest), the prayer journal and the fasting log. Sync writes sealed files into a folder you already keep in sync; no server of ours is involved.
- **Goes over the network, none of it to the developer** — coordinates to AlAdhan where it is the source of your times (Sweden, Diyanet’s places, Morocco, Algeria and Indonesia are calculated on the phone instead); your position rounded to about a kilometre to OpenStreetMap, to name your town when location is automatic; small update files from this project’s repositories; and the downloads you ask for.
- **Not present at all** — ads, trackers, accounts, Google Play Services.

The full list, from the code, is in the [privacy policy](PRIVACY_POLICY.md) and on the [website](https://mihrab.elghamri.se/#privacy).

---

## Install

Every channel is at the top of this page: the store badges, Homebrew for the Mac, the Linux package repositories, and Mihrab Web. Same app on each, built from the same `main` branch; no Android build carries Google Play Services, the Play Store one included.

<details><summary><b>Notes on each channel</b></summary>

| Platform | Link |
|---|---|
| **iPhone & iPad** | [App Store](https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256) |
| **macOS** | `brew install --cask mihrabhq/tap/mihrab` — native Mac Catalyst build from [GitHub Releases](https://github.com/MihrabHQ/Mihrab/releases/latest), for Intel and Apple silicon Macs on macOS 12.1 (Monterey) or later; the widgets need macOS 14 |
| **Android — Obtainium (recommended)** | [Add to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.prayer_times%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FMihrabHQ%2FMihrab%22%2C%22author%22%3A%22Hassan-PS%22%2C%22name%22%3A%22Mihrab%22%7D) — first to get every update, and it updates itself. Needs [Obtainium](https://github.com/ImranR98/Obtainium) installed |
| **Android — Google Play** | [Google Play](https://play.google.com/store/apps/details?id=com.prayer_times) |
| **Android — F-Droid** | [f-droid.org/packages/com.prayer_times](https://f-droid.org/packages/com.prayer_times/) |
| **Android — APK** | [GitHub Releases](https://github.com/MihrabHQ/Mihrab/releases/latest) → `Mihrab-vX.Y.Z.apk` (ARM phones, 32- and 64-bit) |
| **Windows** | [Microsoft Store](https://apps.microsoft.com/detail/9N43KNMJHBWV) |
| **Linux (preview)** | apt, dnf, zypper or pacman, from Mihrab's signed repositories at [mihrabhq.github.io/packages](https://mihrabhq.github.io/packages) — the commands are at the top of this page. Without any of those, [`install-linux.sh`](desktop/scripts/install-linux.sh) unpacks the AppImage. Testers and a maintainer are welcome ([desktop/MAINTAINING.md](desktop/MAINTAINING.md)) |

</details>

---

## Build

You need Node 22.11 or later; for Android, the Android SDK (compile SDK 37, NDK 27.1) and a JDK; for iOS and the Mac, Xcode on a Mac.

```sh
npm install
npm start
```

### Android

```sh
# F-Droid APK (no Google Play Services)
npm run android:assembleFdroidRelease

# GitHub / Obtainium APK
npm run android:assembleGithubRelease

# Google Play AAB
npm run android:bundlePlayRelease
```

Outputs:
- F-Droid APK: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`
- GitHub/Obtainium APK: `android/app/build/outputs/apk/github/release/app-github-release.apk`
- Play AAB: `android/app/build/outputs/bundle/playRelease/app-play-release.aab`

### iOS and Mac

```sh
npm run ios
```

Or open `ios/PrayerApp.xcworkspace` in Xcode and Run. Archive and upload via Xcode Organizer for App Store / TestFlight.

### Windows and Linux

The desktop app is the same code in Electron, under [`desktop/`](desktop/README.md):

```sh
cd desktop
npm run setup
npm run dev          # build and run
npm run dist:linux   # or dist:win
```

### Mihrab Web

```sh
cd desktop
npx webpack --mode production --env web
node scripts/build-web.js
```

It is published from [MihrabHQ.github.io](https://github.com/MihrabHQ/MihrabHQ.github.io).

### Checks

```sh
npm run preflight   # types, lint, the site and copy checks, and the whole unit suite — run it before calling anything done
npx jest            # the unit suite alone
npm run e2e         # Maestro end-to-end flows (needs a running emulator/simulator)
```

---

## Contributing

Pull requests, translations and reproducible bug reports are welcome.

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to send a change
- [AGENTS.md](AGENTS.md) — the rules every change follows, for people and for coding agents
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the code is laid out
- [CHANGELOG.md](CHANGELOG.md) — what changed in each release
- [SECURITY.md](SECURITY.md) — reporting a vulnerability
- A translation that reads wrong, or a language to add: [open a translation issue](https://github.com/MihrabHQ/Mihrab/issues/new?template=translation.yml)

---

## Supporting the project

**Mihrab does not take money.** There is no donation link, no sponsorship, no
in-app purchase and no tip jar — the billing library was removed from the
project outright, and no build pulls one back in. Several people have kindly
offered; the answer is the same to everyone. It is not that kind of project,
and it is not going to become one.

Four kinds of support are welcome, and they are worth more:

- **Dua** — for me and my parents, and for everyone whose work this is built on.
- **Constructive feedback** — a prayer time that disagrees with your masjid, a
  translation that reads wrong, a screen that fights you. Say what you saw and
  what you expected in [an issue](https://github.com/MihrabHQ/Mihrab/issues);
  that is how the bugs get found.
- **Pass it on** — rate Mihrab where you got it, and tell family and friends.
  The app's own month sheet (Settings → About → Help Mihrab) is an easy thing to
  send. A project with no marketing reaches the next person this way.
- **Code** — pull requests, translations, and reproducible bug reports. The
  build instructions are above and the whole thing is AGPL.

If you were going to send something, send it to your local masjid or to relief
work you trust instead. Nothing needs to come here.

---

## Content sources & thanks

Religious content is sourced and attributed (also listed in-app under Settings → About):

- Quran Uthmani text — [Tanzil.net](https://tanzil.net/) (CC BY 3.0)
- Madinah mushaf — KFGQPC QPC v2 page fonts, mirrored at [nuqayah/qpc-fonts](https://github.com/nuqayah/qpc-fonts) ([KFGQPC terms](https://dm.qurancomplex.gov.sa/copyright-2/)); page layout built from the [quran.com API](https://api-docs.quran.com/)
- Tajweed colours — KFGQPC QPC V4 Tajweed page fonts, from the [Quranic Universal Library](https://qul.tarteel.ai/resources/font) ([KFGQPC terms](https://dm.qurancomplex.gov.sa/copyright-2/)), downloaded on request; the rules of each word from the [quran.com API](https://api-docs.quran.com/) (`text_uthmani_tajweed`)
- Ayah and word positions — [quran.com / Quran for Android](https://github.com/quran/quran_android)
- Recitation audio — [EveryAyah.com](https://everyayah.com/); word timings from [cpfair/quran-align](https://github.com/cpfair/quran-align) (CC BY 4.0)
- Tafsir texts — [spa5k/tafsir_api](https://github.com/spa5k/tafsir_api) mirror of the Quran.com tafsir corpus, and [alquran.cloud](https://alquran.cloud/) for the three Tanzil editions (Jalalayn, al-Muntakhab, Kuliev & as-Sa'di)
- Translations — [alquran.cloud](https://alquran.cloud/) (Tanzil-derived, CC BY 3.0) and the [Encyclopedia of the Noble Quran](https://quranenc.com/) (QuranEnc), whose editions are shown as published, footnotes and all, with the version named in Settings → About
- Duas — [Hisn al-Muslim](https://github.com/rn0x/hisn_almuslim_json) (MIT)
- Arabic fonts — [Amiri & Amiri Quran](https://github.com/aliftype/amiri) (SIL OFL 1.1)

Everything the app downloads from those sources — the tafsir, the
translations that are not bundled, the word meanings, the riwāyāt, the
IndoPak text and font — is also **mirrored in this repository's releases**,
byte for byte as the source answered. `scripts/mirror/build-mirror.js`
builds them; the `data-…` tags hold them, a release per text edition
(a release takes at most 1,000 assets, and twenty-five tafsir editions at
114 surahs each is 2,850).

The app asks that mirror **first** and the original source only when the
mirror cannot answer. So a source changing its terms, moving, or going away
does not take a downloaded feature with it, and none of these projects is
asked to carry Mihrab's traffic for it. Mihrab Web is the one exception: a
browser cannot read a release asset (no CORS header), so it reads from the
sources directly. Forks: point `MIRROR_BASE` in `src/config/mirrors.ts` at
your own releases.

---

## License

[AGPL-3.0-or-later](LICENSE) — use it, study it, change it, share it. If you
distribute a modified version, or run one as a network service, you must
publish your source under the same terms.

**Why AGPL** (#116). It keeps Mihrab and every version of it free for
everyone: no one can take the work and close it off, which is what a
waqf-style licence sets out to protect. Mihrab has no clause limiting who may
use it or for what: a restriction like that would make it non-free, so
F-Droid and most Linux distributions could no longer carry it, and the
licences of what it bundles (SIL OFL for the fonts, MPL-2.0 for the
prayer-time methods, MIT for other parts) allow no added restrictions, which
the AGPL itself forbids too.

The **name "Mihrab" and the app icon are not covered by the licence** —
no free-software licence grants trademark rights. Builds of this project
carry the name freely, whoever distributes them — build and packaging
patches, security backports and translations included, so F-Droid's recipe
is fine. A fork that changes what the app *does* needs its own name and
icon. See [TRADEMARK.md](TRADEMARK.md).
