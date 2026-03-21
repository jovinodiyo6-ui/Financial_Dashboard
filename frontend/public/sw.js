const SHELL_CACHE = "financepro-shell-v2";
const RUNTIME_CACHE = "financepro-runtime-v2";
const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/pwa-icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("financepro-") && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

const networkFirst = async (request, fallbackToRoot = false) => {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === "basic") {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
      if (fallbackToRoot && request.mode === "navigate") {
        const shellCache = await caches.open(SHELL_CACHE);
        shellCache.put("/", response.clone());
      }
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackToRoot) {
      const shell = await caches.match("/");
      if (shell) {
        return shell;
      }
    }
    throw new Error("offline");
  }
};

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, true));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached && url.pathname.startsWith("/assets/")) {
        return cached;
      }
      return networkFirst(event.request).catch(() => cached);
    })
  );
});
