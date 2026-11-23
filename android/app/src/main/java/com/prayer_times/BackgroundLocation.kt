package com.prayer_times

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Looper
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.TimeZone
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * "MY LOCATION" KEPT UP WHILE THE APP IS CLOSED — optional, off until asked for.
 *
 * Without it the app learns where the phone is when it is opened, and a
 * reader who has travelled gets the alerts and the widgets of the city they
 * left until then. With it (Settings → Location, and Android's "Allow all
 * the time"), a real move is noticed in the background and handed to the
 * app's own code, which moves the place, the alerts and the widgets.
 *
 * ── WHAT IT COSTS, AND WHY THAT IS ALMOST NOTHING ─────────────────────
 *
 * It never polls for a position. Three things, cheapest first:
 *
 * 1. THE PASSIVE PROVIDER. Android hands this app the positions OTHER apps
 *    and the system have already asked for, and only once the phone has
 *    moved five kilometres and a quarter of an hour has passed. It turns no
 *    radio on.
 *
 * 2. A CHECK EVERY THREE HOURS that reads what the phone already knows: its
 *    last position (no request), its mobile network's country and its time
 *    zone. Milliseconds, no radio. The time zone changing runs it at once.
 *
 * 3. ONE REAL REQUEST, only when that check finds the phone knows too
 *    little: it has changed country or time zone and no position shows it
 *    yet, or it has had no position at all for half a day — a phone on
 *    which nothing else asks for one, where a journey inside one country
 *    and one time zone would otherwise go unseen until the app is opened.
 *    Thirty seconds at most, and not again for six hours (three, after a
 *    request that found nothing): a few times a day at the very most, and
 *    on most phones never.
 *
 * Everything here is native and small. The JavaScript app is started only
 * for a move of twenty kilometres or more ([LocationMovedWorker]) — a new
 * city's times are another timetable; a walk across town is not — and at
 * most once in half an hour.
 *
 * Nothing leaves the phone that did not before: the app's own code names
 * the new town and fetches its times exactly as it does when opened.
 */
object BackgroundLocation {
  const val TAG = "MihrabBgLocation"
  private const val PREFS = "mihrab_background_location"
  const val ACTION_PASSIVE = "com.prayer_times.BACKGROUND_LOCATION"
  private const val WORK_CHECK = "mihrab-travel-check"
  private const val WORK_CHECK_NOW = "mihrab-travel-check-now"
  private const val WORK_MOVED = "mihrab-location-moved"

  /** A move the app is started for: another city's timetable. */
  const val MOVE_METERS = 20_000f
  private const val PASSIVE_MIN_MS = 15 * 60_000L
  private const val PASSIVE_MIN_METERS = 5_000f
  /** The app is not started twice for the same destination inside this. */
  private const val HANDOFF_GAP_MS = 30 * 60_000L
  /** A real request for a position: at most one in this long. */
  private const val ACTIVE_GAP_MS = 6 * 3_600_000L
  private const val ACTIVE_WAIT_MS = 30_000L
  /** A move this recent is done again when the zone changes (see [checkNow]). */
  private const val REDO_MS = 15 * 60_000L
  /** After a request that found nothing: the next check may ask again. */
  private const val ACTIVE_RETRY_MS = 3 * 3_600_000L
  /** The phone's newest position is older than this: it knows too little. */
  private const val STALE_MS = 12 * 3_600_000L
  private const val CHECK_HOURS = 3L

  private fun prefs(c: Context): SharedPreferences =
    c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun granted(c: Context, permission: String) =
    ContextCompat.checkSelfPermission(c, permission) == PackageManager.PERMISSION_GRANTED

  /**
   * Is this build one that may ask at all? The permission is declared per
   * flavor (GitHub and F-Droid; Google Play's, once its declaration is
   * filed), and a build that does not declare it does not offer the row.
   * Before Android 10 there is no separate permission to declare.
   */
  fun offered(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return try {
      c.packageManager
        .getPackageInfo(c.packageName, PackageManager.GET_PERMISSIONS)
        .requestedPermissions
        ?.contains(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == true
    } catch (t: Throwable) {
      false
    }
  }

  /** Does Android allow it now? The reader can take it back in the system's settings at any time. */
  fun permitted(c: Context): Boolean {
    val foreground =
      granted(c, Manifest.permission.ACCESS_FINE_LOCATION) ||
        granted(c, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (!foreground) return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return granted(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
  }

  fun enabled(c: Context): Boolean = prefs(c).getBoolean("enabled", false)

  fun setEnabled(c: Context, on: Boolean) {
    prefs(c).edit().putBoolean("enabled", on).apply()
    if (on) register(c) else unregister(c)
  }

  private fun pendingIntent(c: Context): PendingIntent =
    PendingIntent.getBroadcast(
      c,
      0,
      Intent(c, BackgroundLocationReceiver::class.java).setAction(ACTION_PASSIVE),
      // Mutable: the system writes the position into it.
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0),
    )

  /** Asked for and allowed: listen. Called at every start of the app, after a restart of the phone and after an update. */
  fun register(c: Context) {
    if (!enabled(c) || !permitted(c)) {
      unregister(c)
      return
    }
    try {
      listen(c)
      WorkManager.getInstance(c).enqueueUniquePeriodicWork(
        WORK_CHECK,
        ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<TravelCheckWorker>(CHECK_HOURS, TimeUnit.HOURS).build(),
      )
    } catch (t: Throwable) {
      Log.w(TAG, "could not start listening", t)
    }
  }

  /**
   * The passive provider's positions, to the receiver. Asked again at every
   * check as well: the registration does not outlive a restart of the
   * phone, and the check — which does — puts it back if the restart's own
   * broadcast was missed. Asking twice is one registration.
   */
  private fun listen(c: Context) {
    val lm = c.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    lm.requestLocationUpdates(
      LocationManager.PASSIVE_PROVIDER,
      PASSIVE_MIN_MS,
      PASSIVE_MIN_METERS,
      pendingIntent(c),
    )
  }

  fun unregister(c: Context) {
    try {
      (c.getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(pendingIntent(c))
    } catch (t: Throwable) {
      // Never registered, or the permission is gone: nothing to remove.
    }
    try {
      WorkManager.getInstance(c).cancelUniqueWork(WORK_CHECK)
    } catch (t: Throwable) {
      Log.w(TAG, "could not stop the check", t)
    }
  }

  private fun networkCountry(c: Context): String? =
    try {
      (c.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager)
        ?.networkCountryIso
        ?.takeIf { it.length == 2 }
        ?.uppercase(java.util.Locale.ROOT)
    } catch (t: Throwable) {
      null
    }

  private fun offsetMinutes(now: Long) = TimeZone.getDefault().getOffset(now) / 60_000

  private fun rememberSurroundings(c: Context, e: SharedPreferences.Editor, now: Long) {
    e.putString("country", networkCountry(c))
      .putString("zone", TimeZone.getDefault().id)
      .putInt("offset", offsetMinutes(now))
  }

  /**
   * The place the app is on. The app says it at every launch, found or not,
   * so the place it already has changes nothing here — above all not WHEN
   * it was found: stamped "now" at every launch, a reader who opened the app
   * indoors after a journey (no position, the old city still up) had every
   * position the phone already held made "older than the place". A NEW
   * place is as of now. The surroundings are written only by [confirmPlace].
   */
  fun setPlace(c: Context, latitude: Double, longitude: Double) {
    val p = prefs(c)
    if (p.contains("placeLat") &&
      java.lang.Double.longBitsToDouble(p.getLong("placeLat", 0L)) == latitude &&
      java.lang.Double.longBitsToDouble(p.getLong("placeLng", 0L)) == longitude
    ) {
      return
    }
    p.edit()
      .putLong("placeLat", java.lang.Double.doubleToRawLongBits(latitude))
      .putLong("placeLng", java.lang.Double.doubleToRawLongBits(longitude))
      .putLong("placeAt", System.currentTimeMillis())
      .apply()
  }

  /**
   * A fresh position has just said the place is where the phone is: older
   * positions are not news, and the network's country and the time zone
   * now are the place's — what a later journey is told from.
   */
  fun confirmPlace(c: Context) {
    val now = System.currentTimeMillis()
    val e = prefs(c).edit().putLong("placeAt", now)
    rememberSurroundings(c, e, now)
    e.apply()
  }

  private fun meters(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Float {
    val out = FloatArray(1)
    Location.distanceBetween(aLat, aLng, bLat, bLng, out)
    return out[0]
  }

  /**
   * A position the phone has: is it a move the app should be started for?
   * Newer than the app's own place, twenty kilometres or more from it, and
   * not the destination the app was started for a moment ago.
   */
  fun consider(c: Context, location: Location): Boolean {
    if (!enabled(c)) return false
    val p = prefs(c)
    if (!p.contains("placeLat")) return false
    if (location.time <= p.getLong("placeAt", 0L)) return false
    val placeLat = java.lang.Double.longBitsToDouble(p.getLong("placeLat", 0L))
    val placeLng = java.lang.Double.longBitsToDouble(p.getLong("placeLng", 0L))
    if (meters(placeLat, placeLng, location.latitude, location.longitude) < MOVE_METERS) return false
    val now = System.currentTimeMillis()
    // Only while the place is still the one the app was started for: once
    // it has moved since (the app opened somewhere else), the destination
    // of half an hour ago is news again — seen on an Android 17 emulator,
    // Istanbul → Dubai → Istanbul inside the half hour, the way back left
    // unseen.
    val handoffAt = p.getLong("handoffAt", 0L)
    if (now - handoffAt < HANDOFF_GAP_MS && p.getLong("placeAt", 0L) <= handoffAt) {
      val lat = java.lang.Double.longBitsToDouble(p.getLong("handoffLat", 0L))
      val lng = java.lang.Double.longBitsToDouble(p.getLong("handoffLng", 0L))
      if (meters(lat, lng, location.latitude, location.longitude) < MOVE_METERS) return false
    }
    p.edit()
      .putLong("handoffAt", now)
      .putLong("handoffFixAt", location.time)
      .putLong("handoffLat", java.lang.Double.doubleToRawLongBits(location.latitude))
      .putLong("handoffLng", java.lang.Double.doubleToRawLongBits(location.longitude))
      .apply()
    Log.i(TAG, "a move of 20 km or more: starting the app's own update")
    startUpdate(c, location.latitude, location.longitude, location.time, again = false, delaySeconds = 0)
    return true
  }

  /** The app's own update for a move ('LocationMoved' in index.js). */
  private fun startUpdate(
    c: Context,
    latitude: Double,
    longitude: Double,
    time: Long,
    again: Boolean,
    delaySeconds: Long,
  ) {
    WorkManager.getInstance(c).enqueueUniqueWork(
      WORK_MOVED,
      ExistingWorkPolicy.REPLACE,
      OneTimeWorkRequestBuilder<LocationMovedWorker>()
        .setInputData(
          workDataOf(
            "latitude" to latitude,
            "longitude" to longitude,
            "timestamp" to time,
            "again" to again,
          ),
        )
        .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
        .build(),
    )
  }

  private fun newestLastKnown(lm: LocationManager): Location? {
    var best: Location? = null
    for (provider in arrayOf("fused", LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
      try {
        val l = lm.getLastKnownLocation(provider) ?: continue
        if (best == null || l.time > best.time) best = l
      } catch (t: RuntimeException) {
        // No such provider on this phone.
      }
    }
    return best
  }

  private fun enabledProvider(lm: LocationManager): String? {
    val order =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf("fused", LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
      } else {
        arrayOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
      }
    return order.firstOrNull {
      try {
        lm.isProviderEnabled(it)
      } catch (t: RuntimeException) {
        false
      }
    }
  }

  /** One position, asked for: thirty seconds at most. On a worker's thread. */
  private fun currentLocation(c: Context, lm: LocationManager): Location? {
    val provider = enabledProvider(lm) ?: return null
    val latch = CountDownLatch(1)
    var found: Location? = null
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val cancel = CancellationSignal()
        lm.getCurrentLocation(provider, cancel, c.mainExecutor) { l ->
          found = l
          latch.countDown()
        }
        if (!latch.await(ACTIVE_WAIT_MS, TimeUnit.MILLISECONDS)) cancel.cancel()
      } else {
        // Every method written out: before Android 11 the three below are
        // abstract on the phone, whatever the SDK compiled against says.
        val listener = object : LocationListener {
          override fun onLocationChanged(l: Location) {
            found = l
            latch.countDown()
          }

          @Deprecated("Deprecated in Java")
          override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) = Unit

          override fun onProviderEnabled(provider: String) = Unit

          override fun onProviderDisabled(provider: String) = Unit
        }
        @Suppress("DEPRECATION")
        lm.requestSingleUpdate(provider, listener, Looper.getMainLooper())
        if (!latch.await(ACTIVE_WAIT_MS, TimeUnit.MILLISECONDS)) lm.removeUpdates(listener)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "the one request failed", t)
    }
    return found
  }

  /**
   * The three-hourly check (and at once when the time zone changes): what
   * the phone already knows first, and one request only for a journey that
   * no position shows yet.
   */
  fun travelCheck(c: Context) {
    if (!enabled(c)) return
    if (!permitted(c)) {
      // Taken back in the system's settings: stop listening, keep the wish.
      unregister(c)
      return
    }
    val lm = c.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    try {
      listen(c)
    } catch (t: Throwable) {
      Log.w(TAG, "could not listen again", t)
    }
    val known = newestLastKnown(lm)
    if (known != null && consider(c, known)) return

    val p = prefs(c)
    val now = System.currentTimeMillis()
    val wasCountry = p.getString("country", null)
    val country = networkCountry(c)
    val wasZone = p.getString("zone", null)
    val journey =
      (wasCountry != null && country != null && wasCountry != country) ||
        (wasZone != null && wasZone != TimeZone.getDefault().id &&
          p.getInt("offset", Int.MIN_VALUE) != offsetMinutes(now))
    // Nothing newer than the app's own place, and nothing at all for half
    // a day: a phone on which nobody else asks. A journey inside one
    // country and one zone leaves no other trace.
    val knowsNothing =
      p.contains("placeLat") &&
        (known == null ||
          (now - known.time > STALE_MS && known.time <= p.getLong("placeAt", 0L)) ||
          now - known.time > 2 * STALE_MS)
    if (!journey && !knowsNothing) return
    if (now - p.getLong("activeAt", 0L) < ACTIVE_GAP_MS) return
    // Location switched off in the phone's settings: nothing to ask, and
    // nothing spent — the next check looks again.
    if (enabledProvider(lm) == null) return
    p.edit().putLong("activeAt", now).apply()
    Log.i(TAG, if (journey) "another country or time zone, and no position shows it: asking once" else "no position for half a day: asking once")
    val fix = currentLocation(c, lm)
    if (fix == null) {
      // Indoors, or no sky. On a journey that is not six hours' silence:
      // the next check may ask again. A phone that merely knows nothing
      // waits the six hours.
      if (journey) p.edit().putLong("activeAt", now - ACTIVE_GAP_MS + ACTIVE_RETRY_MS).apply()
      return
    }
    if (!consider(c, fix) && journey) {
      // Answered, and not a move (a border town's tower, a zone changed by
      // hand): these surroundings are the place's own now, and are not
      // asked about again. A move writes them itself when the app has
      // moved the place.
      val e = p.edit()
      rememberSurroundings(c, e, now)
      e.apply()
    }
  }

  fun checkNow(c: Context) {
    if (!enabled(c)) return
    // ON LANDING the position and the new zone arrive together, in either
    // order (an Android 17 emulator: a quarter of a second apart, and both
    // ways round). An update for a move that started just BEFORE the zone
    // changed is ended half done by the reload for the new zone, or ran to
    // the end on the old clock and wrote the alerts an hour off. So a move
    // handed over in the last quarter of an hour is handed over again, to
    // the new engine, once it has started — and done again even though the
    // place may already be there.
    val p = prefs(c)
    val handoffAt = p.getLong("handoffAt", 0L)
    val handoffLat = java.lang.Double.longBitsToDouble(p.getLong("handoffLat", 0L))
    val handoffLng = java.lang.Double.longBitsToDouble(p.getLong("handoffLng", 0L))
    // Not where the phone has moved on since: the check below takes the
    // newer position, and the old one must not be handed over after it.
    val newer = try {
      newestLastKnown(c.getSystemService(Context.LOCATION_SERVICE) as LocationManager)
    } catch (t: Throwable) {
      null
    }
    val movedOn = newer != null && newer.time > handoffAt &&
      meters(handoffLat, handoffLng, newer.latitude, newer.longitude) >= MOVE_METERS
    if (handoffAt > 0 && System.currentTimeMillis() - handoffAt < REDO_MS && !movedOn) {
      Log.i(TAG, "the zone changed just after a move: doing its update again on the new clock")
      startUpdate(
        c,
        handoffLat,
        handoffLng,
        p.getLong("handoffFixAt", 0L),
        again = true,
        delaySeconds = 15,
      )
    }
    WorkManager.getInstance(c).enqueueUniqueWork(
      WORK_CHECK_NOW,
      ExistingWorkPolicy.REPLACE,
      // A moment's delay: a running app is reloading for the new zone
      // (reloadForNewTimeZone), and the check may start its JavaScript.
      OneTimeWorkRequestBuilder<TravelCheckWorker>()
        .setInitialDelay(20, TimeUnit.SECONDS)
        .build(),
    )
  }
}

/** The passive provider's positions, and the time zone changing. */
class BackgroundLocationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      when (intent.action) {
        BackgroundLocation.ACTION_PASSIVE -> {
          @Suppress("DEPRECATION")
          val location: Location =
            intent.getParcelableExtra(LocationManager.KEY_LOCATION_CHANGED) ?: return
          BackgroundLocation.consider(context, location)
        }
        Intent.ACTION_TIMEZONE_CHANGED -> {
          reloadForNewTimeZone(context)
          BackgroundLocation.checkNow(context)
        }
      }
    } catch (t: Throwable) {
      Log.w(BackgroundLocation.TAG, "receiver failed", t)
    }
  }
}

