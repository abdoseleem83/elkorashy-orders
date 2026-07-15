// ⚠️ مهم: غيّر رقم النسخة دي في كل مرة ترفع تحديث جديد.
// ده اللي بيخلي المتصفح يرمي الكاش القديم ويجيب الملفات الجديدة.
const CACHE_VERSION = 'v51';
const CACHE_NAME = 'elkorashy-' + CACHE_VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  // 🔑 دي أهم سطر في الملف: النسخة الجديدة بتفرض نفسها فورًا من غير ما تستنى
  // إذن من الصفحة ولا تستنى التابات تتقفل. ده اللي بيخرّج الأجهزة العالقة على
  // نسخة قديمة من غير ما المستخدم يعمل أي حاجة.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // امسح كل الكاشات القديمة بتاعة النسخ السابقة
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('elkorashy-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    );
    // خد السيطرة على كل الصفحات المفتوحة فورًا من غير ما تستنى إعادة فتح
    await self.clients.claim();

    // اقفل/حدّث كل الصفحات المفتوحة عشان تشتغل بالكود الجديد على طول.
    // النسخ القديمة من index.html مش بتعرف تعمل reload لوحدها، فبنعملهولها احنا.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      if ('navigate' in client) client.navigate(client.url).catch(() => {});
    });
  })());
});

// الصفحة بتبعتلنا الرسالة دي أول ما تلاقي نسخة جديدة مستنية،
// فبنشتغل على طول بدل ما نفضل في حالة waiting لأجل غير مسمى.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // مانتدخلش خالص في نداءات Apps Script — لازم تروح للنت دايمًا
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // ✅ Network-first للـ HTML: ده اللي يضمن إن أي تحديث بترفعه يوصل للناس فورًا.
    // (المشكلة القديمة: الكاش كان بيرجّع نسخة index.html القديمة على طول.)
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        // مفيش نت → رجّع آخر نسخة متخزنة عشان التطبيق يفضل شغال أوفلاين
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // باقي الملفات (مكتبات، أيقونات...): stale-while-revalidate
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        caches.open(CACHE_NAME).then(c => c.put(req, res.clone())).catch(() => {});
      }
      return res;
    }).catch(() => null);
    return cached || network || new Response('', { status: 504 });
  })());
});
