// السلة: نفس الصنف (قطاع/منتج/لون/وحدة) مايتكررش — الإضافة التانية بتزوّد الكمية بس
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const errors = [];
const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext({ viewport:{width:420,height:900}, serviceWorkers:'block' })).newPage();
page.on('pageerror', e => errors.push(e.message));
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],discounts:{}})}));
await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
const r = await page.evaluate(()=>{
  state.cart = [];
  const it = (o)=>Object.assign({ main:'قطاعات PVC كومبن', product:'حلق كومبن', name:'حلق كومبن', color:'ابيض', unitType:'لفة', qty:2 }, o||{});
  cartAdd_(it()); cartAdd_(it({qty:3}));                  // نفس الصنف مرتين
  const afterSame = JSON.parse(JSON.stringify(state.cart));
  cartAdd_(it({color:'بيج', qty:1}));                      // لون مختلف = بند تاني
  cartAdd_(it({unitType:'عود', qty:4}));                   // وحدة مختلفة = بند تاني
  const afterDiff = state.cart.length;
  cartAdd_(it({qty:1, unavailable:true}));                 // التجميع بيحفظ «غير متوفر» لو أي واحد منهم كده
  const flagged = state.cart[0].unavailable === true;
  const merged = cartMerge_([it({qty:1}), it({qty:2}), it({color:'بيج', qty:5})]);   // تجميع قايمة جاهزة (طلب قديم/مسودة)
  return { afterSame, afterDiff, flagged, merged: merged.map(x=>x.color+':'+x.qty) };
});
ok('نفس الصنف مرتين = سطر واحد', r.afterSame.length === 1, String(r.afterSame.length));
ok('الكمية اتجمعت 2 + 3 = 5', r.afterSame[0].qty === 5, String(r.afterSame[0].qty));
ok('لون مختلف أو وحدة مختلفة = بند منفصل', r.afterDiff === 3, String(r.afterDiff));
ok('علامة «غير متوفر» بتفضل لو أي إضافة كانت كده', r.flagged === true);
ok('cartMerge_ بيجمّع طلب قديم/مسودة فيها تكرار', JSON.stringify(r.merged) === JSON.stringify(['ابيض:3','بيج:5']), JSON.stringify(r.merged));
ok('مفيش أخطاء جافاسكريبت', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
