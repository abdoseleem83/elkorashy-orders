// ⚠️ مهم: غيّر رقم النسخة دي في كل مرة ترفع تحديث جديد.
// ده اللي بيخلي المتصفح يرمي الكاش القديم ويجيب الملفات الجديدة.
// 🔑 الرقم ده لازم يطابق APP_BUILD في index.html و APP_VERSION في apps_script.gs.
const CACHE_VERSION = 'v200';
const CACHE_NAME = 'elkorashy-' + CACHE_VERSION;

// الملفات اللي بتتحمّل إجباري وقت تثبيت النسخة — خليها **أقل حاجة ممكنة**.
//
// 🐞 غلطة اتصلحت: كنا حاطين vendor/ (١.٥ ميجا) والكتالوج الاحتياطي (٢٢٦ كيلو)
// هنا. النتيجة إن كل مستخدم كان بيتحمّل **٢ ميجا** أول ما يفتح التطبيق بعد أي
// تحديث — حتى لو عمره ما هيعمل PDF ولا إكسل. وده كان بيخلي الفتح تقيل جدًا
// على النت الضعيف، وبيلغي فايدة إننا خلّينا المكتبات تتحمّل عند الطلب أصلاً.
//
// دلوقتي: الأساسيات بس (٤٣٠ كيلو). وباقي الملفات بتتخزّن **أول مرة تتستخدم
// فعلاً** عن طريق الـ cache-first تحت — يعني أول PDF بيتعمل وانت أونلاين
// بيخزّن المكتبة، وبعدها تشتغل أوفلاين عادي.
const PRECACHE = [
  './',
  './manifest.json',
  './logo.jpg'
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

    // ⚠️ قبل كده كنا بنعمل client.navigate() لكل تاب مفتوح هنا — يعني الصفحة
    // بتتحدّث تحت إيد المستخدم فجأة. لو كان بيكتب طلب، الشاشة بتتقلب قدامه.
    // دلوقتي بنبعت رسالة للصفحة بس، وهي اللي بتقرر إمتى تعمل reload (index.html
    // فيه معالج controllerchange بيعرض رسالة الأول وبيحمي من حلقة تحديث
    // لا نهائية). النسخ القديمة جدًا اللي مافيهاش المعالج ده هتاخد التحديث
    // في أول فتح جديد للتطبيق — وده مقبول تمامًا مقابل إننا مانضيعش شغل حد.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      try { client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION }); } catch (e) {}
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
// ⚠️ الإشعارات دي متوقفة حاليًا من ناحية السيرفر (شوف الشرح في apps_script.gs) —
// المعالج سايبينه شغال عشان لو ربطنا خدمة إشعارات حقيقية بعدين (FCM مثلاً)
// يشتغل على طول من غير تعديل.
self.addEventListener('push', (event) => {
  let data = { title: '🔔 القرشي', body: 'إشعار جديد' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 القرشي', {
      body: data.body || '',
      // 🐞 المسارات دي كانت './icons/icon-192.png' و './icons/icon-96.png' —
      // مفيش فولدر اسمه icons أصلاً، والأيقونات في جذر المشروع مباشرة،
      // و icon-96 مش موجود خالص. يعني الإشعار كان يطلع من غير أي أيقونة.
      icon: './icon-192.png',
      badge: './icon-192.png',
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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) { if (c.url.includes('index.html') || c.url.endsWith('/')) { c.focus(); return; } }
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
        return cached || caches.match('./index.html') || caches.match('./');
      }
    })());
    return;
  }

  // باقي الملفات (المكتبات، الأيقونات، الكتالوج الاحتياطي): cache-first.
  // ⚠️ الملفات دي كلها مربوطة بالنسخة (الكاش بيتمسح كله مع كل نسخة جديدة)،
  // فالقراءة من الكاش الأول آمنة وأسرع بكتير — خصوصًا للمكتبات اللي حجمها
  // ١.٥ ميجا. التحديث بيجي مع تغيير CACHE_VERSION.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // 🐞 الشرط القديم كان res.type === 'basic' — وده بيستبعد أي ملف من
      // دومين تاني، يعني مكتبات الـ CDN مكانتش بتتخزّن أبدًا. بقت محلية
      // دلوقتي، بس بنسيب الشرط واسع عشان أي ملف خارجي يتخزّن برضه.
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
