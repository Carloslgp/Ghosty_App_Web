// Service worker do app de notas: guarda o shell e o remote das notas, para o app abrir rápido e
// funcionar sem rede. Só entra no cache o que está na lista: nada da API e nada da outra área do app
// (o remote dela fica em outra origem e nunca é interceptado).
const VERSION = 'notas-v1';
const NOTES_ORIGIN = new URL(self.location.href).searchParams.get('notes') || '';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/** `navigate`: rede primeiro, com o index.html guardado como reserva. `cache`: responde do cache e atualiza. */
function strategyFor(request) {
  if (request.method !== 'GET') return 'network';
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js') return 'network';
    return request.mode === 'navigate' ? 'navigate' : 'cache';
  }
  if (NOTES_ORIGIN && url.origin === NOTES_ORIGIN) return 'cache';
  return 'network';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('/index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || fresh;
}

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request);
  if (strategy === 'navigate') event.respondWith(networkFirst(event.request));
  else if (strategy === 'cache') event.respondWith(staleWhileRevalidate(event.request));
  // `network`: sem respondWith, o navegador segue sozinho e nada é guardado.
});
