

#import "MihrabTurbo.h"

@interface SyncFolder (Turbo) <NativeSyncFolderSpec>
@end

@implementation SyncFolder (Turbo)

RCT_EXPORT_MODULE(SyncFolder)

- (void)defaultFolder:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self defaultFolder:resolve rejecter:reject];
}

- (void)pick:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self pick:resolve rejecter:reject];
}

- (void)pickFile:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self pickFile:resolve rejecter:reject];
}

- (void)hasAccess:(NSString *)handle resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self hasAccess:handle resolver:resolve rejecter:reject];
}

- (void)forget:(NSString *)handle resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self forget:handle resolver:resolve rejecter:reject];
}

- (void)list:(NSString *)handle resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self list:handle resolver:resolve rejecter:reject];
}

- (void)read:(NSString *)handle name:(NSString *)name resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self read:handle name:name resolver:resolve rejecter:reject];
}

- (void)write:(NSString *)handle name:(NSString *)name contents:(NSString *)contents resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self write:handle name:name contents:contents resolver:resolve rejecter:reject];
}

- (void)remove:(NSString *)handle name:(NSString *)name resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self remove:handle name:name resolver:resolve rejecter:reject];
}

// Not on this platform (the contract is one for all of them): saveFile.

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSyncFolderSpecJSI>(params);
}

@end
