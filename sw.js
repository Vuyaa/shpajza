const CACHE_NAME = 'shpajza-v5';
const APP_SHELL = [
  './',
  './index.html',
  './auth-view.html',
  './mobile-app.html',
  './mobile-app.css',
  './mobile-app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isApiRequest = requestUrl.pathname.includes('/api/');
  const isAppShellRequest = /\.(html|js|css|json|webmanifest)(\?.*)?$/.test(requestUrl.pathname) || requestUrl.pathname === '/' || requestUrl.pathname.endsWith('/index.html');
  const isNavigationRequest = event.request.mode === 'navigate';

  if (isApiRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isNavigationRequest || isAppShellRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request) || caches.match('./mobile-app.html') || caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
