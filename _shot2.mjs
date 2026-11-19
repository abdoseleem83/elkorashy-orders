import fs from 'fs';
const { chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs');
const items = JSON.parse(fs.readFileSync('data/catalog-fallback.json','utf-8')).map(r=>Object.assign({available:true,inStock:true,stock:10,price:null},r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers:'block', viewport:{width:1200,height:900} });
const page = await ctx.newPage(); page.on('pageerror',e=>console.log('ERR',e.message));
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.route('**/script.google.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items,discounts:{}})}));
await page.goto('http://127.0.0.1:8099/index.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>typeof buildShortageImageGroup==='function' && CATALOG.length>100);
const b64 = await page.evaluate(async ()=>{
  const mk=(main,product,color,qty)=>({main,product,color,qty,unitType:'عود',name:product+' '+color});
  const o={id:'x',ts:Date.now(),orderNo:5,distName:'t',warehouse:'طنطا',status:STATUS_RECEIVED,items:[
    mk('قطاعات كرافت لاين','حلق جرار 3 مجري ببار 5 سم كرافت','ابيض',8),
    mk('قطاعات كرافت لاين','باكته دبل جرار كرافت','بيج',4),
    mk('نيو لاين','ضلفه جرار نيو','ابيض',3)]};
  const blobs = await buildShortageImageGroup(o,'kraft_new');
  const buf = await blobs[0].arrayBuffer(); let s=''; new Uint8Array(buf).forEach(c=>s+=String.fromCharCode(c)); return btoa(s);
});
fs.writeFileSync('/tmp/shortage.png', Buffer.from(b64,'base64'));
await browser.close();
