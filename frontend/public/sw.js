/* Service Worker Myfidpass — notifications push */
self.addEventListener("push", (event) => {
  const show = async () => {
    let data = { title: "Myfidpass", body: "" };
    if (event.data) {
      try {
        const parsed = await event.data.json();
        data = { ...data, ...parsed };
      } catch (_) {}
    }
    const options = {
      body: data.body || "Nouvelle notification",
      icon: data.icon || "/assets/logo.png",
      badge: data.icon || "/assets/logo.png",
      tag: "fidpass-" + Date.now(),
      renotify: true,
    };
    await self.registration.showNotification(data.title || "Myfidpass", options);
  };
  event.waitUntil(show());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    if (list.length) list[0].focus();
    else if (clients.openWindow) clients.openWindow(url);
  }));
});
