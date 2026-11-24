// MihrabSecureStore — the Keychain behind src/native/SecureStore.ts: the
// saved place, the prayer journal, the fasting log and this device's sync
// identity.
//
// The app's own, in place of react-native-encrypted-storage, which is no
// longer maintained. IT READS AND WRITES THE SAME ITEMS: generic-password
// items found by account (the key) alone, with no service and no access
// group named — exactly the query the library made — so everything a copy
// of the app stored through the library is here as it was, with nothing to
// move. Add no attribute to these queries without a migration: an item
// written without a service is not found by a query that names one, and
// that is an empty journal.
//
// One thing is left out on purpose: the library's `clear`, which deleted
// every Keychain item the app can see, of every class. Nothing called it.

#import <React/RCTBridgeModule.h>
#import <Security/Security.h>

@interface MihrabSecureStore : NSObject <RCTBridgeModule>
@end

@implementation MihrabSecureStore

RCT_EXPORT_MODULE(MihrabSecureStore)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

static void rejectWith(RCTPromiseRejectBlock reject, NSString *message, OSStatus status)
{
  NSError *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:status userInfo:nil];
  reject([NSString stringWithFormat:@"%d", (int)status], message, error);
}

RCT_EXPORT_METHOD(setItem:(NSString *)key
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    rejectWith(reject, @"The value is not text that can be stored", errSecParam);
    return;
  }
  // As the library did: the old item out, the new one in.
  NSDictionary *item = @{
    (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrAccount : key,
    (__bridge id)kSecValueData : data,
  };
  SecItemDelete((__bridge CFDictionaryRef)item);
  OSStatus status = SecItemAdd((__bridge CFDictionaryRef)item, NULL);
  if (status == errSecSuccess) {
    resolve(nil);
  } else {
    rejectWith(reject, @"The value could not be saved", status);
  }
}

RCT_EXPORT_METHOD(getItem:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *query = @{
    (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrAccount : key,
    (__bridge id)kSecReturnData : (__bridge id)kCFBooleanTrue,
    (__bridge id)kSecMatchLimit : (__bridge id)kSecMatchLimitOne,
  };
  CFTypeRef found = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
  if (status == errSecSuccess) {
    NSData *data = (__bridge_transfer NSData *)found;
    resolve([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
  } else if (status == errSecItemNotFound) {
    resolve(nil);
  } else {
    // Locked, or refused: an error to the caller, never "nothing stored" —
    // durableWrite tells the two apart before it writes.
    rejectWith(reject, @"The value could not be read", status);
  }
}

RCT_EXPORT_METHOD(removeItem:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *query = @{
    (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrAccount : key,
  };
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
  // The library rejected when there was nothing to remove; the callers
  // caught it. Nothing there is what was asked for.
  if (status == errSecSuccess || status == errSecItemNotFound) {
    resolve(nil);
  } else {
    rejectWith(reject, @"The value could not be removed", status);
  }
}

@end
