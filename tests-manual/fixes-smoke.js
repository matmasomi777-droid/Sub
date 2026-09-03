/**
 * تست دودیِ منطقِ اصلاحات — بدون کلادفلر، فقط توابعِ خالص
 * (fakeMode، دروازه‌های سهمیه، skipLead هدرِ خروجی)
 */
const fs = require('fs');
const path = require('path');
let fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fail++; };

/* ─── ۱. fakeCfg با fakeMode ─── */
const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
/* استخراجِ تابع‌های خالص برای اجرا */
function grab(name) {
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n}', 'm');
  const m = w.match(re);
  return m ? m[0] : null;
}
const ctx = {};
const src = [
  'const VERSION = "test";',
  grab('fakeVars'), grab('renderFakeName'), grab('fakeCfg'),
  'this.fakeVars = fakeVars; this.renderFakeName = renderFakeName; this.fakeCfg = fakeCfg;',
].join('\n');
try {
  const f = new Function(src + '; return { fakeCfg };');
  const mod = f();
  const fakeCfg = mod.fakeCfg;

  const uBase = { name: 'u1', uuid: 'uuid-1', secret: 'sec-1', quotaGB: 10, up: 1, down: 2, fakeMode: 'inherit', fakes: [] };
  const sBase = { panel: { name: 'پنل' }, sub: { fakeConfigs: true, fakes: [{ name: '{usage}', enabled: true, pos: 1, proto: 'vless' }] } };

  ok(fakeCfg({ ...uBase }, sBase).length === 1, 'inherit → کانفیگ عمومی پنل ساخته می‌شود');
  ok(fakeCfg({ ...uBase, fakeMode: 'off' }, sBase).length === 0, 'off → هیچ کانفیگ فکی ساخته نمی‌شود (باگِ خاموش)');
  ok(fakeCfg({ ...uBase, fakeMode: 'custom', fakes: [] }, sBase).length === 0, 'custom با فهرست خالی → هیچ');
  const custom = fakeCfg({ ...uBase, fakeMode: 'custom', fakes: [{ name: 'اختصاصی {user}', enabled: true, pos: 1, proto: 'vless' }] }, sBase);
  ok(custom.length === 1 && decodeURIComponent(custom[0].split('#')[1]) === 'اختصاصی u1', 'custom → فقط فهرست کاربر با متغیر');
  ok(fakeCfg({ ...uBase, fakeMode: 'custom', fakes: [{ name: '', enabled: true }] }, sBase).length === 0, 'custom با نام خالی → هیچ');
  ok(fakeCfg({ ...uBase, fakeMode: 'inherit', fakes: [{ name: 'بی‌اثر', enabled: true }] }, sBase).length === 1, 'inherit نادیده‌گرفتنِ فهرستِ کاربر');
  ok(fakeCfg({ ...uBase, fakeMode: 'off', fakes: [{ name: 'x', enabled: true }] }, sBase).length === 0, 'off مقدم بر فهرستِ کاربر');
} catch (e) { fail++; console.log('FAIL - استخراجِ fakeCfg: ' + e.message); }

/* ─── ۲. دروازه‌های سهمیه (همان ریاضیِ dial/maybeFlush) ─── */
function quotaGate(user, uq) {
  const qB = (Number(user.quotaGB) || 0) * 1073741824;
  const dqB = (Number(user.dailyQuotaMB) || 0) * 1048576;
  const usedB = (Number(uq.up) || 0) + (Number(uq.down) || 0);
  const usedD = (Number(uq.dayUp) || 0) + (Number(uq.dayDown) || 0);
  const expDead = user.expiryAt && user.expiryAt < Date.now() && (!user.expiryFirstUse || user.expiryArmed);
  return (qB > 0 && usedB >= qB) || (dqB > 0 && usedD >= dqB) || expDead;
}
const now = Date.now();
ok(!quotaGate({ quotaGB: 10, dailyQuotaMB: 0 }, { up: 5e9, down: 0, dayUp: 0, dayDown: 0 }), 'زیرِ سقف → باز');
ok(quotaGate({ quotaGB: 10, dailyQuotaMB: 0 }, { up: 11e9, down: 0, dayUp: 0, dayDown: 0 }), 'اتمام حجم کل → بسته');
ok(quotaGate({ quotaGB: 0, dailyQuotaMB: 500 }, { up: 0, down: 0, dayUp: 600e6, dayDown: 0 }), 'اتمام سهمیه روزانه → بسته');
ok(!quotaGate({ quotaGB: 0, dailyQuotaMB: 0 }, { up: 1e12, down: 0, dayUp: 0, dayDown: 0 }), 'بدون سقف → همیشه باز');
ok(quotaGate({ quotaGB: 10, expiryAt: now - 1000, expiryArmed: true }, { up: 0, down: 0, dayUp: 0, dayDown: 0 }), 'انقضای گذشته → بسته');
ok(!quotaGate({ quotaGB: 10, expiryAt: now - 1000, expiryFirstUse: true, expiryArmed: false }, { up: 0, down: 0 }), 'انقضای مسلح‌نشده → باز');

/* ─── ۳. skipLead در remoteToWs (شبیه‌سازیِ قطعِ هدرِ بالادست) ─── */
function pump(chunks, respHeader, skipLead) {
  let skip = Math.max(0, Number(skipLead) || 0);
  let header = respHeader;
  const sent = [];
  for (let value of chunks) {
    let v = value;
    if (skip > 0) {
      if (v.length <= skip) { skip -= v.length; continue; }
      v = v.slice(skip); skip = 0;
    }
    if (!v.length) continue;
    if (header && header.length) { sent.push([...header, ...v]); header = null; }
    else sent.push([...v]);
  }
  return sent.flat();
}
const R = [0, 0];
ok(pump([[1, 2, 3, 4]], R, 0).join() === '0,0,1,2,3,4', 'مستقیم: هدرِ خودِ ما + داده');
ok(pump([[9, 8, 1, 2, 3]], R, 2).join() === '0,0,1,2,3', 'خروجی: هدرِ بالادست (۹,۸) مصرف و فقط یک هدر می‌رسد');
ok(pump([[9], [8, 1, 2]], R, 2).join() === '0,0,1,2', 'هدرِ بالادست تکه‌تکه هم درست مصرف می‌شود');
ok(pump([[9, 8]], R, 2).join() === '', 'کل تکه = هدرِ بالادست → چیزی به کلاینت نمی‌رسد');

console.log(fail ? ('\n' + fail + ' TEST(S) FAILED') : '\nALL TESTS PASSED');
process.exit(fail ? 1 : 0);
