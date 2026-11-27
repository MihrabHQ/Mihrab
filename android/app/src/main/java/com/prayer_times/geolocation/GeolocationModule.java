/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/*
 * IN THE APP'S OWN TREE. This package is @react-native-community/geolocation
 * 3.4.0 (MIT) as the app shipped it — that is, with the app's patch applied
 * (patches/@react-native-community+geolocation+3.4.0.patch, 28 KB: the
 * platform LocationManager only, no Google Play services; the fix for a
 * request that outlives its wait; the rest). The library is no longer
 * maintained and the patch had to be carried across every upgrade, so the
 * four files it came down to live here now, unchanged but for the package
 * name, the module's name and the @ReactMethod annotations its wrapper
 * class used to carry. src/native/Geolocation.ts is its JavaScript side.
 */

package com.prayer_times.geolocation;

import android.Manifest;
import android.os.Build;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.JavaOnlyArray;
import com.facebook.react.bridge.PromiseImpl;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter;
import com.facebook.react.modules.permissions.PermissionsModule;

import java.util.ArrayList;
import java.util.Arrays;

public class GeolocationModule extends ReactContextBaseJavaModule {

  public static final String NAME = "MihrabGeolocation";
  private BaseLocationManager mLocationManager;
  private Configuration mConfiguration;

  public GeolocationModule(ReactApplicationContext reactContext) {
    super(reactContext);
    mConfiguration = Configuration.getDefault();
    mLocationManager = new AndroidLocationManager(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void setConfiguration(ReadableMap config) {
    mConfiguration = Configuration.fromReactMap(config);
    onConfigurationChange(mConfiguration);
  }

  private void onConfigurationChange(Configuration config) {
    ReactApplicationContext reactContext = mLocationManager.mReactContext;
    // AOSP LocationManager only (no Google Play services / fused provider). Keeps F-Droid builds
    // free of proprietary GMS blobs; Play Store builds behave the same.
    mLocationManager = new AndroidLocationManager(reactContext);
  }

  /**
   * Requests location permission.
   */
  @ReactMethod
  public void requestAuthorization(final Callback success, final Callback error) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      final PermissionsModule perms = getReactApplicationContext().getNativeModule(PermissionsModule.class);
      ArrayList<String> permissions = new ArrayList<>();
      permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
      permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
      ReadableArray permissionsArray = JavaOnlyArray.from(permissions);

      final Callback onPermissionGranted = args -> {
        WritableNativeMap result = (WritableNativeMap) args[0];
        if (result.getString(Manifest.permission.ACCESS_COARSE_LOCATION).equals("granted")) {
          success.invoke();
        } else {
          error.invoke(PositionError.buildError(PositionError.PERMISSION_DENIED, "Location permission was not granted."));
        }
      };

      final Callback onPermissionDenied = args -> error.invoke(PositionError.buildError(PositionError.PERMISSION_DENIED, "Failed to request location permission."));

      Callback onPermissionCheckFailed = args -> error.invoke(PositionError.buildError(PositionError.PERMISSION_DENIED, "Failed to check location permission."));

      Callback onPermissionChecked = args -> {
        boolean hasPermission = (boolean) args[0];

        if (!hasPermission) {
          perms.requestMultiplePermissions(permissionsArray, new PromiseImpl(onPermissionGranted, onPermissionDenied));
        } else {
          success.invoke();
        }
      };

      perms.checkPermission(Manifest.permission.ACCESS_FINE_LOCATION, new PromiseImpl(onPermissionChecked, args -> perms.checkPermission(Manifest.permission.ACCESS_COARSE_LOCATION, new PromiseImpl(onPermissionChecked, onPermissionCheckFailed))));
      return;
    }

    success.invoke();
  }

