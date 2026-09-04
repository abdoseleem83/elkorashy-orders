// ==== طلبات الموزعين - القرشي — الباك إند (Google Apps Script) ====
//
// ⚠️⚠️ الملف ده نسخة مرجعية موجودة في مستودع **عام** على GitHub.
// ممنوع منعًا باتًا كتابة أي سر جواه (أرقام PIN، مفاتيح API، مفاتيح خاصة).
// كل الأسرار بتتخزّن في Script Properties — شوف setupWizard() تحت.
//
// خطوات النشر بعد أي تعديل:
//   ١) الصق الملف كله في محرر Apps Script
//   ٢) Deploy → Manage deployments → عدّل النشر الحالي → Version: New version
//   ٣) افتح /exec?action=version وتأكد إن الرقم الراجع = APP_VERSION تحت
//
// أول مرة بس: شغّل setupWizard() ثم installTriggers() من محرر Apps Script.

const APP_VERSION = 'v207';

const SHEET_NAME = 'Orders';
const ARCHIVE_SHEET_NAME = 'الأرشيف';
const CATALOG_SHEET_NAME = 'الأصناف';
const DISCOUNT_SHEET_NAME = 'الخصومات';
const USERS_SHEET_NAME = 'المستخدمين';
const WA_QUEUE_SHEET_NAME = 'طابور إشعارات واتساب';
const PW_REQUESTS_SHEET_NAME = 'طلبات الباسورد';
const ORDER_COUNTER_SHEET_NAME = 'عداد الطلبات';
const ERRORS_SHEET_NAME = 'أخطاء';

// ===== مراحل الطلب (لازم تطابق نفس النصوص في index.html بالظبط) =====
const STATUS_RECEIVED = 'تم استلام الطلب';
const STATUS_PENDING = STATUS_RECEIVED;   // اسم قديم — سايبينه عشان أي كود بيناديه
const STATUS_DONE = 'تم تنفيذ الطلب';
const STATUS_EDITED = 'مُعدّل';            // الطلب القديم بعد ما يتعمله تعديل

// أعمدة شيت Orders (1-indexed) — مكان واحد بدل أرقام سايبة في الكود
const COL_ID = 1, COL_TS = 2, COL_NAME = 3, COL_REGION = 4, COL_PHONE = 5,
      COL_NOTE = 6, COL_SUMMARY = 7, COL_STATUS = 8, COL_ITEMS = 9,
      COL_WAREHOUSE = 10, COL_ORDERNO = 11, COL_USERNAME = 12;
const ORDERS_HEADERS = ['رقم الطلب', 'التاريخ', 'الموزع', 'المنطقة', 'الهاتف', 'ملاحظات',
                        'ملخص الأصناف', 'الحالة', 'الأصناف (JSON)', 'المخزن',
                        'رقم الطلب بالمخزن', 'اسم المستخدم'];

// سطر الاعتماد في رسائل الواتساب — خليه '' لو عايز تشيله
const CREDIT_LINE = '🤲 ادعُ لصاحب هذا العمل بظهر الغيب';

// المخزن الوحيد اللي الرصيد بيتحجز عليه (الرصيد في شيت الأصناف رقم عام واحد)
// ⚠️🛘 CRITICAL: هذا الثابت يحدد المخزن الوحيد اللي بيتم حجز البضاعة له.
// ⚠️ تغيير قيمته = حجز بضاعة خاطئ + أرقام رصيد كاذبة لمخازن تانية.
// ⚠️ **بلاش تغيّره إلا لو قالتلك الإدارة العليا بالظبط.**
const RESERVED_WAREHOUSE_ = 'طنطا';

// مدة صلاحية التوكنات
const TTL_ADMIN_MS = 12 * 60 * 60 * 1000;        // ١٢ ساعة
const TTL_USER_MS  = 30 * 24 * 60 * 60 * 1000;   // ٣٠ يوم

// حد محاولات تسجيل الدخول الفاشلة قبل القفل المؤقت
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;   // ١٥ دقيقة

// حد إجمالي لطلبات "تسجيل حساب جديد" في نفس النافذة الزمنية — بدون ده أي حد
// يقدر يغرق شيت "المستخدمين" وإشعارات الأدمن بحسابات وهمية.
const REGISTER_MAX_PER_WINDOW = 20;
const REGISTER_WINDOW_SECONDS = 15 * 60;   // ١٥ دقيقة


// ═══════════════════════════════════════════════════════════════════
//  الأسرار — كلها من Script Properties، مفيش ولا واحد مكتوب في الملف ده
// ═══════════════════════════════════════════════════════════════════

function props_() { return PropertiesService.getScriptProperties(); }

function secret_(key) {
  const v = props_().getProperty(key);
  return (v === null || v === undefined) ? '' : String(v);
}

/**
 * 🔧 شغّلها مرة واحدة من محرر Apps Script (المحرر ده خاص بيك، مش عام).
 *
 * الطريقة:
 *   ١) اكتب القيم جوه الأقواس تحت
 *   ٢) اضغط Run
 *   ٣) **امسح القيم تاني وسيبها فاضية واحفظ** — عشان لو الملف اتنسخ
 *      للمستودع العام مايبقاش فيه أي سر
 *
 * أي خانة بتسيبها فاضية مش هتتغيّر — يعني تقدر تشغّلها تاني لتغيير
 * رقم واحد بس من غير ما تكتب الباقي.
 */
function setupWizard() {
  const values = {
    ADMIN_PIN:        '',   // رقم فتح "متابعة المخزن"
    MANAGE_PIN:       '',   // رقم فتح تبويب "الإدارة"
    CALLMEBOT_APIKEY: '',   // مفتاح CallMeBot المرتبط برقم واتساب الأدمن
    ADMIN_WHATSAPP:   ''    // رقم واتساب الأدمن بصيغة دولية: ‎+201xxxxxxxxx
  };

  const p = props_();
  const changed = [];
  Object.keys(values).forEach(function (k) {
    if (String(values[k]).trim()) { p.setProperty(k, String(values[k]).trim()); changed.push(k); }
  });
  ensureTokenSecret_();

  const missing = ['ADMIN_PIN', 'MANAGE_PIN', 'CALLMEBOT_APIKEY', 'ADMIN_WHATSAPP']
    .filter(function (k) { return !secret_(k); });

  const msg = 'اتغيّر: ' + (changed.length ? changed.join('، ') : 'لا شيء') +
              '\nلسه ناقص: ' + (missing.length ? missing.join('، ') : 'لا شيء ✅');
  Logger.log(msg);
  return msg;
}

