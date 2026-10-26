// Add these handlers to the portal's existing service worker.
// If the service worker already has push or notificationclick handlers, merge the logic.

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'PulseTap';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/assets/pulsetap-icon-512.png',
    tag: payload.tag || 'pulsetap',
    data: {
      url: payload.url || '/',
      ...(payload.data || {})
    },
    timestamp: payload.timestamp || Date.now(),
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const windowClient of windows) {
      if ('focus' in windowClient) {
        await windowClient.focus();
        if ('navigate' in windowClient) await windowClient.navigate(targetUrl);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(targetUrl);
  })());
});

