self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: "GetPrio alert",
        body: event.data.text()
      };
    }
  }

  const title = payload.title || "GetPrio alert";
  const options = {
    body: payload.body || "Open GetPrio for details.",
    data: {
      url: payload.url || "/"
    },
    icon: "/app-icon-192.png",
    badge: "/app-icon-192.png",
    tag: payload.tag || "getprio-notification"
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
