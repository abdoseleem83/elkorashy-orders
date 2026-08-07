// ⚠️ مهم: غيّر رقم النسخة دي في كل مرة ترفع تحديث جديد.
// ده اللي بيخلي المتصفح يرمي الكاش القديم ويجيب الملفات الجديدة.
const CACHE_VERSION = 'v171';
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
      .then(cache => Promise.all(
        PRECACHE.map(u => fetch(u, { cache: 'no-store' })
          .then(r => (r && r.ok) ? cache.put(u, r) : null)
          .catch(() => null))
      ))
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


// ===== Push Notification Handler =====
self.addEventListener('push', (event) => {
  let data = { title: '🔔 القرشي', body: 'إشعار جديد' };
  try{ if(event.data) data = event.data.json(); }catch(e){}
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 القرشي', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      dir: 'rtl',
      lang: 'ar',
      tag: data.tag || 'elkorashy-push',
      renotify: true,
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(clients => {
      for(const c of clients){ if(c.url.includes('index.html') || c.url.endsWith('/')){ c.focus(); return; } }
      return self.clients.openWindow(url);
    })
  );
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
    // ✅ Network-first للـ HTML: ده اللي يضمن إن أي تحديث بترفعه يوصل للناس فورًا
    // (بدل ما الكاش يرجّع نسخة index.html قديمة).
    event.respondWith((async () => {
      try {
        // 🔑 طبقتين لازم نتخطاهم مع بعض عشان التحديث يوصل:
        //  ١) كاش المتصفح المحلي  → بنتخطاه بـ cache:'no-store'
        //  ٢) كاش CDN بتاع GitHub Pages (Fastly) → ده مابيتأثرش بـ no-store لأنه
        //     بره الجهاز أصلًا، وبيفضل يرجّع النسخة القديمة لحد ما مدته تخلص.
        //     الحل الوحيد المضمون: نضيف باراميتر فريد للرابط، فيبقى "رابط جديد"
        //     مالوش نسخة مخزّنة عند الـ CDN فيجيبه من السيرفر مباشرة.
        //     (نفس الحل المجرّب في تطبيق الأبواب — كان ناقص هنا وده كان سبب
        //     بطء وصول التحديثات.)
        const bust = url.pathname + '?_v=' + Date.now();
        let fresh;
        try {
          fresh = await fetch(bust, { cache: 'no-store' });
          if (!fresh || !fresh.ok) throw new Error('bad');
        } catch (e1) {
          fresh = await fetch(req, { cache: 'no-store' });   // احتياطي
        }
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
