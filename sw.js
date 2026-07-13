// ====== نظام طلبات القرشي — Service Worker ======
// كل مرة تعمل تعديل في index.html أو أي أصل ثابت، لازم تزوّد رقم النسخة دي.
// النسخة هي اللي بتخلي المتصفح يعتبر الملفات "اتغيرت" ويحمّل تحديث جديد.
const CACHE_VERSION = 'v6'; // 🔴 زوّد الرقم ده مع كل تحديث تنزّله
const CACHE_NAME = 'qurashi-orders-' + CACHE_VERSION;

// أصول ثابتة بسيطة بس (أيقونات / مانيفست) — من غير index.html نفسه عشان التحديثات توصل فورًا
const PRECACHE_URLS = [
  'manifest.json',
  'icon-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // ميستناش تبويبات تانية تقفل، يفعّل نفسه فورًا
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // امسح أي كاش قديم من نسخ سابقة
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim(); // يتحكم في التبويبات المفتوحة فورًا من غير ما يحتاج reload يدوي
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // مايلمسش أي حاجة غير GET (زي POST بتاع حفظ الطلبات على Google Apps Script)
  if (req.method !== 'GET') return;

  // مايتدخلش أبدًا في الدومينات الخارجية (Google Apps Script / Google Fonts / cdnjs...)
  // ده أهم سطر هنا: التدخل في الطلبات دي هو سبب شائع لتعليق الشاشة على "جارٍ..." للأبد
  if (url.origin !== self.location.origin) return;

  // index.html (وأي navigation request زي فتح التطبيق أو الـ PWA): "شبكة الأول"
  // يعني هيحاول ياخد أحدث نسخة من النت، ولو النت فصل ياخد آخر نسخة محفوظة كبديل
  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('index.html')))
    );
    return;
  }

  // باقي الأصول الثابتة بتاعتنا: كاش الأول مع تحديث في الخلفية (stale-while-revalidate)
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// السماح لصفحة التطبيق إنها تطلب من الـ SW الجديد يتفعّل فورًا لو حابة (اختياري)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
