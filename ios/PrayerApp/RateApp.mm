// Rate-the-app native module — in-app App Store review prompt.
//
// Uses SKStoreReviewController so no App Store numeric id is needed and the
// user never leaves the app. iOS rate-limits the prompt system-side (max ~3
// times/year), so calling it from an explicit "Rate Mihrab" tap is safe and
// App Review-compliant.
//
// StoreKit is linked by name in the project's linker flags: Objective-C++
// does not link a framework for having imported it, as Objective-C does.

#import <React/RCTBridgeModule.h>
#import <MihrabSpec/MihrabSpec.h>
#import <StoreKit/StoreKit.h>
#import <UIKit/UIKit.h>

@interface RateApp : NSObject <NativeRateAppSpec>
@end

@implementation RateApp

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)requestReview
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (@available(iOS 14.0, *)) {
      for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (scene.activationState == UISceneActivationStateForegroundActive &&
            [scene isKindOfClass:[UIWindowScene class]]) {
          [SKStoreReviewController requestReviewInScene:(UIWindowScene *)scene];
          return;
        }
      }
    }
  });
}


- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeRateAppSpecJSI>(params);
}
@end
