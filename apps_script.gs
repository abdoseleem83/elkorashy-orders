// ==== طلبات الموزعين - القرشي ====
// شغّل دالة setup() مرة واحدة بس بعد اللصق عشان تجهز الشيت

const SHEET_NAME = 'Orders';
const CATALOG_SHEET_NAME = 'الأصناف';
const DISCOUNT_SHEET_NAME = 'الخصومات';
const USERS_SHEET_NAME = 'المستخدمين';
const WA_QUEUE_SHEET_NAME = 'طابور إشعارات واتساب';
// سطر الاعتماد في رسائل الواتساب — خليه '' لو عايز تشيله
const CREDIT_LINE = 'تصميم وتنفيذ: عبد الخالق سليم — 01067765483';

// بيانات إشعار واتساب (CallMeBot)
const ADMIN_WHATSAPP = '+201067765483';
const CALLMEBOT_APIKEY = '3318176';

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  sheet.clear();
  sheet.appendRow(['رقم الطلب', 'التاريخ', 'الموزع', 'المنطقة', 'الهاتف', 'ملاحظات', 'ملخص الأصناف', 'الحالة', 'الأصناف (JSON)']);
  sheet.setFrozenRows(1);

  let usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(USERS_SHEET_NAME);
    usersSheet.appendRow(['اسم المستخدم', 'كلمة المرور', 'اسم الموزع', 'المنطقة', 'الهاتف', 'الحالة', 'تاريخ التسجيل', 'النوع']);
    usersSheet.setFrozenRows(1);
  }
}

function doPost(e) {
  try {
    return doPostInner_(e);
  } catch (err) {
    // أي خطأ هنا كان بيرجع صفحة HTML مبهمة، والتطبيق يعتبرها "فشل الحفظ" من غير
    // ما نعرف السبب. دلوقتي بنسجّله في شيت "أخطاء" ونرجّعه كنص واضح.
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let s = ss.getSheetByName('أخطاء');
      if (!s) { s = ss.insertSheet('أخطاء'); s.appendRow(['التاريخ', 'الخطأ', 'البيانات']); s.setFrozenRows(1); }
      s.appendRow([new Date(), String(err && err.stack ? err.stack : err), (e && e.postData ? String(e.postData.contents).slice(0, 400) : '')]);
    } catch (e2) {}
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPostInner_(e) {
  const data = JSON.parse(e.postData.contents);

  if (data.action === 'register') {
    return handleRegister(data);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const itemsSummary = data.items.map(it => it.product + (it.color ? ' - ' + it.color : '') + ' × ' + it.qty + ' ' + (it.unitType || '')).join(' | ');

  if (data.action === 'update') {
    const rows = sheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        sheet.getRange(i + 1, 3).setValue(data.distName);
        sheet.getRange(i + 1, 4).setValue(data.distRegion || '');
        sheet.getRange(i + 1, 5).setNumberFormat('@').setValue(String(data.distPhone || ''));
        sheet.getRange(i + 1, 6).setValue(data.note || '');
        sheet.getRange(i + 1, 7).setValue(itemsSummary);
        sheet.getRange(i + 1, 8).setValue('قيد التنفيذ');
        sheet.getRange(i + 1, 9).setValue(JSON.stringify(data.items));
        found = true;
        break;
      }
    }
    if (!found) {
      const newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 5).setNumberFormat('@');
      sheet.appendRow([data.id, new Date(data.ts), data.distName, data.distRegion || '', String(data.distPhone || ''), data.note || '', itemsSummary, 'قيد التنفيذ', JSON.stringify(data.items)]);
    }
    notifyWhatsApp(data, itemsSummary, true);
  } else {
    const newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 5).setNumberFormat('@');
    sheet.appendRow([
      data.id, new Date(data.ts), data.distName, data.distRegion || '', String(data.distPhone || ''),
      data.note || '', itemsSummary, data.status || 'قيد التنفيذ', JSON.stringify(data.items)
    ]);
    notifyWhatsApp(data, itemsSummary, false);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow(['اسم المستخدم', 'كلمة المرور', 'اسم الموزع', 'المنطقة', 'الهاتف', 'الحالة', 'تاريخ التسجيل', 'النوع']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleRegister(data) {
  const sheet = getUsersSheet_();
  const username = String(data.username || '').trim();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === username.toLowerCase()) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: 'exists' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  const distType = (String(data.distType || '').trim() === 'عميل') ? 'عميل' : 'موزع';
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 5).setNumberFormat('@');
  sheet.appendRow([
    username, String(data.password || ''), data.distName || '', data.distRegion || '',
    String(data.distPhone || ''), 'قيد المراجعة', new Date(), distType
  ]);
  notifyRegisterWhatsApp(data);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function notifyRegisterWhatsApp(data) {
  let msg = '🆕 طلب تسجيل مستخدم جديد\n';
  msg += '👤 اسم المستخدم: ' + data.username + '\n';
  msg += '🏬 الموزع: ' + (data.distName || '') + '\n';
  msg += '📍 المنطقة: ' + (data.distRegion || '') + '\n';
  if (data.distPhone) msg += '📞 ' + data.distPhone + '\n';
  queueWhatsApp_(msg);
}

