#!/usr/bin/env bash
#
# Builds the fixture around the plugin in THIS repository and runs the quick-action probe against it.
#
# The app is assembled in a temporary directory, not here, because `cordova plugin add <this repo>`
# copies the whole plugin directory into the app's plugins/ — and this fixture lives inside that
# directory, so building in place copies the fixture into itself until the path is too long for the
# filesystem. Paramedic builds in a temp project for the same reason.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
APPIUM_URL=${APPIUM_URL:-http://127.0.0.1:4723}

# Say so up front rather than after a build: without a server the probe fails on a bare
# "fetch failed", which reads as a broken test.
if ! curl -sf "$APPIUM_URL/status" > /dev/null; then
  echo "No Appium server at $APPIUM_URL. Start one with:" >&2
  echo "  npm i -g appium && appium driver install xcuitest && appium server --port 4723" >&2
  exit 1
fi

CORDOVA_IOS=${CORDOVA_IOS:-8.1.1}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "building the fixture in $WORK against cordova-ios@$CORDOVA_IOS"
cp -R "$ROOT/tests/e2e/www" "$ROOT/tests/e2e/config.xml" "$WORK/"
cat > "$WORK/package.json" <<'JSON'
{
  "name": "com.example.quickaction",
  "displayName": "QuickAction",
  "version": "1.0.0",
  "keywords": ["ecosystem:cordova"],
  "devDependencies": { "cordova": "13.0.0" },
  "cordova": { "platforms": [], "plugins": {} }
}
JSON

cd "$WORK"
npm install --silent
# CocoaPods 1.17 on Ruby 4 fails on a non-UTF-8 locale.
export LANG=${LANG:-en_US.UTF-8}
npx cordova platform add "ios@$CORDOVA_IOS" --no-save
npx cordova plugin add "$ROOT" --no-save
npx cordova build ios --emulator

APP=$(find "$WORK/platforms/ios/build" -maxdepth 3 -name '*.app' | head -1)
if [ -z "$APP" ]; then
  echo "the build produced no .app" >&2
  exit 1
fi

# Resolve one device and use it for BOTH the install and the probe. "booted" is not a device: with
# more than one simulator up -- and paramedic leaves one behind -- simctl's "booted" and the probe's
# idea of the first booted one can be different simulators, and the app is then installed where the
# probe is not looking.
TARGET=${IOS_UDID:-$(xcrun simctl list devices booted --json | python3 -c "import json,sys; ds=json.load(sys.stdin)['devices']; print(next(d['udid'] for v in ds.values() for d in v))" 2>/dev/null || true)}
if [ -z "$TARGET" ]; then
  echo "No booted simulator. Boot one, or set IOS_UDID." >&2
  exit 1
fi

xcrun simctl install "$TARGET" "$APP"
echo "installed $(basename "$APP") on $TARGET"

cd "$ROOT/tests/e2e"

# Every mode asked for, against the one build. MODES="cold warm" covers both ways a quick action
# reaches the app: a launch, where the item arrives with the scene, and an app already running.
for mode in ${MODES:-${MODE:-cold}}; do
  echo "--- $mode"
  IOS_UDID="$TARGET" MODE="$mode" LEAVE="${LEAVE:-home}" node probe.mjs
done
