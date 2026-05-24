# Web Push notifications — operator runbook

The backend can deliver Web Push (VAPID) notifications to the existing PWA
service worker, so users receive line updates and alerts even when the
app is closed. The infrastructure is fully optional — leaving the VAPID
env vars blank disables push delivery cleanly:

- `/api/health` reports `push.configured: false` with the missing fields.
- The Settings UI hides the push toggle, so users never see something
  they can't enable.
- `PushService.sendToUser(...)` becomes a no-op (returns `{sent:0,total:0}`).
- The boot log prints a single warning naming the missing env vars.

## One-time per deployment

Generate a VAPID keypair (Mozilla's spec; works for Chrome, Edge, Firefox,
Safari 16+/iOS 16.4+ when the PWA is installed):

```bash
npx web-push generate-vapid-keys --json
```

Paste the result into `selfhost/.env.production`:

```env
VAPID_PUBLIC_KEY=BNB...XXXX
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:notifications@mwasalat.com
```

`VAPID_SUBJECT` MUST be a real `mailto:` (or `https:`) address so push
providers can reach you about abuse.

Restart the backend; you should see `[PushService] Web Push delivery is
enabled.` in the logs.

## How the pieces fit

```
Frontend                       Backend                    Browser/OS
────────                       ───────                    ──────────
Settings → "Enable"        →   POST /push/subscriptions   stores keys
                  ↓                       ↓
                  └─ pushManager.subscribe (VAPID public key)
                                          ↓
                            push_subscriptions row (per device)
                                          ↓
event happens (alert, line update)
                                ↓
                            PushService.sendToUser(userId, payload)
                                ↓
                            web-push library (VAPID-signed)
                                ↓
                                                 →   Mozilla / Google /
                                                     Apple push gateway
                                                            ↓
                                                     Service worker
                                                     (push-handler.js)
                                                            ↓
                                                     showNotification()
```

## Files involved

Backend:

- `backend/prisma/schema.prisma` — `PushSubscription` model
- `backend/prisma/migrations/20260524110000_push_subscriptions/migration.sql`
- `backend/src/modules/push/{push.module,push.controller,push.service,push.dto}.ts`
- `backend/src/modules/health/health.controller.ts` — exposes `push.configured`

Frontend:

- `public/push-handler.js` — SW `push` + `notificationclick` handlers
- `vite.config.ts` — `workbox.importScripts: ["/push-handler.js"]`
- `src/lib/push.ts` — `getPushSupportLevel()`, `enablePush()`, `disablePush()`,
  `sendPushSelfTest()`
- `src/components/PushNotificationsCard.tsx` — Settings UI
- `src/i18n/locales/{ar,en,fr}.json` — `push.*` keys

## Sending a push from custom code

```ts
import { PushService } from "src/modules/push/push.service";

// From any module that imports PushModule:
await this.push.sendToUser(userId, {
  title: "تنبيه على خط فيصل",
  body: "تم إيقاف الخط مؤقتًا بسبب زحام مفاجئ.",
  url: "/route/faisal/main",
  tag: "line-faisal-status",
});
```

Returns `{ sent, total }`; failed deliveries with HTTP 404/410 (Mozilla
or Google reporting that the subscription is dead) are pruned
automatically. Other failures bump `consecutiveFailures` so you can
debug without losing the row.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/push/public-key` | public, throttled | Returns `{publicKey, configured}` |
| `POST` | `/api/push/subscriptions` | JWT + tenant context | Idempotent register/refresh |
| `POST` | `/api/push/subscriptions/unsubscribe` | JWT | Forget this device's row |
| `POST` | `/api/push/test` | JWT | Send a self-test to all of the user's devices |

## Manual smoke test

1. `npm run prisma:deploy` to apply the new migration.
2. Restart the backend. Confirm `[PushService] Web Push delivery is enabled.`
3. Open the app on an HTTPS origin or `localhost`. Open Settings.
4. Press **تفعيل التنبيهات**, accept the OS permission prompt.
5. Press **إرسال تنبيه تجريبي**. A system notification should appear
   within a few seconds.
6. Tap the notification — the app should focus the route the payload
   pointed at.

## Notes that bite people

- **Capacitor iOS** delivers Web Push only when the app is installed via
  Xcode and `WKWebView` has the right entitlements. Test on a real
  device — the simulator's Notification Center swallows pushes.
- **Safari (web)** requires the user to install the PWA to the Home
  Screen first. The toggle still works after install.
- **Chrome on Android** requires HTTPS for the SW to register at all;
  `localhost` is the only exempt origin.
- **Iframes / Lovable preview**: `registerSW.ts` already refuses to
  register the SW inside iframes, so push silently stays off there.
- **Rotation:** rotating VAPID keys invalidates every subscription. The
  app handles this gracefully — subscriptions get 404/410 on the next
  send and are auto-pruned, then users re-enable from Settings.
