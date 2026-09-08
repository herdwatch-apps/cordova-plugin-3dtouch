/**
 * Registers the quick-action listener and records what arrives.
 *
 * The listener is registered on deviceready, which is AFTER the scene has connected -- so a cold
 * start launched by a quick action has already delivered its item by then. The plugin holds the
 * item until a listener exists, which is the part the patch under test adds; if that queueing were
 * missing, a cold start would simply never report anything here.
 */
const log = (message) => {
  const at = new Date().toISOString().slice(11, 23);
  document.getElementById('log').textContent += `${at}  ${message}\n`;
};

document.addEventListener('deviceready', () => {
  log('deviceready');
  window.ThreeDeeTouch.registerQuickActionListener((payload) => {
    log(`quick action: ${JSON.stringify(payload)}`);
    document.getElementById('state').textContent = `received ${payload && payload.type}`;
    document.body.classList.add('shortcut-received');
    window.__lastShortcut = payload;
  });
  log('listener registered');
});