/**
 * THE TIME ZONE CHANGED UNDER A RUNNING APP: start its JavaScript again.
 *
 * The JavaScript engine works out the zone's offset once and keeps it. An
 * app left in memory across a change of zone — a flight, with the app not
 * closed — went on reading every prayer time on the OLD clock: Berlin's
 * Fajr at 04:39 on a phone that had moved from London's time to Berlin's,
 * an hour early, until the process happened to be restarted (seen on an
 * Android 17 emulator with 2.38.3, Nov 2026). Nothing in JavaScript can
 * see it — its own clock is the thing that is stale — so the native side,
 * which is told of the change, reloads React Native: a new engine, the
 * right clock.
 *
 * AND AGAIN WHEN IT COMES BACK TO THE SCREEN. Reloaded with its activity
 * stopped (the app in the background — exactly where it is on a flight),
 * React Native came back to a window it never drew again: opened, the app
 * was a blank page until its process was ended (Android 17 emulator,
 * Nov 2026). Not reloading then is no answer either: the engine left on
 * the old clock is the one the background work runs in — the move to the
 * new city, the alerts it writes — and wrote them an hour off. So away
 * from the screen the engine is reloaded at once, for that work, and once
 * more when the app is next in front ([MainActivity.onResume]), for the
 * window. In front, once.
 */
