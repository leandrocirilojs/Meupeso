const CACHE_NAME = 'cuida-v1';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache apenas assets estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS.map(url => new Request(url, { mode: 'no-cors' })))
    ).catch(() => {})
  );
  self.skipWaiting();
});

// Activate: apaga caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Mensagem para forçar atualização (skipWaiting)
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Sempre rede para APIs externas
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('generativelanguage') ||
    url.hostname.includes('openfoodfacts.org') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('mistral.ai')
  ) {
    return event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 503 }))
    );
  }

  // Sempre rede para index.html — garante atualizações imediatas
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    return event.respondWith(
      fetch(event.request).then(response => {
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => caches.match('/index.html'))
    );
  }

  // Network first para JS e CSS (app.js, foods.js, style.css) — pega atualizações
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    return event.respondWith(
      fetch(event.request).then(response => {
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => caches.match(event.request))
    );
  }

  // Cache first para ícones, fontes e outros assets estáticos
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});
