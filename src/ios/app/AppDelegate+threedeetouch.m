#import "AppDelegate+threedeetouch.h"
#import "ThreeDeeTouch.h"
#import <objc/runtime.h>
#import "MainViewController.h"
// cordova-ios 8 introduced CDVSceneDelegate; 7.x has no such class and no such header, so
// everything scene-related is compiled only where it exists. Without this the plugin fails to
// build for anyone still on cordova-ios 7, where quick actions still arrive through
// application:performActionForShortcutItem: above and nothing below is needed.
#if __has_include(<Cordova/CDVSceneDelegate.h>)
#import <Cordova/CDVSceneDelegate.h>
#define TDT_HAS_SCENE_DELEGATE 1
#endif

@implementation AppDelegate (threedeetouch)

// Still the delivery path on a build that has not adopted UIScene. From cordova-ios 8 the app
// declares UIApplicationSceneManifest and UIKit stops calling this altogether, which is why quick
// actions stopped arriving; the CDVSceneDelegate category below is where they land now.
- (void)application:(UIApplication *)application performActionForShortcutItem:(UIApplicationShortcutItem *)shortcutItem completionHandler:(void(^)(BOOL succeeded))completionHandler {
  ThreeDeeTouch *threeDeeTouch = [self.viewController getCommandInstance:@"ThreeDeeTouch"];
  [threeDeeTouch performActionForShortcutItem:shortcutItem];
}

- (void)applicationDidBecomeActive:(UIApplication *)application {
}

@end

#if TDT_HAS_SCENE_DELEGATE

/**
 * Quick actions under UIScene, which arrive two different ways and neither reached the app:
 *
 * - already running: UIKit calls windowScene:performActionForShortcutItem: on the scene delegate,
 *   implemented below;
 * - launched by the action: there is no callback at all. The item comes in as
 *   UISceneConnectionOptions.shortcutItem. CDVSceneDelegate already implements
 *   scene:willConnectToSession:options: to forward URL contexts, and a category adding that method
 *   would REPLACE it and take deep links down with it -- hence the swizzle, which calls the
 *   original first.
 */
@implementation CDVSceneDelegate (threedeetouch)

+ (void)load {
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Method original = class_getInstanceMethod(self, @selector(scene:willConnectToSession:options:));
    Method replacement = class_getInstanceMethod(self, @selector(tdt_scene:willConnectToSession:options:));
    if (original && replacement) {
      method_exchangeImplementations(original, replacement);
    }
  });
}

// Exchanged with scene:willConnectToSession:options:, so this call reaches the original.
- (void)tdt_scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions {
  [self tdt_scene:scene willConnectToSession:session options:connectionOptions];

  if (connectionOptions.shortcutItem) {
    [ThreeDeeTouch deliverShortcutItem:connectionOptions.shortcutItem];
  }
}

- (void)windowScene:(UIWindowScene *)windowScene performActionForShortcutItem:(UIApplicationShortcutItem *)shortcutItem completionHandler:(void (^)(BOOL succeeded))completionHandler {
  [ThreeDeeTouch deliverShortcutItem:shortcutItem];

  if (completionHandler) {
    completionHandler(YES);
  }
}

@end

#endif
