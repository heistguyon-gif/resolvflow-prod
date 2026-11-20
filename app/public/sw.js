self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const notification = payload && typeof payload.notification === "object" ? payload.notification : payload;
  const title = typeof notification.title === "string" ? notification.title : "Resolve Flow";
  const body = typeof notification.body === "string" ? notification.body : "Você recebeu uma nova atualização.";
  const navigate = typeof notification.navigate === "string" ? notification.navigate : payload.url;
  const url = typeof navigate === "string" ? navigate : "/integracoes";
  const tag = typeof notification.tag === "string" ? notification.tag : "resolvflow-update";
  const options = {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/notification-badge-96.png",
    data: { url },
  };
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => (
      self.registration.showNotification(title, { body, tag, data: { url } })
    )),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/integracoes", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
