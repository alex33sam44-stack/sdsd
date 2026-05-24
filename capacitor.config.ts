import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper config.
 *
 * appId / appName are fixed for the platform.
 * webDir points at Vite's build output.
 *
 * NOTE: no `server.url` is set — the Android/iOS shells load the locally
 * bundled web build. After running `npm run build`:
 *   - Android: `npx cap sync android`
 *   - iOS:     `npx cap sync ios`
 * to copy `dist/` into the native project.
 *
 * Both shells talk to the live backend over HTTPS using
 * `VITE_API_BASE_URL` baked into the build at compile time.
 *
 * The native `android/` and `ios/` folders are NOT committed to the repo;
 * they are regenerated locally by `npx cap add android` / `npx cap add ios`
 * (iOS requires a Mac with Xcode 15+ and CocoaPods installed). See
 * `docs/MOBILE_BUILD.md` for the full runbook.
 */
const config: CapacitorConfig = {
  appId: "eg.mawaqef.app",
  appName: "مواقف مصر",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  ios: {
    // Custom https-equivalent scheme; matches Capacitor's production default
    // and avoids mixed-content/cookie quirks on iOS 14+.
    scheme: "MawaqefMasr",
    // Lock WebView navigation to the bundled bundle id + the API origin so a
    // hijacked link inside the app shell can't open arbitrary cross-origin
    // pages without going through the OS browser.
    limitsNavigationsToAppBoundDomains: true,
    // Web layer already handles safe-area padding via CSS env(safe-area-*),
    // so let the WKWebView extend under the status/home indicator.
    contentInset: "always",
  },
};

export default config;
