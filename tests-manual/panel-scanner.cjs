/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ اسکنرِ داخلِ پنل (PANEL_SCAN در ui/app.js)
 *  ───────────────────────────────────────────────────────────────────────────
 *  موتورِ واقعیِ اسکنر از ui/app.js استخراج و در یک محیطِ شبیه‌سازی‌شده اجرا
 *  می‌شود تا مطمئن شویم ادمین می‌تواند از خودِ پنل اسکن کند، نتیجه را ببیند و
 *  روی «IPهای پاک» اعمال کند — بدون نیاز به مرورگر.
 *
 *  اجرا:  node tests-manual/panel-scanner.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');

/* ── استخراجِ CF_CIDRS_UI و بلوکِ PANEL_SCAN از فایلِ واقعی ── */
const cidrsStart = app.indexOf('const CF_CIDRS_UI = [');
const cidrsEnd = app.indexOf('];', cidrsStart) + 2;
if (cidrsStart < 0) { console.error('FATAL: CF_CIDRS_UI پیدا نشد'); process.exit(1); }
const cidrsSrc = app.slice(cidrsStart, cidrsEnd);

const scanStart = app.indexOf('const PANEL_SCAN = (function () {');
const scanEnd = app.indexOf('function scannerView() {');
if (scanStart < 0 || scanEnd < 0) { console.error('FATAL: PANEL_SCAN پیدا نشد'); process.exit(1); }
let scanSrc = app.slice(scanStart, scanEnd);

/* قلابِ تست: فقط برای دیدنِ داخلی‌ها — کدِ تولید دست‌نخورده می‌ماند */
const RET = 'return { start: start, apply: apply, reset: reset };';
if (scanSrc.indexOf(RET) < 0) { console.error('FATAL: return بلوکِ PANEL_SCAN پیدا نشد'); process.exit(1); }
scanSrc = scanSrc.replace(RET,
  'return { start: start, apply: apply, reset: reset, buildList: buildList, blocksOf: blocksOf, ping: ping, probe: probe, readCfg: readCfg,' +
  ' selfTest: selfTest, SCAN_TLS_PORTS: SCAN_TLS_PORTS, SCAN_CONTROL_IPS: SCAN_CONTROL_IPS,' +
  ' rawResponses: function () { return rawResponses; },' +
  ' autoFloor: autoFloor, baseline: baseline,' +
  ' setFloor: function (v) { floor = v; }, getFloor: function () { return floor; },' +
  ' rejectedFast: function () { return rejectedFast; }, resetFast: function () { rejectedFast = 0; },' +
  ' _s: function () { return { results: results, done: done, total: total, running: running }; } };');

/* ── محیطِ شبیه‌سازی‌شده ── */
const OFFICIAL = ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22'];
const ip2n = (s) => s.split('.').reduce((a, x) => a * 256 + Number(x), 0);
const OFF = OFFICIAL.map((c) => { const [ip, p] = c.split('/'); const size = 2 ** (32 - Number(p)); const s = ip2n(ip); return { s, e: s + size - 1 }; });
const inCF = (ip) => { const n = ip2n(ip); return OFF.some((b) => n >= b.s && n <= b.e); };

let calls = 0;
/* تأخیرِ شبیه‌سازی‌شده — بدونِ آن پاسخِ ۳ms زیرِ کفِ خودکار می‌افتد و اسکنِ
   سالم هم صفر نتیجه می‌دهد (دقیقاً همان رفتارِ واقعیِ شبکه‌ی فیلترشده). */
function latencyOf(host) {
  if (host.startsWith('p.example')) return 30;   /* میزبانِ مبنا (دامنه‌ی پنل) */
  if (host.startsWith('4.4.4.4')) return 3;      /* پاسخِ آنیِ میان‌راه (RST) */
  return 40;                                     /* لبه‌ی واقعی، بالای کفِ خودکار */
}
function makeFakeImage() {
  return class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this._src = ''; }
    set src(v) {
      this._src = v; calls++;
      const host = String(v).replace('https://', '').split('/')[0];
      if (host.startsWith('9.9.9.9')) return;             /* مرده → تایم‌اوت */
      setTimeout(() => { if (typeof this.onerror === 'function') this.onerror(); }, latencyOf(host));
    }
    get src() { return this._src; }
  };
}

