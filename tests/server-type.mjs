// منطق السيرفر: نقل صنف بين الأنواع (عمود «النوع» في شيت الأصناف) — setProductType_
// بيشغّل السكربت الحقيقي في vm بشيت وهمي. التشغيل: node tests/server-type.mjs
import fs from 'fs'; import vm from 'vm';
let fails = 0; const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const src = fs.readFileSync(new URL('../apps_script.gs', import.meta.url), 'utf8');
// A=name B=main C=sub D=unit E=product F=color G=price H=stock I=available
const data = [
  ['name','main','sub','unit','product','color','price','stock','available'],
  ['حلق كومبن ابيض','قطاعات PVC كومبن','','4','حلق كومبن','ابيض','','10',''],
  ['حلق كومبن رمادي','قطاعات PVC كومبن','','4','حلق كومبن','رمادي','','10',''],
  ['سقاس كومبن ابيض','قطاعات PVC كومبن','','4','سقاس كومبن','ابيض','','10',''],
  ['حلق كرافت ابيض','قطاعات كرافت لاين','','4','حلق كومبن','ابيض','','10',''],   // نفس اسم الصنف بس قطاع تاني — مايتلمسش
];
const sheet = {
  getLastRow: () => data.length,
  getLastColumn: () => Math.max(...data.map(r=>r.length)),
  getRange: (r, c, nr=1, nc=1) => ({
    getValues: () => Array.from({length:nr}, (_,i)=> Array.from({length:nc}, (_,j)=> (data[r-1+i] && data[r-1+i][c-1+j]) ?? '')),
    setValue: v => { if(!data[r-1]) data[r-1]=[]; while(data[r-1].length < c) data[r-1].push(''); data[r-1][c-1] = v; },
  }),
};
const ctx = { console, Date, Math, JSON, String, Number, Array, Object, Map, Set, isFinite, parseFloat, parseInt,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
  LockService: {}, CacheService: {}, PropertiesService: {}, ScriptApp: {}, Utilities: {}, ContentService: {}, MailApp: {}, UrlFetchApp: {}, Session: {} };
vm.createContext(ctx); vm.runInContext(src, ctx);
const set = (m,p,t) => vm.runInContext(`setProductType_(${JSON.stringify(m)},${JSON.stringify(p)},${JSON.stringify(t)})`, ctx);

ok('أول نقل: بيعمل عمود «النوع» ويكتب «جرار» لكل ألوان الصنف', set('قطاعات PVC كومبن','حلق كومبن','جرار')===true && data[0][9]==='النوع' && data[1][9]==='جرار' && data[2][9]==='جرار');
ok('الأصناف التانية وقطاع كرافت (نفس الاسم) متلمسوش', (data[3][9]??'')==='' && (data[4][9]??'')==='');
ok('نوع غير معروف بيترفض', set('قطاعات PVC كومبن','حلق كومبن','حاجة غريبة')===false && data[1][9]==='جرار');
ok('«أخرى» مسموحة', set('قطاعات PVC كومبن','سقاس كومبن','أخرى')===true && data[3][9]==='أخرى');
ok('نوع فاضي = رجوع للتصنيف التلقائي', set('قطاعات PVC كومبن','حلق كومبن','')===true && data[1][9]==='' && data[2][9]==='');
ok('صنف مش موجود = false', set('قطاعات PVC كومبن','مش موجود','جرار')===false);
ok('العمود اتعمل مرة واحدة بس (من غير تكرار)', data[0].filter(h=>h==='النوع').length===1);
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