private fun reloadForNewTimeZone(context: Context) {
  try {
    val host = (context.applicationContext as? ReactApplication)?.reactHost ?: return
    if (host.currentReactContext == null) return
    if (!MainActivity.resumed) {
      Log.i(BackgroundLocation.TAG, "time zone changed while the app is away: reloading now and when it is opened")
      MainActivity.zoneReloadPending = true
    } else {
      Log.i(BackgroundLocation.TAG, "time zone changed under a running app: reloading its JavaScript")
    }
    reloadJavaScript(context, "time zone changed")
  } catch (t: Throwable) {
    Log.w(BackgroundLocation.TAG, "could not reload for the new time zone", t)
  }
}

/** A new JavaScript engine for the running app, on the main thread. */
fun reloadJavaScript(context: Context, reason: String) {
  try {
    val host = (context.applicationContext as? ReactApplication)?.reactHost ?: return
    if (host.currentReactContext == null) return
    UiThreadUtil.runOnUiThread {
      try {
        host.reload(reason)
      } catch (t: Throwable) {
        Log.w(BackgroundLocation.TAG, "reload failed", t)
      }
    }
  } catch (t: Throwable) {
    Log.w(BackgroundLocation.TAG, "could not reload", t)
  }
}

class TravelCheckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    try {
      BackgroundLocation.travelCheck(applicationContext)
    } catch (t: Throwable) {
      Log.w(BackgroundLocation.TAG, "the check failed", t)
    }
    return Result.success()
  }
}

