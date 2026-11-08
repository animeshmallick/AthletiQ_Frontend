/*
 * AthletiQ service worker.
 *
 * - Push: shows notifications sent through Firebase Cloud Messaging (iPhone Home Screen app on
 *   iOS 16.4+, Android/desktop browsers). Tapping one focuses the app and opens its link.
 * - Offline: page loads fall back to /offline.html when there is no connection.
 *
 * App code is NOT cached here on purpose: every deploy must reach users immediately.
 */
const CACHE = 'atq-shell-v1';
const SHELL = ['/offline.html', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;
  event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
});

/** FCM delivers { notification: { title, body }, data: { link } } (shape varies slightly by browser). */
function parse(event) {
  try {
    const json = event.data ? event.data.json() : {};
    const n = json.notification || {};
    const data = json.data || {};
    return {
      title: n.title || data.title || 'AthletiQ',
      body: n.body || data.body || '',
      link: data.link || '/',
      tag: n.tag || data.tag,
    };
  } catch {
    return { title: 'AthletiQ', body: event.data ? event.data.text() : '', link: '/' };
  }
}

self.addEventListener('push', (event) => {
  const msg = parse(event);
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: msg.tag,
      data: { link: msg.link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const url = new URL(link.startsWith('/') ? link : '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          w.postMessage({ type: 'atq:navigate', link });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