/** بيتأكد إن فيه مفتاح توقيع للتوكنات، وبينشئه لو مش موجود. */
function ensureTokenSecret_() {
  const p = props_();
  let s = p.getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

/**
 * 🚨 بيلغي كل التوكنات الصالحة فورًا (أدمن + إدارة + كل الموزعين).
 * شغّلها لو شكيت إن حد وصل لتوكن، أو بعد ما تغيّر أرقام الـ PIN.
 */
function revokeAllTokens() {
  props_().setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  return 'كل التوكنات اتلغت — كل الناس هتحتاج تدخل تاني.';
}


// ═══════════════════════════════════════════════════════════════════
//  التوكنات — موقّعة بـ HMAC، مش متخزنة
// ═══════════════════════════════════════════════════════════════════
//
// قبل كده كان كل توكن بيتخزّن كـ property مستقل ومابيتمسحش أبدًا، فـ Script
// Properties كان بيكبر للأبد لحد ما يوصل للحد (500KB) ويقع كل حاجة.
// دلوقتي التوكن نفسه بيحمل بياناته وتوقيعه: role|subject|expiry + HMAC-SHA256.
// السيرفر بيتحقق من التوقيع من غير ما يخزّن حاجة — صفر تخزين وصفر تنضيف.

function b64uEncode_(str) {
  return Utilities.base64EncodeWebSafe(str, Utilities.Charset.UTF_8).replace(/=+$/, '');
}
function b64uDecode_(s) {
  const pad = s.length % 4;
  if (pad) s += '===='.slice(pad);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}
function hmacB64u_(payload) {
  const sig = Utilities.computeHmacSha256Signature(payload, ensureTokenSecret_());
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

/** role: 'admin' | 'manage' | 'user' — subject: اسم المستخدم (أو '' للأدمن) */
function signToken_(role, subject, ttlMs) {
  const payload = role + '|' + String(subject || '') + '|' + (Date.now() + ttlMs);
  return b64uEncode_(payload) + '.' + hmacB64u_(payload);
}

/** بيرجّع subject (ممكن يكون '') لو التوكن صالح للدور المطلوب، أو null. */
function verifyToken_(token, wantRole) {
  try {
    const t = String(token || '');
    const dot = t.indexOf('.');
    if (dot < 1) return null;
    const payload = b64uDecode_(t.slice(0, dot));
    if (hmacB64u_(payload) !== t.slice(dot + 1)) return null;
    const parts = payload.split('|');
    if (parts.length !== 3) return null;
    if (parts[0] !== wantRole) return null;
    if (Date.now() > Number(parts[2])) return null;
    return parts[1];
  } catch (e) { return null; }
}

function isValidAdminToken_(token) {
  return verifyToken_(token, 'admin') !== null;
}
// الأدمن ليه نفس صلاحية الإدارة أو أعلى، فتوكنه مقبول في نداءات الإدارة كمان.
function isValidManageToken_(token) {
  return verifyToken_(token, 'manage') !== null || isValidAdminToken_(token);
}
/** بيرجّع اسم المستخدم لو التوكن توكن موزّع صالح، أو null. */
function userFromToken_(token) {
  const u = verifyToken_(token, 'user');
  return u ? u : null;
}

// 🔒 نفس آلية قفل محاولات الدخول (isLoginLocked_) لكن بمفتاح ثابت بدل اسم
// مستخدم — عشان محدش يقدر يجرّب رقم الـ PIN آلاف المرات في السكريبت.
function adminLogin_(pin) {
  const real = secret_('ADMIN_PIN');
  if (!real) return { ok: false, reason: 'not_configured' };
  if (isLoginLocked_('admin_pin')) return { ok: false, reason: 'locked' };
  if (String(pin || '').trim() !== real) { noteLoginFail_('admin_pin'); return { ok: false, reason: 'wrong_pin' }; }
  clearLoginFails_('admin_pin');
  return { ok: true, token: signToken_('admin', '', TTL_ADMIN_MS) };
}

function manageLogin_(pin) {
  const real = secret_('MANAGE_PIN');
  if (!real) return { ok: false, reason: 'not_configured' };
  if (isLoginLocked_('manage_pin')) return { ok: false, reason: 'locked' };
  if (String(pin || '').trim() !== real) { noteLoginFail_('manage_pin'); return { ok: false, reason: 'wrong_pin' }; }
  clearLoginFails_('manage_pin');
  return { ok: true, token: signToken_('manage', '', TTL_ADMIN_MS) };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function denyAdmin_()  { return json_({ ok: false, error: 'unauthorized' }); }
function denyManage_() { return json_({ ok: false, error: 'unauthorized' }); }
function denyAuth_()   { return json_({ ok: false, error: 'unauthorized' }); }


// ═══════════════════════════════════════════════════════════════════
//  كلمات المرور — SHA-256 مع salt لكل مستخدم
// ═══════════════════════════════════════════════════════════════════
//
// الحسابات القديمة باسووردها متخزّن نص صريح. مابنكسرهاش: أول ما المستخدم
// يدخل بنجاح بالباسورد القديم، بنحوّله لـ hash في نفس اللحظة (ترقية صامتة).
// بعد فترة كل الحسابات هتبقى مشفّرة من غير ما حد يعمل حاجة.

function hashPw_(pw, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + '|' + String(pw), Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ((b & 0xFF) + 0x100).toString(16).slice(1); }).join('');
}
function makePwHash_(pw) {
  const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  return 'sha256$' + salt + '$' + hashPw_(pw, salt);
}
function isHashedPw_(stored) {
  return String(stored || '').indexOf('sha256$') === 0;
}
function verifyPw_(stored, pw) {
  const s = String(stored || '');
  if (isHashedPw_(s)) {
    const parts = s.split('$');
    return parts.length === 3 && hashPw_(pw, parts[1]) === parts[2];
  }
  return s !== '' && s === String(pw);   // حساب قديم بنص صريح
}

/**
 * 🔧 اختياري: بيحوّل كل الباسوردات المتخزنة نص صريح لـ hash دفعة واحدة.
 * ⚠️ بعد ما تشغّلها، الباسوردات مش هتبقى مقروءة من الشيت خالص (وده المطلوب) —
 * لو نسي حد باسورده، الحل الوحيد يبقى "نسيت كلمة المرور" جوه التطبيق.
 */
function hashAllPasswords() {
  const sheet = getUsersSheet_();
  const n = sheet.getLastRow() - 1;
  if (n < 1) return 'مفيش مستخدمين.';
  const range = sheet.getRange(2, 2, n, 1);
  const vals = range.getValues();
  let done = 0;
  for (let i = 0; i < vals.length; i++) {
    const cur = String(vals[i][0] || '');
    if (cur && !isHashedPw_(cur)) { vals[i][0] = makePwHash_(cur); done++; }
  }
  if (done) range.setValues(vals);
  return 'اتشفّر ' + done + ' باسورد.';
}

// ===== حد محاولات الدخول =====
// بنستخدم CacheService لأنه بيمسح نفسه لوحده بعد المدة — مفيش تنضيف يدوي.
function loginFailKey_(username) {
  return 'lf_' + String(username || '').trim().toLowerCase();
}
function isLoginLocked_(username) {
  try {
    const n = Number(CacheService.getScriptCache().get(loginFailKey_(username)) || 0);
    return n >= LOGIN_MAX_FAILS;
  } catch (e) { return false; }
}
function noteLoginFail_(username) {
  try {
    const cache = CacheService.getScriptCache();
    const key = loginFailKey_(username);
    const n = Number(cache.get(key) || 0) + 1;
    cache.put(key, String(n), LOGIN_LOCK_SECONDS);
  } catch (e) {}
}
function clearLoginFails_(username) {
  try { CacheService.getScriptCache().remove(loginFailKey_(username)); } catch (e) {}
}

// ===== حد معدّل التسجيل =====
// عدّاد عام (مش لكل مستخدم — لسه مفيش اسم مستخدم وقت التسجيل) بيمنع إغراق
// النظام بحسابات وهمية. بيمسح نفسه لوحده بعد النافذة الزمنية.
function isRegisterFlooded_() {
  try {
    const n = Number(CacheService.getScriptCache().get('reg_flood') || 0);
    return n >= REGISTER_MAX_PER_WINDOW;
  } catch (e) { return false; }
}
function noteRegisterAttempt_() {
  try {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get('reg_flood') || 0) + 1;
    cache.put('reg_flood', String(n), REGISTER_WINDOW_SECONDS);
  } catch (e) {}
}


// ═══════════════════════════════════════════════════════════════════
//  تجهيز الشيتات
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ تحذير تاريخي: النسخة القديمة من setup() كانت فيها sheet.clear() —
// يعني أي Run عليها (حتى بالغلط، وهي أول دالة في القائمة!) كان بيمسح كل
// الطلبات. ده حصل فعلاً واتفقدت طلبات. دلوقتي الدالة "آمنة": بتعمل الشيتات
// لو مش موجودة وبتضيف العناوين لو الشيت فاضي — عمرها ما بتمسح أي بيانات.

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ORDERS_HEADERS);
    sheet.setFrozenRows(1);
  } else {
    // شيت قديم — نضيف عناوين الأعمدة الجديدة بس، من غير ما نلمس أي بيانات
    if (!sheet.getRange(1, COL_ORDERNO).getValue()) sheet.getRange(1, COL_ORDERNO).setValue(ORDERS_HEADERS[COL_ORDERNO - 1]);
    if (!sheet.getRange(1, COL_USERNAME).getValue()) sheet.getRange(1, COL_USERNAME).setValue(ORDERS_HEADERS[COL_USERNAME - 1]);
  }
  getUsersSheet_();
  getArchiveSheet_();
  ensureTokenSecret_();
  return 'تمام — الشيتات جاهزة.';
}

/** 🔧 شغّلها مرة واحدة: بتركّب كل الـ triggers المطلوبة. */
function installTriggers() {
  const wanted = { 'processWhatsAppQueue': 1, 'reconcileReserved': 10 };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (wanted.hasOwnProperty(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processWhatsAppQueue').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('reconcileReserved').timeBased().everyMinutes(10).create();
  return 'اتركّبوا: طابور الواتساب (كل دقيقة) + مزامنة المحجوز (كل ١٠ دقايق).';
}

// اسم قديم — سايبينه عشان لو حد بينده عليه من المحرر
function installWhatsAppTrigger() { return installTriggers(); }

function getUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow(['اسم المستخدم', 'كلمة المرور', 'اسم الموزع', 'المنطقة', 'الهاتف',
                     'الحالة', 'تاريخ التسجيل', 'النوع', '', 'مفتاح واتساب', 'اشتراك Push']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getArchiveSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ARCHIVE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ARCHIVE_SHEET_NAME);
    sheet.appendRow(ORDERS_HEADERS.concat(['تاريخ الأرشفة']));
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getPwRequestsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PW_REQUESTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PW_REQUESTS_SHEET_NAME);
    sheet.appendRow(['رقم الطلب', 'التاريخ', 'اسم المستخدم', 'الباسورد الجديد', 'الحالة']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logError_(where, err, extra) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let s = ss.getSheetByName(ERRORS_SHEET_NAME);
    if (!s) { s = ss.insertSheet(ERRORS_SHEET_NAME); s.appendRow(['التاريخ', 'الخطأ', 'البيانات']); s.setFrozenRows(1); }
    s.appendRow([new Date(), where + ': ' + String(err && err.stack ? err.stack : err), String(extra || '').slice(0, 400)]);
  } catch (e2) {}
}


// ═══════════════════════════════════════════════════════════════════
//  doPost — كل العمليات اللي بتغيّر بيانات
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ كل عملية بتعدّل أو بتمسح بقت هنا (POST) مش في doGet. قبل كده كان
// ?action=delete مجرد رابط — أي حد يفتحه (أو أي أداة بتعمل prefetch للروابط)
// كان بيمسح طلب. GET المفروض يقرا بس.

