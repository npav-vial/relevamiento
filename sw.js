// Service worker: guarda la app en el celular para que abra y funcione sin señal.
// Al publicar una versión nueva de la app, subí el número de VERSION para que los celulares la actualicen.
const VERSION = 'v3.25-2';
const APP = 'relev-app-' + VERSION;      // la app y sus librerías
const MAPA = 'relev-mapa';               // baldosas del mapa ya vistas (se conservan entre versiones)
const MAX_BALDOSAS = 600;

const ARCHIVOS_APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './iconos/icon-192.png',
  './iconos/icon-512.png',
  './iconos/icon-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/favicon-32.png'
];
const LIBRERIAS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await c.addAll(ARCHIVOS_APP);
    // Las librerías se guardan una por una: si alguna falla, la app igual se instala
    await Promise.all(LIBRERIAS.map(u => c.add(new Request(u, {mode: 'cors'})).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n.startsWith('relev-app-') && n !== APP).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function recortarMapa() {
  const c = await caches.open(MAPA);
  const ks = await c.keys();
  for (let i = 0; i < ks.length - MAX_BALDOSAS; i++) await c.delete(ks[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Búsqueda de dirección (Nominatim): siempre por internet, nunca se guarda
  if (url.hostname.includes('nominatim')) return;

  // La app: primero internet (para recibir actualizaciones), si no hay señal, la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(APP);
        c.put('./index.html', r.clone());
        return r;
      } catch (_) {
        return (await caches.match('./index.html', {ignoreSearch: true})) || (await caches.match('./'));
      }
    })());
    return;
  }

  // Baldosas del mapa: la guardada si existe; si no, internet y se guarda
  if (url.hostname.includes('arcgisonline.com')) {
    e.respondWith((async () => {
      const c = await caches.open(MAPA);
      const g = await c.match(req);
      if (g) return g;
      try {
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); recortarMapa(); }
        return r;
      } catch (_) {
        return new Response('', {status: 504});
      }
    })());
    return;
  }

  // Librerías y archivos de la app: primero la copia guardada
  e.respondWith((async () => {
    const g = await caches.match(req, {ignoreSearch: url.origin === self.location.origin});
    if (g) return g;
    try {
      const r = await fetch(req);
      if (r.ok && (url.origin === self.location.origin || LIBRERIAS.includes(req.url))) {
        const c = await caches.open(APP);
        c.put(req, r.clone());
      }
      return r;
    } catch (_) {
      return new Response('', {status: 504});
    }
  })());
});
