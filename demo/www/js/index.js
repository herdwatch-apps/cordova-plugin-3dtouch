/**
 * Shared by every page in this demo, which is the whole point of it living here rather than inline
 * in index.html.
 *
 * A quick action can launch the app onto ANY page -- including one the user was last on -- so the
 * listener has to be registered by whatever page happens to load. Upstream's demo registered it
 * inside index.html and, worse, did it by assigning over the plugin method:
 *
 *     ThreeDeeTouch.registerQuickActionListener = function (payload) { ... }   // never called
 *
 * which replaced the function instead of handing it a callback, so no quick action was ever
 * reported. It is called properly below.
 */
document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  const ready = document.getElementById('deviceready');
  if (ready) {
    ready.classList.add('received');
  }
  log('deviceready');

  // The listener is registered after deviceready, which is already too late to catch a cold start
  // the naive way: the launch that opened the app delivered its quick action before any JavaScript
  // was running. The plugin holds that item until a listener exists and then replays it, which is
  // why a cold start reports here at all.
  window.ThreeDeeTouch.registerQuickActionListener(onQuickAction);
  log('quick action listener registered');

  wireButtons();
}

function onQuickAction(payload) {
  log('quick action: ' + JSON.stringify(payload));

  // Route the two that have a page of their own; show the rest rather than alert() them, so the
  // payload can actually be read and copied.
  if (payload && payload.type === 'checkin') {
    document.location = 'checkin.html';
    return;
  }
  if (payload && payload.type === 'share') {
    document.location = 'share.html';
    return;
  }
  show(JSON.stringify(payload, null, 2));
}

function wireButtons() {
  on('available', () => {
    window.ThreeDeeTouch.isAvailable((available) => show('isAvailable: ' + available));
  });

  on('watch', () => {
    window.ThreeDeeTouch.watchForceTouches((touch) => {
      // Reported continuously while a finger is down, so it goes to the log, not the result card.
      log(`force ${Math.round(touch.force)}% at ${Math.round(touch.x)},${Math.round(touch.y)}`);
    });
    show('watching force touches — press and hold anywhere');
  });

  on('enable-preview', () => {
    window.ThreeDeeTouch.enableLinkPreview();
    show('link preview enabled — press and hold the link below');
  });

  on('disable-preview', () => {
    window.ThreeDeeTouch.disableLinkPreview();
    show('link preview disabled');
  });

  on('configure', () => {
    // These three are DYNAMIC: they exist only once this has run, and they replace any previous
    // dynamic set. The "Check in" action offered on a fresh install is the static one from
    // config.xml instead -- long-press the icon before and after tapping this to see the
    // difference.
    window.ThreeDeeTouch.configureQuickActions(
      [
        { type: 'share', title: 'Share', subtitle: 'Share this page', iconType: 'Share' },
        { type: 'search', title: 'Search', iconType: 'Search' },
        // No type: the listener then has only the title to go on. iconTemplate names an image in
        // the app's asset catalog, so it is commented out rather than shipped broken -- this demo
        // deliberately has no assets. Swap iconType for iconTemplate once you have added one.
        { type: 'favourites', title: 'Show favourites', iconType: 'Love' },
      ],
      () => show('quick actions configured — long-press the app icon on the Home Screen'),
      (error) => show('configureQuickActions failed: ' + error),
    );
  });
}

function on(id, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', handler);
  }
}

function show(message) {
  const result = document.getElementById('result');
  if (result) {
    result.textContent = message;
  }
}

function log(message) {
  const el = document.getElementById('log');
  if (!el) {
    return;
  }
  el.textContent += new Date().toISOString().slice(11, 19) + '  ' + message + '\n';
}