function doPost(e) {
  try {
    return doPostInner_(e);
  } catch (err) {
    logError_('doPost', err, e && e.postData ? e.postData.contents : '');
    return json_({ ok: false, error: String(err) });
  }
}

function doPostInner_(e) {
  const data = JSON.parse(e.postData.contents);
  const action = String(data.action || '');
  const token = data.token;

  // ---------- عمليات مفتوحة (بدون توكن) ----------
  if (action === 'login')                 return json_(handleLogin(data.username || '', data.password || ''));
  if (action === 'register')              return handleRegister(data);
  if (action === 'requestPasswordReset')  return handleRequestPasswordReset(data);

  // ---------- عمليات الموزّع (بتوكن المستخدم) ----------
  if (action === 'savePushSub') {
    // 🔒 قبل كده أي حد كان يقدر يبعت اسم أي مستخدم ويمسح/يغيّر اشتراكه.
    const me = userFromToken_(token);
    if (!me) return denyAuth_();
    return json_({ ok: savePushSub_(me, data.sub || null) });
  }

  // ---------- إدارة الأصناف ----------
  if (action === 'manageUpdateCatalogItem') {
    if (!isValidManageToken_(token)) return denyManage_();
    return json_({ ok: updateCatalogItem_(data.item || {}) });
  }
  if (action === 'manageAddCatalogItem') {
    if (!isValidManageToken_(token)) return denyManage_();
    return json_({ ok: addCatalogItem_(data.item || {}) });
  }
  if (action === 'uploadCatalog') {
    if (!isValidAdminToken_(token)) return denyAdmin_();
    return json_(Object.assign({ ok: true }, bulkUpdateCatalog_(data.rows || [], data.mode || 'full')));
  }
  if (action === 'manageUploadCatalog') {
    if (!isValidManageToken_(token)) return denyManage_();
    return json_(Object.assign({ ok: true }, bulkUpdateCatalog_(data.rows || [], data.mode || 'full')));
  }

  // ---------- موافقات الإدارة ----------
  if (action === 'manageApproveReg' || action === 'manageRejectReg') {
    if (!isValidManageToken_(token)) return denyManage_();
    return json_({ ok: decideRegRequest_(data.username, action === 'manageApproveReg') });
  }
  if (action === 'manageApprovePasswordReset' || action === 'manageRejectPasswordReset') {
    if (!isValidManageToken_(token)) return denyManage_();
    return json_({ ok: decidePwRequest_(data.id, action === 'manageApprovePasswordReset') });
  }
  if (action === 'approvePasswordReset' || action === 'rejectPasswordReset') {
    if (!isValidAdminToken_(token)) return denyAdmin_();
    return json_({ ok: decidePwRequest_(data.id, action === 'approvePasswordReset') });
  }

  // ---------- عمليات الأدمن على الطلبات ----------
  if (action === 'updateStatus') {
    if (!isValidAdminToken_(token)) return denyAdmin_();
    return json_(updateOrderStatus_(data.id, data.status));
  }
  if (action === 'delete') {
    if (!isValidAdminToken_(token)) return denyAdmin_();
    return json_(deleteOrderById_(data.id));
  }
  if (action === 'deleteDelivered') {
    if (!isValidAdminToken_(token)) return denyAdmin_();
    return json_(deleteDeliveredOrders_());
  }
  if (action === 'archiveDone') {
    if (!isValidAdminToken_(token)) return denyAdmin_();
    return json_(archiveDoneOrders_());
  }
  if (action === 'restoreArchived') {
    if (!isValidAdminToken_(token)) return denyAdmin_();
    return json_(restoreArchivedOrder_(data.id));
  }

  // ---------- حفظ / تعديل طلب ----------
  // 🔒 قبل كده كان بيقبل الحفظ من غير توكن خالص، ولو مفيش توكن كان بياخد
  // username من اللي الواجهة بعتته زي ما هو — يعني أي حد يعرف رابط الـ/exec
  // (المكتوب في index.html اللي في مستودع عام) يقدر يحقن طلب وهمي منسوب
  // لأي اسم موزّع حقيقي، من غير تسجيل دخول خالص. دلوقتي لازم توكن موزّع صالح.
  if (action === 'create' || action === 'update') {
    if (!userFromToken_(token)) return denyAuth_();
    return saveOrder_(data);
  }

  return json_({ ok: false, error: 'unknown action: ' + action });
}


// ═══════════════════════════════════════════════════════════════════
//  حفظ وتعديل الطلبات
// ═══════════════════════════════════════════════════════════════════

function saveOrder_(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return json_({ ok: false, error: 'sheet not found' });

  const items = Array.isArray(data.items) ? data.items : [];
  const itemsSummary = items.map(function (it) {
    return it.product + (it.color ? ' - ' + it.color : '') + ' × ' + it.qty + ' ' + (it.unitType || '');
  }).join(' | ');

  const isUpdate = data.action === 'update';
  // اسم المستخدم بيتاخد من التوكن بس — مش من اللي الواجهة بعتته، عشان محدش
  // يقدر ينسب طلب لحساب مش بتاعه. doPostInner_ بيتأكد إن التوكن صالح قبل ما
  // يوصل هنا أصلاً، فمفيش داعي لأي fallback على data.username.
  const username = userFromToken_(data.token) || '';

  const idCol = sheet.getLastRow() > 1
    ? sheet.getRange(2, COL_ID, sheet.getLastRow() - 1, 1).getValues()
    : [];

  // 🔒 idempotent: نفس رقم الطلب اتسجّل قبل كده (ضغطة مرتين أو إعادة محاولة
  // من النت) → مانضيفش صف تاني، بنرجّع رقم الطلب الموجود زي ما هو.
  for (let i = 0; i < idCol.length; i++) {
    if (String(idCol[i][0]) === String(data.id)) {
      const existingNo = sheet.getRange(i + 2, COL_ORDERNO).getValue();
      return json_({ ok: true, orderNo: existingNo || '', duplicate: true });
    }
  }

  // ✏️ التعديل بيعمل صف **جديد** برقم وتاريخ جديد، والقديم بيتعلّم "مُعدّل"
  // (يفضل ظاهر للأدمن كنسخة قديمة) — مش بيحدّث نفس الصف.
  //
  // 🔒 ثغرة اتصلحت: الكود القديم كان بيعلّم أي صف رقمه = oldId من غير ما
  // يتأكد إن الطلب ده بتاع نفس الموزّع اللي باعت. يعني أي موزّع مسجّل دخول
  // كان يقدر يبعت oldId بتاع طلب **موزّع تاني** ويخليه "مُعدّل" — الطلب
  // بيختفي من متابعة صاحبه وحجز بضاعته بيتفك. دلوقتي بنتأكد من الملكية:
  // إما اسم المستخدم مطابق، أو (للطلبات القديمة اللي مالهاش عمود اسم مستخدم)
  // رقم التليفون مطابق. غير كده بنسيب الصف القديم زي ما هو.
  if (isUpdate && data.oldId != null && String(data.oldId)) {
    const oldId = String(data.oldId);
    const myPhone = normalizePhone((userInfo_(username) || {}).phone || '');
    for (let i = 0; i < idCol.length; i++) {
      if (String(idCol[i][0]) !== oldId) continue;
      const rowUser = String(sheet.getRange(i + 2, COL_USERNAME).getValue() || '').trim();
      const rowPhone = normalizePhone(sheet.getRange(i + 2, COL_PHONE).getValue());
      const mine = rowUser
        ? (rowUser.toLowerCase() === String(username).trim().toLowerCase())
        : (!!myPhone && rowPhone === myPhone);
      if (mine) sheet.getRange(i + 2, COL_STATUS).setValue(STATUS_EDITED);
      break;
    }
  }

  const orderNo = getNextOrderNumber_(data.warehouse);
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, COL_PHONE).setNumberFormat('@');
  sheet.appendRow([
    data.id, new Date(data.ts), data.distName, data.distRegion || '',
    String(data.distPhone || ''), data.note || '', itemsSummary,
    isUpdate ? STATUS_PENDING : (data.status || STATUS_PENDING),
    JSON.stringify(items), data.warehouse || '', orderNo, username
  ]);

  notifyWhatsApp(data, itemsSummary, isUpdate, orderNo);
  markReservedDirty_();   // بيتزامن في الخلفية خلال دقيقة
  return json_({ ok: true, orderNo: orderNo });
}

// رقم الطلب لكل مخزن بيبدأ من 1 ويزيد لوحده — كل مخزن ليه عدّاد مستقل.
// Lock عشان لو طلبين اتبعتوا في نفس اللحظة من نفس المخزن مايخدوش نفس الرقم.
function getNextOrderNumber_(warehouse) {
  const wh = String(warehouse || 'عام').trim() || 'عام';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ORDER_COUNTER_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(ORDER_COUNTER_SHEET_NAME);
      sheet.appendRow(['المخزن', 'آخر رقم']);
      sheet.setFrozenRows(1);
    }
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === wh) {
        const next = (Number(rows[i][1]) || 0) + 1;
        sheet.getRange(i + 1, 2).setValue(next);
        return next;
      }
    }
    sheet.appendRow([wh, 1]);
    return 1;
  } finally {
    lock.releaseLock();
  }
}

