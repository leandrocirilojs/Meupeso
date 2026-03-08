// =====================================================================
// CUIDA — Service Worker
// Versão do cache: atualize este número sempre que mudar arquivos
// =====================================================================
const CACHE_NAME = 'cuida-v1';

// Arquivos essenciais para funcionar offline
const ASSETS = [
  '/Meupeso/',
  '/Meupeso/index.html',
  '/Meupeso/style.css',
  '/Meupeso/app.js',
  '/Meupeso/manifest.json',
  '/Meupeso/icons/icon-192.png',
  '/Meupeso/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&display=swap'
];

// ─── INSTALL: salva arquivos no cache ───────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Cuida SW] Cache criado:', CACHE_NAME);
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE: limpa caches antigos ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[Cuida SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ─── FETCH: estratégia Cache First + Network Fallback ───────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requisições ao Open Food Facts: sempre busca na rede (sem cache)
  if (url.hostname.includes('openfoodfacts.org')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ products: [], error: 'offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Fontes do Google: cache primeiro
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          })
        )
      )
    );
    return;
  }

  // Demais recursos: cache primeiro, rede como fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          // Só cacheia respostas válidas e do mesmo origem
          if (
            !response ||
            response.status !== 200 ||
            response.type === 'opaque'
          ) return response;

          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, toCache)
          );

          return response;
        })
        .catch(() => {
          // Fallback offline para navegação
          if (event.request.destination === 'document') {
            return caches.match('/Meupeso/index.html');
          }
        });
    })
  );
});

// ─── PUSH NOTIFICATIONS (preparado para uso futuro) ─────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {
    title: 'Cuida',
    body: 'Não esqueça de registrar sua refeição! 🥗'
  };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
