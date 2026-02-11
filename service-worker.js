const CACHE_NAME = "my-app-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/Settings.html",
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/icons/home.png",
  "/icons/settings.png",
  "/icons/dropdown.png"
];

// Install – cache files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Activate – clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      )
    )
  );
});

// Fetch – serve from cache first
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
