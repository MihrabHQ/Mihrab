/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * (Here: MihrabGeolocation.LICENSE, beside this file.)
 */

/*
 * IN THE APP'S OWN TREE. This is @react-native-community/geolocation 3.4.0
 * (MIT) as the app shipped it, with the app's patch applied. The library is
 * no longer maintained; its iOS half is this one file, here unchanged but
 * for the class's name (and so the module's: MihrabGeolocation) and the
 * two blocks that tied it to the library's generated TurboModule spec — it
 * is reached through the interop layer, like the app's other modules.
 * src/native/Geolocation.ts is its JavaScript side.
 */


#import "MihrabGeolocation.h"


#import <CoreLocation/CLError.h>
#import <CoreLocation/CLLocationManager.h>
#import <CoreLocation/CLLocationManagerDelegate.h>

#import <React/RCTAssert.h>
#import <React/RCTBridge.h>
#import <React/RCTConvert.h>
#import <React/RCTEventDispatcher.h>
#import <React/RCTLog.h>

typedef NS_ENUM(NSInteger, RNCPositionErrorCode) {
  RNCPositionErrorDenied = 1,
  RNCPositionErrorUnavailable,
  RNCPositionErrorTimeout,
};

typedef NS_ENUM(NSInteger, MihrabGeolocationAuthorizationLevel) {
  MihrabGeolocationAuthorizationLevelDefault,
  MihrabGeolocationAuthorizationLevelWhenInUse,
  MihrabGeolocationAuthorizationLevelAlways,
};

#define RNC_DEFAULT_LOCATION_ACCURACY kCLLocationAccuracyHundredMeters

typedef struct {
  BOOL skipPermissionRequests;
  MihrabGeolocationAuthorizationLevel authorizationLevel;
  BOOL enableBackgroundLocationUpdates;
} MihrabGeolocationConfiguration;

typedef struct {
  double timeout;
  double maximumAge;
  double accuracy;
  double distanceFilter;
  BOOL useSignificantChanges;
} MihrabGeolocationOptions;

@implementation RCTConvert (MihrabGeolocationAuthorizationLevel)
RCT_ENUM_CONVERTER(MihrabGeolocationAuthorizationLevel, (@{
    @"whenInUse": @(MihrabGeolocationAuthorizationLevelWhenInUse),
    @"always": @(MihrabGeolocationAuthorizationLevelAlways)}),
  MihrabGeolocationAuthorizationLevelDefault, integerValue)
@end

@implementation RCTConvert (MihrabGeolocationOptions)

+ (MihrabGeolocationConfiguration)MihrabGeolocationConfiguration:(id)json
{
  NSDictionary<NSString *, id> *options = [RCTConvert NSDictionary:json];

  return (MihrabGeolocationConfiguration) {
    .skipPermissionRequests = [RCTConvert BOOL:options[@"skipPermissionRequests"]],
    .authorizationLevel = [RCTConvert MihrabGeolocationAuthorizationLevel:options[@"authorizationLevel"]]
  };
}

+ (MihrabGeolocationOptions)MihrabGeolocationOptions:(id)json
{
  NSDictionary<NSString *, id> *options = [RCTConvert NSDictionary:json];

  double distanceFilter = options[@"distanceFilter"] == NULL ? RNC_DEFAULT_LOCATION_ACCURACY
  : [RCTConvert double:options[@"distanceFilter"]] ?: kCLDistanceFilterNone;

  return (MihrabGeolocationOptions){
    .timeout = [RCTConvert NSTimeInterval:options[@"timeout"]] ?: 1000 * 60 * 10,
    .maximumAge = [RCTConvert NSTimeInterval:options[@"maximumAge"]],
    .accuracy = [RCTConvert BOOL:options[@"enableHighAccuracy"]] ? kCLLocationAccuracyBest : RNC_DEFAULT_LOCATION_ACCURACY,
    .distanceFilter = distanceFilter,
    .useSignificantChanges = static_cast<BOOL>([RCTConvert BOOL:options[@"useSignificantChanges"]] ?: NO),
  };
}

@end

