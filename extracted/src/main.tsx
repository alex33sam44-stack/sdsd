import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { assertRuntimeConfig, ENV } from "./lib/env";
import { logger } from "./lib/logger";
import { registerServiceWorker } from "./lib/registerSW";
import { initSentry } from "./lib/sentry";
import { mark, measure, recordBootMetrics } from "./lib/perf";

// Initialize observability BEFORE any other code runs so early errors are captured.
// Safe no-op when VITE_SENTRY_DSN is unset or in Lovable previews / iframes.
initSentry();
recordBootMetrics();
mark("boot.start");

// Verify runtime config at boot. In production this only warns; in dev it
// surfaces missing config loudly so it gets fixed before shipping.
assertRuntimeConfig();
logger.info("app boot", { mode: ENV.mode, dataMode: ENV.dataMode, release: ENV.release });

createRoot(document.getElementById("root")!).render(<App />);
mark("boot.rendered");
measure("boot", "boot.start", "boot.rendered");

// Register PWA service worker (no-op inside Lovable preview / iframes).
void registerServiceWorker();
