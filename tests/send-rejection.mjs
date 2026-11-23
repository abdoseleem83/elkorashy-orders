// رد السيرفر الصريح بالرفض مقابل المهلة/الشبكة/JSON باظ/رد غير مؤكد.
// القاعدة: في كل الحالات غير المؤكدة الطلب يفضل محفوظ كـ «attempted» (من غير إعادة إرسال)،
// وفي الرفض الصريح بس بنعرض السبب الآمن. كله بمحاكاة محلية، مفيش اتصال بالسيرفر الحقيقي.
// التشغيل: node tests/send-rejection.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const ok = (n,c,x='')=>{ console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext({ viewport:{width:412,height:860}, serviceWorkers:'block' })).newPage();
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
let mode='ok', creates=0, outside=[];
await page.route('**/script.google.com/**', async route=>{
  const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
  const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
  const json=b=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b)});
  if(action==='catalog') return json({items:[],discounts:{}});
  if(action==='login') return json({ok:true,username:'test',distName:'فرع طنطا',distRegion:'طنطا',distPhone:'010',distType:'موزع',token:'T.OK'});
  if(action==='create'){
    creates++;
    if(mode==='ok') return json({ok:true,orderNo:'77'});
    if(mode==='reject') return json({ok:false,error:'المخزن غير صالح'});
    if(mode==='reject-tech') return json({ok:false,error:'Exception: Cannot read properties of null at Code.gs:123'});
    if(mode==='reject-empty') return json({ok:false});
    if(mode==='reject-html') return json({ok:false,error:'<img src=x onerror=window.__xss=1> مرفوض'});
    if(mode==='unauthorized') return json({ok:false,error:'unauthorized'});
    if(mode==='ok-string') return json({ok:'true',orderNo:'1'});
    if(mode==='http500') return route.fulfill({status:500,body:'boom'});
    if(mode==='badjson') return route.fulfill({status:200,contentType:'application/json',body:'<html>not json'});
    if(mode==='network') return route.abort('failed');
  }
  return json({ok:true});
});
await page.route(u=>!/127\.0\.0\.1|script\.google\.com|fonts\.googleapis\.com/.test(u.toString()), r=>{ outside.push(r.request().url()); r.abort(); });
await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
const b=await page.$('[data-act="bypass-install"]'); if(b) await b.click();
await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','secret');
await page.click('[data-act="login-submit"]'); await page.waitForTimeout(1200);
ok('دخول تجريبي (محاكاة)', await page.evaluate(()=>!!state.currentUser));

async function attempt(m){
  mode=m; creates=0;
  await page.evaluate(()=>{ localStorage.removeItem(LS_OFFLINE_QUEUE_KEY); state.view='order'; state.pendingReviewId=null; state.saveError='';
    state.distName='فرع'; state.distRegion='طنطا'; state.distPhone='010'; state.warehouse='طنطا'; state.note='';
    state.cart=[{main:'قطاعات كرافت لاين',product:'حلق جرار',name:'حلق جرار',color:'',unitType:'لفة',qty:3}]; state.editingOrderId=null; });
  await page.evaluate(()=>actuallySubmit());
  await page.waitForTimeout(500);
  return page.evaluate(()=>({q:getOfflineQueue_().map(r=>({kind:r.kind,items:(r.order&&r.order.items||[]).length,lastCheck:r.lastCheck||''})),view:state.view,saveError:state.saveError,
    body:document.body.innerText, xss:window.__xss||0, cart:state.cart.length}));
}
let r;
r=await attempt('ok');
ok('نجاح مؤكد: الحالة confirmed وبشاشة النجاح، POST واحد', r.q.length===1 && r.q[0].kind==='confirmed' && creates===1 && r.view!=='pending', JSON.stringify(r.q));
r=await attempt('reject');
ok('رفض صريح: الطلب محفوظ attempted بعناصره، مفيش إعادة إرسال (POST واحد)', r.q.length===1 && r.q[0].kind==='attempted' && r.q[0].items===1 && creates===1, JSON.stringify(r.q)+' creates='+creates);
ok('رفض صريح: السبب بيظهر للموزع في المعلّق', r.view==='pending' && r.q[0].lastCheck.includes('المخزن غير صالح') && r.body.includes('المخزن غير صالح'), r.view);
ok('رفض صريح: الصياغة لسه بتقول مفيش إرسال تلقائي', /مش هيتبعت تاني تلقائيًا/.test(r.q[0].lastCheck));
r=await attempt('reject-tech');
ok('رفض بنص تقني: بيتعرض نص عام من غير تفاصيل داخلية', r.q[0].kind==='attempted' && /من غير سبب واضح/.test(r.q[0].lastCheck) && !/Exception|Code\.gs/.test(r.q[0].lastCheck+r.body), r.q[0].lastCheck);
r=await attempt('reject-empty');
ok('ok:false من غير سبب: نص عام والطلب محفوظ', r.q[0].kind==='attempted' && r.q[0].items===1 && creates===1 && /من غير سبب واضح/.test(r.q[0].lastCheck));
r=await attempt('reject-html');
ok('سبب فيه HTML: مش بيتنفّذ (esc) ومفيش عنصر اتحقن', r.xss===0 && r.q[0].kind==='attempted');
for (const m of ['http500','badjson','network','ok-string']){
  r=await attempt(m);
  ok(m+': رد غير مؤكد = نفس السلوك القديم (attempted، رسالة «مش مؤكدة»، POST واحد، الطلب محفوظ)',
     r.q.length===1 && r.q[0].kind==='attempted' && r.q[0].items===1 && creates===1 && r.q[0].lastCheck.startsWith('نتيجة الإرسال مش مؤكدة') && r.view==='pending', JSON.stringify(r.q)+' creates='+creates);
}
r=await attempt('unauthorized');
ok('unauthorized: لسه بيطلب الباسورد والطلب محفوظ في السلة (سلوك قديم)', r.cart===1 && (await page.evaluate(()=>!!state.reauth)) && creates===1, 'kind='+(r.q[0]&&r.q[0].kind));
ok('مفيش أي طلب لموقع خارجي', outside.length===0, outside.join(','));
ok('مفيش أخطاء جافاسكريبت', errors.length===0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
