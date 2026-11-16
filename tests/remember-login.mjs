// «افضل مسجّل دخول»: الموزع ميكتبش الاسم والباسورد كل ما التطبيق يتقفل ويتفتح
// التشغيل: node tests/remember-login.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const ok = (n,c,x='')=>{ console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport:{width:412,height:860}, serviceWorkers:'block' });
const page = await ctx.newPage();
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', async route=>{
  const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
  const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
  let p; if(action==='catalog') p={items:[],discounts:{}}; else if(action==='login') p={ok:true,username:'test',distName:'فرع طنطا',distRegion:'طنطا',distPhone:'010',distType:'موزع',token:'T.OK'}; else if(action==='lookup'||action==='myOrders') p=[]; else p={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
});
const open = async()=>{ await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700); const b=await page.$('[data-act="bypass-install"]'); if(b) await b.click(); await page.waitForTimeout(300); };
const login = async()=>{ await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','secret'); await page.click('[data-act="login-submit"]'); await page.waitForTimeout(1200); };
const closeApp = async()=>{ await page.evaluate(()=>sessionStorage.clear()); };   // قفل التطبيق فعليًا (الـ sessionStorage بيتمسح)

await open();
ok('خانة «افضل مسجّل دخول» ظاهرة ومفعّلة افتراضيًا', await page.evaluate(()=>!!document.querySelector('.rememberrow .rchk.on')));
await login();
ok('الدخول نجح', await page.evaluate(()=>!!state.currentUser));
await closeApp(); await open();
ok('بعد قفل التطبيق وفتحه: لسه داخل من غير ما يكتب حاجة', await page.evaluate(()=>!!state.currentUser && state.currentUser.username==='test'));
// خروج صريح = يتمسح الحفظ
await page.evaluate(()=>{ document.querySelector('[data-act="toggle-tools"]').click(); });
await page.evaluate(()=>{ const b=document.querySelector('[data-act="logout"]'); if(b) b.click(); else { state.currentUser=null; } }); await page.waitForTimeout(300);
await closeApp(); await open();
ok('بعد «خروج» وفتح التطبيق: بيطلب الدخول تاني', await page.evaluate(()=>!state.currentUser));
ok('اسم المستخدم متكتب لوحده في الخانة (الباسورد لأ)', await page.evaluate(()=>document.querySelector('[data-act="auth-username"]').value==='test' && document.querySelector('[data-act="auth-password"]').value===''));
// لو شال العلامة: مبيتحفظش
await page.click('[data-act="toggle-remember"]'); await page.waitForTimeout(200);
await login();
await closeApp(); await open();
ok('من غير «افضل مسجّل دخول»: بيطلب الدخول بعد قفل التطبيق', await page.evaluate(()=>!state.currentUser));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
