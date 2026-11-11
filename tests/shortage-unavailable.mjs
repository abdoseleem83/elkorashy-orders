// صورة نواقص الطلب: الصنف غير المتوفر لازم يتعلّم بالأحمر + شارة «غير متوفر» + سطر تنبيه تحت
// التشغيل: node tests/shortage-unavailable.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const errors = [];
const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport:{width:420,height:900}, serviceWorkers:'block' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', async route=>{
  const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
  const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
  let p;
  if(action==='catalog') p={items:[],discounts:{}};
  else if(action==='login') p={ok:true,username:'test',distName:'محاسب',distRegion:'طنطا',distPhone:'01000000001',distType:'موزع',token:'FAKE.TOKEN'};
  else if(action==='lookup'||action==='myOrders') p=[]; else p={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
});
await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
const b = await page.$('[data-act="bypass-install"]'); if(b) await b.click();
await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','secret');
await page.click('[data-act="login-submit"]'); await page.waitForTimeout(900);

const r = await page.evaluate(async () => {
  await ensureLibs_('html2canvas');
  const cap = []; const real = window.html2canvas;
  window.html2canvas = (el, o) => { cap.push(el.innerHTML); return real(el, o); };
  const key = Object.keys(SHORTAGE_IMG_GROUPS_)[0], main = SHORTAGE_IMG_GROUPS_[key].mains[0];
  const mk = (name, un, qty) => ({ main, product: name, name, color: 'ابيض', unitType: 'لفة', qty, unavailable: un });
  const order = { id:'t1', ts: Date.now(), warehouse:'طنطا', distName:'x', items: [ mk('صنف متوفر', false, 3), mk('صنف مقفول', true, 2), mk('صنف تاني متوفر', false, 1) ] };
  const blobs = await buildShortageImageGroup(order, key);
  return { n: (blobs||[]).length, html: cap.join('\n') };
});
const count = (re) => (r.html.match(re)||[]).length;
ok('الصورة اتبنت', r.n >= 1, String(r.n));
ok('شارة «غير متوفر» ظهرت مرة واحدة بس (للصنف المقفول)', count(/>غير متوفر</g) === 1, String(count(/>غير متوفر</g)));
ok('صف الصنف غير المتوفر أحمر فاتح مع خط أحمر جنبه', /#FDECEC[^"]*"[^>]*>[\s\S]{0,300}صنف مقفول/.test(r.html) || (/border-right:4px solid #DC2626/.test(r.html) && r.html.includes('صنف مقفول')));
ok('الأصناف المتوفرة من غير تلوين أحمر', !/صنف متوفر[\s\S]{0,40}<\/span>[\s\S]{0,80}غير متوفر/.test(r.html));
ok('سطر التنبيه «1 صنف غير متوفر حاليًا» تحت الورقة', /1 صنف غير متوفر حاليًا/.test(r.html));
ok('مفيش أخطاء جافاسكريبت', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
