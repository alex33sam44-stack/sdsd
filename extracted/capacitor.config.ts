import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper config.
 *
 * appId / appName are fixed for the platform.
 * webDir points at Vite's build output.
 *
 * NOTE: no `server.url` is set — the Android shell loads the locally
 * bundled web build. After running `npm run build`, run `npx cap sync android`
 * to copy `dist/` into the native project.
 *
 * The shell talks to the live backend over HTTPS using
 * `VITE_API_BASE_URL` baked into the build at compile time.
 */
const config: CapacitorConfig = {
  appId: "eg.mawaqef.app",
  appName: "مواقف مصر",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
