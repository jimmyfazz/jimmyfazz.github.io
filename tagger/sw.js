// Keeps the page on the phone so it opens without signal at the pitch. Only this page's own files; nothing else.
// Bump VERSION whenever a file here changes (tools/publish_tagger.sh checks it), so phones pick up the new copy.
const VERSION = "pitchreel-tagger-2";
const FILES = ["./", "./index.html", "./app.js", "./tagger.js", "./manifest.webmanifest", "./icon-192.png",
  "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// the copy on the phone first (instant, works offline); a newer copy is fetched in the background when there's signal
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await fresh) || c.match("./index.html");
  }));
});
