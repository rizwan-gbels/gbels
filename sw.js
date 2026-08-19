// GBELS Service Worker - offline caching with external libraries support
// GitHub Pages variant: this copy serves the app at a fixed filename
// (index.html) that never changes between builds, so only CACHE_NAME
// needs to be bumped on every new build — don't mix this with the
// Termux/local variant (which serves a build-numbered filename like
// GBELS_BUILD726.html and must bump both the filename and CACHE_NAME
// together). The app forces an update check immediately
// (instead of waiting ~24h) and fetches the HTML/manifest network-first,
// so once you DO open the current URL, you'll never see stale content
// sitting behind an old cache.
const CACHE_NAME = 'gbels-v823';
const LIBRARY_CACHE = 'gbels-libraries-v1';
const FILES_TO_CACHE = [
  '/gbels/index.html',
  '/gbels/manifest.json',
  '/gbels/icon-192.png',
  '/gbels/icon-512.png'
];
const EXTERNAL_LIBRARIES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js'
];

// Install: pre-cache the app shell and external libraries
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE)),
      caches.open(LIBRARY_CACHE).then((cache) => {
        return Promise.all(
          EXTERNAL_LIBRARIES.map(url => 
            fetch(url).then(response => {
              if(response.status === 200) {
                return cache.put(url, response.clone());
              }
            }).catch(() => {})
          )
        );
      })
    ])
  );
  self.skipWaiting();
});

// Activate: clean up old caches from previous BUILD versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== LIBRARY_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: NETWORK-FIRST for the app page/manifest, so the installed web app
// always shows the latest build the instant it's online — it only falls
// back to the last cached copy when there's no network at all. Static icons
// rarely change, so those stay cache-first (instant, and they're tiny
// anyway). External libraries use cache-first with network fallback.
// This is the other half of the "old build kept showing" fix: even
// if the service worker itself hasn't updated yet, this still serves fresh
// HTML whenever the device has internet access.
const _gbelsNetworkFirstPaths = ['index.html', 'manifest.json'];
function _gbelsIsNetworkFirst(request){
  if(request.mode === 'navigate') return true;
  return _gbelsNetworkFirstPaths.some((p) => request.url.indexOf(p) !== -1);
}
function _gbelsIsExternalLibrary(url){
  return EXTERNAL_LIBRARIES.some(lib => url.includes(lib));
}
self.addEventListener('fetch', (event) => {
  // External libraries: cache-first, fallback to network
  if(_gbelsIsExternalLibrary(event.request.url)){
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if(cached) return cached;
        return fetch(event.request).then((response) => {
          if(event.request.method === 'GET' && response.status === 200){
            const clone = response.clone();
            caches.open(LIBRARY_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }
  
  // App pages: network-first
  if(_gbelsIsNetworkFirst(event.request)){
    event.respondWith(
      fetch(event.request).then((response) => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Everything else: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// ══════════════════════════════════════════════════════════════════
// LOCAL PUSH NOTIFICATIONS (BUILD643)
// ══════════════════════════════════════════════════════════════════
// The page (index.html) posts a message here whenever a Notify &
// Alerts item is due and hasn't been shown yet today. This is NOT a real
// server push — it only works while the app's tab is open somewhere
// (foreground or backgrounded), since that's what sends the message.
//
// KNOWN LIMITATION — true push (a notification that arrives even when the
// app/tab is fully closed) needs two things this project doesn't have:
//   1. A push service subscription (Web Push API: PushManager.subscribe()),
//      which requires VAPID keys tied to a specific origin/app identity.
//   2. A backend server that holds that subscription and calls the push
//      service (e.g. FCM/Web Push) to actually trigger the notification
//      at the right time — the service worker alone can't wake itself up
//      on a schedule; something server-side has to push the event in.
// GBELS is intentionally a single offline HTML file with no server
// component (localStorage/IndexedDB only, works with zero internet). A
// GitHub Pages deployment fixes secure-context features like this service
// worker, but GitHub Pages is a static host with no backend of its own —
// it can't run a persistent server to trigger scheduled push events either.
// Until then, the "app tab open somewhere" approach above is the closest
// achievable equivalent.
//
// اردو نوٹ: مکمل بند ایپ پر بھی نوٹیفیکیشن پہنچانے کے لیے ایک ایسا سرور
// درکار ہے جو ہر وقت پس منظر میں چلتا رہے اور مقررہ وقت پر پش سروس کو خود
// اطلاع بھیجے — چونکہ GBELS بغیر سرور کے صرف ایک HTML فائل کے طور پر چلتی
// ہے، اس لیے فی الحال یہی طریقہ (ٹیب کھلا ہونے پر نوٹیفیکیشن) دستیاب ہے۔
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'GBELS_SHOW_NOTIFICATION') {
    const opts = {
      body: msg.body || '',
      icon: '/gbels/icon-192.png',
      badge: '/gbels/icon-192.png',
      tag: msg.tag || 'gbels-alert',
      renotify: false,
      data: { url: msg.url || '/gbels/' }
    };
    event.waitUntil(self.registration.showNotification(msg.title || 'GBELS Gehal Pur', opts));
  }
});

// Tapping a notification focuses the already-open app tab if there is one,
// otherwise opens a new one — instead of just dismissing and doing nothing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/gbels/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