/* fetch جعلی — کانالِ دومِ پروب (Image + fetch موازی). همان معناشناسی:
   زنده ⇒ خطای سریع (TypeError)، مرده ⇒ معلق تا اَبورتِ اسکنر (AbortError). */
function makeFakeFetch() {
  return function fakeFetch(url, opts) {
    return new Promise((resolve, reject) => {
      const host = String(url).replace('https://', '').split('/')[0];
      const sig = opts && opts.signal;
      const dead = host.startsWith('9.9.9.9');
      /* میزبانِ مبنا تأخیرِ واقع‌گرایانه می‌دهد، نه پاسخِ آنی */
      const ms = latencyOf(host);
      let timer = null;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
      };
      if (sig) {
        if (sig.aborted) { onAbort(); return; }
        sig.addEventListener('abort', onAbort);
      }
      if (dead) return;
      timer = setTimeout(() => reject(new TypeError('Failed to fetch')), ms);
    });
  };
}

/* المان‌های جعلیِ DOM */
function mkEl(v) { return { value: v === undefined ? '' : String(v), innerHTML: '', textContent: '', style: {}, dataset: {} }; }
const form = {
  ipCount: mkEl('60'), concurrency: mkEl('8'), timeout: mkEl('300'), probes: mkEl('2'),
  minRtt: mkEl('0'), maxRtt: mkEl('0'), keep: mkEl('5'), mode: mkEl('even'),
  autoFloor: { value: '', checked: true, innerHTML: '', textContent: '', style: {}, dataset: {} },
  ports: mkEl(''), ranges: mkEl(''),
};
const nodes = {
  pScanBar: mkEl(), pScanStatus: mkEl(), pScanWrap: mkEl(), pScanBtn: mkEl(),
};
const toasts = [];
let putPayload = null;

const deps = {
  icon: () => '<i></i>',
  fa: (n) => String(n),
  esc: (s) => String(s),
  performance: { now: () => Date.now() },
  location: { host: 'p.example', href: 'https://p.example/sub/abc' },
  toast: (m, k) => toasts.push({ m, k }),
  $: (sel) => {
    const m = /data-p="scanner\.([a-zA-Z]+)"/.exec(String(sel));
    return m ? (form[m[1]] || null) : null;
  },
  $$: () => [],
  api: async (method, p, body) => { putPayload = { method, p, body }; return { ok: true }; },
  S: { d: { settings: { cleanIPs: ['1.1.1.1', '2.2.2.2'] } } },
  document: { getElementById: (id) => nodes[id] || null },
};
/* CF_CIDRS_UI از خودِ فایل خوانده می‌شود (تستِ واقعی، نه کپیِ دستی) */
const cidrs = new Function(cidrsSrc + '\n;return CF_CIDRS_UI;')();

const names = Object.keys(deps);
const M = new Function(...names, 'Image', 'fetch', 'AbortController',
  cidrsSrc + '\n' + scanSrc + '\n;return PANEL_SCAN;')(...names.map((n) => deps[n]), makeFakeImage(), makeFakeFetch(), AbortController);

let fail = 0;
const ok = (cond, label, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : '')); if (!cond) fail++; };

