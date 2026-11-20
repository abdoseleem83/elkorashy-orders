const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const filename = path.join(root, pathname === '/' ? 'index.html' : pathname);
    if(!filename.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(filename);
    const types = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png'};
    res.writeHead(200, {'Content-Type':types[path.extname(filename)] || 'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || undefined, args:['--no-sandbox']});
let failures=0;
const check=(name, condition) => { console.log((condition?'PASS ':'FAIL ')+name); if(!condition) failures++; };
try {
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  let mode='expired', createCalls=0, loginCalls=0;
  const captured=[];
  await page.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.hostname==='127.0.0.1') return route.continue();
    if(url.hostname!=='script.google.com') return route.fulfill({status:200,body:''});
    const body=req.method()==='POST'?JSON.parse(req.postData()||'{}'):{};
    const action=body.action || url.searchParams.get('action');
    let reply;
    if(action==='catalog') reply={items:[],discounts:{},version:'v287'};
    else if(action==='lookup') reply=[];
    else if(action==='version') reply={version:'v287',configured:true};
    else if(action==='login') {
      loginCalls++;
      reply=mode==='wrong-password'?{ok:false,reason:'invalid'}:{ok:true,username:'test',token:'renewed.test.session',distName:'Test Distributor',distType:'موزع'};
    } else if(action==='create' || action==='update') {
      createCalls++; captured.push(body);
      reply=body.token==='renewed.test.session'?{ok:true,orderNo:101}:{ok:false,error:'unauthorized'};
    } else reply={ok:true};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reply)});
  });
  await page.goto(base+'/index.html');
  await page.evaluate(()=>{
    state.installGateBypassed=true; state.showBiometricGate=false;
    state.currentUser={username:'test',distName:'Test Distributor',distType:'موزع',token:'expired.test.session'};
    localStorage.setItem(LS_USER_KEY,JSON.stringify(state.currentUser));
    localStorage.setItem(LS_BIOMETRIC_CREDID_KEY,'bW9jay1jcmVkZW50aWFs');
    localStorage.setItem(LS_BIOMETRIC_VAULT_KEY,JSON.stringify(state.currentUser));
    setUserToken('expired.test.session');
    sessionStorage.removeItem(SS_AUTHED_KEY);
    state.view='order'; state.distName='Test Distributor'; state.distRegion='Test'; state.distPhone='01000000000'; state.warehouse='طنطا';
    state.cart=[{main:'test',product:'Test Item',name:'Test Item',color:'white',qty:2,unitType:'قطعة',unit:1}];
    ensureLibs_=async()=>{};
    render();
  });
  await page.evaluate(()=>actuallySubmit());
  check('expired token opens renewal without logout',await page.evaluate(()=>!!state.reauth && state.currentUser.username==='test'));
  check('expired submission keeps cart',await page.evaluate(()=>state.cart.length===1 && state.cart[0].qty===2));
  mode='wrong-password';
  await page.evaluate(async()=>{state.reauth.pw='test-invalid'; await reauthSubmit_();});
  check('wrong password preserves cart and dialog',await page.evaluate(()=>!!state.reauth && !!state.reauth.err && state.cart.length===1));
  check('wrong password never retries order',createCalls===1);
  await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR || '/tmp','elkorashy-reauth-before.png'),fullPage:true});
  mode='expired';
  await page.evaluate(async()=>{state.reauth.pw='test-valid'; await reauthSubmit_();});
  check('successful renewal retries once',createCalls===2 && loginCalls===2);
  check('retry includes renewed token',captured[1]?.token==='renewed.test.session');
  check('success clears cart and dialog but not account',await page.evaluate(()=>!state.reauth && state.cart.length===0 && !!state.currentUser));
  check('normal token and saved user updated',await page.evaluate(()=>getUserToken()==='renewed.test.session' && JSON.parse(localStorage.getItem(LS_USER_KEY)).token==='renewed.test.session'));
  check('biometric session updated',await page.evaluate(()=>JSON.parse(localStorage.getItem(LS_BIOMETRIC_VAULT_KEY)).token==='renewed.test.session'));
  check('renewal marks browser session authenticated',await page.evaluate(()=>sessionStorage.getItem(SS_AUTHED_KEY)==='1'));
  await page.evaluate(async()=>{
    state.distName='Test Distributor'; state.warehouse='طنطا';
    state.cart=[{main:'test',product:'Second Item',name:'Second Item',color:'white',qty:1,unitType:'قطعة',unit:1}];
    await actuallySubmit();
  });
  check('next order uses renewed session without password',createCalls===3 && loginCalls===2 && await page.evaluate(()=>!state.reauth && state.cart.length===0));
  await page.evaluate(async()=>{
    Object.defineProperty(navigator,'credentials',{configurable:true,value:{get:async()=>({})}});
    state.currentUser=null;
    setUserToken('');
    await unlockWithBiometric();
  });
  check('biometric unlock restores the renewed token',await page.evaluate(()=>state.currentUser?.token==='renewed.test.session' && getUserToken()==='renewed.test.session'));
  await page.evaluate(async()=>{
    state.distName='Test Distributor'; state.warehouse='طنطا';
    state.cart=[{main:'test',product:'After Fingerprint',name:'After Fingerprint',color:'white',qty:1,unitType:'قطعة',unit:1}];
    await actuallySubmit();
  });
  check('order after biometric unlock needs no password renewal',createCalls===4 && loginCalls===2 && await page.evaluate(()=>!state.reauth && state.cart.length===0));
  await page.evaluate(()=>{
    localStorage.setItem(LS_BIOMETRIC_VAULT_KEY,JSON.stringify({username:'other',token:'other.session'}));
    saveUserSession_({username:'test',token:'new.test.session'});
  });
  check('another account biometric session is not overwritten',await page.evaluate(()=>JSON.parse(localStorage.getItem(LS_BIOMETRIC_VAULT_KEY)).token==='other.session'));
  await page.evaluate(()=>{
    localStorage.removeItem(LS_BIOMETRIC_VAULT_KEY);
    saveUserSession_({username:'test',token:'new.test.session'});
  });
  check('session renewal does not enroll biometric login',await page.evaluate(()=>localStorage.getItem(LS_BIOMETRIC_VAULT_KEY)===null));
  check('no runtime errors',errors.length===0);
  if(errors.length) console.log(errors.join('\n'));
  await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR || '/tmp','elkorashy-reauth-after.png'),fullPage:true});
} finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}
process.exitCode=failures?1:0;
