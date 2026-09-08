#!/usr/bin/env bash
#
# Builds this demo against the plugin in the repository it sits in, and launches it on a booted
# iOS simulator.
#
# The build happens in a temporary directory rather than here, and that is not tidiness: this demo
# lives INSIDE the plugin directory, and `cordova plugin add <plugin dir>` copies that whole
# directory into the app's plugins/. Building in place therefore copies the demo into itself, over
# and over, until the path is too long for the filesystem. tests/e2e/run.sh does the same for the
# same reason.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
CORDOVA_IOS=${CORDOVA_IOS:-8.1.1}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "building the demo in $WORK against cordova-ios@$CORDOVA_IOS"
cp -R "$HERE/www" "$HERE/config.xml" "$HERE/package.json" "$WORK/"

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

TARGET=${IOS_UDID:-$(xcrun simctl list devices booted --json | python3 -c "import json,sys; ds=json.load(sys.stdin)['devices']; print(next(d['udid'] for v in ds.values() for d in v))" 2>/dev/null || true)}
if [ -z "$TARGET" ]; then
  echo "No booted simulator. Open one from Xcode, or boot it yourself:" >&2
  echo "  xcrun simctl list devices available" >&2
  echo "  xcrun simctl boot <udid> && open -a Simulator" >&2
  echo "Then re-run, or set IOS_UDID=<udid>." >&2
  exit 1
fi

BUNDLE_ID=$(python3 -c "import re,sys; print(re.search(r'id=\"([^\"]+)\"', open('$HERE/config.xml').read()).group(1))")

xcrun simctl install "$TARGET" "$APP"
xcrun simctl launch "$TARGET" "$BUNDLE_ID" > /dev/null
echo
echo "installed and launched $BUNDLE_ID on $TARGET"
echo "Long-press the app icon on the Home Screen to see the quick actions."
