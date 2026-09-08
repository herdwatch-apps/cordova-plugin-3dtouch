/**
 * Copied from ngx-app's appium/lib/driver.mjs so this fixture stands alone. Keep the two in step
 * when either learns something.
 *
 * Minimal Appium client over plain fetch. No webdriverio: the whole harness needs a session, a
 * context switch, a tap and script evaluation, and pinning another dependency tree to get them
 * is not worth it.
 *
 * Two things here exist because of how this app behaves on a real device, and both cost hours to
 * find:
 *
 * - W3C pointer actions do NOT reach the Cordova web view. Taps must go through `mobile: tap`.
 *   They do reach SpringBoard, though, so a long press on an app icon can use either.
 * - The web view handle is invalidated when the app is relaunched, and the stale handle is still
 *   listed by /contexts. Using it fails with "No targets found for app 'PID:n'". Always
 *   re-discover the handle after anything that may restart or re-foreground the app.
 */
/**
 * Where the session is created. Follows the credentials rather than needing a flag: with
 * BROWSERSTACK_* set, aiming at localhost would fail in a way that reads as a broken hub.
 */
export const BASE =
  process.env.APPIUM_URL ??
  (process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY
    ? 'https://hub-cloud.browserstack.com/wd/hub'
    : 'http://127.0.0.1:4723');

/**
 * Every request is bounded and, with APPIUM_TRACE set, traced.
 *
 * Both exist because a run stalled on a cloud device with nothing on stdout: a driver call can block
 * for as long as its own timeout allows, and a cloud session cannot be inspected afterwards, so
 * "which request was it on" was unanswerable. A hard ceiling turns a stall into an error naming the
 * request, and the trace shows the durations leading up to it.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.APPIUM_REQUEST_TIMEOUT_MS ?? 120000);
/**
 * Opening a session is not a command and must not share their ceiling: in the cloud it installs the
 * app, boots the device and starts WebDriverAgent, which is minutes rather than seconds.
 */
const SESSION_TIMEOUT_MS = Number(process.env.APPIUM_SESSION_TIMEOUT_MS ?? 600000);
const TRACE = Boolean(process.env.APPIUM_TRACE);

const call = async (method, path, body, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) => {
  const started = Date.now();
  const abort = AbortSignal.timeout(timeoutMs);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: abort,
    });
  } catch (e) {
    const waited = Date.now() - started;
    if (TRACE) console.log(`  appium: ${method} ${path} FAILED after ${waited}ms: ${e.message}`);
    // The cause matters: a timeout and a refused connection are different problems, and reporting
    // both as "did not answer within Xms" sent one debugging session looking at the wrong thing.
    const cause = e.name === 'TimeoutError' ? `no answer within ${waited}ms` : `${e.name}: ${e.message}`;
    throw new Error(`${method} ${BASE}${path} failed after ${waited}ms -- ${cause}`);
  }
  const text = await res.text();
  if (TRACE) console.log(`  appium: ${method} ${path} ${res.status} ${Date.now() - started}ms`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The driver's error and message are not always strings, and `${object}` loses the whole reason. */
const describeError = (value) => {
  const parts = [value?.error, value?.message]
    .map((v) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)))
    .filter(Boolean);
  return parts.join(': ') || JSON.stringify(value).slice(0, 300);
};

/**
 * True when the run is aimed at BrowserStack rather than a device on this desk, which decides
 * which set of capabilities is sent. It has to agree with BASE above, so it is read off the same
 * inputs in the same order: an explicit APPIUM_URL names the target, and only without one do the
 * credentials decide. Otherwise a local run with the cloud keys exported -- which is what sourcing
 * .env does -- would send cloud capabilities to the device on the desk.
 */
export const isBrowserStack = () =>
  process.env.APPIUM_URL
    ? /browserstack/i.test(process.env.APPIUM_URL)
    : Boolean(process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY);