function handleLogin(username, password) {
  const sheet = getUsersSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      const status = String(rows[i][5] || '').trim();
      if (String(rows[i][1]) !== String(password)) {
        return { ok: false, reason: 'invalid' };
      }
      if (status !== 'مفعل') {
        return { ok: false, reason: 'pending' };
      }
      // النوع (موزع/عميل) في العمود الثامن (index 7) — لو فاضي (حسابات قديمة) بنعتبره "موزع" افتراضيًا
      const distType = String(rows[i][7] || '').trim() === 'عميل' ? 'عميل' : 'موزع';
      return {
        ok: true,
        distName: rows[i][2] || '',
        distRegion: rows[i][3] || '',
        distPhone: rows[i][4] || '',
        distType: distType
      };
    }
  }
  return { ok: false, reason: 'invalid' };
}

function notifyWhatsApp(data, itemsSummary, isUpdate) {
  let msg = (isUpdate ? '✏️ تعديل على طلب #' : '📦 طلب جديد #') + data.id.toUpperCase() + '\n';
  msg += '👤 الموزع: ' + data.distName + '\n';
  msg += '📍 المنطقة: ' + (data.distRegion || '') + '\n';
  if (data.distPhone) msg += '📞 ' + data.distPhone + '\n';
  msg += '——————\n' + itemsSummary;
  queueWhatsApp_(msg);
}

// ⚠️ مهم: مابنبعتش الواتساب جوه طلب الحفظ نفسه.
// CallMeBot بيبقى بطيء أحيانًا (ثواني طويلة)، وكان بيأخّر رد السيرفر لدرجة إن
// التطبيق يعتبر إن الحفظ فشل — مع إن الطلب اتسجل فعلاً. فبدل كده بنسجّل الرسالة
// في طابور (شيت)، وبنرجّع الرد فورًا، و trigger كل دقيقة بيبعت اللي في الطابور.
function getWhatsAppQueueSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(WA_QUEUE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(WA_QUEUE_SHEET_NAME);
    sheet.appendRow(['التاريخ', 'الحالة', 'محاولات', 'نص الرسالة', 'آخر خطأ', 'المستلم', 'المفتاح']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// phone/apikey اختياريين — لو مفيش، بنبعت للأدمن زي الأول.
function queueWhatsApp_(msg, phone, apikey) {
  try {
    getWhatsAppQueueSheet_().appendRow([
      new Date(), 'في الانتظار', 0, msg, '',
      String(phone || ADMIN_WHATSAPP),
      String(apikey || CALLMEBOT_APIKEY)
    ]);
  } catch (e) {
    // لو حتى التسجيل في الطابور فشل، الطلب نفسه لازم يفضل متسجل — مانوقفش حاجة
  }
}

// بيدوّر على الموزع في شيت المستخدمين برقم تليفونه، ويرجّع مفتاح الواتساب بتاعه.
// المفتاح في العمود العاشر (J) — "مفتاح واتساب".
// الموزع لازم يكون فعّل CallMeBot لنفسه الأول عشان يبقى ليه مفتاح.
function getDistributorWaKey_(phone) {
  const target = normalizePhone(phone);
  if (!target) return null;
  try {
    const rows = getUsersSheet_().getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (normalizePhone(rows[i][4]) === target) {
        const key = String(rows[i][9] || '').trim();
        return key ? key : null;
      }
    }
  } catch (e) {}
  return null;
}

// شغّل الدالة دي مرة واحدة بس من محرر Apps Script عشان تركّب الـ trigger.
function installWhatsAppTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'processWhatsAppQueue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processWhatsAppQueue').timeBased().everyMinutes(1).create();
}

