// Haven Background Push & Lock-Screen Notification Worker
// Loaded into the production Service Worker via Workbox importScripts

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Haven', body: event.data.text() };
  }

  const isEmergency = payload.type === 'emergency_alert';
  const title = payload.title || (isEmergency ? 'URGENT ALERT — Haven' : 'Haven');
  const options = {
    body: payload.body || 'New activity on Haven',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: isEmergency ? 'haven-emergency-alert' : `haven-ping-${payload.id || Date.now()}`,
    timestamp: payload.timestamp || Date.now(),
    renotify: true,
    requireInteraction: isEmergency,
    silent: false,
    vibrate: isEmergency
      ? [600, 150, 600, 150, 900, 150, 600, 150, 900, 150, 1000]
      : [220, 100, 220],
    data: payload,
    actions: isEmergency
      ? [
          { action: 'mark_safe', title: 'I Am Safe' },
          { action: 'open_app', title: 'Open Alert' },
        ]
      : [{ action: 'open_app', title: 'View' }],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            client.postMessage({
              type: 'HAVEN_BACKGROUND_PUSH',
              payload,
            });
          }
        }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action;

  notification.close();

  if (action === 'mark_safe' && data.targetRole) {
    event.waitUntil(
      fetch('/api/resolve-emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.targetRole }),
      }).catch(() => {})
    );
    return;
  }

  const targetUrl = data.targetRole ? `/?user=${data.targetRole}` : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'HAVEN_NOTIFICATION_CLICKED',
              payload: data,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
