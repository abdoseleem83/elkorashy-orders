// كارت الصنف (اتجاه أ): دواير الألوان + اختيار أكتر من لون + «متاح N · غير متوفر» بأعداد حقيقية + كروت القطاعات + بحث الرئيسية
// التشغيل: node tests/product-card.mjs   (بعد python3 -m http.server 8099)
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0; const errors = [];
const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext({ viewport:{width:412,height:900}, serviceWorkers:'block' })).newPage();
page.on('pageerror', e => errors.push(e.message));
const mk=(main,sub,product,color,stock,avail=true)=>({name:product+' '+color,main,sub,unit:4,product,color,price:100,available:avail,inStock:stock>0,stock});
const K='قطاعات PVC كومبن';
const CAT=[
  mk(K,'كومبن ابيض','حلق كومبن','ابيض',40), mk(K,'كومبن بيج','حلق كومبن','بيج',0), mk(K,'كومبن رمادي','حلق كومبن','رمادي',30), mk(K,'كومبن رمادي','حلق كومبن','رمادي',30),   // صف مكرر لنفس اللون — لازم يتعرض مرة واحدة
  mk(K,'كومبن ابيض','سقاس مفصلي','ابيض',3),            // أقل من لفة = «أعواد بس»
  mk(K,'كومبن ابيض','حلق قليل','ابيض',12),             // أقل من ٥ لفات = «قليل»
  mk(K,'كومبن ابيض','ضلفة مفصلي','ابيض',0),            // مفيش رصيد خالص = غير متوفر
  mk('قطاعات كرافت لاين','كرافت','حلق كرافت','ابيض',50),
  mk('اكسسوارات pvc اكسا','مفصلة','مفصلة ثقيلة','',10), mk('اكسسوارات pvc اكسا','سيليكون','سيليكون شفاف','',5), mk('اكسسوارات pvc اكسا','مفصلة','باكتة صغيرة','',7),
  mk('شاتر','','شاتر ابيض','ابيض',9), mk('ابواب WPC','','باب WPC','',3), mk('اكسسوارات خارجيه','','مقبض خارجي','',4)
];
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', async route=>{
  const r=route.request(); const post=r.method()==='POST'?JSON.parse(r.postData()||'{}'):null;
  const action=post?(post.action||''):(new URL(r.url()).searchParams.get('action')||'');
  let p;
  if(action==='catalog') p={items:CAT,discounts:{}};
  else if(action==='login') p={ok:true,username:'test',distName:'فرع طنطا',distRegion:'طنطا',distPhone:'01000000001',distType:'موزع',token:'FAKE.TOKEN'};
  else if(action==='lookup'||action==='myOrders') p=[]; else p={ok:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
});
await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
const b = await page.$('[data-act="bypass-install"]'); if(b) await b.click();
await page.fill('[data-act="auth-username"]','test'); await page.fill('[data-act="auth-password"]','secret');
await page.click('[data-act="login-submit"]'); await page.waitForTimeout(1500);
await page.evaluate(()=>{ state.warehouse='طنطا'; render(); }); await page.waitForTimeout(300);

