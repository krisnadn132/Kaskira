const CACHE_NAME = 'vault-cache-v7';
const urlsToCache = [
  './',
  './index.html',
  './style.css?v=0.4',
  './script.js?v=103',
  './manifest.json',
  './assets/icon-192.png',
  './assets/krisna.png'
];

// 1. INSTALL: Membuat cache baru dan mengunduh seluruh aset statis
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('🔄 SW: Mengisi cache statis utama...');
            return cache.addAll(urlsToCache);
        }).then(() => self.skipWaiting())
    );
});

// 2. ACTIVATE: Membersihkan sisa-sisa cache lama jika versi berganti (v7)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('🗑️ SW: Menghapus cache usang:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. FETCH: Strategi Cache-First untuk aset lokal, Jaringan Jauh untuk API
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // SAKTI: Bypass otomatis HANYA untuk GitHub Cloud agar selalu Live
    if (
        url.includes('github') || 
        url.includes('api.github.com')
    ) {
        return; // Network Only untuk Cloud Sync
    }

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(response => {
            return response || fetch(event.request);
        })
    );
});