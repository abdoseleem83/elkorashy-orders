// تجميع الأصناف المتكررة (v273): ٧ م / ٦.١٥ م / «3 مجري» في نيو / مفصلي بكاوتش من غير بار
// التشغيل: node tests/variant-merge.mjs   (بعد python3 -m http.server 8099)
import fs from 'fs';
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(PW);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
let fails = 0;
const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const items = JSON.parse(fs.readFileSync(new URL('../data/catalog-fallback.json', import.meta.url), 'utf-8')).map(r=>Object.assign({available:true,inStock:true,stock:10,price:null}, r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ serviceWorkers:'block' });
const page = await ctx.newPage();
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items,discounts:{}})}));
await page.goto(BASE+'/index.html', { waitUntil:'domcontentloaded' });
await page.waitForFunction(()=>typeof groupVariants_==='function' && typeof CATALOG!=='undefined' && CATALOG.length>100, null, {timeout:15000});
const res = await page.evaluate(()=>{
  const out = {};
  ['قطاعات كرافت لاين','نيو لاين'].forEach(main=>{
    const seen = new Set(), entries = [];
    CATALOG.filter(d=>d.main===main).forEach(d=>{ if(!seen.has(d.product)){ seen.add(d.product); entries.push({ main, name:d.product }); } });
    out[main] = groupVariants_(entries).map(g=>g.one ? g.base : g.base+' ['+g.items.length+']');
  });
  return out;
});
const k = res['قطاعات كرافت لاين'], n = res['نيو لاين'];
ok('كرافت: «حلق جرار 3 مجري ببار 5 سم» (٧ م) داخل نفس المجموعة', k.filter(x=>/^حلق جرار 3 مجري ببار 5 سم كرافت/.test(x)).length===1, k.filter(x=>/حلق جرار 3/.test(x)).join(' | '));
ok('كرافت: «ضلفه جرار كبيره» (٦.١٥ م) مجموعة واحدة', k.filter(x=>/^ضلفه جرار كبيره/.test(x)).length===1, k.filter(x=>/ضلفه جرار كبيره/.test(x)).join(' | '));
ok('كرافت: «حلق مفصلي بكاوتش ٦.٥ م» اندمج في «ببار 5 سم»', !k.some(x=>/^حلق مفصلي كرافت/.test(x)), k.filter(x=>/حلق مفصلي/.test(x)).join(' | '));
ok('نيو: «حلق جرار ببار 5 سم» مجموعة واحدة (3 مجري = نفس الصنف)', n.filter(x=>/^حلق جرار.*ببار 5 سم نيو/.test(x)).length===1, n.filter(x=>/حلق جرار/.test(x)).join(' | '));
await browser.close();
console.log(fails ? '❌ فشل '+fails : '✅ كله تمام'); process.exit(fails?1:0);
