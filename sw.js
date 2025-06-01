// Service Worker - 棚卸しPWA完全版

// sw.js

const CACHE_NAME = 'inventory-pwa-v1.0.0';

// キャッシュするファイル
const CACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// インストール時の処理
self.addEventListener('install', (event) => {
  console.log('Service Worker: インストール中...');
  
  // キャッシュの即時更新のために skipWaiting を使用
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('キャッシュにファイルを追加中...');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => {
        console.log('静的ファイルのキャッシュ完了');
      })
      .catch((error) => {
        console.error('キャッシュエラー:', error);
      })
  );
});

// アクティベート時の処理
self.addEventListener('activate', (event) => {
  console.log('Service Worker: アクティベート中...');
  
  // 古いキャッシュを削除
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // 現在のキャッシュ以外を削除
              return cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log(`古いキャッシュを削除: ${cacheName}`);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        // 全クライアントをコントロール
        return self.clients.claim();
      })
  );
});

// フェッチ時の処理（キャッシュファースト戦略）
self.addEventListener('fetch', (event) => {
  // GET リクエストのみ処理
  if (event.request.method !== 'GET') return;
  
  // APIリクエストなどは除外
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((cacheResponse) => {
        // キャッシュにあればそれを返す
        if (cacheResponse) {
          console.log('キャッシュから提供:', event.request.url);
          // バックグラウンドでキャッシュを更新（オプション）
          updateCache(event.request);
          return cacheResponse;
        }
        
        // キャッシュになければネットワークから取得
        console.log('ネットワークから取得:', event.request.url);
        return fetch(event.request)
          .then((networkResponse) => {
            // レスポンスをクローンしてキャッシュに保存
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                })
                .catch((error) => {
                  console.error('キャッシュ保存エラー:', error);
                });
            }
            
            return networkResponse;
          })
          .catch((error) => {
            console.error('ネットワークリクエストエラー:', error);
            // HTML要求の場合はindex.htmlを返す（SPAの場合に有用）
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // その他はエラーを返す
            throw error;
          });
      })
  );
});

// バックグラウンドでキャッシュを更新する関数
function updateCache(request) {
  fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(request, response);
            console.log('バックグラウンドでキャッシュを更新:', request.url);
          })
          .catch((error) => {
            console.error('バックグラウンドキャッシュ更新エラー:', error);
          });
      }
    })
    .catch((error) => {
      // バックグラウンド更新なのでエラーは無視
      console.log('バックグラウンド更新スキップ:', request.url);
    });
}

// メッセージの受信処理（バージョン管理用）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('Service Worker 初期化完了 - バージョン:', CACHE_NAME);