/**
 * A real move: the app's own JavaScript ('LocationMoved' in index.js) names
 * the new town, moves "My location" to it and writes the alerts and the
 * widgets again — the same code as when the app is opened.
 *
 * A worker, not a service: a background service may not be started from
 * here on Android 8 and later, and a worker is the system's own way to run
 * a minute of work. The task is run on React Native's headless context
 * directly, as HeadlessJsTaskService does it.
 */
class LocationMovedWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val done = CountDownLatch(1)
    UiThreadUtil.runOnUiThread {
      try {
        val host = (applicationContext as ReactApplication).reactHost
        if (host == null) {
          done.countDown()
          return@runOnUiThread
        }
        val args = Arguments.createMap().apply {
          putDouble("latitude", inputData.getDouble("latitude", 0.0))
          putDouble("longitude", inputData.getDouble("longitude", 0.0))
          putDouble("timestamp", inputData.getLong("timestamp", 0L).toDouble())
          putBoolean("again", inputData.getBoolean("again", false))
        }
        val config = HeadlessJsTaskConfig("LocationMoved", args, TASK_MS, true)
        val start = { reactContext: ReactContext ->
          val tasks = HeadlessJsTaskContext.getInstance(reactContext)
          var id = -1
          tasks.addTaskEventListener(
            object : HeadlessJsTaskEventListener {
              override fun onHeadlessJsTaskStart(taskId: Int) = Unit

              override fun onHeadlessJsTaskFinish(taskId: Int) {
                if (taskId != id) return
                tasks.removeTaskEventListener(this)
                done.countDown()
              }
            },
          )
          id = tasks.startTask(config)
        }
        val current = host.currentReactContext
        if (current != null) {
          start(current)
        } else {
          host.addReactInstanceEventListener(
            object : ReactInstanceEventListener {
              override fun onReactContextInitialized(context: ReactContext) {
                host.removeReactInstanceEventListener(this)
                UiThreadUtil.runOnUiThread { start(context) }
              }
            },
          )
          host.start()
        }
      } catch (t: Throwable) {
        Log.w(BackgroundLocation.TAG, "could not start the app's update", t)
        done.countDown()
      }
    }
    // The task's own limit, and a little for the engine to start.
    done.await(TASK_MS + 30_000L, TimeUnit.MILLISECONDS)
    return Result.success()
  }

  private companion object {
    const val TASK_MS = 90_000L
  }
}

class BackgroundLocationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "BackgroundLocation"

  @ReactMethod
  fun status(promise: Promise) {
    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("offered", BackgroundLocation.offered(reactContext))
        putBoolean("enabled", BackgroundLocation.enabled(reactContext))
        putBoolean("permitted", BackgroundLocation.permitted(reactContext))
      },
    )
  }

  @ReactMethod
  fun setEnabled(on: Boolean, promise: Promise) {
    BackgroundLocation.setEnabled(reactContext, on)
    promise.resolve(BackgroundLocation.enabled(reactContext) && BackgroundLocation.permitted(reactContext))
  }

  @ReactMethod
  fun setPlace(latitude: Double, longitude: Double) {
    BackgroundLocation.setPlace(reactContext, latitude, longitude)
  }

  @ReactMethod
  fun confirmPlace() {
    BackgroundLocation.confirmPlace(reactContext)
  }
}
