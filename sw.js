const CACHE_NAME = 'tecnofs-v2';
const urlsToCache = [
  './index.html',
  './precios.html',
  './precios.css',
  './precios.js',
  './finanzas.html',
  './finanzas.css',
  './finanzas.js',
  './garantias.html',
  './garantias.css',
  './garantias.js',
  './logo.png',
  './financiero.png',
  './precios.png',
  './garantia.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});