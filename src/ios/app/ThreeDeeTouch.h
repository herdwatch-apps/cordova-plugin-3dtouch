#import <Cordova/CDVPlugin.h>
#import <WebKit/WebKit.h>

@interface ThreeDeeTouch : CDVPlugin

- (void) performActionForShortcutItem: (UIApplicationShortcutItem *)shortcutItem;

/** Entry point for the scene delegate: delivers now, or holds until the plugin exists. */
+ (void) deliverShortcutItem:(UIApplicationShortcutItem *)shortcutItem;


- (void) isAvailable:(CDVInvokedUrlCommand*)command;

- (void) watchForceTouches:(CDVInvokedUrlCommand*)command;

- (void) configureQuickActions:(CDVInvokedUrlCommand*)command;

- (void) enableLinkPreview:(CDVInvokedUrlCommand*)command;
- (void) disableLinkPreview:(CDVInvokedUrlCommand*)command;

@end

@class ForceTouchRecognizer;
@interface ForceTouchRecognizer : UIGestureRecognizer {
  ForceTouchRecognizer * ForceTouchRecognizer;
}
@property NSString* callbackId;
@property id<CDVCommandDelegate> commandDelegate;
- (void)touchesMoved:(NSSet *)touches withEvent:(UIEvent *)event;
@end