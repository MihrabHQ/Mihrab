# Privacy Policy — Mihrab: The Muslim Companion

**Effective:** 2026-10-18
**Language:** English first, Swedish (Svenska) below.

## About this policy

This policy covers the app **Mihrab: The Muslim Companion** ("Mihrab", "the app"), for Android and iOS/iPadOS/macOS.

| | |
|---|---|
| **App name** | Mihrab: The Muslim Companion |
| **Android package** | `com.prayer_times` (Google Play) |
| **iOS / macOS bundle ID** | `com.hassan.prayerapp` (App Store) |
| **Developer / data controller** | Hassan El Ghamri, trading as Mihrab (the "Mihrab team" on Google Play), Stockholm, Sweden |
| **Contact** | [mihrab@elghamri.se](mailto:mihrab@elghamri.se) |
| **Website** | [https://mihrab.elghamri.se](https://mihrab.elghamri.se) |
| **Source code and issues** | [https://github.com/MihrabHQ/Mihrab](https://github.com/MihrabHQ/Mihrab) |

Mihrab is free and open source. It has no accounts, no ads, no analytics, no crash-reporting service, no in-app purchases and no server operated by the developer. **The developer does not receive, store or sell any personal data about you.**

## Summary

- Everything you enter or record (prayer log, fasting, dhikr, journal, Quran bookmarks, settings, location) is stored **on your device**. Nothing is sent to the developer.
- The app connects to the internet to fetch prayer times where they are not calculated on the device, to name your town and search for places, to check for updated calculation data and Hijri-date corrections, and to download Quran fonts, tafsir or recitation audio you ask for. These requests go to the third-party services listed below, never to the developer.
- Syncing between your own devices is optional, sealed end to end, and goes through a folder you pick, not through a Mihrab server.

## Data the app handles

**Location (sensitive).** If you choose "device location", the app reads your approximate or precise location (Android `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION`, iOS "While Using") to calculate prayer times and the Qibla direction. You can instead enter a place manually or search for one. Your location settings and saved places are stored on the device, encrypted at rest with iOS Keychain or Android EncryptedSharedPreferences (Android Keystore). The towns the app has placed you in (used to keep the times steady while you move within a town) are kept in the app's ordinary storage. Location is never sent to the developer. It is sent (see Third-party services) to AlAdhan, where AlAdhan is the source of your prayer times — the default outside the places whose authority's method is calculated on the device — as the coordinates and date needed for the lookup; and, with device location, to OpenStreetMap Nominatim to name your town, rounded to two decimal places (about a kilometre). If you choose on-device calculation and enter your place by hand, neither request is made.

**Motion sensors.** Used only to show the Qibla compass direction. Sensor readings are processed on the device and not stored or sent anywhere.

**Camera.** Used only to scan the pairing QR code when you link two of your own devices for sync. Nothing is recorded, saved or sent.

**Notifications and alarms.** If you enable prayer notifications, they are scheduled locally on your device. Optional full-screen prayer alerts use Android's full-screen notification and exact-alarm permissions, and on iOS 26+ the system alarm service (AlarmKit); both are scheduled and shown entirely on the device. The app also requests Do Not Disturb access (Android `ACCESS_NOTIFICATION_POLICY`) only so a prayer alert can ring when you ask it to. Nothing about your notifications is sent to the developer.

**Your worship record and settings.** Prayer log, fasting, dhikr, sunnah log, journal entries, Quran bookmarks, starred ayat, khatmah plans, last-read position, language, appearance, calculation method and notification preferences are stored locally. Sensitive records (journal, fasting, dhikr, sunnah) are encrypted at rest with a device-bound key. On Android, the app's settings and records can be included in Android's own backup and device-to-device transfer when you have those turned on in the system; that backup is Google's, under your Google account's settings, and the developer has no access to it.

**Photos and files.** When you export a monthly prayer-times image or a data export, the app saves it to the place you choose (photo library or a file). The app only adds the image you export; it does not browse your photo library.

**Device sync (optional).** If you turn on sync, a snapshot of the categories you select is merged between your own devices. The snapshot is sealed to the other device's key and written to a folder you choose (for example a folder in your own cloud-storage app). The developer cannot read it and has no access to that folder. You can turn sync off and forget a device at any time.

**Widgets and Live Activity.** Home-screen widgets and the iOS Live Activity show the prayer times the app already has. They use no server and no push service.

**Clipboard.** The app only places text on the clipboard when you tap a copy action (for example a pairing code).

## Third-party services

When you use these features, your device contacts the service directly. The service may see technical data such as your IP address, the time of the request and the requested URL, under its own privacy policy. Mihrab sends no account identifier, advertising identifier or device identifier.

- **Prayer times.** Sweden's (Islamiska Förbundet's), Diyanet's, Morocco's, Algeria's and Indonesia's times are calculated on your device and contact no prayer-time service. **Aladhan** (`api.aladhan.com`) is the source elsewhere unless you choose on-device calculation; it is sent your coordinates, the date and the calculation settings. Singapore's and Malaysia's tables come from Mihrab's own open datasets on GitHub (`raw.githubusercontent.com/MihrabHQ/Mihrab`), asked for by city; only when a day is missing there is the authority's own service asked (`www.e-solat.gov.my`, by zone code; `api-open.data.gov.sg`, with nothing about you). For Türkiye Takvimi the city nearest you is looked up on your device from a map tile covering about 500 km, fetched from GitHub; its year comes from a GitHub release of the Mihrab repository, or, if missing there, from `www.namazvakti.com` by the city's id, never your coordinates.
- **Calculation and calendar updates:** at start and every few hours the app reads `certification.json` and correction lists from `raw.githubusercontent.com/MihrabHQ/mihrab-methods`, and announced Hijri-date corrections from `raw.githubusercontent.com/MihrabHQ/Mihrab`. Sent: nothing beyond the request itself.
- **Place search and naming your town:** OpenStreetMap Nominatim (`nominatim.openstreetmap.org`), and Photon (`photon.komoot.io`) for search when Nominatim is busy. Sent: your search text; or, with device location, your coordinates rounded to two decimal places (about a kilometre), automatically when you have moved about a kilometre.
- **Quran content, on request:** (the Quran text and translations are bundled in the app) tafsir (via `cdn.jsdelivr.net`), Arabic meanings of harder words (QuranEnc, `quranenc.com`), recitation audio (`everyayah.com`), additional riwayat and mushaf data (Quranpedia, `api.quranpedia.net`) and mushaf fonts (GitHub releases of the Mihrab repository). Sent: the file or chapter being requested.
- **Opening links:** If you tap a link (GitHub, the website, the store pages), it opens in your browser or the store app, under that site's policy.

The app contains **no** advertising SDKs, analytics SDKs, tracking, crash-reporting services or data brokers, and it does not track you across apps or websites. Because the developer collects no data, there is nothing to share or sell.

## Purpose and legal basis (GDPR)

Processing happens on your device to provide the features you use (prayer times, Qibla, notifications, widgets, worship tracking, sync). Where it needs your location, the legal basis is your **consent** through the system permission prompt, which you can withdraw at any time. The developer is not a recipient of your data and does not process personal data on a server.

## Your rights (EU/EEA)

Because the developer holds no copy of your data, access, correction and deletion are in your hands: change or revoke permissions in system settings, enter a manual location, delete records inside the app, turn off sync, or **uninstall** the app to remove all local data. You may also write to [mihrab@elghamri.se](mailto:mihrab@elghamri.se) with any privacy question, and you can complain to the Swedish Authority for Privacy Protection (IMY, [imy.se](https://www.imy.se)) or your local supervisory authority.

## Children

Mihrab is not directed at children under 13 and does not knowingly collect personal data from anyone. There is no account and no central database, so there is nothing for the developer to delete on a child's behalf; contact us if you have any concern.

## Changes

If the app's data handling changes, this policy and its effective date will be updated. The current version is always at [https://github.com/MihrabHQ/Mihrab/blob/main/PRIVACY_POLICY.md](https://github.com/MihrabHQ/Mihrab/blob/main/PRIVACY_POLICY.md).

---

# Integritetspolicy — Mihrab: The Muslim Companion

**Gäller från:** 2026-10-18

## Om policyn

Den här policyn gäller appen **Mihrab: The Muslim Companion** ("Mihrab", "appen") för Android och iOS/iPadOS/macOS.

| | |
|---|---|
| **Appens namn** | Mihrab: The Muslim Companion |
| **Android-paket** | `com.prayer_times` (Google Play) |
| **iOS-/macOS-bundle-ID** | `com.hassan.prayerapp` (App Store) |
| **Utvecklare / personuppgiftsansvarig** | Hassan El Ghamri, verksam under namnet Mihrab ("Mihrab team" på Google Play), Stockholm, Sverige |
| **Kontakt** | [mihrab@elghamri.se](mailto:mihrab@elghamri.se) |
| **Webbplats** | [https://mihrab.elghamri.se](https://mihrab.elghamri.se) |
| **Källkod och ärenden** | [https://github.com/MihrabHQ/Mihrab](https://github.com/MihrabHQ/Mihrab) |

Mihrab är gratis och öppen källkod. Appen har inga konton, ingen reklam, ingen analys, ingen kraschrapportering, inga köp i appen och ingen server som drivs av utvecklaren. **Utvecklaren tar inte emot, lagrar eller säljer några personuppgifter om dig.**

## Sammanfattning

- Allt du anger eller registrerar (bönelogg, fasta, dhikr, dagbok, Koranbokmärken, inställningar, plats) lagras **på din enhet**. Inget skickas till utvecklaren.
- Appen ansluter till internet för att hämta bönetider där de inte räknas ut på enheten, för att ta reda på ortens namn och söka platser, för att se efter uppdaterade beräkningsdata och rättelser av hijri-datumet, och för att ladda ned Korantypsnitt, tafsir eller recitationsljud som du ber om. Anropen går till tredjepartstjänsterna nedan, aldrig till utvecklaren.
- Synkronisering mellan dina egna enheter är valfri, förseglad från ände till ände och sker via en mapp du väljer, inte via någon Mihrab-server.

## Uppgifter som appen hanterar

**Plats (känslig).** Om du väljer enhetsplats läser appen din ungefärliga eller exakta plats (Android `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION`, iOS "När appen används") för att beräkna bönetider och Qibla-riktning. Du kan i stället ange eller söka en plats manuellt. Platsinställningar och sparade platser lagras på enheten, krypterade i vila via iOS Keychain eller Android EncryptedSharedPreferences (Android Keystore). Orterna appen har placerat dig i (som håller tiderna stadiga medan du rör dig inom en ort) ligger i appens vanliga lagring. Platsen skickas aldrig till utvecklaren. Den skickas (se Tredje parter) till AlAdhan, där AlAdhan är källan till dina bönetider — standard utanför de platser vars myndighets metod räknas ut på enheten — som de koordinater och det datum som behövs för uppslaget; och, med enhetsplats, till OpenStreetMap Nominatim för att ta reda på ortens namn, avrundad till två decimaler (ungefär en kilometer). Väljer du beräkning på enheten och anger platsen själv görs ingen av förfrågningarna.

**Rörelsesensorer.** Används enbart för att visa Qibla-kompassen. Sensorvärdena bearbetas på enheten och varken lagras eller skickas.

**Kamera.** Används enbart för att läsa parnings-QR-koden när du länkar två av dina egna enheter för synkronisering. Inget spelas in, sparas eller skickas.

**Notiser och alarm.** Om du aktiverar bönenotiser schemaläggs de lokalt på enheten. Valfria helskärmsaviseringar använder Androids behörigheter för helskärmsnotis och exakta alarm, och på iOS 26+ systemets alarmtjänst (AlarmKit); allt schemaläggs och visas helt på enheten. Appen begär också åtkomst till Stör ej (Android `ACCESS_NOTIFICATION_POLICY`) bara för att en bönepåminnelse ska kunna ringa när du har bett om det. Inget om dina notiser skickas till utvecklaren.

**Din bönelogg och dina inställningar.** Bönelogg, fasta, dhikr, sunna-logg, dagboksinlägg, Koranbokmärken, stjärnmärkta verser, khatmah-planer, senast lästa plats, språk, utseende, beräkningsmetod och notisinställningar lagras lokalt. Känsliga poster (dagbok, fasta, dhikr, sunna) krypteras i vila med en enhetsbunden nyckel. På Android kan appens inställningar och poster följa med i Androids egen säkerhetskopia och flytt mellan enheter när du har dem påslagna i systemet; den säkerhetskopian är Googles, enligt inställningarna för ditt Google-konto, och utvecklaren har ingen åtkomst till den.

**Bilder och filer.** När du exporterar en månadsbild med bönetider eller en dataexport sparar appen den där du väljer (fotobibliotek eller fil). Appen lägger bara till den bild du exporterar och bläddrar inte i ditt fotobibliotek.

**Enhetssynk (valfritt).** Om du slår på synk slås en ögonblicksbild av de kategorier du valt samman mellan dina egna enheter. Ögonblicksbilden förseglas till den andra enhetens nyckel och skrivs till en mapp du väljer (t.ex. en mapp i din egen molnlagringsapp). Utvecklaren kan inte läsa den och har ingen åtkomst till mappen. Du kan stänga av synk och glömma en enhet när som helst.

**Widgetar och Live Activity.** Widgetar och iOS Live Activity visar de bönetider appen redan har. De använder ingen server och ingen pushtjänst.

**Urklipp.** Appen lägger bara text i urklipp när du trycker på en kopieringsåtgärd (t.ex. en parningskod).

## Tredje parter

När du använder dessa funktioner kontaktar din enhet tjänsten direkt. Tjänsten kan se tekniska uppgifter som din IP-adress, tidpunkt och begärd URL, enligt sin egen integritetspolicy. Mihrab skickar inget kontoid, reklam-id eller enhets-id.

- **Bönetider.** Sveriges (Islamiska Förbundets), Diyanets, Marockos, Algeriets och Indonesiens tider räknas ut på enheten och kontaktar ingen bönetidstjänst. **Aladhan** (`api.aladhan.com`) är källan på andra platser om du inte väljer beräkning på enheten; den får dina koordinater, datumet och beräkningsinställningarna. Singapores och Malaysias tabeller kommer från Mihrabs egna öppna dataset på GitHub (`raw.githubusercontent.com/MihrabHQ/Mihrab`), per ort; bara när en dag saknas där frågas myndighetens egen tjänst (`www.e-solat.gov.my`, med zonkod; `api-open.data.gov.sg`, utan något om dig). För Türkiye Takvimi slås närmaste stad upp på enheten i en kartruta på cirka 50 mil som hämtas från GitHub; året hämtas från en GitHub-release i Mihrab-repot, eller, om det saknas där, från `www.namazvakti.com` med stadens id, aldrig dina koordinater.
- **Uppdateringar av beräkningar och kalender:** vid start och med några timmars mellanrum läser appen `certification.json` och korrigeringslistor från `raw.githubusercontent.com/MihrabHQ/mihrab-methods`, och aviserade rättelser av hijri-datumet från `raw.githubusercontent.com/MihrabHQ/Mihrab`. Skickas: inget utöver själva förfrågan.
- **Platssökning och ortens namn:** OpenStreetMap Nominatim (`nominatim.openstreetmap.org`), och Photon (`photon.komoot.io`) för sökning när Nominatim är upptagen. Skickas: din söktext; eller, med enhetsplats, dina koordinater avrundade till två decimaler (ungefär en kilometer), automatiskt när du har flyttat dig ungefär en kilometer.
- **Koraninnehåll, på begäran:** (Korantexten och översättningarna följer med appen) tafsir (via `cdn.jsdelivr.net`), arabiska betydelser av svårare ord (QuranEnc, `quranenc.com`), recitationsljud (`everyayah.com`), ytterligare riwayat- och mushaf-data (Quranpedia, `api.quranpedia.net`) och mushaf-typsnitt (GitHub-releaser för Mihrab-repot). Skickas: den fil eller sura som begärs.
- **Öppna länkar:** Om du trycker på en länk (GitHub, webbplatsen, butikssidorna) öppnas den i webbläsaren eller butiksappen, enligt den webbplatsens policy.

Appen innehåller **inga** reklam-SDK:er, analys-SDK:er, spårning, kraschrapporteringstjänster eller datamäklare, och den spårar dig inte över appar eller webbplatser. Eftersom utvecklaren inte samlar in några uppgifter finns inget att dela eller sälja.

## Ändamål och rättslig grund (GDPR)

Behandlingen sker på din enhet för att tillhandahålla de funktioner du använder (bönetider, Qibla, notiser, widgetar, bönelogg, synk). Där platsen behövs är den rättsliga grunden ditt **samtycke** via systemets behörighetsfråga, som du när som helst kan återkalla. Utvecklaren är inte mottagare av dina uppgifter och behandlar inga personuppgifter på någon server.

## Dina rättigheter (EU/EES)

Eftersom utvecklaren inte har någon kopia av dina uppgifter ligger tillgång, rättelse och radering i dina egna händer: ändra eller återkalla behörigheter i systeminställningarna, ange en manuell plats, ta bort poster i appen, stäng av synk eller **avinstallera** appen för att ta bort all lokal data. Du kan också skriva till [mihrab@elghamri.se](mailto:mihrab@elghamri.se) med frågor om integritet, och du kan klaga hos Integritetsskyddsmyndigheten (IMY, [imy.se](https://www.imy.se)) eller din lokala tillsynsmyndighet.

## Barn

Mihrab riktar sig inte till barn under 13 år och samlar inte medvetet in personuppgifter från någon. Det finns inget konto och ingen central databas, så det finns inget för utvecklaren att radera för ett barns räkning; hör av dig om du har några frågor.

## Ändringar

Om appens datahantering ändras uppdateras denna policy och datumet. Aktuell version finns alltid på [https://github.com/MihrabHQ/Mihrab/blob/main/PRIVACY_POLICY.md](https://github.com/MihrabHQ/Mihrab/blob/main/PRIVACY_POLICY.md).
