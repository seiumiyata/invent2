// sw.js

const CACHE_NAME = 'inventory-pwa-cache-v1.0.0';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // 必要に応じて追加
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  self.skipWaiting(); // 即時有効化
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
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
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// fetch時はキャッシュ優先、なければネット
self.addEventListener('fetch', event => {
  // API通信などは除外したい場合はここで判定
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(response => {
      // キャッシュにあれば返す
      if (response) return response;
      // なければネットワークから取得しキャッシュ
      return fetch(event.request).then(networkResponse => {
        // 静的ファイルのみキャッシュ
        if (
          event.request.url.startsWith(self.location.origin) &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => {
        // オフライン時のフォールバック（必要に応じて）
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
