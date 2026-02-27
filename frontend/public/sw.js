/* Service Worker Fidpass — notifications push */
self.addEventListener("push", (event) => {
  let data = { title: "Fidpass", body: "" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (_) {}
  }
  const options = {
    body: data.body || "Nouvelle notification",
    icon: "/assets/logo.png",
    badge: "/assets/logo.png",
    tag: "fidpass-" + Date.now(),
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title || "Fidpass", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    if (list.length) list[0].focus();
    else if (clients.openWindow) clients.openWindow(url);
  }));
});
