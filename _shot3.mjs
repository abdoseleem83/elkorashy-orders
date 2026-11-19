import fs from 'fs';
// تصميم الشاشة الرئيسية (اتجاه أ) والتنقل: الهيدر، أيقونة «الرئيسية»، علامة +، عرض الكمبيوتر، وترقيم الخطوات
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
    if(action==='catalog') p={items:JSON.parse(fs.readFileSync('data/catalog-fallback.json','utf-8')).map(r=>Object.assign({available:true,inStock:true,stock:10,price:null},r)),discounts:{}}; else if(false) p={items:[{name:'حلق ابيض',main:'قطاعات PVC كومبن',sub:'كومبن ابيض',unit:4,product:'حلق كومبن',color:'ابيض',price:100,available:true,inStock:true,stock:40}],discounts:{}};
    else if(action==='login') p={ok:true,username:'test',distName:'محاسب',distRegion:'طنطا',distPhone:'01000000001',distType:'موزع',token:'FAKE.TOKEN'};
    else if(action==='lookup'||action==='myOrders') p=[{id:'a1',orderNo:213,ts:Date.now()-2*86400000,status:'جاري تجهيز الطلب',warehouse:'طنطا',items:[{main:'قطاعات PVC كومبن',product:'حلق كومبن',name:'حلق كومبن',color:'ابيض',unitType:'لفة',qty:4}]}]; else p={ok:true};
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


const { ctx, page } = await open({width:420,height:900}, 'light');
await page.evaluate(()=>{ state.warehouse='طنطا'; state.view='order'; applySector_('قطاعات كرافت لاين'); state.family=''; render(); }); await page.waitForTimeout(600);
await page.screenshot({path:'/tmp/order2.png'});
await browser.close();
