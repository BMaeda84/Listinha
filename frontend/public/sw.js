const CACHE = 'listinha-v1';
const PRECACHE = ['/', '/index.html', '/icon.svg', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Deixa chamadas de API sempre ir para a rede (nunca cacheie)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Navegação SPA: sempre retorna index.html do cache ou rede
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/index.html').then((cached) =>
        cached || fetch(e.request)
      )
    );
    return;
  }

  // Assets estáticos: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});
