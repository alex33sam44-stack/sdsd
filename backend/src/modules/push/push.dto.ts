/**
 * Web Push subscription shape — exactly the JSON returned by
 * `PushSubscription.prototype.toJSON()` in the browser, so the frontend
 * can pass through what `pushManager.subscribe()` produced without any
 * reshaping.
 */
export interface SubscribeDto {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Server-side push payload. Stays opt-in/optional so future events can grow. */
export interface PushPayload {
  title: string;
  body?: string;
  /** Path the SW should focus/open when the user taps the notification. */
  url?: string;
  /** Used to coalesce notifications of the same kind. */
  tag?: string;
  /** Override the default icon (must be served from the same origin). */
  icon?: string;
  /** Optional structured payload. The SW only reads top-level fields above. */
  data?: Record<string, unknown>;
}
