const CACHE = 'draw-monkey-v2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './bgm.mp3',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 音樂檔會用 Range 請求分段讀取；從快取切出需要的那一段回傳（Safari 需要 206 才能播放）
async function rangeResponse(req) {
  const cached = await caches.match(req.url);
  if (!cached) return fetch(req);
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const size = buf.byteLength;
  let start = m && m[1] ? +m[1] : 0;
  let end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.headers.has('range')) { e.respondWith(rangeResponse(e.request)); return; }
  // 網路優先，離線時改用快取
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.status === 200 && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