function updateOrderStatus_(id, status) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  let notified = false;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][COL_ID - 1]) !== String(id)) continue;
    sheet.getRange(i + 1, COL_STATUS).setValue(status);

    // إشعار واتساب للموزّع نفسه (مش للأدمن) — بيشتغل بس لو الموزع ليه
    // مفتاح CallMeBot في شيت المستخدمين (عمود J).
    const st = String(status).trim();
    const distPhone = String(rows[i][COL_PHONE - 1] || '');
    const key = getDistributorWaKey_(distPhone);
    if (key && (st === STATUS_DONE || st === STATUS_RECEIVED)) {
      const orderNo = String(rows[i][COL_ORDERNO - 1] || id);
      const distName = String(rows[i][COL_NAME - 1] || '');
      let msg;
      if (st === STATUS_DONE) {
        msg = '✅ طلبك اتنفّذ بالكامل\n' +
              'رقم الطلب: #' + orderNo + '\n' +
              'الموزع: ' + distName + '\n' +
              '——————\n' +
              'شكرًا لتعاملك مع القرشي لأبواب وشبابيك الـ UPVC';
        if (CREDIT_LINE) msg += '\n' + CREDIT_LINE;
      } else {
        msg = '📦 جاري تجهيز طلبك\n' +
              'رقم الطلب: #' + orderNo + '\n' +
              'الموزع: ' + distName;
      }
      queueWhatsApp_(msg, normalizePhone(distPhone), key);
      notified = true;
    }
    break;
  }
  markReservedDirty_();   // الحالة اتغيّرت — الحجز لازم يتحدّث
  return { ok: true, notified: notified };
}

function deleteOrderById_(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const n = sheet.getLastRow() - 1;
  if (n < 1) return { ok: true, deleted: 0 };
  const ids = sheet.getRange(2, COL_ID, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      markReservedDirty_();   // بيتزامن في الخلفية خلال دقيقة
      return { ok: true, deleted: 1 };
    }
  }
  return { ok: true, deleted: 0 };
}

/**
 * بيمسح الصفوف المطلوبة **بالمجموعات المتجاورة** بدل صف صف.
 * ٥٠٠ طلب منفَّذ كانوا ٥٠٠ نداء لـ Sheets API — وده بيتخطى حد الـ٦ دقايق
 * ويقع في النص ويسيب البيانات نص ممسوحة. دلوقتي بقوا نداءات معدودة.
 * ⚠️ rowNums لازم تكون أرقام صفوف فعلية (1-indexed).
 */
function deleteRowsBatch_(sheet, rowNums) {
  const sorted = rowNums.slice().sort(function (a, b) { return b - a; });   // من تحت لفوق
  let i = 0;
  while (i < sorted.length) {
    let end = sorted[i];        // أعلى رقم في المجموعة
    let start = end;
    while (i + 1 < sorted.length && sorted[i + 1] === start - 1) { i++; start = sorted[i]; }
    sheet.deleteRows(start, end - start + 1);
    i++;
  }
}

function deleteDeliveredOrders_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const n = sheet.getLastRow() - 1;
  if (n < 1) return { ok: true, deleted: 0 };
  const statuses = sheet.getRange(2, COL_STATUS, n, 1).getValues();
  const rows = [];
  for (let i = 0; i < statuses.length; i++) {
    if (String(statuses[i][0]).trim() === STATUS_DONE) rows.push(i + 2);
  }
  if (rows.length) deleteRowsBatch_(sheet, rows);
  markReservedDirty_();   // بيتزامن في الخلفية خلال دقيقة
  return { ok: true, deleted: rows.length };
}


// ═══════════════════════════════════════════════════════════════════
//  الأرشيف
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ الميزة دي كانت موجودة في الواجهة من زمان (٣ زراير) بس السيرفر مكانش
// عارف الـ actions دي خالص — فالنداء كان بيقع لآخر doGet ويرجّع قايمة كل
// الطلبات. النتيجة إن شاشة "الأرشيف" كانت بتعرض **كل الطلبات النشطة** على
// إنها مؤرشفة، وزراير الأرشفة/الاسترجاع كانت بتقول "حصل خطأ" كل مرة.

function archiveDoneOrders_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const asheet = getArchiveSheet_();
  const n = sheet.getLastRow() - 1;
  if (n < 1) return { ok: true, archived: 0 };

  const width = ORDERS_HEADERS.length;
  const data = sheet.getRange(2, 1, n, width).getValues();
  const toMove = [], rowNums = [];
  const now = new Date();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_STATUS - 1]).trim() === STATUS_DONE) {
      toMove.push(data[i].concat([now]));
      rowNums.push(i + 2);
    }
  }
  if (!toMove.length) return { ok: true, archived: 0 };

  asheet.getRange(asheet.getLastRow() + 1, 1, toMove.length, width + 1).setValues(toMove);
  deleteRowsBatch_(sheet, rowNums);
  markReservedDirty_();   // بيتزامن في الخلفية خلال دقيقة
  return { ok: true, archived: toMove.length };
}

function listArchivedOrders_() {
  const asheet = getArchiveSheet_();
  const n = asheet.getLastRow() - 1;
  if (n < 1) return [];
  const width = ORDERS_HEADERS.length;
  return asheet.getRange(2, 1, n, width).getValues()
    .filter(function (r) { return r[COL_ID - 1]; })
    .map(rowToOrder)
    .sort(function (a, b) { return b.ts - a.ts; });
}

function restoreArchivedOrder_(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const asheet = getArchiveSheet_();
  const n = asheet.getLastRow() - 1;
  if (n < 1) return { ok: false, error: 'الأرشيف فاضي' };

  const width = ORDERS_HEADERS.length;
  const data = asheet.getRange(2, 1, n, width).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_ID - 1]) === String(id)) {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, width).setValues([data[i]]);
      asheet.deleteRow(i + 2);
      markReservedDirty_();   // بيتزامن في الخلفية خلال دقيقة
      return { ok: true };
    }
  }
  return { ok: false, error: 'الطلب مش موجود في الأرشيف' };
}


// ═══════════════════════════════════════════════════════════════════
//  الحسابات: دخول / تسجيل / نسيان الباسورد
// ═══════════════════════════════════════════════════════════════════

function handleLogin(username, password) {
  const uname = String(username || '').trim();
  if (!uname) return { ok: false, reason: 'invalid' };

  // 🔒 حد للمحاولات الفاشلة — من غيره التخمين الآلي مفتوح على الآخر
  if (isLoginLocked_(uname)) return { ok: false, reason: 'locked' };

  const sheet = getUsersSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() !== uname.toLowerCase()) continue;

    if (!verifyPw_(rows[i][1], password)) {
      noteLoginFail_(uname);
      return { ok: false, reason: 'invalid' };
    }
    const status = String(rows[i][5] || '').trim();
    if (status !== 'مفعل') return { ok: false, reason: 'pending' };

    clearLoginFails_(uname);
    // ترقية صامتة: الباسورد كان نص صريح → نحوّله لـ hash دلوقتي
    if (!isHashedPw_(rows[i][1])) {
      try { sheet.getRange(i + 1, 2).setValue(makePwHash_(password)); } catch (e) {}
    }

    // النوع (موزع/عميل) في العمود الثامن — لو فاضي (حسابات قديمة) يبقى "موزع"
    const distType = String(rows[i][7] || '').trim() === 'عميل' ? 'عميل' : 'موزع';
    const realUsername = String(rows[i][0]).trim();
    return {
      ok: true,
      username: realUsername,
      distName: rows[i][2] || '',
      distRegion: rows[i][3] || '',
      distPhone: String(rows[i][4] == null ? '' : rows[i][4]),
      distType: distType,
      token: signToken_('user', realUsername, TTL_USER_MS)
    };
  }
  noteLoginFail_(uname);
  return { ok: false, reason: 'invalid' };
}

function handleRegister(data) {
  if (isRegisterFlooded_()) return json_({ ok: false, reason: 'flooded' });
  noteRegisterAttempt_();
  const sheet = getUsersSheet_();
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  if (!username || !password) return json_({ ok: false, reason: 'missing' });

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === username.toLowerCase()) {
      return json_({ ok: false, reason: 'exists' });
    }
  }
  const distType = (String(data.distType || '').trim() === 'عميل') ? 'عميل' : 'موزع';
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 5).setNumberFormat('@');
  sheet.appendRow([
    username, makePwHash_(password), data.distName || '', data.distRegion || '',
    String(data.distPhone || ''), 'قيد المراجعة', new Date(), distType
  ]);
  notifyRegisterWhatsApp(data);
  return json_({ ok: true });
}

// الموزع بيكتب الباسورد الجديد اللي عايزه، بس مابيتفعّلش على طول — بيتسجّل
// "قيد المراجعة" وبيوصل إشعار واتساب للأدمن، ولازم موافقة من داخل التطبيق.
// ⚠️ الباسورد بيتخزّن **مشفّر** في شيت الطلبات — قبل كده كان نص صريح وبيفضل
// موجود في الشيت للأبد حتى بعد الموافقة.
function handleRequestPasswordReset(data) {
  const username = String(data.username || '').trim();
  const newPassword = String(data.newPassword || '');
  if (!username || !newPassword) return json_({ ok: false, error: 'بيانات ناقصة' });

  const users = getUsersSheet_().getDataRange().getValues();
  let found = false;
  for (let i = 1; i < users.length; i++) {
    if (String(users[i][0]).trim().toLowerCase() === username.toLowerCase()) { found = true; break; }
  }
  if (!found) return json_({ ok: false, error: 'اسم المستخدم مش موجود' });

  getPwRequestsSheet_().appendRow([
    Utilities.getUuid(), new Date(), username, makePwHash_(newPassword), 'قيد المراجعة'
  ]);

  queueWhatsApp_('🔑 طلب تغيير باسورد\n👤 اسم المستخدم: ' + username +
    '\nافتح التطبيق → الإدارة → الموافقات عشان توافق أو ترفض.');
  return json_({ ok: true });
}

