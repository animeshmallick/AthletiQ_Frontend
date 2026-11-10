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

/**
 * FCM delivers { notification: { title, body }, data: { link, category, notificationId, actions } }
 * (shape varies slightly by browser). `actions` is a JSON list of { label, link }.
 */
function parse(event) {
  try {
    const json = event.data ? event.data.json() : {};
    const n = json.notification || {};
    const data = json.data || {};
    let actions = [];
    try {
      actions = JSON.parse(data.actions || '[]').slice(0, 2);
    } catch {
      actions = [];
    }
    return {
      title: n.title || data.title || 'AthletiQ',
      body: n.body || data.body || '',
      link: data.link || '/',
      tag: n.tag || data.tag,
      category: data.category,
      notificationId: data.notificationId,
      actions,
    };
  } catch {
    return { title: 'AthletiQ', body: event.data ? event.data.text() : '', link: '/', actions: [] };
  }
}

self.addEventListener('push', (event) => {
  const msg = parse(event);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // The app is on screen: it shows its own banner instead of a system notification.
      const visible = windows.find((w) => w.visibilityState === 'visible' && w.focused);
      if (visible) {
        visible.postMessage({ type: 'atq:push', ...msg });
        return undefined;
      }
      return self.registration.showNotification(msg.title, {
        body: msg.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: msg.tag,
        // Quiet for daily summaries; the rest may alert again when replaced.
        silent: msg.category === 'summaries',
        renotify: !!msg.tag && msg.category !== 'summaries',
        timestamp: Date.now(),
        actions: msg.actions.map((x, i) => ({ action: String(i), title: x.label })),
        data: { link: msg.link, notificationId: msg.notificationId, actions: msg.actions },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  // A button opens its own screen; the notification itself opens its link.
  const chosen = event.action !== '' && data.actions ? data.actions[Number(event.action)] : null;
  const link = (chosen && chosen.link) || data.link || '/';
  const safe = link.startsWith('/') ? link : '/';
  const url = new URL(safe, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          w.postMessage({ type: 'atq:navigate', link: safe, notificationId: data.notificationId });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
