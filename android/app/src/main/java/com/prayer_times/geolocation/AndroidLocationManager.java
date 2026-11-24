package com.prayer_times.geolocation;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationProvider;
import android.os.Bundle;
import android.os.Handler;

import androidx.core.content.ContextCompat;

import com.facebook.common.logging.FLog;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.common.ReactConstants;
import com.facebook.react.common.SystemClock;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import javax.annotation.Nullable;

@SuppressLint("MissingPermission")
public class AndroidLocationManager extends BaseLocationManager {
    private @Nullable
    String mWatchedProvider;

    private final LocationListener mLocationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            mReactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("geolocationDidChange", locationToMap(location));
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
            if (status == LocationProvider.OUT_OF_SERVICE) {
                emitError(PositionError.POSITION_UNAVAILABLE, "Provider " + provider + " is out of service.");
            } else if (status == LocationProvider.TEMPORARILY_UNAVAILABLE) {
                emitError(PositionError.TIMEOUT, "Provider " + provider + " is temporarily unavailable.");
            }
        }

        @Override
        public void onProviderEnabled(String provider) {
        }

        @Override
        public void onProviderDisabled(String provider) {
        }
    };

    protected AndroidLocationManager(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    public void getCurrentLocationData(
            ReadableMap options,
            final Callback success,
            Callback error) {
        AndroidLocationManager.LocationOptions locationOptions = AndroidLocationManager.LocationOptions.fromReactMap(options);

        try {
            LocationManager locationManager =
                    (LocationManager) mReactContext.getSystemService(Context.LOCATION_SERVICE);
            // Android 12 and later have a fused provider in the OS itself
            // (Google's on a phone with Play services, the system's own on
            // one without): satellites, Wi-Fi, cell towers and the sensors
            // as one answer. The quick request (not high accuracy) asks it,
            // for every reader and not only one who chose "Approximate" —
            // beside the satellites alone, which the precise request still
            // listens to. A phone with no network provider used to give the
            // quick request the satellites too, so both waited on the sky.
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S
                    && (approximateOnly() || !locationOptions.highAccuracy)) {
                Location recent = newestLastKnown(locationManager);
                if (recent != null && (SystemClock.currentTimeMillis() - recent.getTime()) < locationOptions.maximumAge) {
                    success.invoke(locationToMap(recent));
                    return;
                }
                currentApproximateLocation(locationManager, locationOptions.timeout, success, error);
                return;
            }
            String provider = getValidProvider(locationManager, locationOptions.highAccuracy);
            if (provider == null) {
                error.invoke(
                        PositionError.buildError(
                                PositionError.POSITION_UNAVAILABLE, "No location provider available."));
                return;
            }
            Location location = locationManager.getLastKnownLocation(provider);
            if (location != null && (SystemClock.currentTimeMillis() - location.getTime()) < locationOptions.maximumAge) {
                success.invoke(locationToMap(location));
                return;
            }

            new AndroidLocationManager.SingleUpdateRequest(locationManager, provider, locationOptions.timeout, success, error)
                    .invoke(location);
        } catch (SecurityException e) {
            // The permission went between the check and the call (revoked in
            // the system's settings while the request was on its way): an
            // answer for the caller, not a crash.
            error.invoke(PositionError.buildError(PositionError.PERMISSION_DENIED, "Location permission was not granted."));
        }
    }

    public void startObserving(ReadableMap options) {
        if (LocationManager.GPS_PROVIDER.equals(mWatchedProvider)) {
            return;
        }
        LocationOptions locationOptions = LocationOptions.fromReactMap(options);

        try {
            LocationManager locationManager =
                    (LocationManager) mReactContext.getSystemService(Context.LOCATION_SERVICE);
            String provider = getValidProvider(locationManager, locationOptions.highAccuracy);
            if (provider == null) {
                emitError(PositionError.POSITION_UNAVAILABLE, "No location provider available.");
                return;
            }
            if (!provider.equals(mWatchedProvider)) {
                locationManager.removeUpdates(mLocationListener);
                locationManager.requestLocationUpdates(
                        provider,
                        1000,
                        locationOptions.distanceFilter,
                        mLocationListener);
            }
            mWatchedProvider = provider;
        } catch (SecurityException e) {
            throw e;
        }
    }

    public void stopObserving() {
        LocationManager locationManager =
                (LocationManager) mReactContext.getSystemService(Context.LOCATION_SERVICE);
        locationManager.removeUpdates(mLocationListener);
        mWatchedProvider = null;
    }

    /** The reader chose "Approximate": the coarse permission and not the fine one. */
    private boolean approximateOnly() {
        return ContextCompat.checkSelfPermission(mReactContext, android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(mReactContext, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * One fix for a reader who chose "Approximate", on Android 12 and later.
     *
     * Asked of the platform's own `getCurrentLocation`, from the platform's
     * fused provider where there is one (Android 12 brought one into the OS
     * itself — AOSP's, nothing of Google's), else the network provider, else
     * the satellites. The listener this file otherwise registers is not
     * answered in useful time for such a reader: on an AOSP Android 12
     * emulator with no network provider (what a GrapheneOS phone has by
     * default) the registration on `gps` stood for 28 seconds and was given
     * no location at all, and the request "timed out" on a phone whose GPS
     * had a fix.
     */
    private void currentApproximateLocation(LocationManager locationManager, long timeout, final Callback success, final Callback error) {
        String provider = null;
        for (String candidate : new String[] {LocationManager.FUSED_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER}) {
            if (isEnabled(locationManager, candidate)) {
                provider = candidate;
                break;
            }
        }
        if (provider == null) {
            error.invoke(PositionError.buildError(PositionError.POSITION_UNAVAILABLE, "No location provider available."));
            return;
        }
        final java.util.concurrent.atomic.AtomicBoolean answered = new java.util.concurrent.atomic.AtomicBoolean(false);
        final android.os.CancellationSignal cancel = new android.os.CancellationSignal();
        final Handler handler = new Handler(android.os.Looper.getMainLooper());
        final Runnable giveUp = new Runnable() {
            @Override
            public void run() {
                if (answered.compareAndSet(false, true)) {
                    cancel.cancel();
                    Location last = newestLastKnown(locationManager);
                    if (last != null) {
                        success.invoke(locationToMap(last));
                    } else {
                        error.invoke(PositionError.buildError(PositionError.TIMEOUT, "Location request timed out"));
                    }
                }
            }
        };
        handler.postDelayed(giveUp, timeout);
        // High accuracy by name: the fused provider answers a "balanced"
        // request from the network provider alone, and where there is none
        // it answers at once with nothing.
        android.location.LocationRequest request = new android.location.LocationRequest.Builder(0)
                .setQuality(android.location.LocationRequest.QUALITY_HIGH_ACCURACY)
                .setDurationMillis(Math.max(1000L, timeout))
                .build();
        locationManager.getCurrentLocation(provider, request, cancel, mReactContext.getMainExecutor(), new java.util.function.Consumer<Location>() {
            @Override
            public void accept(Location location) {
                if (!answered.compareAndSet(false, true)) {
                    return;
                }
                handler.removeCallbacks(giveUp);
                Location answer = location != null ? location : newestLastKnown(locationManager);
                if (answer != null) {
                    success.invoke(locationToMap(answer));
                } else {
                    error.invoke(PositionError.buildError(PositionError.POSITION_UNAVAILABLE, "No location could be found."));
                }
            }
        });
    }

    /**
     * Which provider answers.
     *
     * The network provider where there is one and the request is not for
     * high accuracy; otherwise the satellites. A phone without Google Play
     * services very often has NO network provider at all — GrapheneOS ships
     * without one unless the reader opts in to its own — so the fallback to
     * the satellites is the ordinary case there, not the exception.
     *
     * WITH "APPROXIMATE" ONLY. Since Android 12 the permission sheet offers
     * Approximate beside Precise, and the system lets an app holding only
     * the coarse permission ask ANY provider: it hands back the fix
     * coarsened. This method used to refuse the satellites to such an app
     * (the rule before Android 12), so on a phone with no network provider
     * a reader who chose Approximate — the careful choice, on exactly the
     * phones that have no network provider — was told "No location provider
     * available" and could not be located at all. A few kilometres are more
     * than prayer times need. (A single fix for such a reader goes through
     * `currentApproximateLocation`; this is what watching still uses.)
     */
    @Nullable
    private String getValidProvider(LocationManager locationManager, boolean highAccuracy) {
        boolean fine = ContextCompat.checkSelfPermission(mReactContext, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(mReactContext, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        // Android 12+: the coarse permission is enough for the satellites (the fix comes back coarsened).
        boolean gpsAllowed = fine || (coarse && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S);
        boolean networkAllowed = fine || coarse;
        boolean gps = gpsAllowed && isEnabled(locationManager, LocationManager.GPS_PROVIDER);
        boolean network = networkAllowed && isEnabled(locationManager, LocationManager.NETWORK_PROVIDER);
        if (highAccuracy) {
            return gps ? LocationManager.GPS_PROVIDER : network ? LocationManager.NETWORK_PROVIDER : null;
        }
        return network ? LocationManager.NETWORK_PROVIDER : gps ? LocationManager.GPS_PROVIDER : null;
    }

    /**
     * The newest position any provider last had, or null.
     *
     * What a request answers with when its wait runs out. A reader who had
     * travelled from Sweden to Germany kept Stockholm at every launch and
     * every pull to refresh (Mihrab, Nov 2026): a first fix after a flight,
     * or indoors, takes longer than the wait, the request "timed out", and
     * the app stayed on the place it had — though the phone itself had a
     * position in Germany, a minute and a half old, from a fix that landed
     * after the app stopped listening. The phone's last position is never
     * older than the app's own: the app's came from one.
     */
    @Nullable
    private static Location newestLastKnown(LocationManager locationManager) {
        Location best = null;
        for (String provider : new String[] {"fused", LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
            try {
                Location location = locationManager.getLastKnownLocation(provider);
                if (location != null && (best == null || location.getTime() > best.getTime())) {
                    best = location;
                }
            } catch (RuntimeException e) {
                // No such provider on this phone, or not this permission's to ask.
            }
        }
        return best;
    }

    /** A provider the phone does not have at all is not enabled either, and asking must not throw. */
    private static boolean isEnabled(LocationManager locationManager, String provider) {
        try {
            return locationManager.isProviderEnabled(provider);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static class SingleUpdateRequest {

        private final Callback mSuccess;
        private final Callback mError;
        private final LocationManager mLocationManager;
        private final String mProvider;
        private final long mTimeout;
        private Location mOldLocation;
        private final Handler mHandler = new Handler();
        private final Runnable mTimeoutRunnable = new Runnable() {
            @Override
            public void run() {
                synchronized (SingleUpdateRequest.this) {
                    if (!mTriggered) {
                        // No fix in time: the newest position the phone has, if it has one (newestLastKnown).
                        Location last = newestLastKnown(mLocationManager);
                        if (last != null) {
                            mSuccess.invoke(locationToMap(last));
                        } else {
                            mError.invoke(PositionError.buildError(PositionError.TIMEOUT, "Location request timed out"));
                        }
                        mLocationManager.removeUpdates(mLocationListener);
                        FLog.i(ReactConstants.TAG, "LocationModule: Location request timed out");
                        mTriggered = true;
                    }
                }
            }
        };
        private final LocationListener mLocationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                synchronized (SingleUpdateRequest.this) {
                    if (!mTriggered && isBetterLocation(location, mOldLocation)) {
                        mSuccess.invoke(locationToMap(location));
                        mHandler.removeCallbacks(mTimeoutRunnable);
                        mTriggered = true;
                        mLocationManager.removeUpdates(mLocationListener);
                    }

                    mOldLocation = location;
                }
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String provider) {
            }

            @Override
            public void onProviderDisabled(String provider) {
            }
        };
        private boolean mTriggered;

        private SingleUpdateRequest(
                LocationManager locationManager,
                String provider,
                long timeout,
                Callback success,
                Callback error) {
            mLocationManager = locationManager;
            mProvider = provider;
            mTimeout = timeout;
            mSuccess = success;
            mError = error;
        }

        public void invoke(Location location) {
            mOldLocation = location;
            mLocationManager.requestLocationUpdates(mProvider, 100, 1, mLocationListener);
            mHandler.postDelayed(mTimeoutRunnable, mTimeout);
        }

        private static final int TWO_MINUTES = 1000 * 60 * 2;

        /**
         * Determines whether one Location reading is better than the current Location fix
         * taken from Android Examples https://developer.android.com/guide/topics/location/strategies.html
         *
         * @param location            The new Location that you want to evaluate
         * @param currentBestLocation The current Location fix, to which you want to compare the new one
         */
        private boolean isBetterLocation(Location location, Location currentBestLocation) {
            if (currentBestLocation == null) {
                // A new location is always better than no location
                return true;
            }

            // Check whether the new location fix is newer or older
            long timeDelta = location.getTime() - currentBestLocation.getTime();
            boolean isSignificantlyNewer = timeDelta > TWO_MINUTES;
            boolean isSignificantlyOlder = timeDelta < -TWO_MINUTES;
            boolean isNewer = timeDelta > 0;

            // If it's been more than two minutes since the current location, use the new location
            // because the user has likely moved
            if (isSignificantlyNewer) {
                return true;
                // If the new location is more than two minutes older, it must be worse
            } else if (isSignificantlyOlder) {
                return false;
            }

            // Check whether the new location fix is more or less accurate
            int accuracyDelta = (int) (location.getAccuracy() - currentBestLocation.getAccuracy());
            boolean isLessAccurate = accuracyDelta > 0;
            boolean isMoreAccurate = accuracyDelta < 0;
            boolean isSignificantlyLessAccurate = accuracyDelta > 200;

            // Check if the old and new location are from the same provider
            boolean isFromSameProvider = isSameProvider(location.getProvider(),
                    currentBestLocation.getProvider());

            // Determine location quality using a combination of timeliness and accuracy
            if (isMoreAccurate) {
                return true;
            } else if (isNewer && !isLessAccurate) {
                return true;
            } else if (isNewer && !isSignificantlyLessAccurate && isFromSameProvider) {
                return true;
            }

            return false;
        }

        /**
         * Checks whether two providers are the same
         */
        private boolean isSameProvider(String provider1, String provider2) {
            if (provider1 == null) {
                return provider2 == null;
            }
            return provider1.equals(provider2);
        }
    }
}
