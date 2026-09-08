# 3D Touch demo

A small Cordova app that exercises everything the plugin exposes: static and dynamic quick actions,
the quick-action listener, force touches and link preview.

iOS only, because the plugin is iOS only — `plugin.xml` declares no other platform.

## Run it against this checkout

Boot a simulator (any iPhone; 3D Touch pressure is not simulated, but quick actions and link
preview work), then:

```bash
cd demo && ./run.sh
```

That builds in a temporary directory and installs the result on whichever simulator is booted, or
on `IOS_UDID` if you set it. `CORDOVA_IOS` picks the platform version, default `8.1.1`.

The build is done outside this directory on purpose: `cordova plugin add <plugin dir>` copies the
whole plugin into the app's `plugins/`, and this demo lives inside the plugin, so building in place
would copy the demo into itself until the path got too long.

For a real device, build the temporary project by hand — `run.sh` deliberately does not sign
anything:

```bash
cd demo && npx cordova platform add ios && npx cordova plugin add .. && npx cordova build ios
```

## Run it against the published plugin

In any Cordova project of your own:

```bash
cordova plugin add @herdwatch/cordova-plugin-3dtouch
```

then copy `www/` from here over your own.

## What to try

1. **Static quick action.** Long-press the app icon on the Home Screen straight after installing,
   before opening the app. "Check in" is already there: it comes from `UIApplicationShortcutItems`
   in `config.xml`, which iOS reads without running the app.
2. **Dynamic quick actions.** Open the app, tap *Configure quick actions*, background it, then
   long-press the icon again. Three more appear. These live only after the app has run once, and
   each call replaces the previous set.
3. **Cold start.** Kill the app, then pick a quick action. The item is delivered while the scene
   connects, before any JavaScript exists — the plugin holds it and replays it once the listener
   registers, which is what the *Log* card shows.
4. **Link preview.** Tap *Enable link preview*, then press and hold the link on the home page.

`www/js/index.js` registers the listener, and it is shared by every page here rather than living in
`index.html`: a quick action can launch the app onto any page, so a listener that existed only on
the home page would miss it.
