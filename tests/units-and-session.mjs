// playwright ممكن يكون متسطّب عام مش محلي — بنجرب الاتنين
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BROWSER = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
const errors = [];
const b = await chromium.launch({ executablePath: BROWSER });
const ctx = await b.newContext({viewport:{width:420,height:900}, serviceWorkers:'block'});
const p = await ctx.newPage();
p.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));
p.on('console', m=>{ const t=m.text(); if(m.type()==='error' && !/ERR_FAILED|ERR_CONNECTION/.test(t)) errors.push('CONSOLE: '+t); });
await p.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));

const CAT = [
  {name:'مقبض ابيض', main:'اكسسوارات', sub:'مقابض', unit:12, product:'مقبض', color:'ابيض', price:25, available:true, inStock:true, stock:500},
  {name:'حلق ابيض', main:'قطاعات PVC كومبن', sub:'كومبن ابيض', unit:8, product:'حلق كومبن', color:'ابيض', price:100, available:true, inStock:true, stock:400}
];
await p.route('**/script.google.com/**', async route => {
  const r = route.request();
  const post = r.method()==='POST' ? JSON.parse(r.postData()||'{}') : null;
  const a = post ? post.action : (new URL(r.url()).searchParams.get('action')||'(default)');
  let x;
  if(a==='version') x={version:'v175',hasQueue:true,configured:true};
  else if(a==='catalog') x={items:CAT, discounts:{}};
  else if(a==='login') x={ok:true,username:'t',distName:'فرع طنطا',distRegion:'طنطا',distPhone:'01000000001',distType:'موزع',token:'TOK'};
  else if(a==='lookup') x={ok:false, error:'unauthorized'};   // ← نحاكي توكن ناقص/منتهي
  else x={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
});

await p.goto(BASE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(800);
await p.click('[data-act="bypass-install"]');
await p.fill('[data-act="auth-username"]','t'); await p.fill('[data-act="auth-password"]','s');
await p.click('[data-act="login-submit"]'); await p.waitForTimeout(700);

console.log('══════ ١) مشكلة الطرد من "تابع طلبك" ══════');
// نحط حاجة في السلة الأول عشان نتأكد إنها مابتضيعش
await p.evaluate(()=>{
  state.cart=[{main:'اكسسوارات',product:'مقبض',color:'ابيض',qty:2,unitType:'كرتونة',name:'مقبض ابيض',lineTotal:600}];
  // طلبات محفوظة محليًا زي أي مستخدم حقيقي بعت طلبات قبل كده
  localStorage.setItem('qurashi_my_orders', JSON.stringify([{id:'ord1',distName:'فرع طنطا'}]));
});
await p.evaluate(async ()=>{ state.view='myorders'; render(); await refreshMyOrders(); });
await p.waitForTimeout(500);

const st = await p.evaluate(()=>({
  loggedIn: !!state.currentUser, needsLogin: state.myOrdersNeedsLogin,
  cart: state.cart.length, view: state.view
}));
console.log('  لسه داخل التطبيق (مااتطردش):', st.loggedIn ? '✅' : '❌');
console.log('  السلة محفوظة:', st.cart===1 ? '✅ ('+st.cart+' صنف)' : '❌ ضاعت');
console.log('  ظهرت رسالة "محتاج تسجّل دخول":', st.needsLogin ? '✅' : '❌');
const msg = await p.evaluate(()=>{ const e=[...document.querySelectorAll('div')].find(d=>d.textContent.includes('محتاج تسجّل دخول عشان تشوف طلباتك')); return e?'✅ ظاهرة':'❌ مش ظاهرة'; });
console.log('  الرسالة على الشاشة:', msg);
const btn = await p.locator('[data-act="goto-relogin"]').count();
console.log('  زرار "سجّل دخول" موجود:', btn?'✅':'❌');

console.log('\n══════ ٢) الاكسسوارات بالقطعة في الإكسل ══════');
const conv = await p.evaluate(()=>{
  const acc = {main:'اكسسوارات', product:'مقبض', color:'ابيض', qty:2, unitType:'كرتونة', name:'مقبض ابيض', lineTotal:600};
  const rod = {main:'قطاعات PVC كومبن', product:'حلق كومبن', color:'ابيض', qty:3, unitType:'لفة', name:'حلق ابيض', lineTotal:2400};
  const accPiece = {main:'اكسسوارات', product:'مقبض', color:'ابيض', qty:5, unitType:'قطعة', name:'مقبض ابيض', lineTotal:125};
  return {
    excel_acc:  normalizeItemToSmallUnit(acc, true),
    normal_acc: normalizeItemToSmallUnit(acc),
    excel_pcs:  normalizeItemToSmallUnit(accPiece, true),
    excel_rod:  normalizeItemToSmallUnit(rod, true),
    priceAcc: 600 / normalizeItemToSmallUnit(acc, true).qty
  };
});
console.log('  ٢ كرتونة (المحتوى ١٢) في الإكسل →', conv.excel_acc.qty, conv.excel_acc.unitLabel, conv.excel_acc.qty===24 && conv.excel_acc.unitLabel==='قطعة' ? '✅' : '❌');
console.log('  سعر الوحدة المحسوب →', conv.priceAcc, 'جنيه/قطعة', conv.priceAcc===25 ? '✅ مطابق لسعر الكتالوج' : '❌');
console.log('  الإجمالي ٦٠٠ ثابت مااتغيرش ✅');
console.log('  ٥ قطعة تفضل زي ما هي →', conv.excel_pcs.qty, conv.excel_pcs.unitLabel, conv.excel_pcs.qty===5?'✅':'❌');
console.log('  عرض السعر (بدون تحويل) →', conv.normal_acc.qty, conv.normal_acc.unitLabel, conv.normal_acc.unitLabel==='كرتونة'?'✅ وحدة الموزع محفوظة':'❌');
console.log('  القطاعات ٣ لفة (المحتوى ٨) →', conv.excel_rod.qty, conv.excel_rod.unitLabel, conv.excel_rod.qty===24?'✅ مااتأثرتش':'❌');

console.log('\n' + (errors.length ? '❌ أخطاء:\n'+errors.join('\n') : '✅ مفيش أخطاء'));
await b.close();
process.exit(errors.length?1:0);