// بيشتغل تلقائيًا كل دقيقة: بياخد الرسائل المستنية ويبعتها.
function processWhatsAppQueue() {
  if (!CALLMEBOT_APIKEY) return;
  const sheet = getWhatsAppQueueSheet_();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const status = String(rows[i][1] || '').trim();
    if (status !== 'في الانتظار') continue;

    const attempts = Number(rows[i][2]) || 0;
    const msg = String(rows[i][3] || '');
    if (!msg) { sheet.getRange(i + 1, 2).setValue('اتلغت'); continue; }

    const toPhone = String(rows[i][5] || ADMIN_WHATSAPP);
    const toKey = String(rows[i][6] || CALLMEBOT_APIKEY);
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(toPhone)
      + '&text=' + encodeURIComponent(msg) + '&apikey=' + encodeURIComponent(toKey);

    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        sheet.getRange(i + 1, 2).setValue('اتبعتت');
      } else {
        markQueueAttempt_(sheet, i + 1, attempts, 'HTTP ' + res.getResponseCode());
      }
    } catch (err) {
      markQueueAttempt_(sheet, i + 1, attempts, String(err));
    }
  }
}

function markQueueAttempt_(sheet, rowNum, attempts, reason) {
  const next = attempts + 1;
  sheet.getRange(rowNum, 3).setValue(next);
  sheet.getRange(rowNum, 5).setValue(reason);
  // بعد 5 محاولات فاشلة بنوقف المحاولة ونسيبها ظاهرة في الشيت عشان تراجعها
  if (next >= 5) sheet.getRange(rowNum, 2).setValue('فشلت');
}

function rowToOrder(r) {
  // ⚠️ جوجل شيتس بيرجّع رقم الهاتف كـ Number (وبيشيل الصفر اللي في الأول).
  // لازم نحوّله لنص هنا، وإلا التطبيق بيحاول يعمل .trim() على رقم ويقع.
  return {
    id: String(r[0]),
    ts: new Date(r[1]).getTime(),
    distName: String(r[2] == null ? '' : r[2]),
    distRegion: String(r[3] == null ? '' : r[3]),
    distPhone: String(r[4] == null ? '' : r[4]),
    note: String(r[5] == null ? '' : r[5]),
    status: String(r[7] == null ? '' : r[7]),
    items: r[8] ? JSON.parse(r[8]) : []
  };
}

// ===== تحقق الأدمن (على السيرفر) =====
// ⚠️ قبل كده كان رقم الأدمن مكتوب جوه index.html — والملف ده عام على GitHub،
// يعني أي حد يفتح كود الصفحة كان يشوف الرقم ويدخل على "متابعة الطلبات".
// وأسوأ من كده: نداءات عرض/حذف/تعديل الطلبات مكانش عليها أي تحقق أصلاً،
// فأي حد معاه رابط الـ /exec كان يقدر يسحب كل الطلبات من غير رقم خالص.
// دلوقتي الرقم متخزن في Script Properties (مش في الكود العام)، وكل نداء إداري
// لازم يجيب معاه توكن صالح.

