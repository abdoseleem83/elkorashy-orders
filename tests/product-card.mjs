// كارت الصنف (اتجاه أ): دواير الألوان + اختيار أكتر من لون + «متاح N · غير متوفر» بأعداد حقيقية + كروت القطاعات + بحث الرئيسية
// التشغيل: node tests/product-card.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const errors = [];
const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext({ viewport:{width:412,height:900}, serviceWorkers:'block' })).newPage();
page.on('pageerror', e => errors.push(e.message));
const mk=(main,sub,product,color,stock,avail=true)=>({name:product+' '+color,main,sub,unit:4,product,color,price:100,available:avail,inStock:stock>0,stock});
const K='قطاعات PVC كومبن';
const CAT=[
  mk(K,'كومبن ابيض','حلق كومبن','ابيض',40), mk(K,'كومبن بيج','حلق كومبن','بيج',0), mk(K,'كومبن رمادي','حلق كومبن','رمادي',30),
  mk(K,'كومبن ابيض','سقاس مفصلي','ابيض',3),            // أقل من لفة = «قليل»
  mk(K,'كومبن ابيض','ضلفة مفصلي','ابيض',0),            // مفيش رصيد خالص = غير متوفر
  mk('قطاعات كرافت لاين','كرافت','حلق كرافت','ابيض',50)
];
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', async route=>{
  const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
  const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
  let p;
  if(action==='catalog') p={items:CAT,discounts:{}};
  else if(action==='login') p={ok:true,username:'test',distName:'فرع طنطا',distRegion:'طنطا',distPhone:'01000000001',distType:'موزع',token:'FAKE.TOKEN'};
  else if(action==='lookup'||action==='myOrders') p=[]; else p={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
});
await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
const b = await page.$('[data-act="bypass-install"]'); if(b) await b.click();
await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','secret');
await page.click('[data-act="login-submit"]'); await page.waitForTimeout(1500);
await page.evaluate(()=>{ state.warehouse='طنطا'; render(); }); await page.waitForTimeout(300);

// ── كروت القطاعات: أعداد حقيقية (٢ متاح، ١ غير متوفر)
const tiles = await page.$$eval('.homesectors .sectile', e=>e.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
ok('كارت كومبن: «3 أصناف · متاح 2 · غير متوفر 1»', tiles.some(t=>/قطاعات PVC كومبن\s*3 أصناف · متاح 2 · غير متوفر 1/.test(t)), tiles.join(' | '));

// ── بحث الرئيسية
await page.fill('[data-act="home-search"]','سقاس'); await page.waitForTimeout(300);
ok('البحث بيلاقي «سقاس مفصلي»', (await page.$$('.hres')).length===1);
await page.click('.hres'); await page.waitForTimeout(400);
let st = await page.evaluate(()=>({view:state.view, main:state.mainGroup, q:state.productSearch}));
ok('نتيجة البحث بتفتح القطاع وبتحط الاسم في بحثه', st.view==='order' && st.main===K && st.q==='سقاس مفصلي', JSON.stringify(st));
await page.evaluate(()=>{ state.productSearch=''; state.staged=[]; render(); }); await page.waitForTimeout(300);

// ── كارت «حلق كومبن»: ٣ دواير + سطر المتاح/غير المتوفر
const card = async n => page.evaluate(n=>{ const c=[...document.querySelectorAll('.pcard')].find(x=>x.querySelector('.pc-name').textContent.trim()===n); return c ? { dots:c.querySelectorAll('.cdot').length, on:c.querySelectorAll('.cdot.on').length, av:(c.querySelector('.pavail')||{}).textContent||'' } : null; }, n);
let c1 = await card('حلق كومبن');
ok('٣ دواير ألوان جوه الكارت', c1 && c1.dots===3, JSON.stringify(c1));
ok('«متاح · 70 في المخزن» + «غير متوفر: بيج»', c1 && /متاح · 70 في المخزن/.test(c1.av) && /غير متوفر: بيج/.test(c1.av), c1 && c1.av);
ok('«سقاس مفصلي» قليل: «قليل · 3 بس»', /قليل · 3 بس/.test((await card('سقاس مفصلي')).av));
ok('«ضلفة مفصلي» غير متوفر', /^غير متوفر$/.test((await card('ضلفة مفصلي')).av.trim()));

// ── اختيار أكتر من لون: دايرتين → علامة ✓ + صفين كمية
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="ابيض"]'); await page.waitForTimeout(250);
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="رمادي"]'); await page.waitForTimeout(250);
c1 = await card('حلق كومبن');
ok('دايرتين مختارتين عليهم ✓', c1.on===2 && (await page.$$eval('.cdot.on i', e=>e.every(x=>x.textContent.trim()==='✓'))));
ok('صف كمية لكل لون مختار (٢) وزرار «ضيف للسلة» واحد', (await page.$$('.inlinemulticolor .qty3')).length===2 && (await page.$$('.inlinemulticolor [data-act="confirm-staged"]')).length===1);
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="رمادي"]'); await page.waitForTimeout(250);
ok('دوسة تانية على الدايرة بتشيل اللون', (await card('حلق كومبن')).on===1);
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="رمادي"]'); await page.waitForTimeout(250);
// كميات وإضافة للسلة
await page.fill('.inlinemulticolor [data-act="staged-qty-input"][data-val="ابيض"]','2');
await page.fill('.inlinemulticolor [data-act="staged-qty-input"][data-val="رمادي"]','3');
await page.click('.inlinemulticolor [data-act="confirm-staged"]'); await page.waitForTimeout(400);
st = await page.evaluate(()=>state.cart.map(c=>c.color+':'+c.qty).sort());
ok('اتضاف اللونين بكمياتهم للسلة', st.length===2 && st.includes('ابيض:2') && st.includes('رمادي:3'), JSON.stringify(st));

// ── فلتر اللون الاختياري («الكل» + ألوان) بيقلّل الأصناف
await page.click('[data-act="set-color"][data-val="بيج"]'); await page.waitForTimeout(250);
ok('فلتر «بيج»: صنف واحد بس', (await page.$$('.pcard')).length===1);
await page.click('[data-act="set-color"][data-val=""]'); await page.waitForTimeout(250);
ok('«الكل» بيرجّع كل الأصناف', (await page.$$('.pcard')).length===3);
ok('مفيش أخطاء جافاسكريبت', errors.length===0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
