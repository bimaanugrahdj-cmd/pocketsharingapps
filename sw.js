// Service worker: menyimpan tampilan aplikasi agar terbuka cepat dan tetap muncul saat sinyal buruk.
// Data pengeluaran TIDAK disimpan di sini; selalu diambil dari Supabase.
// Setelah mengubah berkas aplikasi lalu deploy ulang, naikkan angka VERSION agar ponsel mengambil versi baru.
const VERSION = 'pocketnt-v4';

const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/api.js',
  'js/util.js',
  'js/charts.js',
  'js/pdf.js',
  'js/config.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return; // Supabase dan lainnya: langsung ke jaringan

  // Pakai salinan tersimpan dulu, sambil memperbarui salinannya di latar belakang.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
