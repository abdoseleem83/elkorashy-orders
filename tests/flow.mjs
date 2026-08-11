// playwright ممكن يكون متسطّب عام مش محلي — بنجرب الاتنين
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);

// مسار المتصفح — سيبه فاضي عشان playwright يدوّر عليه لوحده
const BROWSER = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
const errors = [];
const browser = await chromium.launch({ executablePath: BROWSER });
const ctx = await browser.newContext({ viewport:{width:420,height:900}, serviceWorkers:'block' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if(m.type()==='error' && !m.text().includes('ERR_CONNECTION_RESET')) errors.push('CONSOLE: '+m.text()); });
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));

const calls = [];
let savedOrder = null;
await page.route('**/script.google.com/**', async route => {
  const r = route.request();
  const post = r.method()==='POST' ? JSON.parse(r.postData()||'{}') : null;
  const action = post ? (post.action||'') : (new URL(r.url()).searchParams.get('action')||'');
  const tokenSent = post ? post.token : new URL(r.url()).searchParams.get('token');
  calls.push({ m:r.method(), action, token: tokenSent||null });
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

await page.goto(BASE + '/index.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(600);
await page.click('[data-act="bypass-install"]');
await page.fill('[data-act="auth-username"]','test');
await page.fill('[data-act="auth-password"]','secret');
await page.click('[data-act="login-submit"]');
await page.waitForTimeout(600);

// الخطوة الأولى في التطبيق: اختيار المخزن، وبعدها بتظهر القطاعات
await page.locator('[data-act="pick-warehouse-inline"]').first().click();
await page.waitForTimeout(400);
const chips = await page.locator('[data-act="set-group"]').count();
console.log('١) شرائح القطاعات:', chips, chips>0?'✅':'❌');

await page.locator('[data-act="set-group"]').first().click();
await page.waitForTimeout(400);
// خطوة تصنيف فرعي (لو القطاع محتاجها)
if(await page.locator('[data-act="set-sub"]').count()){
  await page.locator('[data-act="set-sub"]').first().click();
  await page.waitForTimeout(400);
}
// خطوة اختيار اللون — بعدها بتظهر المنتجات
if(await page.locator('[data-act="set-color"]').count()){
  await page.locator('[data-act="set-color"]').first().click();
  await page.waitForTimeout(400);
}
const products = await page.locator('[data-act="toggle-product"]').count();
console.log('٢) التفويض شغال — ظهرت المنتجات:', products, products>0?'✅':'❌');
if(!products){
  const acts = await page.evaluate(()=>[...new Set([...document.querySelectorAll('[data-act]')].map(e=>e.getAttribute('data-act')))]);
  console.log('   الأكشنز المتاحة دلوقتي:', JSON.stringify(acts));
}

// نختار منتج ونحدد كمية ونضيفه للسلة
if(products){
  await page.locator('[data-act="toggle-product"]').first().click();
  await page.waitForTimeout(400);

  const qty = page.locator('[data-act="staged-qty-input"]').first();
  const hasQty = await qty.count();
  console.log('٣) ظهر صف الكمية بعد اختيار المنتج:', hasQty?'✅':'❌');

  if(hasQty){
    await qty.fill('3');
    await page.waitForTimeout(250);
    const typed = await page.evaluate(()=>{
      const s = state.staged[0];
      return s ? Object.values(s.qtys)[0] : null;
    });
    console.log('٤) الكتابة في الخانة وصلت للحالة:', typed===3 ? '✅' : ('❌ ' + typed));

    await page.locator('[data-act="confirm-staged"]').first().click();
    await page.waitForTimeout(400);
    const cart = await page.evaluate(()=>state.cart.length);
    console.log('٥) اتضاف للسلة:', cart, cart>0?'✅':'❌');
  }
}

// نتأكد إن الطلب بيتبعت ومعاه التوكن
const sent = await page.evaluate(async ()=>{
  state.distName='فرع طنطا'; state.distRegion='طنطا'; state.distPhone='01000000001'; state.warehouse='طنطا';
  if(!state.cart.length) state.cart=[{main:'قطاعات PVC كومبن',product:'حلق كومبن',color:'ابيض',qty:3,unitType:'لفة',name:'حلق ابيض'}];
  await actuallySubmit();
  return { successId: state.successOrderId, err: state.saveError };
});
console.log('٦) إرسال الطلب:', sent.successId ? ('رقم ' + sent.successId + ' ✅') : ('❌ ' + sent.err));
console.log('٧) الطلب اتبعت ومعاه التوكن:', savedOrder && savedOrder.token==='FAKE.TOKEN' ? '✅' : ('❌ ' + JSON.stringify(savedOrder && savedOrder.token)));

// المودال: الضغط جوه اللوحة مايقفلهاش، والضغط على الخلفية يقفلها
await page.evaluate(()=>{ state.showStock=true; render(); });
await page.waitForTimeout(200);
await page.locator('.modalbg [data-act="noop"]').first().click({ position:{x:5,y:5} });
await page.waitForTimeout(200);
const stillOpen = await page.evaluate(()=>state.showStock);
await page.locator('.modalbg').first().click({ position:{x:5,y:5} });
await page.waitForTimeout(200);
const nowClosed = await page.evaluate(()=>!state.showStock);
console.log('٨) المودال: الضغط جوه مايقفلش =', stillOpen?'✅':'❌', '| الضغط على الخلفية بيقفل =', nowClosed?'✅':'❌');

console.log('\nنداءات السيرفر:');
calls.forEach(c=>console.log('   ', c.m, c.action, c.token?('token='+c.token):''));
console.log('\n' + (errors.length ? '❌ أخطاء:\n'+errors.join('\n') : '✅ مفيش أخطاء'));
await browser.close();
process.exit(errors.length?1:0);
