const CACHE_PREFIX = `mis-tickets-static-${self.registration.scope}-`;
const CACHE = `${CACHE_PREFIX}__CACHE_VERSION__`;
const ASSETS = __ASSET_LIST__;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const path = new URL(event.request.url).pathname;
    const cached = await cache.match(event.request.mode === 'navigate'
      ? new URL('index.html', self.registration.scope).href : path);
    return cached ?? fetch(event.request);
  })());
});
