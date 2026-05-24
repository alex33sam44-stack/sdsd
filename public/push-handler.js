/**
 * Web Push handlers attached to the workbox-generated service worker via
 * `vite.config.ts -> workbox.importScripts: ["/push-handler.js"]`.
 *
 * Workbox owns the cache/precache lifecycle (`install`, `activate`, `fetch`);
 * this file only adds the two events it doesn't handle:
 *   - `push`              : show a system notification from the JSON payload.
 *   - `notificationclick` : focus an existing window for the same URL or
 *                            open a new one.
 *
 * Keeping this in plain JS (no bundling) means MIME-typed image/icon paths
 * in the SW reference the same `/icons/...` files the manifest already
 * ships, with no extra build step.
 */

self.addEventListener("push", function (event) {
  /** @type {{title?: string, body?: string, url?: string, tag?: string, icon?: string, dir?: string, lang?: string}} */
  var data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (_err) {
    // Some Web Push providers send plain text; surface it as the body.
    try {
      data = { body: event.data ? event.data.text() : "" };
    } catch (_err2) {
      data = {};
    }
  }
  var title = data.title || "مواصلات مصر";
  var options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag,
    dir: data.dir || "rtl",
    lang: data.lang || "ar",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async function () {
      var allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (var i = 0; i < allClients.length; i++) {
        var c = allClients[i];
        try {
          var u = new URL(c.url);
          if (u.pathname === target || c.url === target) {
            if ("focus" in c) return c.focus();
          }
        } catch (_err) {
          /* ignore malformed client URL */
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })(),
  );
});