// شيت طلبات الباسورد مالوش عمود "اسم الموزع" (اسم المستخدم بس)، وده مش واضح
// كفاية للأدمن. بندوّر على اسم الموزّع من شيت المستخدمين ونرجّعه معاه.
function listPwRequests_() {
  const rows = getPwRequestsSheet_().getDataRange().getValues();
  rows.shift();
  const usersRows = getUsersSheet_().getDataRange().getValues();
  const distNameByUsername_ = {};
  usersRows.forEach(function (r) {
    const u = String(r[0] || '').trim().toLowerCase();
    if (u) distNameByUsername_[u] = String(r[2] || '');
  });
  const out = [];
  rows.forEach(function (r) {
    if (String(r[4] || '').trim() !== 'قيد المراجعة') return;
    const username = String(r[2] || '');
    out.push({
      id: String(r[0]),
      date: r[1] ? new Date(r[1]).toLocaleString('ar-EG') : '',
      username: username,
      distName: distNameByUsername_[username.trim().toLowerCase()] || ''
    });
  });
  return out.reverse();
}

// موافقة: بينقل الباسورد الجديد (المشفّر) لشيت المستخدمين، وبيمسحه من شيت
// الطلبات عشان مايفضلش متخزّن في مكانين. رفض: بيقفل الطلب من غير تغيير.
function decidePwRequest_(id, approve) {
  const sheet = getPwRequestsSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    const username = String(rows[i][2] || '');
    const newPassword = String(rows[i][3] || '');
    if (approve) {
      // الطلبات القديمة كانت بتتخزن نص صريح — نشفّرها دلوقتي قبل الحفظ
      const toStore = isHashedPw_(newPassword) ? newPassword : makePwHash_(newPassword);
      const users = getUsersSheet_();
      const urows = users.getDataRange().getValues();
      for (let j = 1; j < urows.length; j++) {
        if (String(urows[j][0]).trim().toLowerCase() === username.trim().toLowerCase()) {
          users.getRange(j + 1, 2).setValue(toStore);
          clearLoginFails_(username);
          break;
        }
      }
    }
    sheet.getRange(i + 1, 4).setValue('———');   // مانحتفظش بالباسورد بعد القرار
    sheet.getRange(i + 1, 5).setValue(approve ? 'تمت الموافقة' : 'مرفوض');
    return true;
  }
  return false;
}

// شيت المستخدمين: A=username, B=password, C=distName, D=distRegion,
// E=distPhone, F=status, G=date, H=distType. "قيد المراجعة" = محتاج موافقة.
function listRegRequests_() {
  const rows = getUsersSheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][5] || '').trim() !== 'قيد المراجعة') continue;
    out.push({
      username: String(rows[i][0] || ''),
      distName: String(rows[i][2] || ''),
      distRegion: String(rows[i][3] || ''),
      distPhone: String(rows[i][4] == null ? '' : rows[i][4]),
      distType: String(rows[i][7] || 'موزع'),
      date: rows[i][6] ? new Date(rows[i][6]).toLocaleString('ar-EG') : ''
    });
  }
  return out.reverse();
}

// موافقة: الحالة → "مفعل". رفض: → "مرفوض" (الصف يفضل للمرجع، مفيش حذف نهائي).
function decideRegRequest_(username, approve) {
  const sheet = getUsersSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      sheet.getRange(i + 1, 6).setValue(approve ? 'مفعل' : 'مرفوض');
      return true;
    }
  }
  return false;
}


// ═══════════════════════════════════════════════════════════════════
//  إشعارات واتساب (CallMeBot) — عن طريق طابور
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ مابنبعتش الواتساب جوه طلب الحفظ نفسه. CallMeBot بيبقى بطيء أحيانًا
// (ثواني طويلة) وكان بيأخّر رد السيرفر لدرجة إن التطبيق يعتبر الحفظ فشل —
// مع إن الطلب اتسجل فعلاً. بنسجّل الرسالة في طابور (شيت) ونرجّع الرد فورًا،
// و trigger كل دقيقة بيبعت اللي في الطابور.

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

// phone/apikey اختياريين — لو مفيش، بنبعت للأدمن.
function queueWhatsApp_(msg, phone, apikey) {
  try {
    getWhatsAppQueueSheet_().appendRow([
      new Date(), 'في الانتظار', 0, msg, '',
      String(phone || secret_('ADMIN_WHATSAPP')),
      String(apikey || secret_('CALLMEBOT_APIKEY'))
    ]);
  } catch (e) {
    // لو حتى التسجيل في الطابور فشل، الطلب نفسه لازم يفضل متسجل — مانوقفش حاجة
  }
}

function notifyWhatsApp(data, itemsSummary, isUpdate, orderNo) {
  queueWhatsApp_(
    (isUpdate ? '✏️ تعديل على طلب #' : '📦 طلب جديد #') + (orderNo || '') + '\n' +
    '👤 الموزع: ' + data.distName + '\n' +
    '🏬 مكان التحميل: ' + (data.warehouse || '—')
  );
}

function notifyRegisterWhatsApp(data) {
  let msg = '🆕 طلب تسجيل مستخدم جديد\n';
  msg += '👤 اسم المستخدم: ' + data.username + '\n';
  msg += '🏬 الموزع: ' + (data.distName || '') + '\n';
  msg += '📍 المنطقة: ' + (data.distRegion || '') + '\n';
  if (data.distPhone) msg += '📞 ' + data.distPhone + '\n';
  queueWhatsApp_(msg);
}

// بيدوّر على الموزع في شيت المستخدمين برقم تليفونه ويرجّع مفتاح الواتساب
// بتاعه (عمود J). الموزع لازم يكون فعّل CallMeBot لنفسه عشان يبقى ليه مفتاح.
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

// بيشتغل تلقائيًا كل دقيقة: بياخد الرسايل المستنية ويبعتها.
function processWhatsAppQueue() {
  // بنركب المزامنة المؤجّلة على نفس الـ trigger بدل ما نعمل تاني — أرخص وأبسط
  syncReservedIfDirty_();
  if (!secret_('CALLMEBOT_APIKEY')) return;
  const sheet = getWhatsAppQueueSheet_();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim() !== 'في الانتظار') continue;

    const attempts = Number(rows[i][2]) || 0;
    const msg = String(rows[i][3] || '');
    if (!msg) { sheet.getRange(i + 1, 2).setValue('اتلغت'); continue; }

    const toPhone = String(rows[i][5] || secret_('ADMIN_WHATSAPP'));
    const toKey = String(rows[i][6] || secret_('CALLMEBOT_APIKEY'));
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(toPhone) +
                '&text=' + encodeURIComponent(msg) + '&apikey=' + encodeURIComponent(toKey);
    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) sheet.getRange(i + 1, 2).setValue('اتبعتت');
      else markQueueAttempt_(sheet, i + 1, attempts, 'HTTP ' + res.getResponseCode());
    } catch (err) {
      markQueueAttempt_(sheet, i + 1, attempts, String(err));
    }
  }
}

function markQueueAttempt_(sheet, rowNum, attempts, reason) {
  const next = attempts + 1;
  sheet.getRange(rowNum, 3).setValue(next);
  sheet.getRange(rowNum, 5).setValue(reason);
  // بعد ٥ محاولات فاشلة بنوقف ونسيبها ظاهرة في الشيت عشان تراجعها
  if (next >= 5) sheet.getRange(rowNum, 2).setValue('فشلت');
}


// ═══════════════════════════════════════════════════════════════════
//  إشعارات المتصفح (Web Push) — متوقفة حاليًا
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ النسخة القديمة كانت بتبعت الـ payload خام لـ endpoint الاشتراك من غير
// حاجتين إجباريتين في بروتوكول Web Push:
//   ١) هيدر Authorization فيه VAPID JWT موقّع (RFC 8292)
//   ٢) تشفير الـ payload بـ aes128gcm (RFC 8291)
// خدمة الـ push كانت بترد 401/400 دايمًا — يعني **مفيش ولا إشعار واحد وصل
// لأي مستخدم** من يوم ما الميزة اتكتبت. وأسوأ: الكود كان بيعتبر الرد ده
// اشتراك ميت ويمسحه.
//
// Apps Script مافيهوش ECDSA signing ولا AES-GCM ولا ECDH، فتنفيذ البروتوكول
// صح مش ممكن هنا. فوقفنا الإرسال، والاعتماد بقى على واتساب (اللي شغال فعلاً).
//
// لو عايز الإشعارات تشتغل بجد لاحقًا: استخدم خدمة وسيطة بتتنادى بـ
// UrlFetchApp عادي — Firebase Cloud Messaging HTTP v1 أو OneSignal —
// وسيب savePushSub_ زي ما هي لأنها بتجمّع الاشتراكات أصلاً.