export async function createSession({ udid, bundleId, firebaseDebug = false, forceLaunch = false }) {
  const capabilities = isBrowserStack()
    ? {
        // The cloud rejects the local-device capabilities outright: there is no udid to attach to
        // and WebDriverAgent is signed on their side, not with our team.
        platformName: 'ios',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': process.env.BS_DEVICE ?? 'iPhone 16',
        'appium:platformVersion': process.env.BS_OS_VERSION ?? '18',
        // A cloud device arrives wiped, so the app has to be installed from an upload rather than
        // attached to by bundle id. BS_APP_URL is the bs://… that /app-automate/upload returns.
        'appium:app': process.env.BS_APP_URL,
        'appium:autoAcceptAlerts': true,
        // Do not wait for the app to go idle before acting. This is the single setting behind two
        // long-standing mysteries here: a tap that sat ~10s before the finger went down (SpringBoard
        // with a menu open never settles), and a long press whose hold ran far past the requested
        // duration and tipped the Home Screen into icon-rearrange mode. Named waitForQuiescence in
        // older XCUITest drivers; that name is gone as of 12.x and is silently ignored.
        'appium:waitForIdleTimeout': 0,
        'appium:webviewConnectTimeout': 20000,
        'appium:newCommandTimeout': 900,
        'bstack:options': {
          userName: process.env.BROWSERSTACK_USERNAME,
          accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
          projectName: process.env.BS_PROJECT ?? 'ngx-app',
          buildName: process.env.BS_BUILD ?? 'appium harness',
          sessionName: process.env.BS_SESSION ?? 'probe',
          // Left on deliberately. Masking would hide a test account's password that is worth
          // nothing, at the price of the logs and video used to work out why a run failed.
          deviceLogs: true,
          appiumLogs: true,
        },
      }
    : {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:udid': udid,
        'appium:bundleId': bundleId,
        // Never reset: the app under test is signed in, and a reset would wipe that.
        'appium:noReset': true,
        'appium:fullReset': false,
        // A fresh install raises several permission dialogs one after another -- location,
        // Bluetooth, notifications -- and each one blocks the web view until it is answered.
        // There is no way to pre-grant them on a real device, so let WebDriverAgent answer them.
        // HW_TEST_NO_AUTO_ALERTS turns this off so login.mjs has to answer them itself, which is
        // how that path gets tested on the desk instead of on metered cloud minutes.
        'appium:autoAcceptAlerts': !process.env.HW_TEST_NO_AUTO_ALERTS,
        // Do not wait for the app to go idle before acting. This is the single setting behind two
        // long-standing mysteries here: a tap that sat ~10s before the finger went down (SpringBoard
        // with a menu open never settles), and a long press whose hold ran far past the requested
        // duration and tipped the Home Screen into icon-rearrange mode. Named waitForQuiescence in
        // older XCUITest drivers; that name is gone as of 12.x and is silently ignored.
        'appium:waitForIdleTimeout': 0,
        'appium:xcodeOrgId': process.env.XCODE_ORG_ID ?? 'GF3B722BQU',
        'appium:xcodeSigningId': 'Apple Development',
        'appium:webviewConnectTimeout': 20000,
        'appium:newCommandTimeout': 900,
        'appium:wdaLaunchTimeout': 240000,
      };

  if (isBrowserStack() && !process.env.BS_APP_URL) {
    throw new Error('BS_APP_URL is required for a BrowserStack run (the bs://… from /app-automate/upload)');
  }
  if (forceLaunch) {
    capabilities['appium:forceAppLaunch'] = true;
  }
  if (firebaseDebug) {
    // Firebase only streams into the console's DebugView when the app is launched with this.
    capabilities['appium:processArguments'] = { args: ['-FIRDebugEnabled'] };
    capabilities['appium:forceAppLaunch'] = true;
  }

  const res = await call(
    'POST',
    '/session',
    { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } },
    { timeoutMs: SESSION_TIMEOUT_MS },
  );
  const id = res?.value?.sessionId;
  if (!id) {
    throw new Error(`session not created: ${JSON.stringify(res).slice(0, 500)}`);
  }
  return new Session(id, res.value.capabilities ?? {});
}

/**
 * Reattaches to a session that is already running, which is what makes iterating bearable: opening
 * one costs the better part of a minute, and `newCommandTimeout` above keeps it alive between
 * commands for 15 minutes. For debugging from a scratch script -- a real run should still open its
 * own session so nothing is inherited.
 */
export const attachSession = (id) => new Session(id, {});

class Session {
  constructor(id, caps) {
    this.id = id;
    this.caps = caps;
  }

  deleteSession() {
    return call('DELETE', `/session/${this.id}`);
  }

  native() {
    return call('POST', `/session/${this.id}/context`, { name: 'NATIVE_APP' });
  }

