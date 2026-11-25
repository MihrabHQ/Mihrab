#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <MihrabSpec/MihrabSpec.h>

@interface AppVersion : NSObject <NativeAppVersionSpec>
@end

@implementation AppVersion

RCT_EXPORT_MODULE();

- (facebook::react::ModuleConstants<JS::NativeAppVersion::Constants>)getConstants
{
  NSString *version = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
  NSString *build = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleVersion"];
  if (version == nil) {
    version = @"";
  }
  if (build == nil) {
    build = @"";
  }
  return facebook::react::typedConstants<JS::NativeAppVersion::Constants>({
      .versionName = version,
      .buildNumber = build,
  });
}

- (facebook::react::ModuleConstants<JS::NativeAppVersion::Constants>)constantsToExport
{
  return [self getConstants];
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}


- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppVersionSpecJSI>(params);
}
@end
