const CACHE_PREFIX = 'arkvoid-world-';
const SHELL_CACHE = CACHE_PREFIX + 'shell-v1';
const RUNTIME_CACHE = CACHE_PREFIX + 'runtime-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/posters/manifest.json'];
const STATIC_PATH = /^\/(?:assets|textures|posters|models)\//;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS);
    const manifestResponse = await fetch('/posters/manifest.json', { cache: 'no-cache' }).catch(() => null);
    if (!manifestResponse?.ok) return;
    const manifest = await manifestResponse.clone().json().catch(() => null);
    const posters = Array.isArray(manifest?.posters) ? manifest.posters : [];
    await Promise.allSettled(posters.map(async (path) => {
      if (typeof path !== 'string' || !/^\/posters\/hero-(?:dawn|day|dusk|night)-(?:landscape|portrait)\.webp$/.test(path)) return;
      const response = await fetch(path);
      if (response.ok) await cache.put(path, response);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)));
    // Deliberately do not call skipWaiting() or clients.claim(): an update takes effect on the next load.
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match('/')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok && response.type !== 'opaque') void cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(fresh);
    return cached;
  }
  return (await fresh) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' || url.pathname === '/manifest.webmanifest' || url.pathname === '/posters/manifest.json') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