(async () => {
  console.log('== ۱) رنج‌های موتورِ پنل ==');
  ok(cidrs.length === 15, 'هر ۱۵ رنج رسمی در پنل تعریف شده', cidrs.length);
  ok(OFFICIAL.every((c) => cidrs.indexOf(c) >= 0), 'فهرست با cloudflare.com/ips-v4 یکی است');
  ok(M.blocksOf([]).length === 15, 'بلوک‌ها از رنج‌های رسمی ساخته می‌شوند', M.blocksOf([]).length);
  ok(M.blocksOf(['104.16.0.0/13']).length === 15, 'رنجِ تکراری دوباره اضافه نمی‌شود', M.blocksOf(['104.16.0.0/13']).length);
  ok(M.blocksOf(['203.0.113.0/24']).length === 16, 'رنجِ دلخواه اضافه می‌شود', M.blocksOf(['203.0.113.0/24']).length);

  console.log('== ۲) ساختِ فهرستِ آی‌پی ==');
  const list = M.buildList(600, [], 'even');
  ok(list.length === 600 && new Set(list).size === 600, '۶۰۰ آی‌پیِ یکتا ساخته شد', list.length);
  ok(list.every(inCF), 'همه داخلِ رنج‌های رسمی‌اند');
  const blockOf = (ip) => { const n = ip2n(ip); return OFF.findIndex((b) => n >= b.s && n <= b.e); };
  ok(new Set(list.map(blockOf)).size === 15, 'هر ۱۵ رنج نمونه دارند', new Set(list.map(blockOf)).size + '/15');

  console.log('== ۳) خواندنِ تنظیمات از فرمِ پنل ==');
  const cfg = M.readCfg();
  ok(cfg.ipCount === 60 && cfg.concurrency === 8 && cfg.probes === 2, 'مقادیرِ فرم خوانده شدند', cfg.ipCount + '/' + cfg.concurrency + '/' + cfg.probes);
  ok(cfg.ports.join(',') === '443', 'پورتِ خالی → فالبک به ۴۴۳ (باگِ اسکنِ خالی)', cfg.ports.join(','));
  form.ports.value = '443\n2053';
  ok(M.readCfg().ports.join(',') === '443,2053', 'پورت‌های فرم استفاده می‌شوند', M.readCfg().ports.join(','));
  form.ports.value = '99999\nabc';
  ok(M.readCfg().ports.join(',') === '443', 'پورتِ نامعتبر → فالبک به ۴۴۳', M.readCfg().ports.join(','));
  form.ports.value = '';

  console.log('== ۴) پروب ==');
  const before = calls;
  const alive = await M.probe('1.2.3.4', [443], { timeout: 300, probes: 2, minRtt: 0, maxRtt: 0 });
  ok(!!alive && alive.ip === '1.2.3.4' && alive.port === 443, 'آی‌پیِ زنده تشخیص داده شد', alive && alive.avg + 'ms');
  ok(calls - before === 2, 'به‌اندازه‌ی probes پروب زده شد', calls - before);
  const dead = await M.probe('9.9.9.9', [443], { timeout: 300, probes: 2, minRtt: 0, maxRtt: 0 });
  ok(dead === null, 'آی‌پیِ بی‌پاسخ رد شد');
  const c0 = calls;
  await M.probe('9.9.9.9', [443, 2053, 2083], { timeout: 300, probes: 2, minRtt: 0, maxRtt: 0 });
  ok(calls - c0 <= 4, 'پورت‌ها موازی‌اند (نه ۳ تایم‌اوتِ پشت‌سرهم)', calls - c0 + ' پروب');

  console.log('== ۵) اجرای اسکن از پنل ==');
  await M.start();
  const st = M._s();
  ok(st.results.length === 5, 'اسکن تا تعدادِ نگه‌داری پیش رفت', st.results.length);
  ok(st.done < st.total, 'بعد از رسیدن به هدف، اسکن زودتر تمام شد', st.done + '/' + st.total);
  ok(nodes.pScanWrap.style.display === '', 'جدولِ نتیجه نمایش داده شد');
  ok(/<table>/.test(nodes.pScanWrap.innerHTML), 'جدولِ نتیجه ساخته شد');
  ok(nodes.pScanWrap.innerHTML.indexOf(':443') > 0, 'پورت در جدول هست');
  ok((nodes.pScanWrap.innerHTML.match(/<tr/g) || []).length === 6, 'پنج ردیف + سرستون', (nodes.pScanWrap.innerHTML.match(/<tr/g) || []).length);
  ok(nodes.pScanBar.style.width === '100%' || /%$/.test(nodes.pScanBar.style.width), 'نوارِ پیشرفت به‌روز شد', nodes.pScanBar.style.width);
  ok(/پایان/.test(nodes.pScanStatus.textContent), 'وضعیتِ پایان نوشته شد', nodes.pScanStatus.textContent);

  console.log('== ۶) اعمال روی «IPهای پاک» ==');
  await M.apply();
  ok(!!putPayload && putPayload.method === 'PUT' && putPayload.p === '/api/settings', 'درخواستِ ذخیره‌ی تنظیمات فرستاده شد', putPayload && putPayload.method + ' ' + putPayload.p);
  const saved = putPayload && putPayload.body && putPayload.body.settings && putPayload.body.settings.cleanIPs;
  ok(Array.isArray(saved) && saved.length === 7, 'آی‌پی‌های تازه اولِ فهرست و بقیه حفظ شدند', saved && saved.length);
  ok(saved && saved.slice(0, 5).every((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)), 'آی‌پی‌های اسکن‌شده اولِ فهرست‌اند');
  ok(saved && saved.indexOf('1.1.1.1') > 0 && saved.indexOf('2.2.2.2') > 0, 'آی‌پی‌های قبلی حفظ شدند');
  ok(deps.S.d.settings.cleanIPs.length === 7, 'حالتِ پنل هم به‌روز شد', deps.S.d.settings.cleanIPs.length);

  console.log('== ۷) پاک‌کردنِ نتیجه ==');
  M.reset();
  ok(M._s().results.length === 0, 'نتیجه خالی شد');
  ok(nodes.pScanWrap.style.display === 'none', 'جدول پنهان شد');
  ok(nodes.pScanStatus.textContent === 'آماده', 'وضعیت به «آماده» برگشت', nodes.pScanStatus.textContent);

  console.log('== ۸) تخصیصِ «smart» در پنل ==');
  /* داده‌ی واقعی: ~۹۶٪ آی‌پی‌های تمیزِ شناخته‌شده در ۳ رنجِ بزرگ‌اند و ۹ رنجِ
     دیگر تقریباً خالی‌اند. «smart» باید بودجه را به همان‌ها بدهد ولی هیچ رنجی
     را صفر نگذارد (خواسته‌ی «تمامِ رنج‌ها اسکن شوند»). */
  const sList = M.buildList(2048, [], 'smart');
  ok(sList.length === 2048 && new Set(sList).size === 2048, '۲۰۴۸ آی‌پیِ یکتا', sList.length);
  const blk = (ip) => { const n = ip2n(ip); return OFF.findIndex((b) => n >= b.s && n <= b.e); };
  const BIG3 = [OFFICIAL.indexOf('104.16.0.0/13'), OFFICIAL.indexOf('172.64.0.0/13'), OFFICIAL.indexOf('104.24.0.0/14')];
  const sBig = Math.round(100 * sList.filter((ip) => BIG3.indexOf(blk(ip)) >= 0).length / sList.length);
  const eList = M.buildList(2048, [], 'even');
  const eBig = Math.round(100 * eList.filter((ip) => BIG3.indexOf(blk(ip)) >= 0).length / eList.length);
  ok(sBig >= 70, '≥۷۰٪ بودجه به ۳ رنجِ پربازده می‌رود', sBig + '%');
  ok(sBig > eBig * 2, 'smart دست‌کم ۲ برابرِ even بازدهی دارد', 'smart ' + sBig + '% vs even ' + eBig + '%');
  ok(new Set(sList.map(blk)).size === 15, 'هر ۱۵ رنج نمونه دارند (کفِ تضمینی)', new Set(sList.map(blk)).size + '/15');

  console.log('== ۹) فیلترِ پورت‌های غیر-TLS در پنل ==');
  /* پورتِ غیر-TLS روی پروبِ https با خطای SSL بی‌درنگ «پاسخ» می‌دهد و همه‌چیز
     را زنده نشان می‌دهد — پس فهرستِ ادمین هم باید از این صافی رد شود. */
  ok(M.SCAN_TLS_PORTS.join(',') === '443,2053,2083,2087,2096,8443', 'فهرستِ پورت‌های TLS درست است', M.SCAN_TLS_PORTS.join(','));
  form.ports.value = '80';
  ok(M.readCfg().ports.join(',') === '443', 'پورتِ ۸۰ → ۴۴۳ (فیلتر شد)', M.readCfg().ports.join(','));
  form.ports.value = '80, 2053, 8080';
  ok(M.readCfg().ports.join(',') === '2053', 'فقط پورتِ TLS از میانِ مخلوط می‌ماند', M.readCfg().ports.join(','));
  form.ports.value = '';

  console.log('== ۱۰) حالتِ پیش‌فرضِ فرم و خودآزمایی ==');
  form.mode.value = 'smart';
  ok(M.readCfg().mode === 'smart', 'حالتِ smart خوانده می‌شود', M.readCfg().mode);
  form.mode.value = 'bogus';
  ok(M.readCfg().mode === 'smart', 'مقدارِ ناشناخته → smart (نه even)', M.readCfg().mode);
  form.mode.value = 'even';
  ok(M.readCfg().mode === 'even', 'حالتِ even هنوز پشتیبانی می‌شود', M.readCfg().mode);
  form.mode.value = 'even';

  ok(M.SCAN_CONTROL_IPS.length === 3 && M.SCAN_CONTROL_IPS.every((ip) => /^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip)),
     'آی‌پی‌های آزمایشیِ RFC 5737 تعریف شده‌اند', M.SCAN_CONTROL_IPS.join(','));
  const stBad = await M.selfTest([443], 200);
  ok(stBad.bad === true, 'پاسخ‌دادنِ آی‌پیِ آزمایشی به‌عنوان «نتیجه‌ی بی‌اعتبار» تشخیص داده می‌شود',
     stBad.bad ? stBad.ip + ' @ ' + stBad.rtt + 'ms' : 'bad=false');
  const rBefore = M.rawResponses();
  await M.ping('1.2.3.4', 443, 200);
  ok(M.rawResponses() > rBefore, 'پاسخِ آی‌پیِ زنده در شمارنده ثبت می‌شود', rBefore + ' → ' + M.rawResponses());
  const rAfter = M.rawResponses();
  await M.ping('9.9.9.9', 443, 200);
  ok(M.rawResponses() === rAfter, 'آی‌پیِ مرده شمارنده را بالا نمی‌برد', String(M.rawResponses()));

  console.log('== ۱۱) کفِ خودکارِ تأخیر در پنل ==');
  ok(M.readCfg().autoFloor === true, 'کفِ خودکار به‌طور پیش‌فرض روشن است', String(M.readCfg().autoFloor));
  form.autoFloor.checked = false;
  ok(M.readCfg().autoFloor === false, 'خاموش‌کردنِ سوییچ کفِ خودکار را غیرفعال می‌کند', String(M.readCfg().autoFloor));
  form.autoFloor.checked = true;
  ok(M.autoFloor(null) === 0, 'بدونِ پایه، کفی اعمال نمی‌شود', '0');
  ok(M.autoFloor(50) === 20, 'کفِ حداقلیِ ۲۰ms', String(M.autoFloor(50)));
  ok(M.autoFloor(100) === 40, 'کف ≈ ۴۰٪ تأخیرِ پایه', String(M.autoFloor(100)));
  ok(M.autoFloor(5000) === 200, 'سقفِ ۲۰۰ms', String(M.autoFloor(5000)));

  console.log('== ۱۲) کفِ تأخیر پاسخِ بی‌درنگ را رد می‌کند ==');
  const PCFG = { timeout: 300, probes: 2, minRtt: 0, maxRtt: 0 };
  M.resetFast();
  M.setFloor(20);
  const pFast = await M.probe('4.4.4.4', [443], PCFG);          /* پاسخِ ۳ms */
  ok(pFast === null, 'پاسخِ ۳ms زیرِ کفِ ۲۰ms رد می‌شود (RSTِ میان‌راه، نه لبه)', String(pFast));
  ok(M.rejectedFast() > 0, 'شمارنده‌ی «مردودِ سریع» بالا می‌رود', String(M.rejectedFast()));
  M.setFloor(0);
  const pOk = await M.probe('1.2.3.4', [443], PCFG);
  ok(pOk !== null, 'با کفِ صفر همان آی‌پی پذیرفته می‌شود (شاهدِ تست)', pOk ? pOk.avg + 'ms' : 'null');

  console.log('== ۱۳) تأخیرِ پایه ==');
  const b = await M.baseline();
  ok(b !== null && b > 0, 'تأخیرِ پایه از دامنه‌ی پنل اندازه‌گیری می‌شود', b === null ? 'null' : b + 'ms');

  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})();