  /**
   * Get the current position. This can return almost immediately if the location is cached or
   * request an update, which might take a while. This method also requests location
   * permissions on API level 23 and above when needed.
   *
   * @param options map containing optional arguments: timeout (millis), maximumAge (millis) and
   *        highAccuracy (boolean)
   */
  /**
   * Whether a position can be had at all, asked before one is asked for.
   *
   * {@code enabled}: the phone's Location switch. {@code hasProvider}: the
   * device has something to find a position with (satellites, the network,
   * the platform's fused provider) — a tablet without GPS and without a
   * network provider has only "passive", which finds nothing itself.
   * Needs no permission. Without it, "Use my location" on such a device
   * spun until a timeout and then said only that the request timed out.
   */
  @ReactMethod
  public void getAvailability(final com.facebook.react.bridge.Promise promise) {
    try {
      android.location.LocationManager lm =
          (android.location.LocationManager) getReactApplicationContext().getSystemService(android.content.Context.LOCATION_SERVICE);
      boolean hasProvider = false;
      boolean anyEnabled = false;
      if (lm != null) {
        for (String name : lm.getAllProviders()) {
          if (android.location.LocationManager.PASSIVE_PROVIDER.equals(name)) continue;
          hasProvider = true;
          try {
            if (lm.isProviderEnabled(name)) anyEnabled = true;
          } catch (Exception ignored) {
          }
        }
      }
      boolean enabled = lm != null && (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? lm.isLocationEnabled() : anyEnabled);
      com.facebook.react.bridge.WritableMap out = com.facebook.react.bridge.Arguments.createMap();
      out.putBoolean("enabled", enabled);
      out.putBoolean("hasProvider", hasProvider);
      promise.resolve(out);
    } catch (Exception e) {
      promise.reject("availability", e);
    }
  }

  @ReactMethod
  public void getCurrentPosition(
      final ReadableMap options,
      final Callback success,
      final Callback error) {
    try {
      if (mConfiguration.skipPermissionRequests) {
        mLocationManager.getCurrentLocationData(options, success, error);
        return;
      }

      requestAuthorization(args -> mLocationManager.getCurrentLocationData(options, success, error), error);
    } catch (SecurityException e) {
      emitLocationPermissionMissing(e);
    }
  }


  /**
   * Start listening for location updates. These will be emitted via the
   * {@link RCTDeviceEventEmitter} as {@code geolocationDidChange} events.
   *
   * @param options map containing optional arguments: highAccuracy (boolean)
   */
  @ReactMethod
  public void startObserving(ReadableMap options) {
    try {
      if (mConfiguration.skipPermissionRequests) {
        mLocationManager.startObserving(options);
        return;
      }

      requestAuthorization(args -> mLocationManager.startObserving(options), args -> {
        emitLocationPermissionMissing(new SecurityException(Arrays.toString(args)));
      });
    } catch (SecurityException e) {
      emitLocationPermissionMissing(e);
    }
  }

  /**
   * Stop listening for location updates.
   *
   * NB: this is not balanced with {@link #startObserving}: any number of calls to that method will
   * be canceled by just one call to this one.
   */
  @ReactMethod
  public void stopObserving() {
    mLocationManager.stopObserving();
  }

  @ReactMethod
  public void addListener(String eventName) {
    // Kept for NativeEventEmitter on the JavaScript side.
  }

  @ReactMethod
  public void removeListeners(double count) {
    // Kept for NativeEventEmitter on the JavaScript side.
  }

  /**
   * Provides a clearer exception message than the default one.
   */
  private void emitLocationPermissionMissing(SecurityException e) {
    String message =
            "Looks like the app doesn't have the permission to access location.\n" +
                    "Add the following line to your app's AndroidManifest.xml:\n" +
                    "<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\" />\n" +
                    e.getMessage();
    mLocationManager.emitError(PositionError.PERMISSION_DENIED, message);
  }

  private static class Configuration {
    String locationProvider;
    Boolean skipPermissionRequests;

    private Configuration(String locationProvider, boolean skipPermissionRequests) {
      this.locationProvider = locationProvider;
      this.skipPermissionRequests = skipPermissionRequests;
    }

    protected static Configuration getDefault() {
      return new Configuration("auto", false);
    }

    protected static Configuration fromReactMap(ReadableMap map) {
      String locationProvider =
              map.hasKey("locationProvider") ? map.getString("locationProvider") : "auto";
      boolean skipPermissionRequests =
              map.hasKey("skipPermissionRequests") ? map.getBoolean("skipPermissionRequests") : false;
      return new Configuration(locationProvider, skipPermissionRequests);
    }
  }
}
