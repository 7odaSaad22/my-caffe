const CACHE_NAME = 'cafe-app-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/user.html',
    '/admin.html',
    '/404.html',
    '/style.css',
    '/script.js',
    '/supabase_client.js',
    'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});

// Placeholder for Push Notification event
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'طلب جديد!',
        icon: '/logo.png',
        badge: '/logo.png'
    };

    event.waitUntil(
        self.registration.showNotification('Averroes Coffee', options)
    );
});
