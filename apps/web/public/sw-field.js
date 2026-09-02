/**
 * Field PWA app-shell cache (docs/08 batch 2.12). Deliberately dumb:
 * no precache manifest to keep in sync with Next.js's hashed build output,
 * just a runtime cache that fills in as the rider actually visits pages
 * while online, so the app (not just data — that's `lib/offline`'s job)
 * still opens with no signal.
 *
 * Scoped to /field/ only (see the registration call in app/field/layout.tsx)
 * — it never touches the ops console or the API origin.
 */
const CACHE_NAME = "ironman-field-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // never touch the API origin
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(event.request)) ||
            (await caches.match("/field")) ||
            new Response("You're offline and this page hasn't been opened before.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
        )
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/field-icon")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
      )
    );
  }
});
