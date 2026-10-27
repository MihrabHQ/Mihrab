package com.prayer_times

/**
 * The fixed-size widgets, under component names of their own.
 *
 * Up to 2.33 these six cards could be resized. They are fixed sizes now
 * (times 4×1, next prayer 2×1, the tall times 4×2, log 4×1 and 4×2,
 * streak 4×2), and a launcher keeps whatever size an existing widget was
 * given — with resizing off, a card stretched under 2.33 would be stuck at
 * the wrong size for good. So the cards moved to new names: the old
 * components are no longer widget providers, the launcher drops the
 * widgets placed from them, and anyone who wants one back places it again
 * at its proper size.
 *
 * Each class here is its old provider unchanged; only the name is new.
 * `.PrayerWidgetProvider` itself stays in the manifest as a plain receiver
 * for unlock, boot and the prayer-boundary alarm (see the manifest).
 */
class TimesWidgetReceiver : PrayerWidgetProvider()

class NextPrayerWidgetReceiver : PrayerWidgetSmallProvider()

class TimesTallWidgetReceiver : PrayerWidgetLargeProvider()

class LogWidgetReceiver : PrayerWidgetLogProvider()

class LogTallWidgetReceiver : PrayerWidgetLogLargeProvider()

class StreakWidgetReceiver : PrayerWidgetStreakProvider()
