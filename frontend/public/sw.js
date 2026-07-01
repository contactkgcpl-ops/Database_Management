self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests without caching to prevent stale CRM data
  event.respondWith(fetch(event.request));
});

// Handle PWA notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Extract target page/route from notification custom data
  const targetPage = event.notification.data?.page || 'dashboard';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if CRM tab/window is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          // Send message to React application to change page/view
          client.postMessage({ type: 'navigate', page: targetPage });
          return;
        }
      }
      // If no tab is open, open a new window loading the target page as query parameter
      if (self.clients.openWindow) {
        return self.clients.openWindow(`/?page=${targetPage}`);
      }
    })
  );
});
