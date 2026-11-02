// FindIt's service worker. It does ONE thing: show alerts that arrive while
// FindIt is closed (see lib/outsideAlerts.ts), and open FindIt when one is
// tapped. No caching here, on purpose: pages and app code always come fresh
// from the network, so nobody gets stuck on an old version.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "FindIt", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "FindIt", {
      body: data.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