// ── كروت القطاعات: أعداد حقيقية (٢ متاح، ١ غير متوفر)
const tiles = await page.$$eval('.homesectors .sico', e=>e.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
ok('كارت كومبن: «4 أصناف · متاح 3 · غير متوفر 1»', tiles.some(t=>/قطاعات PVC كومبن\s*4 أصناف · متاح 3 · غير متوفر 1/.test(t)), tiles.join(' | '));

// ── بحث الرئيسية
await page.fill('[data-act="home-search"]','سقاس'); await page.waitForTimeout(300);
ok('البحث بيلاقي «سقاس مفصلي»', (await page.$$('.hres')).length===1);
await page.click('.hres'); await page.waitForTimeout(400);
let st = await page.evaluate(()=>({view:state.view, main:state.mainGroup, q:state.productSearch}));
ok('نتيجة البحث بتفتح القطاع وبتحط الاسم في بحثه', st.view==='order' && st.main===K && st.q==='سقاس مفصلي', JSON.stringify(st));
await page.evaluate(()=>{ state.productSearch=''; state.staged=[]; render(); }); await page.waitForTimeout(300);

// ── كارت «حلق كومبن»: ٣ دواير + سطر المتاح/غير المتوفر
const card = async n => page.evaluate(n=>{ const c=[...document.querySelectorAll('.pcard')].find(x=>x.querySelector('.pc-name').textContent.trim()===n); return c ? { dots:c.querySelectorAll('.cdot').length, on:c.querySelectorAll('.cdot.on').length, av:(c.querySelector('.pavail')||{}).textContent||'' } : null; }, n);
let c1 = await card('حلق كومبن');
ok('٣ دواير ألوان جوه الكارت (من غير تكرار اللون المكرر في الكاتالوج)', c1 && c1.dots===3, JSON.stringify(c1));
ok('علامة ✓ على المتاح و✗ على غير المتوفر', await page.evaluate(()=>{ const d=[...document.querySelectorAll('.pcard')].find(x=>x.querySelector('.pc-name').textContent.trim()==='حلق كومبن').querySelectorAll('.cdot'); const g=n=>[...d].find(x=>x.getAttribute('aria-label')===n).querySelector('.bdg').textContent; return g('ابيض')==='✓' && g('بيج')==='✗' && g('رمادي')==='✓'; }));
ok('حالة بالكلام من غير أرقام: «متاح: ابيض، رمادي» + «غير متوفر: بيج»', c1 && /متاح: ابيض، رمادي/.test(c1.av) && /غير متوفر: بيج/.test(c1.av) && !/\d/.test(c1.av), c1 && c1.av);
ok('«سقاس مفصلي» (أقل من لفة) = «أعواد بس»', /^أعواد بس$/.test((await card('سقاس مفصلي')).av.trim()));
ok('«حلق قليل» = «قليل»', /^قليل$/.test((await card('حلق قليل')).av.trim()));
ok('«ضلفة مفصلي» غير متوفر', /^غير متوفر$/.test((await card('ضلفة مفصلي')).av.trim()));

// ── اختيار أكتر من لون: دايرتين → علامة ✓ + صفين كمية
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="ابيض"]'); await page.waitForTimeout(250);
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="رمادي"]'); await page.waitForTimeout(250);
c1 = await card('حلق كومبن');
ok('دايرتين مختارتين (حلقة غامقة حواليهم)', c1.on===2);
ok('صف كمية لكل لون مختار (٢) جوه الكارت وزرار «ضيف للسلة» واحد', (await page.$$('.pcard .qbox .qr2')).length===2 && (await page.$$('.pcard .qbox [data-act="confirm-staged"]')).length===1);
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="رمادي"]'); await page.waitForTimeout(250);
ok('دوسة تانية على الدايرة بتشيل اللون', (await card('حلق كومبن')).on===1);
await page.click('[data-act="tile-color"][data-prod="حلق كومبن"][data-val="رمادي"]'); await page.waitForTimeout(250);
// كميات وإضافة للسلة
await page.fill('.qbox [data-act="staged-qty-input"][data-val="ابيض"]','2');
await page.fill('.qbox [data-act="staged-qty-input"][data-val="رمادي"]','3');
await page.click('.qbox [data-act="confirm-staged"]'); await page.waitForTimeout(400);
st = await page.evaluate(()=>state.cart.map(c=>c.color+':'+c.qty).sort());
ok('اتضاف اللونين بكمياتهم للسلة', st.length===2 && st.includes('ابيض:2') && st.includes('رمادي:3'), JSON.stringify(st));