function savePushSub_(username, subJson) {
  const sheet = getUsersSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      sheet.getRange(i + 1, 11).setValue(subJson ? JSON.stringify(subJson) : '');
      return true;
    }
  }
  return false;
}

function sendWebPush_(username, title, body, tag) {
  return false;   // متوقفة — شوف الشرح فوق
}


// ═══════════════════════════════════════════════════════════════════
//  حساب البضاعة المحجوزة
// ═══════════════════════════════════════════════════════════════════
//
// بيبني خريطة: اسم الصنف → الكمية المحجوزة (بالعود/القطعة) من الطلبات اللي
// لسه ماتنفذتش **ومخزنها طنطا بس**. أي طلب من مخزن تاني مابيحجزش خالص.
// أول ما الطلب يتنفذ أو يتحذف أو يتأرشف، الحجز بيروح لوحده.

function findHeaderCol_(headers, name) {
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim() === name) return i;
  }
  return -1;
}

/** محتوى اللفة لكل صنف — بيقرا عمودين بس (A و D) مش الشيت كله. */
function catalogUnitMap_(csheet) {
  const n = csheet.getLastRow() - 1;
  const map = {};
  if (n < 1) return map;
  const vals = csheet.getRange(2, 1, n, 4).getValues();
  for (let i = 0; i < vals.length; i++) {
    const k = String(vals[i][0] || '').trim();
    if (k) map[k] = Number(vals[i][3]) || 1;
  }
  return map;
}

function buildReservedMap_(csheet) {
  const reserved = {};
  try {
    const unitByName = csheet ? catalogUnitMap_(csheet) : {};

    const osheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!osheet) return reserved;
    const n = osheet.getLastRow() - 1;
    if (n < 1) return reserved;

    // ⚡ الأعمدة المطلوبة بس (الحالة، الأصناف، المخزن) بدل الشيت كله.
    // القراءة الكاملة كانت بتجيب ١٢ عمود × كل الطلبات في كل عملية حفظ.
    const rows = osheet.getRange(2, COL_STATUS, n, 3).getValues();
    const BIG_UNITS = ['لفة', 'كرتونة'];

    for (let i = 0; i < rows.length; i++) {
      const status = String(rows[i][0] || '').trim();
      // 🐞 إصلاح الحجز المزدوج: الطلب اللي اتعدّل بيسيب صف قديم حالته "مُعدّل"
      // وصف جديد حالته "تم استلام الطلب". الكود القديم كان بيستثني المنفَّذ بس،
      // فالاتنين كانوا بيتحسبوا → كل تعديل بيحجز ضعف الكمية، ولو اتعدّل ٣ مرات
      // بيحجز ٤ أضعاف. أصناف متاحة فعلاً كانت بتبان "مفيش رصيد" بسبب ده.
      if (status === STATUS_DONE || status === STATUS_EDITED) continue;
      if (String(rows[i][2] || '').trim() !== RESERVED_WAREHOUSE_) continue;

      let items = [];
      try { items = rows[i][1] ? JSON.parse(rows[i][1]) : []; } catch (e) { continue; }
      if (!Array.isArray(items)) continue;

      items.forEach(function (it) {
        const name = String(it.name || it.product || '').trim();
        if (!name) return;
        const qty = Number(it.qty) || 0;
        if (qty <= 0) return;
        const content = unitByName[name] || 1;
        reserved[name] = (reserved[name] || 0) +
          (BIG_UNITS.indexOf(String(it.unitType || '')) >= 0 ? qty * content : qty);
      });
    }
  } catch (e) {
    // خريطة فاضية = مفيش حجز، والرصيد يظهر زي ما هو — أأمن من إننا نوقف كل حاجة
    logError_('buildReservedMap_', e, '');
  }
  return reserved;
}

/**
 * بيكتب "بضاعة محجوزة" و"رصيد متبقي" في شيت الأصناف.
 * "الرصيد" يفضل رقمك إنت زي ما هو — إحنا بنكتب في العمودين الجداد بس:
 *   بضاعة محجوزة = مجموع كميات الطلبات اللي لسه ماتنفذتش (بالعود/القطعة)
 *   رصيد متبقي   = الرصيد − بضاعة محجوزة (مش أقل من صفر)
 * لو العمودين مش موجودين بالاسم بالظبط، بيتخطى من غير أي خطأ.
 */
function syncReservedColumns_() {
  // ⚠️ getDocumentLock مش getScriptLock: العدّاد (getNextOrderNumber_) بياخد
  // الـ script lock، ولو استخدمنا نفس النوع هنا كان الاتنين بيزاحموا بعض
  // ويأخّروا الطلب. ودلوقتي مابنستناش خالص (tryLock(0)) — لو مشغول نسيبها
  // للمرة الجاية، والـ trigger كل ١٠ دقايق بيضمن إنها تحصل.
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(0)) { markReservedDirty_(); return; }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const csheet = ss.getSheetByName(CATALOG_SHEET_NAME);
    if (!csheet) return;

    const lastRow = csheet.getLastRow();
    const lastCol = csheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    const headers = csheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const stockCol = findHeaderCol_(headers, 'الرصيد');
    const reservedCol = findHeaderCol_(headers, 'بضاعة محجوزة');
    const remainCol = findHeaderCol_(headers, 'رصيد متبقي');
    if (stockCol < 0 || reservedCol < 0 || remainCol < 0) return;   // الأعمدة مش موجودة

    const n = lastRow - 1;
    const names = csheet.getRange(2, 1, n, 1).getValues();
    const stocks = csheet.getRange(2, stockCol + 1, n, 1).getValues();
    const reserved = buildReservedMap_(csheet);

    const reservedOut = [], remainOut = [];
    for (let i = 0; i < n; i++) {
      const name = String(names[i][0] || '').trim();
      if (!name) { reservedOut.push(['']); remainOut.push(['']); continue; }
      const rawStockText = String(stocks[i][0] == null ? '' : stocks[i][0]).trim();
      const rawStock = (rawStockText !== '' && rawStockText !== 'غير متوفر') ? (Number(rawStockText) || 0) : null;
      const held = reserved[name] || 0;
      reservedOut.push([held]);
      remainOut.push([rawStock === null ? '' : Math.max(0, rawStock - held)]);
    }

    csheet.getRange(2, reservedCol + 1, n, 1).setValues(reservedOut);
    csheet.getRange(2, remainCol + 1, n, 1).setValues(remainOut);
  } catch (e) {
    // مانوقفش أي عملية حفظ/تعديل/حذف بسبب فشل في تحديث عمودين إضافيين
    logError_('syncReservedColumns_', e, '');
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ⚡ ليه المزامنة مابقتش جوه مسار الحفظ؟
// ═══════════════════════════════════════════════════════════════════
//
// syncReservedColumns_ بتقرا شيت الأصناف كله + شيت الطلبات كله وبتكتب عمودين.
// ده ٨-١٠ نداءات لـ Sheets API، وكل نداء بياخد جزء من الثانية — يعني ثواني
// مضافة على **كل** طلب بيتبعت، والموزّع قاعد مستني الشاشة.
//
// وأسوأ: getNextOrderNumber_ بتاخد الـ script lock، والمزامنة بتاخد نفس النوع،
// والـ trigger الدوري كمان. فلو اتصادفوا، الطلب بيستنى الـ lock لحد ٢٥ ثانية.
//
// الحل: الحفظ بيعلّم "فيه تغيير" وبيرجّع فورًا، والمزامنة بتحصل في الخلفية
// خلال دقيقة (مع trigger الواتساب اللي شغّال كل دقيقة أصلاً). الرصيد المعروض
// بيتأخر دقيقة على الأكتر — وده مقبول تمامًا في الشغل، مقابل إن إرسال الطلب
// بقى فوري.

const RESERVED_DIRTY_KEY = 'RESERVED_DIRTY';

function markReservedDirty_() {
  try { props_().setProperty(RESERVED_DIRTY_KEY, '1'); } catch (e) {}
}

/** بتتنادى من trigger الدقيقة — بتزامن بس لو فيه تغيير فعلاً. */
function syncReservedIfDirty_() {
  try {
    if (props_().getProperty(RESERVED_DIRTY_KEY) !== '1') return;
    props_().deleteProperty(RESERVED_DIRTY_KEY);
    // 🐞 بق حقيقي كان هنا: السطر ده كان `markReservedDirty_()` بدل
    // `syncReservedColumns_()` — يعني الدالة كانت بس بتمسح العلامة وترجع
    // تحطها تاني من غير ما تعمل المزامنة الفعلية خالص. النتيجة: تحديث
    // "بضاعة محجوزة"/"رصيد متبقي" في شيت الأصناف كان بيتأخر فعليًا لحد
    // ١٠ دقايق (عن طريق reconcileReserved المنفصلة) بدل دقيقة واحدة زي
    // الموثّق فوق. لو syncReservedColumns_ لقت القفل مشغول، هي نفسها
    // بتعمل markReservedDirty_() وترجع (شوف تعليقها) — فمفيش داعي نكررها هنا.
    syncReservedColumns_();
  } catch (e) { logError_('syncReservedIfDirty_', e, ''); }
}

/** شبكة أمان: كل ١٠ دقايق بتعيد الحساب كامل، حتى لو العلامة ضاعت. */
function reconcileReserved() { syncReservedColumns_(); }

/** 🔧 شغّلها يدويًا أي وقت لو عايز تحسب المحجوز من الأول فورًا. */
function recalculateReservedNow() {
  syncReservedColumns_();
  return 'اتحسب المحجوز والرصيد المتبقي من الأول.';
}


// ═══════════════════════════════════════════════════════════════════
//  الأصناف (الكتالوج)
// ═══════════════════════════════════════════════════════════════════
//
// شيت الأصناف: A=name(المفتاح الفريد), B=main, C=sub, D=unit(المحتوى),
// E=product, F=color, G=price, H=stock(الرصيد), I=available('لا'=موقوف).

function updateCatalogItem_(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CATALOG_SHEET_NAME);
  if (!sheet) return false;
  const n = sheet.getLastRow() - 1;
  if (n < 1) return false;
  const names = sheet.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() !== String(data.name).trim()) continue;
    const r = i + 2;
    if (data.unit !== undefined && data.unit !== '') sheet.getRange(r, 4).setValue(Number(data.unit) || 1);
    if (data.price !== undefined) sheet.getRange(r, 7).setValue(data.price === '' ? '' : Number(data.price));
    if (data.stock !== undefined) sheet.getRange(r, 8).setValue(data.stock === '' ? '' : Number(data.stock));
    if (data.available !== undefined) sheet.getRange(r, 9).setValue(data.available ? '' : 'لا');
    markReservedDirty_();   // بيتزامن في الخلفية خلال دقيقة
    return true;
  }
  return false;
}

