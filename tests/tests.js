/*
 * Runs inside a throwaway app built by cordova-paramedic.
 *
 * What can be checked from in here is the JS surface and the native round trips that do not need
 * the Home Screen: a quick action can only be raised by long-pressing the app icon, which is
 * SpringBoard's business and therefore outside this app. That half is covered by the Appium suite
 * in tests/e2e.
 *
 * The value of this suite is less the assertions than the fact that it builds and loads the plugin
 * on each cordova-ios version in the matrix. `CDVSceneDelegate` exists only from cordova-ios 8, so
 * a scene-related symbol referenced unconditionally breaks 7.x at compile time -- silently, for
 * anyone still on it, until someone tries.
 */

exports.defineAutoTests = function () {
  describe('ThreeDeeTouch', function () {
    it('is clobbered onto the window', function () {
      expect(window.ThreeDeeTouch).toBeDefined();
    });

    it('exposes the documented API', function () {
      ['isAvailable', 'watchForceTouches', 'enableLinkPreview', 'disableLinkPreview',
       'configureQuickActions', 'registerQuickActionListener'].forEach(function (name) {
        expect(typeof window.ThreeDeeTouch[name]).toBe('function');
      });
    });

    it('answers isAvailable with a boolean', function (done) {
      window.ThreeDeeTouch.isAvailable(function (available) {
        expect(typeof available).toBe('boolean');
        done();
      });
    });

    it('accepts dynamic quick actions', function (done) {
      window.ThreeDeeTouch.configureQuickActions(
        [{ type: 'paramedic', title: 'Paramedic', iconType: 'Play' }],
        function () {
          done();
        },
        function (error) {
          // A failure here is a real one: the call reaches native code and back.
          done.fail('configureQuickActions failed: ' + error);
        },
      );
    });

    it('registers a quick action listener without throwing', function () {
      expect(function () {
        window.ThreeDeeTouch.registerQuickActionListener(function () {});
      }).not.toThrow();
    });
  });
};
