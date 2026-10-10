#import <React/RCTBridgeModule.h>

// The JS side: src/native/LaunchSnapshot.ts. See MihrabLaunchSnapshot.swift.
@interface RCT_EXTERN_MODULE(MihrabLaunchSnapshot, NSObject)

RCT_EXTERN_METHOD(setEligible:(BOOL)value)
RCT_EXTERN_METHOD(setLookKey:(NSString *)key)
RCT_EXTERN_METHOD(hide)
RCT_EXTERN_METHOD(captureNow)
RCT_EXTERN_METHOD(setHeroState:(double)targetAt fromAt:(double)fromAt)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(getShownState)

@end
