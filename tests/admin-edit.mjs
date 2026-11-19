// الأدمن: القطاعات المطلوبة + تعديل الكميات + «طلب باسم موزّع» (v273)
// التشغيل: node tests/admin-edit.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ serviceWorkers:'block' });
const page = await ctx.newPage(); const errs=[]; page.on('pageerror', e=>errs.push(e.message));
const posts = [];
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', async route=>{
  const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
  if(post) posts.push(post);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
});
await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>typeof adminEditItemsHtml_==='function');
const r = await page.evaluate(async ()=>{
  const o = { id:'o1', ts:Date.now(), distName:'محل ابو ليله', warehouse:'طنطا', status:STATUS_RECEIVED, items:[
    {main:'قطاعات كرافت لاين',product:'حلق جرار',color:'ابيض',qty:5,unitType:'عود'},
    {main:'قطاعات PVC كومبن',product:'حلق كومبن',color:'بيج',qty:2,unitType:'عود'}] };
  const sect = orderSectorsHtml_(o);
  state.orders=[o]; state.adminEdits.o1 = o.items.map(i=>Object.assign({},i));
  const html = adminEditItemsHtml_(o);
  state.adminEdits.o1[0].qty = 9; onSelectChange('adm-unit', Object.assign(document.createElement('select'),{}), 'لفة');
  { const el=document.createElement('select'); el.setAttribute('data-id','o1'); el.setAttribute('data-idx','0'); onSelectChange('adm-unit', el, 'لفة'); }
  setAdminToken('ADMINTOKEN'); await adminSaveEdit_('o1');
  return { logos:(sect.match(/<img/g)||[]).length, inputs:(html.match(/adm-qty-input/g)||[]).length, qty:o.items[0].qty, unit:o.items[0].unitType };
});
ok('القطاعات المطلوبة: لوجو كرافت + كومبن', r.logos===2, JSON.stringify(r));
ok('خانات تعديل الكمية لكل صنف', r.inputs===2);
const p = posts.find(x=>x.action==='adminUpdateItems');
ok('حفظ الكميات بيبعت adminUpdateItems بتوكن الأدمن', p && p.token==='ADMINTOKEN' && p.id==='o1' && p.items[0].qty===9, JSON.stringify(p||{}).slice(0,120));
ok('الكمية اتحدّثت في الشاشة', r.qty===9);
ok('الوحدة اتغيّرت (عود ← لفة) وراحت للسيرفر', r.unit==='لفة' && p.items[0].unitType==='لفة', r.unit);
ok('مفيش أخطاء جافاسكريبت', errs.length===0, errs.join(' | '));
await browser.close(); console.log(fails?'❌ فشل '+fails:'✅ كله تمام'); process.exit(fails?1:0);
