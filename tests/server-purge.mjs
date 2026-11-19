// منطق السيرفر (apps_script.gs) — الحذف التلقائي للمنفَّذ بعد ٥ دقايق + دمج الأصناف المكررة
// بيشغّل السكربت الحقيقي في vm بشيت وهمي (من غير جوجل). التشغيل: node tests/server-purge.mjs
import fs from 'fs'; import vm from 'vm';
let fails = 0; const ok = (n, c, x='') => { console.log((c?'✅':'❌')+' '+n+(x?' — '+x:'')); if(!c) fails++; };
const src = fs.readFileSync(new URL('../apps_script.gs', import.meta.url), 'utf8');

const H = 13;                                    // عدد أعمدة شيت الطلبات (آخرها «وقت التنفيذ»)
const mkRow = (id, status, doneAt) => { const r = Array(H).fill(''); r[0]=id; r[7]=status; r[12]=doneAt||''; return r; };
const sheetData = [ Array(H).fill('h') ];
const sheet = {
  getLastRow: () => sheetData.length,
  getRange: (r, c, nr=1, nc=1) => ({
    getValues: () => sheetData.slice(r-1, r-1+nr).map(row => row.slice(c-1, c-1+nc)),
    getValue: () => sheetData[r-1] ? sheetData[r-1][c-1] : '',
    setValue: v => { if(!sheetData[r-1]) sheetData[r-1] = Array(H).fill(''); sheetData[r-1][c-1] = v; },
  }),
  getDataRange: () => ({ getValues: () => sheetData.map(r => r.slice()) }),
  deleteRows: (start, count) => { sheetData.splice(start-1, count); },
  deleteRow: r => { sheetData.splice(r-1, 1); },
};
let dirty = 0;
const ctx = { console, Date, Math, JSON, String, Number, Array, Object, Map, Set, isFinite, parseFloat, parseInt,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  ScriptApp: {}, Utilities: {}, ContentService: {}, MailApp: {}, UrlFetchApp: {}, Session: {},
};
vm.createContext(ctx); vm.runInContext(src, ctx);
vm.runInContext('markReservedDirty_ = function(){ globalThis.__dirty = (globalThis.__dirty||0)+1; };', ctx);
const DONE = vm.runInContext('STATUS_DONE', ctx), NEW = vm.runInContext('STATUS_PENDING', ctx);

const HOUR = 3600 * 1000, now = Date.now();
sheetData.push(
  mkRow('old-done',   DONE, new Date(now - 6*60*1000)),   // اتنفّذ من 6 دقايق → يتمسح
  mkRow('fresh-done', DONE, new Date(now - 4*60*1000)),   // من 4 دقايق        → يفضل
  mkRow('legacy-done',DONE, ''),                        // منفَّذ قديم من غير وقت → ياخد وقت دلوقتي ويفضل
  mkRow('pending',    NEW,  ''),                        // مش منفَّذ          → يفضل
  mkRow('old-done-2', DONE, new Date(now - 100*HOUR)),  // → يتمسح
);
const res = vm.runInContext('purgeDoneOrders_()', ctx);
const ids = () => sheetData.slice(1).map(r => r[0]);
ok('اتمسح الطلبين المنفَّذين من أكتر من ٥ دقايق', res.deleted === 2 && !ids().includes('old-done') && !ids().includes('old-done-2'), JSON.stringify(res));
ok('المنفَّذ من أقل من ٥ دقايق فضل', ids().includes('fresh-done'));
ok('الطلب اللي مش منفَّذ ما اتلمسش', ids().includes('pending'));
const legacy = sheetData.find(r => r[0] === 'legacy-done');
ok('منفَّذ قديم من غير وقت: فضل وخد وقت التنفيذ دلوقتي (مهلة ٥ دقايق)', !!legacy && legacy[12] instanceof Date && Math.abs(legacy[12].getTime()-now) < 60000);
const res2 = vm.runInContext('purgeDoneOrders_()', ctx);
ok('تشغيله تاني ما بيمسحش حاجة زيادة', res2.deleted === 0 && ids().length === 3, JSON.stringify(res2));

// تحويل الحالة لـ «تم التنفيذ» بيسجّل الوقت، ورجوعها لحاجة تانية بيمسحه
vm.runInContext(`updateOrderStatus_('pending', STATUS_DONE)`, ctx);
const p = sheetData.find(r => r[0] === 'pending');
ok('تغيير الحالة لـ «تم التنفيذ» سجّل وقت التنفيذ', p[12] instanceof Date);
vm.runInContext(`updateOrderStatus_('pending', STATUS_PREPARING)`, ctx);
ok('رجوع الحالة لتجهيز مسح وقت التنفيذ', p[12] === '');

// دمج الأصناف المكررة (سيرفر)
const merged = vm.runInContext(`mergeDuplicateItems_([
  {main:'م',product:'ص',color:'ابيض',unitType:'لفة',qty:2},
  {main:'م',product:'ص',color:'ابيض',unitType:'لفة',qty:3,unavailable:true},
  {main:'م',product:'ص',color:'بيج',unitType:'لفة',qty:1}])`, ctx);
ok('الأصناف المكررة اتدمجت وجمعت الكمية', merged.length === 2 && merged[0].qty === 5, JSON.stringify(merged.map(m=>m.qty)));
ok('علامة «غير متوفر» اتحفظت في الدمج', merged[0].unavailable === true);
ok('ملفات الأرشفة مش موجودة في السكربت', !/archiveDoneOrders_|restoreArchivedOrder_|listArchivedOrders_|getArchiveSheet_/.test(src));
console.log(fails ? ('❌ فشل '+fails) : '✅ كله تمام'); process.exit(fails?1:0);