// ── بعد اختيار القطاع: قايمة القطاعات تختفي والأصناف تظهر على طول + ترتيب «الموجود الأول»
ok('قايمة اختيار القطاع مخفية بعد ما القطاع اتحدد', (await page.$('#sec-group'))===null);
const order = await page.$$eval('.pcard .pc-name', e=>e.map(x=>x.textContent.trim()));
ok('الترتيب أبجدي (بغض النظر عن التوفر)', order.join('|')==='حلق قليل|حلق كومبن|سقاس مفصلي|ضلفة مفصلي', order.join('|'));
ok('خلفيتين بالتبادل لكروت الأصناف', await page.evaluate(()=>{ const bg=[...document.querySelectorAll('.pcard')].map(c=>getComputedStyle(c).backgroundColor); return bg.length>=3 && bg.every((b,i)=> i===0 || b!==bg[i-1]) && new Set(bg).size===2; }));
ok('البحث جوه الهيدر الثابت (مبيسكرولش) وفيه أيقونة 🔍', (await page.$('.fixedhead-outer .searchbox.hasic .sbic svg'))!==null && (await page.$('.fixedhead-outer [data-act="search-product"]'))!==null);
await page.evaluate(()=>window.scrollTo(0, 400)); await page.waitForTimeout(200);
ok('البحث ظاهر في أعلى الشاشة وإحنا نازلين تحت', await page.evaluate(()=>{ const r=document.querySelector('[data-act="search-product"]').getBoundingClientRect(); return r.top>=0 && r.bottom<=260; }));
await page.evaluate(()=>window.scrollTo(0, 0));
await page.focus('[data-act="search-product"]'); await page.waitForTimeout(350);
ok('الكيبورد مفتوح: الشرايط الثابتة (التنقل/الإرسال) اتخفّت', await page.evaluate(()=>document.body.classList.contains('kb-open') && getComputedStyle(document.querySelector('.bottomnav')).display==='none'));
await page.evaluate(()=>document.activeElement.blur()); await page.waitForTimeout(400);
ok('بعد قفل الكيبورد الشرايط رجعت', await page.evaluate(()=>!document.body.classList.contains('kb-open') && getComputedStyle(document.querySelector('.bottomnav')).display!=='none'));
// ── «غيّر القطاع» في الشريط الثابت
ok('الشريط الثابت فيه «غيّر القطاع» بس (من غير «غيّر المخزن»)', !/غيّر المخزن/.test(await page.$eval('.ministrip2027', e=>e.textContent)) && (await page.$('.mini2027.sectorbtn'))!==null);
ok('الشريط fixed (مش بيسكرول مع الصفحة)', (await page.$eval('.fixedhead-outer', e=>getComputedStyle(e).position))==='fixed');
// ── «غيّر القطاع» قايمة منسدلة: بتغيّر القطاع مباشرة من غير ما تخرج للقايمة
ok('«غيّر القطاع» select جوه الشريط الثابت', (await page.$('.ministrip2027 select[data-act="pick-sector-select"]'))!==null);
await page.selectOption('.ministrip2027 select', 'قطاعات كرافت لاين'); await page.waitForTimeout(300);
ok('الاختيار من القايمة غيّر القطاع وفتح أصنافه', (await page.evaluate(()=>state.mainGroup))==='قطاعات كرافت لاين' && (await page.$$('.pcard')).length===1);
// ── «اكسسوارات pvc» أيقونة واحدة بتجمع (اكسا + خارجيه + شاتر + WPC)
ok('القطاعات: «اكسسوارات pvc» أيقونة واحدة بدل (اكسا/خارجيه/شاتر/WPC)', await page.evaluate(()=>{ const o=orderSectors_(); return o.includes('اكسسوارات pvc') && !o.includes('شاتر') && !o.includes('ابواب WPC') && !o.includes('اكسسوارات pvc اكسا') && !o.includes('اكسسوارات خارجيه'); }));
await page.selectOption('.ministrip2027 select', 'اكسسوارات pvc'); await page.waitForTimeout(300);
const accNames = await page.$$eval('.pcard .pc-name', e=>e.map(x=>x.textContent.trim()));
ok('القطاع الموحّد فيه أصناف الأربع قطاعات مترتبة أبجدي', accNames.join('|')==='باب WPC|باكتة صغيرة|سيليكون شفاف|شاتر ابيض|مفصلة ثقيلة|مقبض خارجي', accNames.join('|'));
ok('من غير تصنيفات فرعية + رابط «أصناف أخرى» جوه', (await page.$('.chipgrid3'))===null && (await page.$('.otherlink'))!==null);
// الكمية فاضية للصنف من غير ألوان (الموزع يكتبها) + الوحدة صح حسب القطاع الأصلي
await page.click('.pc-head[data-val="مفصلة ثقيلة"]'); await page.waitForTimeout(300);
ok('الكمية فاضية (مش 1) للصنف اللي من غير ألوان', (await page.$eval('.qbox [data-act="staged-qty-input"]', e=>e.value))==='');
const cartBefore = await page.evaluate(()=>state.cart.length);
await page.click('.qbox [data-act="confirm-staged"]'); await page.waitForTimeout(200);
ok('مينفعش يضيف من غير ما يكتب كمية', (await page.evaluate(()=>state.cart.length))===cartBefore);
await page.fill('.qbox [data-act="staged-qty-input"]','3'); await page.click('.qbox [data-act="confirm-staged"]'); await page.waitForTimeout(300);
ok('الإضافة بالكمية المكتوبة وبالـ main الأصلي', (await page.evaluate(()=>state.cart.some(c=>c.product==='مفصلة ثقيلة' && c.main==='اكسسوارات pvc اكسا' && c.qty===3))));
await page.click('.otherlink'); await page.waitForTimeout(300);
ok('«أصناف أخرى» بتفتح من جوه القطاع', (await page.evaluate(()=>state.mainGroup))==='أصناف أخرى');
await page.selectOption('.ministrip2027 select', K); await page.waitForTimeout(300);
await page.evaluate(()=>{ state.cart=[]; render(); });
// ── مربعات الأنواع (باكتات / حلوق / ضلف …): دوس نوع يظهرلك أصنافه بس
await page.evaluate(([k])=>{ state.cart=[]; state.staged=[]; applySector_(k); render(); }, [K]); await page.waitForTimeout(300);
const fams = await page.$$eval('.famrow .fam b', e=>e.map(x=>x.textContent.trim()));
ok('مربعات الأنواع ظاهرة: الكل + حلوق + سقاسات + ضلف', fams[0]==='الكل' && fams.includes('حلوق') && fams.includes('سقاسات') && fams.includes('ضلف'), fams.join('|'));
await page.click('.fam[data-val="حلق"]'); await page.waitForTimeout(300);
ok('«حلوق» بتعرض الحلوق بس', (await page.$$eval('.pcard .pc-name', e=>e.map(x=>x.textContent.trim()))).every(n=>n.startsWith('حلق')) && (await page.$$('.pcard')).length===2);
await page.click('.fam[data-val=""]'); await page.waitForTimeout(300);
ok('«الكل» بترجّع كل الأصناف', (await page.$$('.pcard')).length===4);
// ── دوسة على لون موجود في السلة: بيتفتح للتعديل (مش بيتشال ويتمسح البند من السلة)
await page.evaluate(()=>{ state.staged=[]; state.cart=[]; render(); }); await page.waitForTimeout(200);
await page.evaluate(([k])=>{ cartAdd_({main:k,product:'سقاس مفصلي',name:'سقاس مفصلي ابيض',color:'ابيض',unitType:'لفة',qty:2}); cartAdd_({main:k,product:'ضلفة مفصلي',name:'ضلفة مفصلي ابيض',color:'ابيض',unitType:'لفة',qty:1}); render(); }, [K]); await page.waitForTimeout(200);
await page.click('[data-act="tile-color"][data-prod="سقاس مفصلي"][data-val="ابيض"]'); await page.waitForTimeout(300);
ok('اللون اتفتح بكميته القديمة (٢) ومااتمسحش من السلة', await page.evaluate(()=>{ const s=state.staged[0]; return s && s.selectedColors.join()==='ابيض' && s.qtys['ابيض']===2 && state.cart.length===1; }));
await page.evaluate(()=>{ cancelStaged(state.staged[0].key); }); await page.waitForTimeout(700);   // الإلغاء بيتأخر ٣٢٠ms للأنيميشن
ok('الإلغاء رجّع البند للسلة زي ما كان (من غير تكرار)', await page.evaluate(()=>state.cart.length===2 && state.cart.filter(c=>c.product==='سقاس مفصلي').length===1));
// ── «زود أصناف» بيرجع لنفس صفحة الأصناف ونفس القطاع ونفس السكرول
await page.evaluate(()=>window.scrollTo(0,120)); await page.waitForTimeout(150);
await page.click('[data-act="strip-go"][data-val="cart"]'); await page.waitForTimeout(250);
await page.click('[data-act="cart-add-more"]'); await page.waitForTimeout(400);
ok('«زود أصناف»: نفس القطاع والصفحة ونفس مكان السكرول', await page.evaluate(([k])=>state.view==='order' && state.mainGroup===k && !state.showCartReview && Math.abs(window.scrollY-120)<=2, [K]), String(await page.evaluate(()=>window.scrollY)));
// من الرئيسية: «زود أصناف» يودّي لشاشة الأصناف (مش يفضل في الرئيسية)
await page.evaluate(()=>{ state.view='home'; render(); }); await page.waitForTimeout(200);
await page.click('.bottomnav [data-act="open-cart-review"]'); await page.waitForTimeout(250);
await page.click('[data-act="cart-add-more"]'); await page.waitForTimeout(400);
ok('من الرئيسية «زود أصناف» بيفتح الأصناف على آخر قطاع', await page.evaluate(([k])=>state.view==='order' && state.mainGroup===k && !state.showCartReview, [K]));
ok('مفيش أخطاء جافاسكريبت', errors.length===0, errors.join(' | '));
await browser.close();
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
