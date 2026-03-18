self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("financepro-shell-v1").then((cache) =>
      cache.addAll(["/", "/manifest.webmanifest", "/pwa-icon.svg"])
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const responseClone = response.clone();
          caches.open("financepro-runtime-v1").then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});
