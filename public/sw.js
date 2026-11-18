// Service worker: apertura veloce (file dell'app in cache) + notifiche push.
const CACHE = 'mezza-v5';
// Alla prima installazione si salvano subito pagina, file dell'app e icone: l'app si apre anche senza rete.
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(async c => {
    const res = await fetch('/', { cache: 'reload' }), html = await res.clone().text(); await c.put('/', res);
    const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]).concat(['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-180.png', '/icons/icon.svg']);
    await Promise.all(urls.map(u => c.add(u).catch(() => {})));
  }).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => clients.claim())));
const put = (r, res) => { if (!res.ok) return res; const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); return res; };
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;           // mai la rete di Supabase
  if (u.pathname.startsWith('/assets/')) {                                  // file con il nome "a impronta": non cambiano mai, subito dalla cache
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => put(r, res))));
    return;
  }
  e.respondWith(fetch(r).then(res => put(r, res)).catch(() => caches.match(r).then(m => m || caches.match('/'))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data?.json() || {}; } catch { d = { title: 'Mezza', body: e.data?.text() || '' }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Mezza', { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: d.tag, data: { url: d.url || '/', nid: d.nid } }),
    d.badge != null && self.navigator.setAppBadge ? self.navigator.setAppBadge(d.badge).catch(() => {}) : null,   // numero sull'icona dell'app
  ]));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/', nid = e.notification.data?.nid;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    const w = l.find(c => 'focus' in c);
    if (w) { w.postMessage({ type: 'open-notif', nid }); return w.focus(); }   // app già aperta: le diciamo dove andare
    return clients.openWindow(url);                                            // app chiusa: si apre già sulla pagina giusta
  }));
});
