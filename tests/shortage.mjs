// اختبار "نواقص فقط" (v239): مفيش أسعار ولا عرض سعر في أي شاشة، وزرار «نواقص» بيشارك صور النواقص.
// التشغيل: node tests/shortage.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
const errors = [];
let fails = 0;
const ok = (name, cond, extra='') => { console.log((cond?'✅':'❌') + ' ' + name + (extra?(' — '+extra):'')); if(!cond) fails++; };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport:{width:420,height:900}, serviceWorkers:'block', acceptDownloads:true });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if(m.type()==='error' && !m.text().includes('ERR_CONNECTION_RESET')) errors.push('CONSOLE: '+m.text()); });
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let savedOrder = null;
await page.route('**/script.google.com/**', async route => {
  const r = route.request();
  const post = r.method()==='POST' ? JSON.parse(r.postData()||'{}') : null;
  const action = post ? (post.action||'') : (new URL(r.url()).searchParams.get('action')||'');
  let p;
  if(action==='catalog') p = { items:[
    {name:'حلق ابيض',main:'قطاعات PVC كومبن',sub:'كومبن ابيض',unit:4,product:'حلق كومبن',color:'ابيض',price:100,available:true,inStock:true,stock:40},
    {name:'حلق بيج', main:'قطاعات PVC كومبن',sub:'كومبن ابيض',unit:4,product:'حلق كومبن',color:'بيج', price:110,available:true,inStock:true,stock:8}
  ], discounts:{'قطاعات PVC كومبن':10} };
  else if(action==='login') p = { ok:true, username:'test', distName:'فرع طنطا', distRegion:'طنطا', distPhone:'01000000001', distType:'موزع', token:'FAKE.TOKEN' };
  else if(action==='lookup') p = [];
  else if(action==='create'||action==='update'){ savedOrder = post; p = { ok:true, orderNo: 77 }; }
  else p = { ok:true };
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(p) });
});
// مشاركة الملفات: نسجّل اللي اتبعت بدل ما نفتح شاشة الموبايل
await page.addInitScript(() => {
  navigator.canShare = () => true;
  navigator.share = async (d) => { window.__shared = { n:(d.files||[]).map(f=>({name:f.name,type:f.type,size:f.size})), text:d.text, title:d.title }; };
});