static NSDictionary<NSString *, id> *RNCPositionError(RNCPositionErrorCode code, NSString *msg /* nil for default */)
{
  if (!msg) {
    switch (code) {
      case RNCPositionErrorDenied:
        msg = @"User denied access to location services.";
        break;
      case RNCPositionErrorUnavailable:
        msg = @"Unable to retrieve location.";
        break;
      case RNCPositionErrorTimeout:
        msg = @"The location request timed out.";
        break;
    }
  }

  return @{
           @"code": @(code),
           @"message": msg,
           @"PERMISSION_DENIED": @(RNCPositionErrorDenied),
           @"POSITION_UNAVAILABLE": @(RNCPositionErrorUnavailable),
           @"TIMEOUT": @(RNCPositionErrorTimeout)
           };
}

@interface MihrabGeolocationRequest : NSObject

@property (nonatomic, copy) RCTResponseSenderBlock successBlock;
@property (nonatomic, copy) RCTResponseSenderBlock errorBlock;
@property (nonatomic, assign) MihrabGeolocationOptions options;
@property (nonatomic, strong) NSTimer *timeoutTimer;

@end

@implementation MihrabGeolocationRequest

- (void)dealloc
{
  if (_timeoutTimer.valid) {
    [_timeoutTimer invalidate];
  }
}

@end

@interface MihrabGeolocation () <CLLocationManagerDelegate>

@end

@implementation MihrabGeolocation
{
  CLLocationManager *_locationManager;
  NSDictionary<NSString *, id> *_lastLocationEvent;
  NSMutableArray<MihrabGeolocationRequest *> *_pendingRequests;
  BOOL _observingLocation;
  BOOL _usingSignificantChanges;
  MihrabGeolocationConfiguration _locationConfiguration;
  MihrabGeolocationOptions _observerOptions;
  CLAuthorizationStatus _lastUpdatedAuthorizationStatus; // used since iOS 14.0+
  NSMutableArray<NSDictionary<NSString *, RCTResponseSenderBlock>*>* _queuedAuthorizationCallbacks;
}

RCT_EXPORT_MODULE()

#pragma mark - Lifecycle

- (void)dealloc
{
  [self stopMonitoring];

  _locationManager.delegate = nil;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"geolocationDidChange", @"geolocationError"];
}

#pragma mark - Private API

- (void)beginLocationUpdatesWithDesiredAccuracy:(CLLocationAccuracy)desiredAccuracy distanceFilter:(CLLocationDistance)distanceFilter useSignificantChanges:(BOOL)useSignificantChanges
{
  if (!_locationConfiguration.skipPermissionRequests) {
    [self requestAuthorization:nil error:nil];
  } else if (_locationConfiguration.enableBackgroundLocationUpdates) {
    [self enableBackgroundLocationUpdates];
  }

  if (!_locationManager) {
    _locationManager = [CLLocationManager new];
    _locationManager.delegate = self;
  }

  _locationManager.distanceFilter  = distanceFilter;
  _locationManager.desiredAccuracy = desiredAccuracy;
  _usingSignificantChanges = useSignificantChanges;

  if (@available(iOS 14.0, *)) {
    if (
#if ! TARGET_OS_VISION
      _lastUpdatedAuthorizationStatus == kCLAuthorizationStatusAuthorizedAlways ||
#endif
      _lastUpdatedAuthorizationStatus == kCLAuthorizationStatusAuthorizedWhenInUse
    ) {
      [self startMonitoring];
    }
  } else {
    [self startMonitoring];
  }
}

- (void)startMonitoring
{
#if !TARGET_OS_VISION
   _usingSignificantChanges
     ? [_locationManager startMonitoringSignificantLocationChanges]
     : [_locationManager startUpdatingLocation];
#else
    [_locationManager startUpdatingLocation];
#endif
}

- (void)stopMonitoring
{
#if !TARGET_OS_VISION
   _usingSignificantChanges
     ? [_locationManager stopMonitoringSignificantLocationChanges]
     : [_locationManager stopUpdatingLocation];
#else
    [_locationManager stopUpdatingLocation];
#endif
}

#pragma mark - Timeout handler

- (void)timeout:(NSTimer *)timer
{
  MihrabGeolocationRequest *request = timer.userInfo;
  NSString *message = [NSString stringWithFormat: @"Unable to fetch location within %.1fs.", request.options.timeout];
  request.errorBlock(@[RNCPositionError(RNCPositionErrorTimeout, message)]);
  [_pendingRequests removeObject:request];

  // Stop updating if no pending requests
  if (_pendingRequests.count == 0 && !_observingLocation) {
    [self stopMonitoring];
  }
}

