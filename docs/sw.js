const CACHE_NAME = "wiselife-library-v2";
const ASSETS = [
    "./",
    "./index.html",
    "./admin.html",
    "./styles.css",
    "./api-config.js",
    "./app.js",
    "./admin.js",
    "./manifest.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (event.request.method === "GET") {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                }
                return response;
            })
            .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
});
