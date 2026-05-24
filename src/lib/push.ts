/**
 * Web Push subscription helpers.
 *
 * The flow is:
 *   1. `getPushSupportLevel()` — quick capability/permission probe so the
 *      Settings UI can render the right state without throwing.
 *   2. `enablePush()` — asks for permission, fetches the VAPID public key
 *      from `/push/public-key`, calls `pushManager.subscribe()`, and posts
 *      the resulting subscription to the backend.
 *   3. `disablePush()` — tells the backend to forget this device, then
 *      unsubscribes locally so the OS stops waking the SW.
 *
 * All three are no-ops in environments that don't support Web Push (older
 * iOS Safari without the PWA installed, in-app browsers, server-side
 * rendering, etc.) — they return a clear `state` instead of throwing.
 */

import { api } from "./api";

export type PushSupport =
  | { state: "unsupported"; reason: "ssr" | "no-sw" | "no-push-manager" | "no-notification" }
  | { state: "denied" }
  | { state: "default"; supported: true }
  | { state: "granted"; subscribed: boolean }
  | { state: "server-disabled"; missingFields: string[] };

interface ServerStatus {
  publicKey: string | null;
  configured: boolean;
  reasons?: string[];
  missingFields?: string[];
}

let cachedServerStatus: ServerStatus | null = null;

async function fetchServerStatus(): Promise<ServerStatus> {
  if (cachedServerStatus) return cachedServerStatus;
  try {
    const status = await api.get<ServerStatus>("/push/public-key");
    cachedServerStatus = status;
    return status;
  } catch {
    // Backend missing the endpoint, or network is down — treat as disabled.
    cachedServerStatus = { publicKey: null, configured: false };
    return cachedServerStatus;
  }
}

export async function getPushSupportLevel(): Promise<PushSupport> {
  if (typeof window === "undefined") return { state: "unsupported", reason: "ssr" };
  if (!("serviceWorker" in navigator)) return { state: "unsupported", reason: "no-sw" };
  if (!("PushManager" in window)) return { state: "unsupported", reason: "no-push-manager" };
  if (!("Notification" in window)) return { state: "unsupported", reason: "no-notification" };

  const server = await fetchServerStatus();
  if (!server.configured || !server.publicKey) {
    return { state: "server-disabled", missingFields: server.missingFields ?? [] };
  }

  const perm = Notification.permission;
  if (perm === "denied") return { state: "denied" };
  if (perm === "default") return { state: "default", supported: true };

  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { state: "granted", subscribed: !!sub };
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { ok: false, reason: "unsupported" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  const server = await fetchServerStatus();
  if (!server.configured || !server.publicKey) {
    return { ok: false, reason: "server-disabled" };
  }

  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm };

  // The workbox SW is registered separately on app boot; wait for it to be
  // ready so `pushManager.subscribe()` doesn't race the registration.
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  // The DOM lib types `applicationServerKey` as `BufferSource | null` —
  // strict TS 5.7+ flags the SharedArrayBuffer-tagged Uint8Array union as
  // an incompatible buffer. Cast through ArrayBuffer to land on the
  // narrower legacy shape the platform actually accepts.
  const applicationServerKey = urlBase64ToUint8Array(server.publicKey)
    .buffer as ArrayBuffer;
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

  try {
    await api.post("/push/subscriptions", subscription.toJSON());
  } catch (err) {
    // Roll back the local subscription so the next attempt starts clean
    // instead of getting silently re-bound to a server row that didn't save.
    if (!existing) {
      await subscription.unsubscribe().catch(() => undefined);
    }
    return { ok: false, reason: err instanceof Error ? err.message : "request-failed" };
  }
  return { ok: true };
}

export async function disablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: true };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };
  try {
    await api.post("/push/subscriptions/unsubscribe", { endpoint: sub.endpoint });
  } catch {
    /* not fatal — local unsubscribe is the source of truth for the user */
  }
  await sub.unsubscribe().catch(() => undefined);
  return { ok: true };
}

export async function sendPushSelfTest(): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await api.post("/push/test");
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "request-failed" };
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
