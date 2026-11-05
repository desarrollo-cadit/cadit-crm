/*
 * CadIT Campus service worker.
 *
 * Deliberately has NO fetch handler and NO cache: portal pages and /api/*
 * are authenticated and per-person, so nothing here may store or replay a
 * response. Do not add runtime caching without a spec that classifies what
 * is safe to keep.
 *
 * Push: the payload is minimal on purpose (title, short body, in-app url)
 * because the lock screen is visible to anyone holding the phone.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CadIT Campus";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    tag: data.tag || undefined,
    // iOS and Chrome both require a visible notification for every push.
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/portal" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/portal";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
