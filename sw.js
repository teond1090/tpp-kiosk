// Kiosk video cache. Videos are stored whole in Cache Storage (the page pre-fetches them in the background),
// then served from the kiosk's own disk — including the byte-range requests a <video> makes — so a product
// video opens instantly and keeps playing even if the booth Wi-Fi drops.
// The cache name comes from the ?v= on the video URLs (see VIDEO_VER in index.html); bump it when videos change.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

function cacheName(url) {
  return "tpp-videos-" + (new URL(url).searchParams.get("v") || "0");
}

// Cache key: the path plus ?v= only (the page may add &r=... to force a fresh media pipeline after an error).
function cacheKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname + "?v=" + (u.searchParams.get("v") || "0");
}

async function fromCache(req) {
  const cache = await caches.open(cacheName(req.url));
  const hit = await cache.match(cacheKey(req.url), { ignoreVary: true });
  if (!hit) return null;
  const range = req.headers.get("range");
  if (!range) return hit;
  const blob = await hit.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? +m[1] : 0;
  let end = m && m[2] ? +m[2] : blob.size - 1;
  if (m && !m[1] && m[2]) { start = blob.size - +m[2]; end = blob.size - 1; }   // suffix range: bytes=-N
  end = Math.min(end, blob.size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${blob.size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || !/\/videos\/[^/]+\.mp4$/.test(url.pathname)) return;
  e.respondWith(fromCache(e.request).then(r => r || fetch(e.request)).catch(() => fetch(e.request)));
});
