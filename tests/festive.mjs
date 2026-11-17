// 🎉 رأس السنة: بانر احتفالي + مطر قصاصات/تلج خفيف (٢٨ ديسمبر ← ٣ يناير) — مرة في اليوم، مبيمنعش الدوس، وبيتقفل
// التشغيل: node tests/festive.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const errors = []; const ok = (n,c,x='')=>{ console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

async function session(dateIso, reduced=false){
  const ctx = await browser.newContext({ viewport:{width:412,height:860}, serviceWorkers:'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(); page.on('pageerror', e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(dateIso));
  await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('**/script.google.com/**', async route=>{
    const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
    const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
    let p; if(action==='catalog') p={items:[],discounts:{}}; else if(action==='login') p={ok:true,username:'test',distName:'فرع',distRegion:'طنطا',distPhone:'010',distType:'موزع',token:'T'}; else if(action==='lookup'||action==='myOrders') p=[]; else p={ok:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
  });
  await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(600);
  const b=await page.$('[data-act="bypass-install"]'); if(b) await b.click();
  await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','x'); await page.click('[data-act="login-submit"]'); await page.waitForTimeout(1200);
  return { ctx, page };
}

// ── التواريخ (دوال صافية)
{ const { ctx, page } = await session('2026-11-17T10:00:00');
  ok('التواريخ: ٢٧ ديسمبر لأ · ٢٨ ديسمبر ٢٠٢٧ · ٣١ ديسمبر ٢٠٢٧ · ١ يناير ٢٠٢٧ · ٣ يناير ٢٠٢٧ · ٤ يناير لأ', await page.evaluate(()=> festiveYear_(new Date(2026,11,27))===0 && festiveYear_(new Date(2026,11,28))===2027 && festiveYear_(new Date(2026,11,31))===2027 && festiveYear_(new Date(2027,0,1))===2027 && festiveYear_(new Date(2027,0,3))===2027 && festiveYear_(new Date(2027,0,4))===0));
  ok('خارج الموسم (١٧ نوفمبر): مفيش بانر ولا كانفاس', await page.evaluate(()=>!document.querySelector('.homehero2.fest') && !document.getElementById('festiveCanvas')));
  await ctx.close(); }

// ── جوه الموسم
{ const { ctx, page } = await session('2026-12-30T10:00:00');
  ok('بانر «كل سنة وانتم طيبين ٢٠٢٧» ظاهر في الرئيسية', await page.evaluate(()=> /كل سنة وانتم طيبين 2027/.test((document.querySelector('.homehero2.fest')||{}).textContent||'')));
  await page.waitForTimeout(900);
  ok('المطر بدأ (canvas) ومبيمنعش الدوس (pointer-events:none)', await page.evaluate(()=>{ const c=document.getElementById('festiveCanvas'); return !!c && getComputedStyle(c).pointerEvents==='none' && getComputedStyle(c).position==='fixed'; }));
  ok('اتسجّل إنه اتعرض النهارده (مرة في اليوم)', await page.evaluate(()=>!!localStorage.getItem(LS_FESTIVE_DAY)));
  await page.evaluate(()=>{ document.getElementById('festiveCanvas').remove(); render(); }); await page.waitForTimeout(900);
  ok('إعادة رسم الرئيسية في نفس اليوم مبتشغّلش المطر تاني', await page.evaluate(()=>!document.getElementById('festiveCanvas')));
  await page.evaluate(()=>runFestive_(500)); await page.waitForTimeout(300);
  ok('المطر بيشتغل ويتمسح لوحده بعد المدة', await page.evaluate(()=>!!document.getElementById('festiveCanvas')));
  await page.waitForTimeout(900);
  ok('اتمسح الـ canvas بعد ما المدة خلصت', await page.evaluate(()=>!document.getElementById('festiveCanvas')));
  await page.click('[data-act="toggle-festive"]'); await page.waitForTimeout(300);
  ok('«إيقاف الاحتفال»: رجع البانر العادي وااتحفظ للسنة دي', await page.evaluate(()=>!document.querySelector('.homehero2.fest') && localStorage.getItem(LS_FESTIVE_OFF)==='2027' && festiveActive_(new Date(2027,0,2))===0 && festiveActive_(new Date(2027,11,29))===2028));
  await ctx.close(); }

// ── تقليل الحركة: بانر من غير مطر
{ const { ctx, page } = await session('2026-12-31T20:00:00', true);
  await page.waitForTimeout(900);
  ok('«تقليل الحركة»: البانر ظاهر ومفيش مطر', await page.evaluate(()=>!!document.querySelector('.homehero2.fest') && !document.getElementById('festiveCanvas')));
  await ctx.close(); }

ok('مفيش أخطاء جافاسكريبت', errors.length===0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