function addCatalogItem_(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CATALOG_SHEET_NAME);
  if (!sheet) return false;
  const name = String(data.name || data.product || '').trim();
  if (!name) return false;
  // امنع تكرار نفس الاسم (المفتاح الفريد) بصنف جديد بالغلط
  const n = sheet.getLastRow() - 1;
  if (n > 0) {
    const names = sheet.getRange(2, 1, n, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === name) return false;
    }
  }
  sheet.appendRow([
    name, data.main || '', data.sub || '', Number(data.unit) || 1,
    data.product || name, data.color || '',
    (data.price === '' || data.price == null) ? '' : Number(data.price),
    (data.stock === '' || data.stock == null) ? '' : Number(data.stock),
    data.available ? '' : 'لا'
  ]);
  return true;
}

// mode='full': بيحدّث كل الأعمدة لصف موجود، وبيضيف صف جديد لو الاسم مش موجود.
// mode='stock': بيحدّث عمود الرصيد بس، وبيسجّل الأسامي المش موجودة كـ notFound.
// ⚡ بيقرا ويكتب بالكتلة (بدل نداء لكل خلية) — رفع ١٠٠٠ صنف كان بيتخطى حد
// الـ٦ دقايق بتاع Apps Script ويقع في النص.
function bulkUpdateCatalog_(rows, mode) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CATALOG_SHEET_NAME);
  if (!sheet) return { updated: 0, added: 0, notFound: [] };

  const n = Math.max(0, sheet.getLastRow() - 1);
  const width = 9;
  const data = n > 0 ? sheet.getRange(2, 1, n, width).getValues() : [];
  const nameToIdx = {};
  for (let i = 0; i < data.length; i++) {
    const k = String(data[i][0] || '').trim();
    if (k && !(k in nameToIdx)) nameToIdx[k] = i;
  }

  let updated = 0, added = 0;
  const notFound = [], toAppend = [];

  (rows || []).forEach(function (row) {
    const name = String(row.name || '').trim();
    if (!name) return;
    const idx = nameToIdx[name];
    if (idx !== undefined) {
      if (mode === 'stock') {
        if (row.stock !== undefined) data[idx][7] = (row.stock === '' ? '' : Number(row.stock));
      } else {
        data[idx][1] = row.main || '';
        data[idx][2] = row.sub || '';
        data[idx][3] = Number(row.unit) || 1;
        data[idx][4] = row.product || name;
        data[idx][5] = row.color || '';
        data[idx][6] = (row.price === '' || row.price == null) ? '' : Number(row.price);
        data[idx][7] = (row.stock === '' || row.stock == null) ? '' : Number(row.stock);
        data[idx][8] = row.disabled ? 'لا' : '';
      }
      updated++;
    } else if (mode === 'full') {
      toAppend.push([
        name, row.main || '', row.sub || '', Number(row.unit) || 1,
        row.product || name, row.color || '',
        (row.price === '' || row.price == null) ? '' : Number(row.price),
        (row.stock === '' || row.stock == null) ? '' : Number(row.stock),
        row.disabled ? 'لا' : ''
      ]);
      added++;
    } else {
      notFound.push(name);   // وضع "الرصيد بس" والصنف مش موجود — نبلّغ عنه
    }
  });

  if (updated && data.length) sheet.getRange(2, 1, data.length, width).setValues(data);
  if (toAppend.length) sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, width).setValues(toAppend);
  markReservedDirty_();   // بيتزامن في الخلفية خلال دقيقة
  return { updated: updated, added: added, notFound: notFound };
}

// تصدير كامل للأصناف — عشان تراجعهم/تعدّلهم في إكسيل وترفعهم تاني بنفس الشكل
function exportCatalogRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CATALOG_SHEET_NAME);
  if (!sheet) return [];
  const n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  return sheet.getRange(2, 1, n, 9).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        name: r[0], main: r[1], sub: r[2], unit: r[3], product: r[4], color: r[5],
        price: r[6], stock: r[7], disabled: (r[8] && String(r[8]).trim() === 'لا')
      };
    });
}

function buildCatalogPayload_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const csheet = ss.getSheetByName(CATALOG_SHEET_NAME);
  const dsheet = ss.getSheetByName(DISCOUNT_SHEET_NAME);

  // الرصيد في عمود H جوه شيت الأصناف نفسه (جمب السعر) — بدل مطابقة الاسم مع
  // شيت تاني. خلية فاضية أو "غير متوفر" = مفيش رصيد. عمود I = تعطيل يدوي.
  //
  // الأولوية: لو عمود "رصيد متبقي" موجود وفيه رقم، نقراه مباشرة (محسوب
  // بالفعل من syncReservedColumns_). لو فاضي، نحسب المحجوز في نفس اللحظة.
  let items = [];
  if (csheet) {
    const lastRow = csheet.getLastRow();
    const lastCol = csheet.getLastColumn();
    if (lastRow >= 2) {
      const headers = csheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const remainColIdx = findHeaderCol_(headers, 'رصيد متبقي');
      const rows = csheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      // ⚡ المحجوز بيتحسب **عند الحاجة بس**. في الحالة الطبيعية عمود "رصيد
      // متبقي" مليان بأرقام جاهزة، فمش محتاجين نقرا شيت الطلبات كله أصلاً.
      // قبل كده كان بيتحسب دايمًا — يعني كل مرة أي موزّع بيفتح التطبيق، السيرفر
      // بيقرا كل الطلبات على الفاضي. ده كان أبطأ حاجة في فتح التطبيق.
      let _reservedCache = null;
      const reserved_ = () => (_reservedCache || (_reservedCache = buildReservedMap_(csheet)));

      items = rows.filter(function (r) { return r[0]; }).map(function (r) {
        const adminAvailable = !(r[8] && String(r[8]).trim() === 'لا');
        const stockText = String(r[7] == null ? '' : r[7]).trim();
        const rawStock = (stockText !== '' && stockText !== 'غير متوفر') ? (Number(stockText) || 0) : null;

        let stockQty;
        if (remainColIdx >= 0) {
          const remainText = String(r[remainColIdx] == null ? '' : r[remainColIdx]).trim();
          if (remainText !== '') {
            stockQty = Math.max(0, Number(remainText) || 0);
          } else {
            const held = reserved_()[String(r[0]).trim()] || 0;
            stockQty = (rawStock === null) ? null : Math.max(0, rawStock - held);
          }
        } else {
          const held = reserved_()[String(r[0]).trim()] || 0;
          stockQty = (rawStock === null) ? null : Math.max(0, rawStock - held);
        }

        return {
          name: r[0], main: r[1], sub: r[2],
          unit: Number(r[3]) || 1, product: r[4] || r[0], color: r[5] || '',
          price: (r[6] === '' || r[6] === null || r[6] === undefined) ? null : Number(r[6]),
          // available = الأدمن عطّل الصنف يدويًا (عمود I = "لا")
          // inStock/stock = من "رصيد متبقي" أو "الرصيد" ناقص المحجوز
          available: adminAvailable,
          inStock: (stockQty !== null) && stockQty > 0,
          stock: stockQty
        };
      });
    }
  }

  let discounts = {};
  if (dsheet) {
    const drows = dsheet.getDataRange().getValues();
    drows.shift();
    drows.forEach(function (r) {
      if (!r[0]) return;
      let v = Number(r[1]) || 0;
      // لو الخلية متنسقة كنسبة مئوية (%)، getValues() بترجع الكسر العشري
      // (0.15) مش الرقم (15) — نحوّله هنا لنسبة مئوية عادية.
      if (v > 0 && v < 1) v = v * 100;
      discounts[r[0]] = v;
    });
  }
  return { items: items, discounts: discounts, version: APP_VERSION };
}