#pragma mark - Public API

RCT_REMAP_METHOD(setConfiguration, setConfiguration:(MihrabGeolocationConfiguration)config)
{
  _locationConfiguration = config;
}

RCT_REMAP_METHOD(requestAuthorization, requestAuthorization:(RCTResponseSenderBlock)successBlock
                 error:(RCTResponseSenderBlock)errorBlock)
{
  if (!_locationManager) {
    _locationManager = [CLLocationManager new];
    _locationManager.delegate = self;
  }

  if (successBlock != nil || errorBlock != nil) {
    if (_queuedAuthorizationCallbacks == nil) {
      _queuedAuthorizationCallbacks = [NSMutableArray new];
    }

    [_queuedAuthorizationCallbacks addObject:@{
        @"success": successBlock,
        @"error": errorBlock,
    }];
  }
    
  BOOL wantsAlways = NO;
  BOOL wantsWhenInUse = NO;
  if (_locationConfiguration.authorizationLevel == MihrabGeolocationAuthorizationLevelDefault) {
    if ([[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSLocationAlwaysUsageDescription"] &&
        [_locationManager respondsToSelector:@selector(requestAlwaysAuthorization)]) {
      wantsAlways = YES;
    } else if ([[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSLocationWhenInUseUsageDescription"] &&
               [_locationManager respondsToSelector:@selector(requestWhenInUseAuthorization)]) {
      wantsWhenInUse = YES;
    }
  } else if (_locationConfiguration.authorizationLevel == MihrabGeolocationAuthorizationLevelAlways) {
    wantsAlways = YES;
  } else if (_locationConfiguration.authorizationLevel == MihrabGeolocationAuthorizationLevelWhenInUse) {
    wantsWhenInUse = YES;
  }

  // Request location access permission
  if (wantsAlways) {
#if !TARGET_OS_VISION
    [_locationManager requestAlwaysAuthorization];
    [self enableBackgroundLocationUpdates];
#endif
  } else if (wantsWhenInUse) {
    [_locationManager requestWhenInUseAuthorization];
  }
}

- (void)enableBackgroundLocationUpdates
{
#if !TARGET_OS_VISION
  // iOS 9+ requires explicitly enabling background updates
  NSArray *backgroundModes  = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"UIBackgroundModes"];
  if (backgroundModes && [backgroundModes containsObject:@"location"]) {
    if ([_locationManager respondsToSelector:@selector(setAllowsBackgroundLocationUpdates:)]) {
      [_locationManager setAllowsBackgroundLocationUpdates:YES];
    }
  }
#endif
}


RCT_REMAP_METHOD(startObserving, startObserving:(MihrabGeolocationOptions)options)
{
  checkLocationConfig();
    
  if (_observingLocation) {
    [self stopObserving];
  }

  // Select best options
  _observerOptions = options;
  for (MihrabGeolocationRequest *request in _pendingRequests) {
    _observerOptions.accuracy = MIN(_observerOptions.accuracy, request.options.accuracy);
  }

  [self beginLocationUpdatesWithDesiredAccuracy:_observerOptions.accuracy
                                 distanceFilter:_observerOptions.distanceFilter
                          useSignificantChanges:_observerOptions.useSignificantChanges];
  _observingLocation = YES;
}

RCT_REMAP_METHOD(stopObserving, stopObserving)
{
  // Stop observing
  _observingLocation = NO;

  // Stop updating if no pending requests
  if (_pendingRequests.count == 0) {
    [self stopMonitoring];
  }
}

RCT_REMAP_METHOD(getCurrentPosition, getCurrentPosition:(MihrabGeolocationOptions)options
                  position:(RCTResponseSenderBlock)successBlock
                  error:(RCTResponseSenderBlock)errorBlock)
{
  checkLocationConfig();

  if (!successBlock) {
    RCTLogError(@"%@.getCurrentPosition called with nil success parameter.", [self class]);
    return;
  }

  if (errorBlock) {
    if (@available(iOS 14.0, *)) {
      if (_lastUpdatedAuthorizationStatus == kCLAuthorizationStatusRestricted) {
        errorBlock(@[RNCPositionError(RNCPositionErrorUnavailable, @"This application is not authorized to use location services")]);
        return;
      }

      if (_lastUpdatedAuthorizationStatus == kCLAuthorizationStatusDenied) {
        errorBlock(@[RNCPositionError(RNCPositionErrorDenied, nil)]);
        return;
      }
    } else {
      if (![CLLocationManager locationServicesEnabled]) {
        errorBlock(@[RNCPositionError(RNCPositionErrorUnavailable, @"Location services disabled.")]);
        return;
      }

      if ([CLLocationManager authorizationStatus] == kCLAuthorizationStatusDenied) {
        errorBlock(@[RNCPositionError(RNCPositionErrorDenied, nil)]);
        return;
      }
    }
  }

  // Check if previous recorded location exists and is good enough
  if (_lastLocationEvent &&
      [NSDate date].timeIntervalSince1970 - [RCTConvert NSTimeInterval:_lastLocationEvent[@"timestamp"]] < options.maximumAge &&
      [_lastLocationEvent[@"coords"][@"accuracy"] doubleValue] <= options.accuracy) {
    // Call success block with most recent known location
    successBlock(@[_lastLocationEvent]);
    return;
  }
    
  BOOL didPause = NO;
  if (_observingLocation) {
    [self stopObserving];
    didPause = YES;
  }

  // Create request
  MihrabGeolocationRequest *request = [MihrabGeolocationRequest new];
  request.successBlock = successBlock;
  request.errorBlock = errorBlock ?: ^(NSArray *args){};
  request.options = options;
  request.timeoutTimer = [NSTimer scheduledTimerWithTimeInterval:options.timeout
                                                          target:self
                                                        selector:@selector(timeout:)
                                                        userInfo:request
                                                         repeats:NO];
  if (!_pendingRequests) {
    _pendingRequests = [NSMutableArray new];
  }
  [_pendingRequests addObject:request];

  // Configure location manager and begin updating location
  CLLocationAccuracy accuracy = options.accuracy;
  if (_locationManager) {
    accuracy = MIN(_locationManager.desiredAccuracy, accuracy);
  }
  [self beginLocationUpdatesWithDesiredAccuracy:accuracy
                                 distanceFilter:options.distanceFilter
                          useSignificantChanges:options.useSignificantChanges];

  if (didPause) {
    [self startObserving];
  }
}

#pragma mark - CLLocationManagerDelegate

- (void)locationManager:(CLLocationManager *)manager
     didUpdateLocations:(NSArray<CLLocation *> *)locations
{
  // Create event
  CLLocation *location = locations.lastObject;

  BOOL mocked = NO;
  if (@available(iOS 15.0, *)) {
    mocked = location.sourceInformation.isSimulatedBySoftware;
  }

  _lastLocationEvent = @{
                         @"mocked": @(mocked),
                         @"coords": @{
                             @"latitude": @(location.coordinate.latitude),
                             @"longitude": @(location.coordinate.longitude),
                             @"altitude": @(location.altitude),
                             @"accuracy": @(location.horizontalAccuracy),
                             @"altitudeAccuracy": @(location.verticalAccuracy),
                             @"heading": @(location.course),
                             @"speed": @(location.speed),
                             },
                         @"timestamp": @([location.timestamp timeIntervalSince1970] * 1000) // in ms
                         };

  // Send event
  if (_observingLocation) {
    [self sendEventWithName:@"geolocationDidChange" body:_lastLocationEvent];
  }

  // Fire the queued callbacks this fix is fresh enough for.
  //
  // Core Location often hands back its CACHED last location first when
  // updates start — hours old, from wherever the phone last had a fix. This
  // used to answer every request with it and stop, `maximumAge` unread: a
  // reader who had flown from Stockholm to Berlin was told "Stockholm" at
  // every launch and every pull to refresh (Mihrab, Nov 2026). A request
  // now waits for a fix within its `maximumAge` (seconds here) or for its
  // own timeout. A fix of the last few seconds is always fresh: one that
  // has just been measured answers even `maximumAge: 0`, the default when
  // a caller gives none.
  NSTimeInterval age = -[location.timestamp timeIntervalSinceNow];
  NSMutableArray<MihrabGeolocationRequest *> *answered = [NSMutableArray new];
  for (MihrabGeolocationRequest *request in _pendingRequests) {
    if (age > MAX(request.options.maximumAge, 10.0)) {
      continue;
    }
    request.successBlock(@[_lastLocationEvent]);
    [request.timeoutTimer invalidate];
    [answered addObject:request];
  }
  [_pendingRequests removeObjectsInArray:answered];

  // Stop updating if not observing and nothing is still waiting.
  if (!_observingLocation && _pendingRequests.count == 0) {
    [self stopMonitoring];
  }

}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager
{
  CLAuthorizationStatus currentStatus;
    
  if (@available(iOS 14.0, *)) {
    currentStatus = manager.authorizationStatus;
  } else {
    currentStatus = [CLLocationManager authorizationStatus];
  }
    
  if (
#if !TARGET_OS_VISION
    currentStatus == kCLAuthorizationStatusAuthorizedAlways ||
#endif
    currentStatus == kCLAuthorizationStatusAuthorizedWhenInUse
  ) {
    if (_queuedAuthorizationCallbacks != nil && _queuedAuthorizationCallbacks.count > 0){
        for (NSDictionary<NSString *, RCTResponseSenderBlock>* callbacks in _queuedAuthorizationCallbacks) {
            [callbacks objectForKey:@"success"](@[]);
        }
        _queuedAuthorizationCallbacks = nil;
    }
    [self startMonitoring];
  } else {
    NSDictionary<NSString *, id> *jsError = currentStatus == kCLAuthorizationStatusRestricted
      ? RNCPositionError(RNCPositionErrorUnavailable, @"This application is not authorized to use location services")
      : currentStatus == kCLAuthorizationStatusDenied
        ? RNCPositionError(RNCPositionErrorDenied, nil)
        : nil;

    if (jsError != nil) {
      if (_observingLocation) {
        [self sendEventWithName:@"geolocationError" body:jsError];
      }
        
      if (_queuedAuthorizationCallbacks != nil && _queuedAuthorizationCallbacks.count > 0){
          for (NSDictionary<NSString *, RCTResponseSenderBlock>* callbacks in _queuedAuthorizationCallbacks) {
              [callbacks objectForKey:@"error"](@[jsError]);
          }
          _queuedAuthorizationCallbacks = nil;
      }

      // Fire all queued error callbacks
      for (MihrabGeolocationRequest *request in _pendingRequests) {
        request.errorBlock(@[jsError]);
        [request.timeoutTimer invalidate];
      }
      [_pendingRequests removeAllObjects];
    }

    // Stop updating if user has explicitly denied authorization for this application, or
    // location services are disabled in Settings, or any other reason.
    [self stopMonitoring];
  }

  _lastUpdatedAuthorizationStatus = currentStatus;

}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error
{
  // Check error type
  NSDictionary<NSString *, id> *jsError = nil;
  switch (error.code) {
    case kCLErrorDenied:
      jsError = RNCPositionError(RNCPositionErrorDenied, nil);
      break;
    case kCLErrorNetwork:
      jsError = RNCPositionError(RNCPositionErrorUnavailable, @"Unable to retrieve location due to a network failure");
      break;
    case kCLErrorLocationUnknown:
    default:
      jsError = RNCPositionError(RNCPositionErrorUnavailable, nil);
      break;
  }

  // Send event
  if (_observingLocation) {
    [self sendEventWithName:@"geolocationError" body:jsError];
  }

  // Fire all queued error callbacks
  for (MihrabGeolocationRequest *request in _pendingRequests) {
    request.errorBlock(@[jsError]);
    [request.timeoutTimer invalidate];
  }
  [_pendingRequests removeAllObjects];

}

static void checkLocationConfig()
{
#if RCT_DEV
  if (!([[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSLocationWhenInUseUsageDescription"] ||
        [[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSLocationAlwaysUsageDescription"] ||
        [[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSLocationAlwaysAndWhenInUseUsageDescription"])) {
    RCTLogError(@"Either NSLocationWhenInUseUsageDescription or NSLocationAlwaysUsageDescription or NSLocationAlwaysAndWhenInUseUsageDescription key must be present in Info.plist to use geolocation.");
  }
#endif
}

@end
