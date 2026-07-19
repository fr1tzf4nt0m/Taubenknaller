/* Taubenknaller – Service Worker
   Macht das Spiel offline lauffähig:
   - App selbst (index.html) wird beim ersten Besuch gespeichert
   - Street-View- und Wikimedia-Fotos werden dauerhaft zwischengespeichert,
     sobald sie einmal online geladen wurden (auch ohne CORS, als "opaque response")
*/
const CACHE = 'taubenknaller-v2';
const SHELL = ['./', './index.html', './manifest.json',
               './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // einzeln speichern: fehlt eine Datei, scheitert nicht die ganze Installation
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fotoquellen, die dauerhaft gespeichert werden sollen
const PHOTO_HOSTS = /(maps\.googleapis\.com|upload\.wikimedia\.org|commons\.wikimedia\.org|.*\.wikipedia\.org)$/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // --- Fotos: zuerst Cache, sonst Netz und danach für immer behalten ---
  if (PHOTO_HOSTS.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;                       // offline verfügbar
      try {
        const res = await fetch(req);            // Bild-Requests sind bereits no-cors
        if (res) c.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        return hit || Response.error();          // offline und nie geladen -> Spiel zeichnet Ersatzkulisse
      }
    })());
    return;
  }

  // --- App selbst: Netz bevorzugt (immer aktuell), offline aus dem Cache ---
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res && res.status === 200) c.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        return (await c.match(req)) || (await c.match('./index.html')) || Response.error();
      }
    })());
  }
});
