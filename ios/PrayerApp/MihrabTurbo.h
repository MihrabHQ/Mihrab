/**
 * What a module's `.mm` needs to see to be a typed TurboModule.
 *
 * Every native module of ours has a contract in `src/native/specs/`, and
 * codegen turns each into an Objective-C protocol (`Native<Name>Spec`) and
 * the C++ class that calls it from JavaScript (`Native<Name>SpecJSI`), both
 * in <MihrabSpec/MihrabSpec.h>.
 *
 * A MODULE WRITTEN IN SWIFT stays in Swift. Its `.mm` is a category on the
 * Swift class that adopts the protocol, registers the module, and hands
 * React Native the C++ class (`getTurboModule:`). Where the contract's
 * selector is not the one the Swift method has — a promise is
 * `resolve:reject:` in a contract and `resolver:rejecter:` in ours; a
 * number is a `double` there and an `NSNumber` here — the category has a
 * method of the contract's shape that passes the call on. The compiler
 * checks both ends: the protocol on one side, the Swift class's own
 * header on the other. A method the Swift class already has under the
 * contract's exact selector needs nothing, and must not be repeated here
 * (a category method of the same name would replace it and call itself).
 *
 * The frameworks come first because the Swift header names their types —
 * superclasses and delegates of the app's classes — and Objective-C++
 * does not get them from `@import` the way Objective-C does.
 */
#import <AVFoundation/AVFoundation.h>
#import <CoreLocation/CoreLocation.h>
#import <UIKit/UIKit.h>

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>

#import <MihrabSpec/MihrabSpec.h>

#import "PrayerApp-Swift.h"
