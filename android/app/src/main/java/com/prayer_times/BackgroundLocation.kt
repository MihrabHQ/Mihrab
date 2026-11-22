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
 * 3. ONE REAL REQUEST, only when that check says the phone has changed
 *    country or time zone and no position shows it yet — a phone on which
 *    nothing else asks for a position. Thirty seconds at most, and not
 *    again for six hours: once a journey, not once an hour.
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
      val lm = c.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      lm.requestLocationUpdates(
        LocationManager.PASSIVE_PROVIDER,
        PASSIVE_MIN_MS,
        PASSIVE_MIN_METERS,
        pendingIntent(c),
      )
      WorkManager.getInstance(c).enqueueUniquePeriodicWork(
        WORK_CHECK,
        ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<TravelCheckWorker>(CHECK_HOURS, TimeUnit.HOURS).build(),
      )
    } catch (t: Throwable) {
      Log.w(TAG, "could not start listening", t)
    }
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

  /** The place the app is on, told by the app whenever it changes or is confirmed. */
  fun setPlace(c: Context, latitude: Double, longitude: Double) {
    val now = System.currentTimeMillis()
    val e = prefs(c).edit()
      .putLong("placeLat", java.lang.Double.doubleToRawLongBits(latitude))
      .putLong("placeLng", java.lang.Double.doubleToRawLongBits(longitude))
      .putLong("placeAt", now)
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
    if (now - p.getLong("handoffAt", 0L) < HANDOFF_GAP_MS) {
      val lat = java.lang.Double.longBitsToDouble(p.getLong("handoffLat", 0L))
      val lng = java.lang.Double.longBitsToDouble(p.getLong("handoffLng", 0L))
      if (meters(lat, lng, location.latitude, location.longitude) < MOVE_METERS) return false
    }
    p.edit()
      .putLong("handoffAt", now)
      .putLong("handoffLat", java.lang.Double.doubleToRawLongBits(location.latitude))
      .putLong("handoffLng", java.lang.Double.doubleToRawLongBits(location.longitude))
      .apply()
    Log.i(TAG, "a move of 20 km or more: starting the app's own update")
    WorkManager.getInstance(c).enqueueUniqueWork(
      WORK_MOVED,
      ExistingWorkPolicy.REPLACE,
      OneTimeWorkRequestBuilder<LocationMovedWorker>()
        .setInputData(
          workDataOf(
            "latitude" to location.latitude,
            "longitude" to location.longitude,
            "timestamp" to location.time,
          ),
        )
        .build(),
    )
    return true
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
    if (!journey) return
    if (now - p.getLong("activeAt", 0L) < ACTIVE_GAP_MS) return
    p.edit().putLong("activeAt", now).apply()
    Log.i(TAG, "another country or time zone, and no position shows it: asking once")
    val fix = currentLocation(c, lm) ?: return
    // Answered: these surroundings are now the known ones, whether or not
    // it was a move — a border town's tower is not asked about again.
    val e = p.edit()
    rememberSurroundings(c, e, now)
    e.apply()
    consider(c, fix)
  }

  fun checkNow(c: Context) {
    if (!enabled(c)) return
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
 * right clock. Only where an engine is running; a process without one
 * starts a fresh engine when it needs it.
 */
private fun reloadForNewTimeZone(context: Context) {
  try {
    val host = (context.applicationContext as? ReactApplication)?.reactHost ?: return
    if (host.currentReactContext == null) return
    Log.i(BackgroundLocation.TAG, "time zone changed under a running app: reloading its JavaScript")
    UiThreadUtil.runOnUiThread {
      try {
        host.reload("time zone changed")
      } catch (t: Throwable) {
        Log.w(BackgroundLocation.TAG, "reload failed", t)
      }
    }
  } catch (t: Throwable) {
    Log.w(BackgroundLocation.TAG, "could not reload for the new time zone", t)
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
}
