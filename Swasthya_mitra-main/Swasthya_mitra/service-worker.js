const CACHE_NAME = 'swasthya-mitra-v2';
const ASSETS = [
  'index.html','style.css','app.js','manifest.json',
  'data/symptoms.json','icons/icon-192.png','icons/icon-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : null)
    ))
  );
});

self.addEventListener('fetch', ev => {
  ev.respondWith(
    caches.match(ev.request).then(cached => {
      if (cached) return cached;
      return fetch(ev.request).catch(() => {
        if (ev.request.url.endsWith('data/symptoms.json')) {
          return caches.match('data/symptoms.json');
        }
      });
    })
  );
});