await page.goto(BASE + '/index.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(600);
await page.click('[data-act="bypass-install"]');
await page.fill('[data-act="auth-username"]','test');
await page.fill('[data-act="auth-password"]','secret');
await page.click('[data-act="login-submit"]');
await page.waitForTimeout(900);

const PRICE_RE = /ج\.م|السعر|عرض سعر|عرض السعر|بالأسعار|الخصم/;
const appText = () => page.evaluate(()=>document.querySelector('#app').innerText);

// ١) السلة: من غير أسعار
await page.evaluate(()=>{
  state.warehouse='طنطا'; state.view='order'; state.distName='فرع طنطا'; state.distRegion='طنطا'; state.distPhone='01000000001';
  state.cart = [
    { main:'قطاعات PVC كومبن', product:'حلق كومبن', name:'حلق ابيض', color:'ابيض', unitType:'لفة', qty:2 },
    { main:'قطاعات PVC كومبن', product:'حلق كومبن', name:'حلق بيج',  color:'بيج',  unitType:'عود', qty:3 },
    { main:'أصناف أخرى', product:'صنف حر', name:'صنف حر', color:'', unitType:'قطعة', qty:5, note:'' }
  ];
  render();
});
await page.waitForTimeout(300);
const orderTxt = await appText();
ok('شاشة الطلب من غير أي سعر/خصم', !PRICE_RE.test(orderTxt));
await page.evaluate(()=>{ state.showCartReview=true; render(); });
const cartModalTxt = await page.evaluate(()=>document.querySelector('.previewmodal').innerText);
ok('مراجعة السلة من غير أسعار + فيها عدد الأصناف', !PRICE_RE.test(cartModalTxt) && cartModalTxt.includes('عدد الأصناف'), cartModalTxt.replace(/\s+/g,' ').slice(0,120));
ok('مفيش زرار مشاركة/معاينة عرض سعر', (await page.locator('[data-act="cart-share"],[data-act="preview-cart-invoice"]').count())===0);
await page.evaluate(()=>{ state.showCartReview=false; render(); });

// ٢) إرسال الطلب → شاشة النجاح
await page.evaluate(async()=>{ await actuallySubmit(); });
await page.waitForTimeout(800);
ok('الطلب اتبعت للسيرفر', !!savedOrder);
const sentItems = JSON.stringify(savedOrder && (savedOrder.order||savedOrder));
ok('الطلب المبعوت من غير حقول سعر', !/lineTotal|unitPrice/.test(sentItems));
const succTxt = await appText();
ok('شاشة النجاح ظاهرة', await page.evaluate(()=>!!state.successOrderId));
ok('مفيش أي سعر/عرض سعر في شاشة النجاح', !PRICE_RE.test(succTxt));
ok('زرار «نواقص» ظاهر', (await page.locator('[data-act="share-shortage"]').count())===1, (await page.locator('[data-act="share-shortage"]').innerText()).trim());
ok('مفيش زراير قديمة (واتساب صورة/معاينة/تنزيل)', (await page.locator('[data-act="send-order-img"],[data-act="preview-quote-plain"],[data-act="share-quote-plain"],[data-act="download-quote-plain"]').count())===0);
ok('مفيش نافذة "بأسعار ولا من غير"', (await page.locator('[data-act="share-price-yes"]').count())===0);

// ٣) الضغط على «نواقص» بيشارك صور النواقص
await page.click('[data-act="share-shortage"]', { force:true });
await page.waitForFunction(()=>window.__shared, null, { timeout: 60000 }).catch(()=>{});
const shared = await page.evaluate(()=>window.__shared||null);
ok('اتفتحت المشاركة بملفات', !!(shared && shared.n.length>0), shared ? JSON.stringify(shared.n) : 'مفيش مشاركة');
ok('كل الملفات PNG واسمها «نواقص_…»', !!shared && shared.n.every(f=>f.type==='image/png' && f.name.startsWith('نواقص_') && f.size>1000));
ok('نص المشاركة «نواقص — طلب #…»', !!shared && String(shared.text).startsWith('نواقص — طلب #'), shared && shared.text);
ok('مفيش ملف عرض سعر', !!shared && !shared.n.some(f=>f.name.includes('عرض')));
await page.waitForTimeout(200);
ok('الزرار اتعلّم «تم»', await page.evaluate(()=>state.waSent===true));
await page.waitForTimeout(2600);
ok('رجع للشاشة الرئيسية تلقائيًا', await page.evaluate(()=>!state.successOrderId));

// ٤) طلباتي: زرار «نواقص» بس
const myHtml = await page.evaluate(()=>{
  state.myOrders = [{ id:'z1', orderNo:5, ts:Date.now(), distName:'فرع طنطا', distRegion:'طنطا', distPhone:'0100', status:STATUS_RECEIVED, warehouse:'طنطا',
    items:[{ main:'قطاعات PVC كومبن', product:'حلق كومبن', name:'حلق ابيض', color:'ابيض', unitType:'لفة', qty:2 }] }];
  state.view='myorders'; render(); return document.querySelector('#app').innerText;
});
ok('طلباتي من غير أسعار', !PRICE_RE.test(myHtml));
ok('طلباتي: زرار نواقص موجود ومفيش معاينة PDF', (await page.locator('[data-act="share-shortage"]').count())===1 && (await page.locator('[data-act="preview-myorder-pdf"]').count())===0);

// ٥) الإدارة: من غير تصدير PDF بأسعار، وفيه أزرار نواقص لكل مجموعة
const adminOk = await page.evaluate(()=>{
  state.orders = [{ id:'z2', orderNo:6, ts:Date.now(), distName:'موزع', distRegion:'طنطا', distPhone:'0100', status:STATUS_RECEIVED, warehouse:'طنطا',
    items:[{ main:'قطاعات PVC كومبن', product:'حلق كومبن', name:'حلق ابيض', color:'ابيض', unitType:'لفة', qty:2 }] }];
  state.adminUnlocked = true; state.adminOpenIds = { z2:true }; state.view='admin'; render();
  const t = document.querySelector('#app').innerText; const h = document.querySelector('#app').innerHTML;
  return { priceTxt: /ج\.م|عرض سعر|تصدير PDF/.test(t), groupBtn: h.includes('share-shortage-group'), pdfBtn: h.includes('download-order-pdf') };
});
ok('الإدارة: من غير أسعار/تصدير PDF', !adminOk.priceTxt && !adminOk.pdfBtn);
ok('الإدارة: زرار نواقص المجموعة موجود', adminOk.groupBtn);

// ٦) إدارة الأصناف: من غير أسعار
const manage = await page.evaluate(()=>{
  const list = renderManageItemsTab();
  state.manageEditingName='NEW'; state.manageEditDraft={ name:'', main:'', sub:'', product:'', color:'', unit:1, stock:'', available:true };
  const form = renderManageEditForm_();
  state.manageEditingName=null;
  return { list, form };
});
ok('قايمة إدارة الأصناف من غير أسعار/تصفير أسعار', !/ج\.م|manage-hide-price|pz-open|صفّر أسعار/.test(manage.list));
ok('فورم الصنف من غير خانة سعر', !/manage-draft-price|السعر/.test(manage.form));

// ٧) تصدير الإكسيل من غير عمودي السعر والإجمالي
await page.evaluate(()=>{ state.view='admin'; render(); });
const [dl] = await Promise.all([ page.waitForEvent('download', { timeout: 30000 }).catch(()=>null), page.evaluate(()=>exportExcel(STATUS_RECEIVED)) ]);
if(dl){ await dl.saveAs('/tmp/export-test.xlsx'); ok('تصدير الإكسيل اشتغل', true, dl.suggestedFilename()); }
else ok('تصدير الإكسيل اشتغل', false);

console.log(errors.length ? '\n❌ أخطاء:\n' + errors.join('\n') : '\n✅ مفيش أخطاء في الكونسول');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
