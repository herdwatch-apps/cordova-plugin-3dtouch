#import "AppDelegate+threedeetouch.h"
#import "ThreeDeeTouch.h"
#import <objc/runtime.h>
#import "MainViewController.h"

@implementation AppDelegate (threedeetouch)

- (void)application:(UIApplication *)application performActionForShortcutItem:(UIApplicationShortcutItem *)shortcutItem completionHandler:(void(^)(BOOL succeeded))completionHandler {
  ThreeDeeTouch *threeDeeTouch = [self.viewController getCommandInstance:@"ThreeDeeTouch"];
  [threeDeeTouch performActionForShortcutItem:shortcutItem];    
}


- (void)applicationDidBecomeActive:(UIApplication *)application {
}

@end