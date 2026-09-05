const CACHE_PREFIX = "prono-l1-player-shell";
const CACHE = `${CACHE_PREFIX}-v1`;
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/"]))); self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put("/", copy)); return response; }).catch(() => caches.match("/").then((response) => response || Response.error())));
});
self.addEventListener("push", (event) => { const data = event.data?.json() || {}; event.waitUntil(self.registration.showNotification(data.title || "Prono L1", { body: data.body || "Nouvelle notification", icon: "/icon-192.png", data: { url: data.url || "/" } })); });
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data?.url || "/")); });