// شغّل الدالة دي مرة واحدة من محرر Apps Script عشان تحدد رقم الأدمن.
// غيّر الرقم اللي جوه لأي رقم إنت عايزه، وبعدين اضغط Run.
function setAdminPin() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', '3184');
}

function getAdminPin_() {
  return String(PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '');
}

// بيتحقق من الرقم ويرجّع توكن صالح 12 ساعة
function adminLogin_(pin) {
  const real = getAdminPin_();
  if (!real) return { ok: false, reason: 'not_configured' };
  if (String(pin || '').trim() !== real) return { ok: false, reason: 'wrong_pin' };

  const token = Utilities.getUuid();
  const expiry = Date.now() + 12 * 60 * 60 * 1000; // 12 ساعة
  const props = PropertiesService.getScriptProperties();
  props.setProperty('TOKEN_' + token, String(expiry));
  return { ok: true, token: token };
}

function isValidAdminToken_(token) {
  if (!token) return false;
  const props = PropertiesService.getScriptProperties();
  const exp = props.getProperty('TOKEN_' + token);
  if (!exp) return false;
  if (Date.now() > Number(exp)) {
    props.deleteProperty('TOKEN_' + token);
    return false;
  }
  return true;
}

function denyAdmin_() {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

function doGet(e) {
  const action = e.parameter.action;

  // افتح الرابط ده في المتصفح عشان تتأكد إن النشر (Deploy) فعلاً بيشغّل الكود
  // الجديد: /exec?action=version — لو رجّع v22 يبقى تمام.
  if (action === 'version') {
    return ContentService.createTextOutput(JSON.stringify({
      version: 'v36',
      hasQueue: !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WA_QUEUE_SHEET_NAME),
      time: new Date()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'login') {
    const result = handleLogin(e.parameter.username || '', e.parameter.password || '');
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // تسجيل دخول الأدمن — بيرجّع توكن
  if (action === 'adminLogin') {
    return ContentService.createTextOutput(JSON.stringify(adminLogin_(e.parameter.pin)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const isAdmin = isValidAdminToken_(e.parameter.token);

  if (action === 'updateStatus') {
    if (!isAdmin) return denyAdmin_();
    const id = e.parameter.id, status = e.parameter.status;
    const rows = sheet.getDataRange().getValues();
    let notified = false;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        sheet.getRange(i + 1, 8).setValue(status);

        // لما الحالة تبقى "تم التسليم" نبعت إشعار للموزع نفسه (مش للأدمن).
        // بيشتغل بس لو الموزع ليه مفتاح واتساب في شيت المستخدمين (عمود J).
        if (String(status).trim() === 'تم التسليم') {
          const distPhone = String(rows[i][4] || '');
          const key = getDistributorWaKey_(distPhone);
          if (key) {
            let msg = '✅ طلبك اتسلّم\n';
            msg += 'رقم الطلب: #' + String(id).toUpperCase() + '\n';
            msg += 'الموزع: ' + String(rows[i][2] || '') + '\n';
            msg += '——————\n';
            msg += 'شكرًا لتعاملك مع القرشي لأبواب وشبابيك الـ UPVC';
            if (CREDIT_LINE) msg += '\n' + CREDIT_LINE;
            queueWhatsApp_(msg, normalizePhone(distPhone), key);
            notified = true;
          }
        }
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, notified: notified }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'delete') {
    if (!isAdmin) return denyAdmin_();
    const id = e.parameter.id;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) { sheet.deleteRow(i + 1); break; }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'deleteDelivered') {
    if (!isAdmin) return denyAdmin_();
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i][7] === 'تم التسليم') sheet.deleteRow(i + 1);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'lookup') {
    const rows = sheet.getDataRange().getValues();
    rows.shift();
    let orders = rows.map(rowToOrder);
    if (e.parameter.ids) {
      const idSet = e.parameter.ids.split(',').map(x => x.trim().toLowerCase());
      orders = orders.filter(o => idSet.indexOf(o.id.toLowerCase()) !== -1);
    } else if (e.parameter.phone) {
      const phone = normalizePhone(e.parameter.phone);
      orders = orders.filter(o => {
        const stored = normalizePhone(o.distPhone);
        if (!stored || !phone) return false;
        return stored === phone || stored.endsWith(phone) || phone.endsWith(stored);
      });
    } else {
      orders = [];
    }
    orders.sort((a, b) => b.ts - a.ts);
    return ContentService.createTextOutput(JSON.stringify(orders)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'catalog') {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const csheet = ss.getSheetByName(CATALOG_SHEET_NAME);
    const dsheet = ss.getSheetByName(DISCOUNT_SHEET_NAME);

    // بقى عندنا عمود "الرصيد" (H) جوه شيت "الأصناف" نفسه (جمب عمود السعر)، بدل
    // ما نطابق الاسم مع شيت تاني منفصل. ده بيلغي مشكلة اختلاف كتابة الاسم بين
    // الشيتين تمامًا، لأن الرصيد بقى في نفس صف الصنف مباشرة.
    // خلية فاضية أو "غير متوفر" = مفيش رصيد. أي رقم = الرصيد الحالي.
    // عمود I (لو موجود) اختياري لتعطيل الصنف يدويًا بالكامل من الأدمن (قيمته "لا").
    let items = [];
    if (csheet) {
      const rows = csheet.getDataRange().getValues();
      rows.shift();
      items = rows.filter(r => r[0]).map(r => {
        const adminAvailable = !(r[8] && String(r[8]).trim() === 'لا');
        const stockText = String(r[7] || '').trim();
        const inStock = stockText !== '' && stockText !== 'غير متوفر';
        const stockQty = inStock ? (Number(stockText) || null) : null;
        return {
          name: r[0], main: r[1], sub: r[2],
          unit: Number(r[3]) || 1, product: r[4] || r[0], color: r[5] || '',
          price: (r[6] === '' || r[6] === null || r[6] === undefined) ? null : Number(r[6]),
          // "available" = الأدمن عطّل الصنف يدويًا (عمود I = "لا") — ده اللي يمنع اختيار الصنف خالص.
          // "inStock"/"stock" = من عمود "الرصيد" (H) — معلومة تحذيرية بس (مخزون حاليًا)،
          // ومش بيمنع موزع/عميل عايز يشوف السعر بس من اختيار الصنف وإضافته للطلب.
          available: adminAvailable,
          inStock: inStock,
          stock: stockQty
        };
      });
    }

    let discounts = {};
    if (dsheet) {
      const drows = dsheet.getDataRange().getValues();
      drows.shift();
      drows.forEach(r => {
        if (!r[0]) return;
        let v = Number(r[1]) || 0;
        // لو الخلية متنسقة كنسبة مئوية (%) في الشيت، getValues() بترجع الكسر
        // العشري (0.15) مش الرقم (15) — نحوّله هنا لرقم نسبة مئوية عادي.
        if (v > 0 && v < 1) v = v * 100;
        discounts[r[0]] = v;
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ items, discounts }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // default: list all orders (لوحة المتابعة الإدارية)
  // 🔒 دي كانت أخطر ثغرة: أي حد معاه رابط الـ /exec كان يقدر يسحب كل الطلبات
  // بكل الأسعار والأرقام من غير أي تحقق. دلوقتي لازم توكن أدمن صالح.
  if (!isAdmin) return denyAdmin_();
  const rows = sheet.getDataRange().getValues();
  rows.shift();
  const orders = rows.map(rowToOrder).reverse();
  return ContentService.createTextOutput(JSON.stringify(orders)).setMimeType(ContentService.MimeType.JSON);
}
