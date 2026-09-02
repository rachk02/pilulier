/* sw.js — service worker : l'application fonctionne entierement hors-ligne. */
const CACHE = 'pilulier-v2.2.0';
const ASSETS = [
  '/', '/index.html', '/manifest.webmanifest',
  '/css/theme.css', '/css/anim.css', '/css/app.css',
  '/fonts/mono-regular.woff', '/fonts/mono-bold.woff',
  '/js/app.js', '/js/util.js', '/js/db.js', '/js/schema.js', '/js/store.js',
  '/js/ui.js', '/js/sound.js', '/js/alarm.js', '/js/ics.js', '/js/avatars.js',
  '/js/views/today.js', '/js/views/calendar.js', '/js/views/meds.js',
  '/js/views/suivi.js', '/js/views/settings.js', '/js/views/profiles.js',
  '/js/views/simple.js', '/js/views/urgence.js',
  '/js/speech.js', '/js/safety.js', '/js/qr.js', '/js/bulletin.js', '/js/sync.js',
  '/js/draw.js', '/js/icons.js', '/js/illus.js',
  '/js/boxscan.js', '/js/drugbook.js', '/js/views/newmed.js', '/js/app-version.js',
  '/doc.html', '/css/doc.css', '/sorties.html', '/style.html', '/marques.html', '/schema.html', '/graphiques.html',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png', '/icons/badge-72.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(ASSETS.map((u) => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  /* La synchronisation doit toujours passer par le reseau : un compte rendu
     servi depuis le cache serait un mensonge. */
  if (url.pathname.startsWith('/api/')) return;

  // Navigation : reseau d'abord, cache en secours (permet les mises a jour).
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request)
      .then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('/index.html', c)); return r; })
      .catch(() => caches.match('/index.html')));
    return;
  }
  // Ressources : cache d'abord, puis reseau.
  e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(request, c)); }
    return r;
  }).catch(() => hit)));
});

/* Actions sur les notifications -> renvoyees a l'application. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const msg = { type: 'notification-action', action: e.action || 'open', tag: e.notification.tag };
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { c.postMessage(msg); return c.focus(); }
    return self.clients.openWindow('/#/today');
  }));
});
