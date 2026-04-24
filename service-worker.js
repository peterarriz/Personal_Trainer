const STATIC_CACHE = __FORMA_STATIC_CACHE__;
const RUNTIME_CACHE = __FORMA_RUNTIME_CACHE__;
const APP_SHELL = __FORMA_APP_SHELL__;
const STATIC_ASSET_PREFIXES = __FORMA_STATIC_ASSET_PREFIXES__;
const SERVICE_WORKER_HOSTNAME = String(self.location?.hostname || "");
const SERVICE_WORKERS_ENABLED =
  SERVICE_WORKER_HOSTNAME === "localhost"
  || SERVICE_WORKER_HOSTNAME === "127.0.0.1"
  || SERVICE_WORKER_HOSTNAME === "[::1]"
  || SERVICE_WORKER_HOSTNAME === "::1";

const clearFormaCaches = () => caches.keys().then((keys) => Promise.all(
  keys
    .filter((key) => /^forma-(static|runtime)-/.test(String(key || "")))
    .map((key) => caches.delete(key))
));

const isStaticAssetRequest = (url) => (
  STATIC_ASSET_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  || APP_SHELL.includes(url.pathname)
);

if (!SERVICE_WORKERS_ENABLED) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      clearFormaCaches()
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", () => {});
} else {
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )).then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put("/index.html", copy));
            }
            return response;
          })
          .catch(async () => {
            const cached = await caches.match("/index.html");
            return cached || caches.match("/");
          })
      );
      return;
    }

    if (isStaticAssetRequest(url)) {
      event.respondWith(
        caches.match(request).then((cached) => (
          cached || fetch(request).then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
        ))
      );
      return;
    }

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  });
}