  /**
   * Re-discovers the web view handle rather than trusting a remembered one.
   *
   * /contexts does not always answer with a list: it can return the driver's error object instead,
   * and assuming an array there threw a TypeError mid-run rather than retrying -- which reads as a
   * broken harness rather than a context that was not ready yet. Anything that is not a list is
   * treated as "not yet".
   */
  async web({ attempts = 12 } = {}) {
    for (let i = 0; i < attempts; i++) {
      const res = await call('GET', `/session/${this.id}/contexts`);
      const contexts = Array.isArray(res?.value) ? res.value : [];
      if (!Array.isArray(res?.value) && TRACE) {
        console.log(`  appium: /contexts answered ${JSON.stringify(res?.value ?? res).slice(0, 160)}`);
      }
      const handle = contexts.find((c) => String(c).startsWith('WEBVIEW'));
      if (handle) {
        await call('POST', `/session/${this.id}/context`, { name: handle });
        // A listed handle can still be dead after a relaunch, so prove it answers.
        const probe = await call('POST', `/session/${this.id}/execute/sync`, { script: 'return 1', args: [] });
        if (probe.value === 1) {
          return handle;
        }
      }
      await sleep(1000);
    }
    return null;
  }

  async js(script) {
    const res = await call('POST', `/session/${this.id}/execute/sync`, { script, args: [] });
    if (res.value?.error) {
      throw new Error(describeError(res.value));
    }
    return res.value;
  }

  /**
   * For a script that returns a promise. /execute/sync cannot await one -- it answers
   * "unknown method: Method is not implemented" -- so anything touching an async browser API
   * (indexedDB.databases(), caches, permissions) has to come through here. The script receives a
   * completion callback as its last argument, per the W3C protocol.
   */
  async jsAsync(script, { timeoutMs = 30000 } = {}) {
    await call('POST', `/session/${this.id}/timeouts`, { script: timeoutMs });
    const res = await call('POST', `/session/${this.id}/execute/async`, { script, args: [] });
    if (res.value?.error) {
      throw new Error(describeError(res.value));
    }
    return res.value;
  }

  /** Reads a JSON string out of the page, so the caller gets a real object. */
  async json(script) {
    return JSON.parse(await this.js(script));
  }

  async mobile(command, args = {}) {
    const res = await call('POST', `/session/${this.id}/execute/sync`, { script: command, args: [args] });
    return res.value;
  }

  /** `mobile: tap` rather than W3C actions - see the note at the top of this file. */
  async tap(x, y) {
    await this.native();
    return this.mobile('mobile: tap', { x: Math.round(x), y: Math.round(y) });
  }

  /**
   * A tap that does not go through XCUITest, for anything outside the app under test: SpringBoard,
   * the quick-action menu, a system permission sheet.
   *
   * `mobile: tap` waits for the app to be quiescent first, and none of those surfaces ever settles
   * -- the finger lands as a highlight and the call then sits on the ~10s quiescence timeout, so the
   * dialog stays open and the run looks hung. Pointer actions are HID-level and wait for nothing.
   * The trade-off is the other half of the note at the top of this file: they do NOT reach the
   * Cordova web view, so anything inside the page still needs `tap()`.
   */
  async tapHid(x, y) {
    await this.native();
    return call('POST', `/session/${this.id}/actions`, {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y) },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 60 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  }

  /**
   * A long press built from HID events, with an exact hold time.
   *
   * `mobile: touchAndHold` goes through XCUITest and does not reliably raise the quick-action menu:
   * on a cloud iOS 18 device it put the Home Screen into icon-rearrange mode at 0.7s, 1.1s and 1.5s
   * alike, so the duration was not the variable. Driving pointerDown / pause / pointerUp keeps the
   * hold exact and skips XCUITest's quiescence wait -- see tapHid above for the other half of that
   * story.
   */
  async longPressHid(x, y, holdMs = 700) {
    await this.native();
    return call('POST', `/session/${this.id}/actions`, {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y) },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: Math.round(holdMs) },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  }

  keyboardShown() {
    return this.mobile('mobile: isKeyboardShown');
  }

  background(seconds) {
    return this.mobile('mobile: backgroundApp', { seconds });
  }

  activate(bundleId) {
    return this.mobile('mobile: activateApp', { bundleId });
  }

  async screenshot(file) {
    const res = await call('GET', `/session/${this.id}/screenshot`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, Buffer.from(res.value, 'base64'));
    return file;
  }
}
