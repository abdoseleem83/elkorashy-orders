// playwright ممكن يكون متسطّب عام مش محلي — بنجرب الاتنين
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);

// مسار المتصفح — سيبه فاضي عشان playwright يدوّر عليه لوحده
const BROWSER = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
const errors = [];
const browser = await chromium.launch({ executablePath: BROWSER });
const page = await (await browser.newContext({viewport:{width:420,height:900}, serviceWorkers:'block'})).newPage();
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
page.on('console', m => { const t=m.text(); if(m.type()==='error' && !/ERR_FAILED|ERR_CONNECTION_RESET/.test(t)) errors.push('CONSOLE: '+t); });
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));

const calls = [];
const ORDERS = [
  { id:'a1', ts:Date.now(), distName:'فرع طنطا', distRegion:'طنطا', distPhone:'01000000001', note:'', status:'تم تنفيذ الطلب', items:[], warehouse:'طنطا', orderNo:'5', username:'test' },
  { id:'a2', ts:Date.now(), distName:'فرع اسكندرية', distRegion:'اسكندرية', distPhone:'01000000002', note:'', status:'تم استلام الطلب', items:[], warehouse:'الاسكندرية', orderNo:'6', username:'x' }
];
const ARCHIVED = [{ id:'z9', ts:Date.now(), distName:'قديم', distRegion:'طنطا', distPhone:'01000000003', note:'', status:'تم تنفيذ الطلب', items:[], warehouse:'طنطا', orderNo:'1', username:'y' }];

await page.route('**/script.google.com/**', async route => {
  const r = route.request();
  const post = r.method()==='POST' ? JSON.parse(r.postData()||'{}') : null;
  const u = new URL(r.url());
  const action = post ? (post.action||'') : (u.searchParams.get('action')||'(default)');
  calls.push({ m:r.method(), action, token: (post ? post.token : u.searchParams.get('token')) || null });
  let p;
  if(action==='catalog') p = { items:[{name:'x',main:'م',sub:'',unit:1,product:'x',color:'',price:1,available:true,inStock:true,stock:5}], discounts:{} };
  else if(action==='adminLogin') p = { ok:true, token:'ADMIN.TOK' };
  else if(action==='(default)') p = ORDERS;
  else if(action==='archivedOrders') p = ARCHIVED;
  else if(action==='archiveDone') p = { ok:true, archived:1 };
  else if(action==='restoreArchived') p = { ok:true };
  else if(action==='ordersMeta') p = { count:2, last:{id:'a2',orderNo:'6',distName:'فرع اسكندرية'} };
  else p = { ok:true };
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(p) });
});
page.on('dialog', d => d.accept());   // نوافذ التأكيد

await page.goto(BASE + '/index.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(600);
await page.click('[data-act="bypass-install"]');
await page.evaluate(()=>{ state.currentUser={username:'admin',distName:'a',distRegion:'b',distPhone:'c',distType:'موزع'}; render(); });
await page.waitForTimeout(200);

// دخول الأدمن
await page.evaluate(async ()=>{ state.pinInput='1234'; await submitAdminPin(); });
await page.waitForTimeout(600);
const unlocked = await page.evaluate(()=>state.adminUnlocked && state.orders.length);
console.log('١) الأدمن دخل وحمّل الطلبات:', unlocked, unlocked?'✅':'❌');

// 🔴 الميزة اللي كانت مكسورة تمامًا: الأرشفة
const arch = await page.evaluate(async ()=>{ await archiveDoneOrders(); return state.orders.length; });
console.log('٢) أرشفة المنفَّذ (كانت مكسورة):', arch===1 ? 'اتأرشف واتشال من القايمة ✅' : ('❌ فاضل '+arch));

// 🔴 شاشة الأرشيف — كانت بتعرض كل الطلبات النشطة على إنها مؤرشفة
const archList = await page.evaluate(async ()=>{ await loadArchivedOrders(); return state.archivedOrders.map(o=>o.id); });
console.log('٣) شاشة الأرشيف بترجّع المؤرشف بس:', JSON.stringify(archList), archList.length===1 && archList[0]==='z9' ? '✅' : '❌');

// 🔴 الاسترجاع
const restored = await page.evaluate(async ()=>{ await restoreArchivedOrder('z9'); return state.archivedOrders.length; });
console.log('٤) استرجاع من الأرشيف:', restored===0 ? '✅' : '❌');

// انتهاء صلاحية توكن المستخدم بيرجّعه لشاشة الدخول
await page.unroute('**/script.google.com/**');
await page.route('**/script.google.com/**', async route => {
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:false, error:'unauthorized' }) });
});
const relogin = await page.evaluate(async ()=>{ await loadMyOrdersByIds(['a1']); return !state.currentUser; });
console.log('٥) التوكن المنتهي بيرجّع لشاشة الدخول:', relogin?'✅':'❌');

console.log('\nنداءات السيرفر:');
calls.forEach(c=>console.log('   ', c.m.padEnd(5), c.action.padEnd(18), c.token?('token='+c.token):''));
const mutationsViaGet = calls.filter(c=>c.m==='GET' && ['archiveDone','restoreArchived','delete','deleteDelivered','updateStatus','login'].includes(c.action));
console.log('\n٦) مفيش عمليات تعديل بـ GET:', mutationsViaGet.length===0 ? '✅' : ('❌ '+JSON.stringify(mutationsViaGet)));
console.log('\n' + (errors.length ? '❌ أخطاء:\n'+errors.join('\n') : '✅ مفيش أخطاء'));
await browser.close();
process.exit(errors.length?1:0);
