/**
 * Does a Home Screen quick action reach the app? The whole question, on the fixture alone.
 *
 * MODE=cold terminates the app first, MODE=warm backgrounds it. The assertion is the fixture's own
 * flag, so nothing here depends on a login, a herd, a sync or a tour.
 */
import { createRequire } from 'node:module';
import { createSession, sleep, BASE } from './lib/driver.mjs';

const require = createRequire(import.meta.url);

const BUNDLE_ID = process.env.BUNDLE_ID ?? 'com.example.quickaction';
const SPRINGBOARD = 'com.apple.springboard';
const APP_ICON = process.env.APP_ICON ?? 'QuickAction';
const ACTION = process.env.SHORTCUT_TITLE ?? 'Check in';
const MODE = process.env.MODE ?? 'cold';
const SHOTS = process.env.SHOTS ?? '/tmp';

const post = async (sid, path, body) =>
  (await fetch(`${BASE}/session/${sid}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

const findEl = async (sid, using, value) =>
  (await post(sid, '/element', { using, value }))?.value?.['element-6066-11e4-a52e-4f735466cecf'] ?? null;

const rectOf = async (sid, id) => (await (await fetch(`${BASE}/session/${sid}/element/${id}/rect`)).json())?.value ?? null;

const attr = async (sid, id, name) => (await (await fetch(`${BASE}/session/${sid}/element/${id}/attribute/${name}`)).json())?.value;

const STATE = "return JSON.stringify({received: document.body.classList.contains('shortcut-received'), state: (document.getElementById('state')||{}).textContent, log: (document.getElementById('log')||{}).textContent})";

/**
 * Falls back to whichever simulator is booted, so a run on a desk needs no arguments and CI can
 * simply boot the one it wants. An explicit IOS_UDID still wins.
 */
const bootedSimulator = () => {
  const { execSync } = require('node:child_process');
  const out = execSync('xcrun simctl list devices booted', { encoding: 'utf8' });
  return (out.match(/\(([0-9A-F-]{36})\) \(Booted\)/) ?? [])[1] ?? null;
};

const udid = process.env.IOS_UDID ?? bootedSimulator();
if (!udid) throw new Error('no booted simulator and no IOS_UDID');

const s = await createSession({ udid, bundleId: BUNDLE_ID });
console.log(`session ${s.id}  mode=${MODE}`);
try {
  await s.web();
  console.log('before        :', await s.js(STATE));

  // How the app leaves the screen. LEAVE=background|home|background3 for the warm modes.
  const LEAVE = process.env.LEAVE ?? 'background';
  if (MODE === 'cold') {
    await s.mobile('mobile: terminateApp', { bundleId: BUNDLE_ID });
  } else if (LEAVE === 'home') {
    await s.native();
    await s.mobile('mobile: pressButton', { name: 'home' });
  } else if (LEAVE === 'background3') {
    await s.background(3);
  } else {
    await s.background(-1);
  }
  console.log('left the app  :', MODE === 'cold' ? 'terminated' : LEAVE);
  await sleep(1500);

  if (!(MODE !== 'cold' && LEAVE === 'home')) {
    await s.mobile('mobile: activateApp', { bundleId: SPRINGBOARD });
  }
  await s.native();

  let icon = null;
  for (let page = 0; page < 6 && !icon; page++) {
    const candidate = await findEl(s.id, 'accessibility id', APP_ICON);
    if (candidate) {
      const rect = await rectOf(s.id, candidate);
      const hittable = await attr(s.id, candidate, 'hittable');
      const visible = await attr(s.id, candidate, 'visible');
      console.log('icon          :', JSON.stringify({ page, rect, hittable, visible }));
      if (hittable === true || hittable === 'true') icon = candidate;
    }
    if (!icon) {
      await s.mobile('mobile: swipe', { direction: 'left' });
      await sleep(800);
    }
  }
  if (!icon) throw new Error(`icon "${APP_ICON}" never became hittable`);

  const rect = await rectOf(s.id, icon);
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);

  const presses = [
    { how: 'touchAndHold 2s element', run: () => s.mobile('mobile: touchAndHold', { elementId: icon, duration: 2 }) },
    { how: 'touchAndHold 1s element', run: () => s.mobile('mobile: touchAndHold', { elementId: icon, duration: 1 }) },
    { how: 'HID 700ms', run: () => s.longPressHid(x, y, 700) },
  ];

  let action = null;
  for (const { how, run } of presses) {
    try {
      await run();
    } catch (e) {
      console.log('long press    :', `${how} rejected: ${e.message.slice(0, 70)}`);
      continue;
    }
    const deadline = Date.now() + 4000;
    while (!action && deadline > Date.now()) {
      action = await findEl(s.id, '-ios predicate string', `label == '${ACTION}' OR name == '${ACTION}'`);
      if (!action) await sleep(200);
    }
    if (action) {
      console.log('long press    :', `${how} opened the menu`);
      break;
    }
    const done = await findEl(s.id, '-ios predicate string', "type == 'XCUIElementTypeButton' AND name == 'Done'");
    console.log('long press    :', `${how} gave no menu${done ? ' (rearrange mode, leaving it)' : ''}`);
    if (done) {
      const r = await rectOf(s.id, done);
      if (r) await s.tapHid(r.x + r.width / 2, r.y + r.height / 2);
      await sleep(800);
    }
  }
  await s.screenshot(`${SHOTS}/mini-menu-${MODE}.png`);
  if (!action) throw new Error('the quick action menu never opened');

  const r = await rectOf(s.id, action);
  await s.tapHid(r.x + r.width / 2, r.y + r.height / 2);

  await s.web();
  const deadline = Date.now() + 30000;
  let seen = null;
  while (deadline > Date.now()) {
    seen = JSON.parse(await s.js(STATE));
    if (seen.received) break;
    await sleep(400);
  }
  console.log('after         :', JSON.stringify(seen));
  console.log(seen?.received ? 'RESULT: the quick action reached the app' : 'RESULT: nothing arrived');
} finally {
  await s.deleteSession();
}