// ═══════════════════════════════════════════════════════════════════
//  تحويل صف لطلب
// ═══════════════════════════════════════════════════════════════════

function rowToOrder(r) {
  // ⚠️ جوجل شيتس بيرجّع رقم الهاتف كـ Number (وبيشيل الصفر اللي في الأول).
  // لازم نحوّله لنص هنا، وإلا التطبيق بيحاول يعمل .trim() على رقم ويقع.
  //
  // ⚠️ وأهم: JSON.parse على صف واحد باظ كان بيرمي خطأ ويفشّل الطلب كله —
  // فكل الطلبات تختفي من الشاشة بسبب صف واحد. دلوقتي الصف الباظ بيرجع
  // بأصناف فاضية وباقي الطلبات تظهر عادي.
  let items = [];
  try { items = r[COL_ITEMS - 1] ? JSON.parse(r[COL_ITEMS - 1]) : []; } catch (e) { items = []; }
  if (!Array.isArray(items)) items = [];

  let ts = new Date(r[COL_TS - 1]).getTime();
  if (!isFinite(ts)) ts = 0;

  return {
    id: String(r[COL_ID - 1]),
    ts: ts,
    distName: String(r[COL_NAME - 1] == null ? '' : r[COL_NAME - 1]),
    distRegion: String(r[COL_REGION - 1] == null ? '' : r[COL_REGION - 1]),
    distPhone: String(r[COL_PHONE - 1] == null ? '' : r[COL_PHONE - 1]),
    note: String(r[COL_NOTE - 1] == null ? '' : r[COL_NOTE - 1]),
    status: String(r[COL_STATUS - 1] == null ? '' : r[COL_STATUS - 1]),
    items: items,
    warehouse: String(r[COL_WAREHOUSE - 1] == null ? '' : r[COL_WAREHOUSE - 1]),
    orderNo: String(r[COL_ORDERNO - 1] == null ? '' : r[COL_ORDERNO - 1]),
    username: String(r[COL_USERNAME - 1] == null ? '' : r[COL_USERNAME - 1])
  };
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

/** بيرجّع بيانات الموزّع (الهاتف/النوع) من اسم المستخدم. */
function userInfo_(username) {
  const rows = getUsersSheet_().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      return {
        username: String(rows[i][0]).trim(),
        distName: String(rows[i][2] || ''),
        phone: normalizePhone(rows[i][4]),
        status: String(rows[i][5] || '').trim()
      };
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════
//  doGet — قراءة بس
// ═══════════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    return doGetInner_(e);
  } catch (err) {
    logError_('doGet', err, e && e.parameter ? JSON.stringify(e.parameter) : '');
    return json_({ ok: false, error: String(err) });
  }
}

function doGetInner_(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  // افتح ?action=version في المتصفح عشان تتأكد إن النشر بيشغّل الكود الجديد
  if (action === 'version') {
    return json_({
      version: APP_VERSION,
      hasQueue: !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WA_QUEUE_SHEET_NAME),
      configured: !!(secret_('ADMIN_PIN') && secret_('MANAGE_PIN')),
      time: new Date()
    });
  }

  if (action === 'adminLogin')  return json_(adminLogin_(e.parameter.pin));
  if (action === 'manageLogin') return json_(manageLogin_(e.parameter.pin));

  // الكتالوج مفتوح للكل (أسعار عامة، مفيش بيانات شخصية فيه)
  if (action === 'catalog') return json_(buildCatalogPayload_());

  const isAdmin = isValidAdminToken_(token);
  const isManage = isValidManageToken_(token);
  const me = userFromToken_(token);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  // ═════════════════════════════════════════════════════════════
  //  🔒 lookup — كانت أخطر ثغرة في النظام كله
  // ═════════════════════════════════════════════════════════════
  //
  // النسخة القديمة مكانش عليها أي تحقق، وكانت بتطابق التليفون بـ:
  //     stored.endsWith(phone) || phone.endsWith(stored)
  // من غير أي حد أدنى لطول الرقم. يعني ?action=lookup&phone=1 كان بيرجّع كل
  // طلب رقمه بينتهي بـ 1 (~١٠٪ من الطلبات)، و**عشر نداءات بس كانت بتجيب كل
  // الطلبات في النظام** بأسماء الموزعين وأرقام تليفوناتهم وأصنافهم وكمياتهم
  // — من غير رقم سري ولا توكن ولا حاجة. ورابط الـ/exec نفسه مكتوب في
  // index.html اللي في مستودع عام.
  //
  // دلوقتي: لازم توكن. الموزّع يشوف طلباته هو بس، والأدمن يشوف الكل.
  if (action === 'lookup') {
    if (!isAdmin && !me) return denyAuth_();
    if (!sheet) return json_([]);
    const n = sheet.getLastRow() - 1;
    if (n < 1) return json_([]);

    let orders = sheet.getRange(2, 1, n, ORDERS_HEADERS.length).getValues()
      .filter(function (r) { return r[COL_ID - 1]; })
      .map(rowToOrder);

    if (!isAdmin) {
      // الموزّع: طلباته هو بس. المطابقة باسم المستخدم أولاً (دقيقة ١٠٠٪)،
      // والتليفون بمطابقة **كاملة** للطلبات القديمة اللي اتسجلت قبل ما
      // نضيف عمود اسم المستخدم.
      const info = userInfo_(me);
      const myPhone = info ? info.phone : '';
      orders = orders.filter(function (o) {
        if (o.username) return o.username.trim().toLowerCase() === me.trim().toLowerCase();
        return !!myPhone && normalizePhone(o.distPhone) === myPhone;
      });
    }

    if (e.parameter.ids) {
      const idSet = String(e.parameter.ids).split(',').map(function (x) { return x.trim().toLowerCase(); });
      orders = orders.filter(function (o) { return idSet.indexOf(o.id.toLowerCase()) !== -1; });
    } else if (e.parameter.phone) {
      // للأدمن بس — بحث برقم كامل، ومفيش endsWith خالص
      const phone = normalizePhone(e.parameter.phone);
      if (phone.length < 8) return json_([]);
      orders = orders.filter(function (o) { return normalizePhone(o.distPhone) === phone; });
    }

    orders.sort(function (a, b) { return b.ts - a.ts; });
    return json_(orders);
  }

  // إشعار الأدمن: عدد الطلبات وآخر طلب بس (خفيف، للـ polling المتكرر)
  if (action === 'ordersMeta') {
    if (!isAdmin) return denyAdmin_();
    const n = sheet ? sheet.getLastRow() - 1 : 0;
    if (n < 1) return json_({ count: 0, last: null });
    const rows = sheet.getRange(2, 1, n, ORDERS_HEADERS.length).getValues();
    const seen = {};
    let count = 0, lastRow = null;
    for (let i = 0; i < rows.length; i++) {
      const id = String(rows[i][COL_ID - 1] || '');
      if (id && seen[id]) continue;
      if (id) seen[id] = true;
      count++;
      lastRow = rows[i];
    }
    return json_({
      count: count,
      last: lastRow ? {
        id: String(lastRow[COL_ID - 1] || ''),
        orderNo: String(lastRow[COL_ORDERNO - 1] || ''),
        distName: String(lastRow[COL_NAME - 1] || '')
      } : null
    });
  }

  // ---------- الأرشيف (قراءة) ----------
  if (action === 'archivedOrders') {
    if (!isAdmin) return denyAdmin_();
    return json_(listArchivedOrders_());
  }

  // ---------- قوايم الموافقات ----------
  if (action === 'passwordRequests') {
    if (!isAdmin) return denyAdmin_();
    return json_(listPwRequests_());
  }
  if (action === 'managePasswordRequests') {
    if (!isManage) return denyManage_();
    return json_(listPwRequests_());
  }
  if (action === 'manageRegRequests') {
    if (!isManage) return denyManage_();
    return json_(listRegRequests_());
  }
  if (action === 'manageExportCatalog') {
    if (!isManage) return denyManage_();
    return json_(exportCatalogRows_());
  }

  // ⛔ العمليات اللي بتغيّر بيانات بقت في doPost — مابقتش تشتغل من رابط
  const MUTATIONS = ['updateStatus', 'delete', 'deleteDelivered', 'archiveDone',
                     'restoreArchived', 'approvePasswordReset', 'rejectPasswordReset',
                     'manageApprovePasswordReset', 'manageRejectPasswordReset',
                     'manageApproveReg', 'manageRejectReg', 'login'];
  if (MUTATIONS.indexOf(action) !== -1) {
    return json_({ ok: false, error: 'use_post', message: 'العملية دي بقت POST — حدّث التطبيق.' });
  }

  // ---------- الافتراضي: كل الطلبات (لوحة المتابعة الإدارية) ----------
  if (!isAdmin) return denyAdmin_();
  if (!sheet) return json_([]);
  const n = sheet.getLastRow() - 1;
  if (n < 1) return json_([]);
  return json_(
    sheet.getRange(2, 1, n, ORDERS_HEADERS.length).getValues()
      .filter(function (r) { return r[COL_ID - 1]; })
      .map(rowToOrder)
      .reverse()
  );
}
