//
//  MihrabVerticalBar.m
//
//  The vertical bar on phones that have one (iPhone Duo, iOS 27.1): which
//  edge the system puts it on, how wide a band it takes from that edge (the
//  safe-area inset it adds), and the regions it occludes (the camera, the
//  clock and the status icons at its top). The JS side lays the page out
//  clear of it and puts the tab bar in it — src/native/VerticalBar.ts.
//
//  Built against an SDK older than 27.1 (CI may be), or run on an older
//  iOS, it answers "no bar" and the app keeps its horizontal layout.
//

#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface MihrabVerticalBar : NSObject <RCTBridgeModule>
@end

@implementation MihrabVerticalBar

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

static UIView *MihrabRootView(void)
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (window.isKeyWindow) return window.rootViewController.view ?: window;
    }
  }
  return nil;
}

RCT_EXPORT_METHOD(read:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSMutableDictionary *out = [@{ @"edge": [NSNull null], @"regions": @[] } mutableCopy];
  UIView *view = MihrabRootView();
  if (view == nil) {
    resolve(out);
    return;
  }
  UIEdgeInsets safe = view.safeAreaInsets;
  out[@"safe"] = @{ @"top": @(safe.top), @"left": @(safe.left), @"bottom": @(safe.bottom), @"right": @(safe.right) };
#if defined(__IPHONE_OS_VERSION_MAX_ALLOWED) && __IPHONE_OS_VERSION_MAX_ALLOWED >= 270100
  if (@available(iOS 27.1, *)) {
    UIVerticalBarEdge edge = view.traitCollection.verticalBarEdge;
    BOOL rtl = view.effectiveUserInterfaceLayoutDirection == UIUserInterfaceLayoutDirectionRightToLeft;
    if (edge == UIVerticalBarEdgeLeading) out[@"edge"] = rtl ? @"right" : @"left";
    if (edge == UIVerticalBarEdgeTrailing) out[@"edge"] = rtl ? @"left" : @"right";
    NSMutableArray *regions = [NSMutableArray array];
    for (UIViewReservedRegion *region in [view reservedRegionsOfKind:[UIViewReservedRegionKind occlusionRegionKind]]) {
      if (!region.isActive) continue;
      CGRect f = region.frame;
      [regions addObject:@{ @"x": @(f.origin.x), @"y": @(f.origin.y), @"width": @(f.size.width), @"height": @(f.size.height) }];
    }
    out[@"regions"] = regions;
  }
#endif
  resolve(out);
}

@end
