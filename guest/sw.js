/* 손님용 오프라인 캐시. 파일을 고치면 VERSION 을 올린다 */
var VERSION = 'guest-v7';
var FONT_CACHE = 'bm-fonts';
var FILES = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  '../shared/base.css',
  '../shared/ui.css',
  '../shared/person-form.js',
  '../shared/ui.js',
  '../shared/bmqr.js',
  '../vendor/lz-string.min.js',
  '../vendor/qrcode.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('guest-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 글꼴(Pretendard CDN): 한 번 받으면 캐시에서 쓴다. 인터넷이 안 되면 시스템 글꼴로 보인다
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(FONT_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // 앱 파일: 인터넷이 되면 새 파일(3초 안에 안 오면 저장해 둔 것), 안 되면 저장해 둔 것
  e.respondWith(caches.open(VERSION).then(function (c) {
    var net = fetch(req).then(function (res) {
      if (res.ok) c.put(req, res.clone());
      return res;
    });
    var cached = function () {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === 'navigate' ? c.match('./index.html') : null);
      });
    };
    var slow = new Promise(function (resolve) { setTimeout(resolve, 3000); }).then(cached);
    return Promise.race([net.catch(cached), slow.then(function (hit) { return hit || net; })]).then(function (res) {
      return res || net.catch(function () { return Response.error(); });
    });
  }));
});
