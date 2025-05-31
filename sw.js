// sw.js - Service Worker for Inventory PWA
const CACHE_NAME = 'inventory-pwa-v1.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  self.skipWaiting(); // 即時有効化
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// アクティベート時に古いキャッシュ削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('Deleting old cache', key);
            return caches.delete(key);
          })
      )
    )
    .then(() => {
      console.log('Service Worker activated');
      self.clients.claim();
    })
  );
});

// fetch時はキャッシュ優先、なければネット
self.addEventListener('fetch', event => {
  // API通信やCDNリソースは除外
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // キャッシュがあれば即時返す
        return cachedResponse;
      }

      // キャッシュになければネットワークからフェッチ
      return fetch(event.request)
        .then(response => {
          // 有効なレスポンスか確認
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // レスポンスをクローンしてキャッシュに保存
          // (レスポンスは1度しか使えないため)
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        })
        .catch(error => {
          // オフライン時のフォールバック処理
          console.log('Fetch failed; returning offline fallback.', error);
          return caches.match('./index.html');
        });
    })
  );
});

// プッシュ通知(必要に応じて実装)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png'
    });
  }
});

// 通知クリック時の処理
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('.')
  );
});