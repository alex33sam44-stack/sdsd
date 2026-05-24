# Mobile build runbook (Capacitor)

The web app ships as a Capacitor wrapper for both **Android** and **iOS**.
Only the web build (`dist/`) and the Capacitor config are committed; the
native projects (`android/`, `ios/`) are generated locally per developer
machine and are git-ignored.

This document is the canonical instruction set for both platforms — they
go through the same `npm run build` → `cap sync` → open in IDE flow.

## One-time setup

### Both platforms

```bash
npm install
npm run build
```

`@capacitor/android`, `@capacitor/ios` and `@capacitor/cli` are pinned to
the same major (`^8.3.x`) in `package.json`; they do NOT need to be
installed globally.

### Android (any host OS)

Required:

- Android Studio Hedgehog (2023.1) or newer
- JDK 17 (Android Studio bundles a working one)
- An Android device with USB debugging on, or an emulator AVD

```bash
npm run cap:add:android   # only the first time
npm run cap:sync:android  # after every `npm run build`
npm run cap:open:android  # opens the project in Android Studio
```

Press **Run ▶** in Android Studio.

### iOS (macOS only)

Required:

- macOS 13+ with Xcode 15 or newer
- An iOS device, or a simulator from Xcode
- CocoaPods 1.13+ (`sudo gem install cocoapods`)
- An Apple Developer account if you want to run on a physical device

```bash
npm run cap:add:ios       # only the first time
npm run cap:sync:ios      # after every `npm run build`
npm run cap:open:ios      # opens the workspace in Xcode
```

In Xcode:

1. Set **Signing & Capabilities → Team** to your Apple ID team.
2. Pick the destination (simulator or connected device).
3. Press **Run ▶**.

## Day-to-day loop

After every web change:

```bash
npm run build
# pick one or both:
npm run cap:sync:android
npm run cap:sync:ios
```

`cap sync` copies `dist/` into both native projects, refreshes the
plugin manifest, and on iOS runs `pod install` for you.

## Notes that bite people

- **Backend URL is baked in at build time.** Set `VITE_API_BASE_URL` in
  your shell (or `.env.production`) BEFORE `npm run build`. Re-running
  `cap sync` does not change the bundled URL.
- **iOS App Bound Domains.** `capacitor.config.ts` sets
  `limitsNavigationsToAppBoundDomains: true`. If you change
  `VITE_API_BASE_URL` to a new origin, also add the host to the
  `WKAppBoundDomains` array in `ios/App/App/Info.plist`. Otherwise the
  WebView refuses to talk to it.
- **Android cleartext.** `allowMixedContent: false` is intentional —
  the production API is HTTPS. Don't flip it to develop against a plain
  `http://` backend; tunnel through `cloudflared` / `ngrok` instead.
- **Service worker.** `src/lib/registerSW.ts` already detects Capacitor
  on either platform and registers the SW so offline caching works the
  same way Android and iOS shells.
- **Don't commit `android/` or `ios/`.** Both are listed in
  `.gitignore`. They contain Gradle output / CocoaPods checkout / signing
  configs that must stay local.

## Troubleshooting

- `pod install` fails on Apple Silicon → run
  `sudo arch -x86_64 gem install cocoapods` once, then `cap sync ios`
  again.
- `Could not find @capacitor/ios` → run `npm install` (the dep was
  added in this fix; older clones may still be at the Android-only
  state).
- White screen on first launch → you forgot `npm run build` before
  `cap sync`. The native shell loads `dist/index.html` literally.
