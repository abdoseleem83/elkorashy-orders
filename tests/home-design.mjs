// تصميم الشاشة الرئيسية والتنقل: تباين الاسم، أيقونة «الرئيسية»، علامة +، عرض الكمبيوتر، وترقيم الخطوات
// التشغيل: node tests/home-design.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const errors = [];
const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

async function open(vp, theme){
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers:'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('**/script.google.com/**', async route=>{
    const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
    const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
    let p;
    if(action==='catalog') p={items:[{name:'حلق ابيض',main:'قطاعات PVC كومبن',sub:'كومبن ابيض',unit:4,product:'حلق كومبن',color:'ابيض',price:100,available:true,inStock:true,stock:40}],discounts:{}};
    else if(action==='login') p={ok:true,username:'test',distName:'محاسب',distRegion:'طنطا',distPhone:'01000000001',distType:'موزع',token:'FAKE.TOKEN'};
    else if(action==='lookup'||action==='myOrders') p=[]; else p={ok:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
  });
  await page.addInitScript(t=>{ try{ localStorage.setItem('theme',t); localStorage.setItem('qurashi_theme',t); }catch(e){} }, theme);
  await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
  const b = await page.$('[data-act="bypass-install"]'); if(b) await b.click();
  await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','secret');
  await page.click('[data-act="login-submit"]'); await page.waitForTimeout(1000);
  return { ctx, page };
}
const rgb = c => (c.match(/\d+/g)||[]).slice(0,3).join(',');

for(const theme of ['light','dark']){
  const { ctx, page } = await open({width:1280,height:900}, theme);
  const r = await page.evaluate(()=>{
    const cs=(el,p)=>el?getComputedStyle(el)[p]:null;
    const app=document.querySelector('#app').getBoundingClientRect();
    return { theme: document.documentElement.getAttribute('data-theme'),
      name: cs(document.querySelector('.homehero h2'),'color'),
      icon: cs(document.querySelector('.bn.on .bn-ic'),'color'),
      appW: Math.round(app.width),
      tiles: new Set([...document.querySelectorAll('.hometile')].map(t=>Math.round(t.getBoundingClientRect().top))).size };
  });
  ok(`[${theme}] اسم المستخدم في الكارت الأزرق أبيض`, rgb(r.name)==='255,255,255', r.name);
  ok(`[${theme}] أيقونة «الرئيسية» النشطة بيضا`, rgb(r.icon)==='255,255,255', r.icon);
  ok(`[${theme}] الشاشة الرئيسية في عمود ≤ 980px على الكمبيوتر`, r.appW<=980, r.appW+'px');
  ok(`[${theme}] البلاطات التلاتة في صف واحد`, r.tiles===1, String(r.tiles));
  await ctx.close();
}

{ // شاشة «طلب جديد» على الكمبيوتر
  const { ctx, page } = await open({width:1280,height:900}, 'light');
  await page.evaluate(()=>{ state.warehouse='طنطا'; state.view='order'; render(); }); await page.waitForTimeout(500);
  const r = await page.evaluate(()=>({
    appW: Math.round(document.querySelector('#app').getBoundingClientRect().width),
    fab: getComputedStyle(document.querySelector('.bn-fab .fab-btn')).color,
    nums: [...document.querySelectorAll('#app .card h2 .num')].map(n=>n.textContent.trim()) }));
  ok('طلب جديد: العرض ≤ 980px على الكمبيوتر', r.appW<=980, r.appW+'px');
  ok('علامة + بيضا حتى والصفحة مفتوحة', rgb(r.fab)==='255,255,255', r.fab);
  ok('أرقام الخطوات متسلسلة من غير فجوات', r.nums.length>0 && r.nums.every((n,i)=>n===String(i+1)), r.nums.join(','));
  await ctx.close();
}
{ // الموبايل: الرئيسية سليمة
  const { ctx, page } = await open({width:412,height:860}, 'light');
  const r = await page.evaluate(()=>({ name:getComputedStyle(document.querySelector('.homehero h2')).color,
    icon:getComputedStyle(document.querySelector('.bn.on .bn-ic')).color,
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  ok('موبايل: الاسم أبيض والأيقونة ظاهرة', rgb(r.name)==='255,255,255' && rgb(r.icon)==='255,255,255');
  ok('موبايل: مفيش تمرير أفقي', r.over<=1, String(r.over));
  await ctx.close();
}
ok('مفيش أخطاء جافاسكريبت', errors.length===0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
