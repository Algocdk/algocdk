// Algocdk Service Worker v3 - Enhanced PWA Support
const CACHE_VERSION = 'algocdk-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const OFFLINE_URL = '/offline.html';

// Static assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/app',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable.png',
  '/offline.html',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// API endpoints to cache with network-first strategy
const API_ROUTES = [
  '/api/',
  '/api/user',
  '/api/bots',
  '/api/signals'
];

// Install event - cache critical static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v2...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Skip waiting to activate immediately');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Pre-cache failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v2...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old version caches
            if (cacheName.startsWith('algocdk-v') && cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && cacheName !== IMAGE_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming all clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - intelligent caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) return;

  // Skip WebSocket connections
  if (request.url.includes('ws://') || request.url.includes('wss://')) return;

  // Skip external API calls (allow them to fail naturally)
  if (url.origin !== location.origin && !url.hostname.includes('deriv')) {
    return;
  }

  // Handle different types of requests with appropriate strategies
  if (isStaticAsset(url.pathname)) {
    // Static assets: Cache-first strategy
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isImage(request)) {
    // Images: Cache-first with network fallback
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  } else if (isAPIRequest(url.pathname)) {
    // API requests: Network-first with cache fallback
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
  } else {
    // Pages: Network-first with offline fallback
    event.respondWith(networkFirstWithOffline(request, DYNAMIC_CACHE));
  }
});

// Cache-first strategy - for static assets
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Return cached version
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Cache-first fetch failed:', error);
    return caches.match('/offline.html');
  }
}

// Network-first strategy - for API and dynamic content
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network-first fallback to cache:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Network-first with offline page fallback - for HTML pages
// HTML pages are NEVER cached — always served fresh from network
async function networkFirstWithOffline(request, cacheName) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-store' });
    // Do NOT cache HTML responses — return directly
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, checking cache or offline page');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Return offline page for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match(OFFLINE_URL) || new Response(getOfflineHTML(), {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    return new Response('Offline', { status: 503 });
  }
}

// Helper functions
function isStaticAsset(pathname) {
  return /\.(js|css|svg|woff2?|ttf|eot)$/.test(pathname) ||
         pathname.includes('/icons/') ||
         pathname.includes('/images/');
}

function isImage(request) {
  return request.headers.get('accept')?.includes('image/') ||
         /\.(png|jpg|jpeg|gif|webp|ico|avif)$/.test(request.url);
}

function isAPIRequest(pathname) {
  return pathname.startsWith('/api/');
}

// Background sync for trade actions (when back online)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-trades') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncTrades());
  }
});

async function syncTrades() {
  // Get pending trades from IndexedDB and sync them
  try {
    const db = await openDB();
    const tx = db.transaction('pendingTrades', 'readonly');
    const store = tx.objectStore('pendingTrades');
    const pendingTrades = await getAllFromStore(store);
    
    for (const trade of pendingTrades) {
      try {
        await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trade)
        });
        // Remove from pending after successful sync
        await removeFromStore(db, 'pendingTrades', trade.id);
      } catch (e) {
        console.error('[SW] Failed to sync trade:', e);
      }
    }
  } catch (e) {
    console.error('[SW] Sync failed:', e);
  }
}

// IndexedDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('algocdk-db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingTrades')) {
        db.createObjectStore('pendingTrades', { keyPath: 'id' });
      }
    };
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function removeFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Push notifications handler
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification from Algocdk',
      icon: '/icons/icon-192x192.svg',
      badge: '/favicon.svg',
      vibrate: [100, 50, 100],
      tag: data.tag || 'algocdk-notification',
      renotify: true,
      data: {
        url: data.url || '/app',
        timestamp: Date.now()
      },
      actions: [
        { action: 'open', title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Algocdk', options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes('/app') && 'focus' in client) {
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              data: event.notification.data
            });
            return;
          }
        }
        // Open new window
        if (clients.openWindow) {
          clients.openWindow(event.notification.data.url || '/app');
        }
      })
  );
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      return Promise.all(names.map((name) => caches.delete(name)));
    }).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

// Offline HTML template
function getOfflineHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Offline - Algocdk</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0A0E1A 0%, #1a1f2e 100%);
      color: #E2E8F0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      text-align: center;
    }
    .icon { font-size: 80px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin-bottom: 12px; color: #FF4500; }
    p { color: #9ca3af; margin-bottom: 24px; max-width: 300px; line-height: 1.6; }
    button {
      background: #FF4500;
      color: white;
      border: none;
      padding: 14px 32px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, background 0.2s;
    }
    button:hover { background: #ff5722; transform: scale(1.05); }
    .signal {
      position: fixed;
      bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #9ca3af;
      font-size: 14px;
    }
    .signal::before {
      content: '';
      width: 8px;
      height: 8px;
      background: #FF4500;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  </style>
</head>
<body>
  <div class="icon">📡</div>
  <h1>You're Offline</h1>
  <p>Please check your internet connection and try again. Your data is saved locally.</p>
  <button onclick="window.location.reload()">Retry</button>
  <div class="signal">Algocdk will sync when online</div>
</body>
</html>`;
}
