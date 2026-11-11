// The words the second message needs (Mihrab.mc, THE SECOND MESSAGE): the
// Hijri months and the night marks, in the watch's language. Foreground
// only — neither the background service nor the glance draws them, and
// both run in a fraction of the memory.
import Toybox.Lang;
import Toybox.System;

module MihrabHijri {
    // "9 Jumada II", or short for a row it shares, "9 Jum II"; null when
    // the phone has sent no Hijri date for the day.
    function text(now as Number, short as Boolean) as String? {
        var h = MihrabStore.hijri(now);
        if (h == null || h[1] < 1 || h[1] > 12) {
            return null;
        }
        var table = short ? SHORT : MONTHS;
        var names = table[System.getDeviceSettings().systemLanguage];
        if (names == null) {
            names = table[System.LANGUAGE_ENG] as Array<String>;
        }
        return h[0].format("%d") + " " + (names as Array<String>)[h[1] - 1];
    }

    const MONTHS = {
        System.LANGUAGE_ENG => ["Muharram", "Safar", "Rabi I", "Rabi II", "Jumada I", "Jumada II", "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhul Qadah", "Dhul Hijjah"],
        System.LANGUAGE_TUR => ["Muharrem", "Safer", "Rebiülevvel", "Rebiülahir", "Cemaziyelevvel", "Cemaziyelahir", "Recep", "Şaban", "Ramazan", "Şevval", "Zilkade", "Zilhicce"],
        System.LANGUAGE_IND => ["Muharam", "Safar", "Rabiulawal", "Rabiulakhir", "Jumadilawal", "Jumadilakhir", "Rajab", "Syakban", "Ramadan", "Syawal", "Zulkaidah", "Zulhijah"],
        System.LANGUAGE_RUS => ["Мухаррам", "Сафар", "Раби I", "Раби II", "Джумада I", "Джумада II", "Раджаб", "Шабан", "Рамадан", "Шавваль", "Зуль-када", "Зуль-хиджа"],
        System.LANGUAGE_ARA => ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"],
    } as Dictionary<Number, Array<String>>;

    const SHORT = {
        System.LANGUAGE_ENG => ["Muh", "Saf", "Rab I", "Rab II", "Jum I", "Jum II", "Raj", "Sha", "Ram", "Shw", "Dhu Q", "Dhu H"],
        System.LANGUAGE_TUR => ["Muh", "Saf", "Reb I", "Reb II", "Cem I", "Cem II", "Rec", "Şab", "Ram", "Şev", "Zilk", "Zilh"],
        System.LANGUAGE_RUS => ["Мух", "Саф", "Раб I", "Раб II", "Джум I", "Джум II", "Радж", "Шаб", "Рам", "Шав", "З-кад", "З-хид"],
        System.LANGUAGE_ARA => ["محرم", "صفر", "ربيع ١", "ربيع ٢", "جمادى ١", "جمادى ٢", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"],
    } as Dictionary<Number, Array<String>>;

    // The name of a night mark (MihrabStore.NIGHT_ kinds).
    function night(kind as Number) as String {
        var names = NIGHT[System.getDeviceSettings().systemLanguage];
        if (names == null) {
            names = NIGHT[System.LANGUAGE_ENG] as Array<String>;
        }
        return (names as Array<String>)[kind - 1];
    }

    const NIGHT = {
        System.LANGUAGE_ENG => ["Midnight", "Last third", "First third"],
        System.LANGUAGE_SWE => ["Midnatt", "Sista tredjedelen", "Första tredjedelen"],
        System.LANGUAGE_DEU => ["Mitternacht", "Letztes Drittel", "Erstes Drittel"],
        System.LANGUAGE_FRE => ["Minuit", "Dernier tiers", "Premier tiers"],
        System.LANGUAGE_SPA => ["Medianoche", "Último tercio", "Primer tercio"],
        System.LANGUAGE_IND => ["Tengah malam", "Sepertiga akhir", "Sepertiga awal"],
        System.LANGUAGE_TUR => ["Gece yarısı", "Son üçte bir", "İlk üçte bir"],
        System.LANGUAGE_RUS => ["Полночь", "Последняя треть", "Первая треть"],
        System.LANGUAGE_ARA => ["منتصف الليل", "الثلث الأخير", "الثلث الأول"],
    } as Dictionary<Number, Array<String>>;
}
