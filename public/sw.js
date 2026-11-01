// Service worker: apertura veloce (file dell'app in cache) + notifiche push.
const CACHE = 'mezza-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => clients.claim())));
const put = (r, res) => { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); return res; };
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
  e.waitUntil(self.registration.showNotification(d.title || 'Mezza', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    const w = l.find(c => 'focus' in c);
    return w ? w.focus() : clients.openWindow(url);
  }));
});
