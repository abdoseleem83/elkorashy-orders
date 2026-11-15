// التدفق: الرئيسية (طلبك الأخير + أعد الطلب) → السلة → طلباتي (فلاتر/أعد الطلب) → كروت القطاعات وبيانات الموزع المختصرة
// التشغيل: node tests/orders-flow.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const errors = [];
const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext({ viewport:{width:412,height:900}, serviceWorkers:'block' })).newPage();
page.on('pageerror', e => errors.push(e.message));
const mk=(main,sub,product,color,stock)=>({name:product+' '+color,main,sub,unit:4,product,color,price:100,available:stock>0,inStock:stock>0,stock});
const CAT=[mk('قطاعات PVC كومبن','كومبن ابيض','حلق كومبن','ابيض',40),mk('قطاعات كرافت لاين','كرافت ابيض','سقاس مفصلي','ابيض',6),mk('اكسسوارات','سيليكون','سيليكون ماستيك','ابيض',0)];
const now=Date.now(), DAY=86400000;
const O=(id,no,ago,st,items)=>({id,orderNo:no,ts:now-ago*DAY,status:st,warehouse:'طنطا',items});
const it=(p,c,u,q)=>({main:'قطاعات PVC كومبن',product:p,name:p,color:c,unitType:u,qty:q});
const ORDERS=[O('a1',213,2,'جاري تجهيز الطلب',[it('حلق كومبن','ابيض','لفة',4)]), O('a2',209,9,'تم تنفيذ الطلب',[it('حلق كومبن','ابيض','لفة',3),it('باكتة','ابيض','عود',2)]), O('a3',204,16,'تم تنفيذ الطلب',[it('حلق كومبن','ابيض','لفة',2)])];
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', async route=>{
  const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
  const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
  let p;
  if(action==='catalog') p={items:CAT,discounts:{}};
  else if(action==='login') p={ok:true,username:'test',distName:'فرع طنطا',distRegion:'طنطا',distPhone:'01000000001',distType:'موزع',token:'FAKE.TOKEN'};
  else if(action==='lookup'||action==='myOrders') p=ORDERS; else p={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
});
await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
const b = await page.$('[data-act="bypass-install"]'); if(b) await b.click();
await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','secret');
await page.click('[data-act="login-submit"]'); await page.waitForTimeout(1500);

// ── الرئيسية (اتجاه أ): بحث + طلبك الأخير + كروت القطاعات (من غير «اللي بتطلبه كتير»)
ok('مفيش قسم «اللي بتطلبه كتير» ولا شريط إضافة سريعة', (await page.$('.qrow'))===null && (await page.$('.quickbar'))===null);
ok('كارت «طلبك الأخير» = الطلب #213 وفيه خط تقدّم', /#213/.test(await page.$eval('.lastorder', e=>e.textContent)) && (await page.$$('.lastorder .ost')).length===3);
ok('كروت القطاعات على الرئيسية', (await page.$$('.homesectors .sico')).length>=3);
await page.click('.lastorder [data-act="reorder"]'); await page.waitForTimeout(500);
let st = await page.evaluate(()=>({view:state.view, cart:state.cart.map(c=>c.product+':'+c.qty+':'+c.unitType)}));
ok('«أعد الطلب» من الرئيسية ودّى لشاشة الطلب وضاف الأصناف للسلة', st.view==='order' && st.cart.length===1 && st.cart[0]==='حلق كومبن:4:لفة', JSON.stringify(st));

// ── طلباتي: فلاتر + أعد الطلب (من غير تكرار)
await page.evaluate(()=>{ state.view='myorders'; render(); }); await page.waitForTimeout(400);
const count = async()=> (await page.$$('.ordA')).length;
ok('الكل: 3 طلبات', (await count())===3, String(await count()));
await page.click('[data-act="orders-filter"][data-k="active"]'); ok('جاري: طلب واحد', (await count())===1);
await page.click('[data-act="orders-filter"][data-k="done"]'); ok('اتسلّم: طلبين', (await count())===2);
ok('كل طلب فيه خط تقدّم بـ3 مراحل', (await page.$$eval('.ordA', cards=>cards.every(c=>c.querySelectorAll('.ost').length===3))));
await page.click('[data-act="reorder"][data-id="a2"]'); await page.waitForTimeout(500);
st = await page.evaluate(()=>({view:state.view, cart:state.cart.map(c=>c.product+':'+c.qty+':'+c.unitType)}));
ok('«أعد الطلب» دمج نفس الصنف (حلق كومبن ابيض لفة 4+3=7) ولا كرر السطر', st.cart.length===2 && st.cart.includes('حلق كومبن:7:لفة') && st.cart.includes('باكتة:2:عود'), JSON.stringify(st));

// ── شاشة الطلب: بيانات الموزع مختصرة + كروت القطاعات
await page.evaluate(()=>{ state.warehouse='طنطا'; state.view='order'; render(); }); await page.waitForTimeout(400);
ok('بيانات الموزع في سطر مختصر بدل الحقول', (await page.$('.distsum'))!==null && (await page.$('[data-act="set-distname"]'))===null);
await page.click('[data-act="dist-edit"]'); await page.waitForTimeout(250);
ok('زرار «تعديل» بيفتح الحقول', (await page.$('[data-act="set-distname"]'))!==null);
const tiles = await page.$$eval('.sectile', e=>e.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
ok('كروت القطاعات (4) بعدد المنتجات والتوفّر', tiles.length>=3 && tiles.some(t=>/قطاعات PVC كومبن\s*1 صنف · متاح 1/.test(t)) && tiles.some(t=>/اكسسوارات pvc\s*1 صنف · نفد/.test(t)), tiles.join(' | '));
const nums = await page.$$eval('#app .card h2 .num', e=>e.map(x=>x.textContent.trim()));
ok('أرقام الخطوات متسلسلة', nums.every((n,i)=>n===String(i+1)), nums.join(','));
ok('مفيش أخطاء جافاسكريبت', errors.length===0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
