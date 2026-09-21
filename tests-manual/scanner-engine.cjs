/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ موتورِ اسکنر (رادار آی‌پی تمیز)
 *  ───────────────────────────────────────────────────────────────────────────
 *  کدِ واقعیِ اسکنر از new-subscription.html استخراج و در یک محیطِ شبیه‌سازی‌شده
 *  اجرا می‌شود. بدون نیاز به مرورگر یا حساب کلادفلر.
 *
 *  پروبِ اسکنر «دوکاناله» است (Image + fetch موازی، اولین سیگنال برنده است)، پس
 *  اینجا هر دو کانال جعلی ساخته می‌شود: آی‌پیِ «زنده» خطای سریع می‌دهد (لبه TLS
 *  را کامل می‌کند و گواهی رد می‌شود) و آی‌پیِ «مرده» هیچ رویدادی نمی‌دهد تا
 *  تایم‌اوت/اَبورتِ خودِ اسکنر تعیین‌کننده باشد.
 *
 *  اجرا:  node tests-manual/scanner-engine.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'new-subscription.html'), 'utf8');

/* ── استخراجِ بلوکِ اسکنر از فایلِ واقعی ── */
const START = html.indexOf('const SCAN = (function () {');
const END = html.indexOf('async function radarRun');
if (START < 0 || END < 0) { console.error('FATAL: بلوکِ اسکنر در new-subscription.html پیدا نشد'); process.exit(1); }
const code = html.slice(START, END);

/* ── محیطِ شبیه‌سازی‌شده ── */
const performanceStub = { now: () => Date.now() };
const baseDeps = {
  performance: performanceStub,
  location: { host: 'p.example', href: 'https://p.example/sub/abc' },
  sanaeiClientData: { links: ['vless://uuid@1.2.3.4:443?x=1#n'], subUrl: 'https://p.example/sub/abc' },
  parseConfigLink: () => ({ port: '443', remark: 'n' }),
};

/* شمارنده‌ی پروب‌ها — بین همه‌ی ماژول‌ها مشترک است */
let calls = 0;

/* ── رفتارِ میزبان‌های شبیه‌سازی‌شده ──
   ۹.۹.۹.۹ = مرده: هیچ رویدادی نمی‌آید → تایم‌اوتِ اسکنر تعیین‌کننده است
   ۷.۷.۷.۷ = لبه‌ی واقعیِ دوردست: ۶۰ms → بالای کفِ خودکار (۲۰ms) می‌ماند
   ۸.۸.۸.۸ = بی‌ثبات: فقط پروبِ اول پاسخ می‌دهد (۱ از ۳ → باید رد شود)
   بقیه    = پاسخِ بی‌درنگِ ۵ms، مثل RSTِ میان‌راه → زیرِ کف رد می‌شود */
let chanCalls = 0;
function hostPlan(host) {
  if (host.startsWith('p.example')) return { ms: 30 };   /* میزبانِ مبنا (دامنه‌ی ورکر) */
  if (host.startsWith('9.9.9.9')) return { dead: true };
  if (host.startsWith('8.8.8.8')) return (chanCalls++ < 2) ? { ms: 60 } : { dead: true };
  if (host.startsWith('7.7.7.7')) return { ms: 60 };
  return { ms: 5 };
}

/* Image جعلی */
function makeFakeImage() {
  return class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this._src = ''; }
    set src(v) {
      this._src = v;
      calls++;
      const host = String(v).replace('https://', '').split('/')[0];
      const p = hostPlan(host);
      if (p.dead) return;
      setTimeout(() => { if (typeof this.onerror === 'function') this.onerror(); }, p.ms);
    }
    get src() { return this._src; }
  };
}

/* fetch جعلی — همان معناشناسیِ Image، تا کانالِ دومِ پروب هم شبیه‌سازی شود:
   آی‌پیِ زنده خطای سریع می‌دهد (گواهی/CORS ⇒ TypeError) و آی‌پیِ مرده معلق
   می‌ماند تا خودِ اسکنر abort کند (AbortError ⇒ مرده). */
function makeFakeFetch() {
  return function fakeFetch(url, opts) {
    return new Promise((resolve, reject) => {
      const host = String(url).replace('https://', '').split('/')[0];
      const sig = opts && opts.signal;
      const plan = hostPlan(host);
      const dead = !!plan.dead;
      let timer = null;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      };
      if (sig) {
        if (sig.aborted) { onAbort(); return; }
        sig.addEventListener('abort', onAbort);
      }
      if (dead) return;                                  /* معلق تا اَبورت */
      timer = setTimeout(() => reject(new TypeError('Failed to fetch')), plan.ms);
    });
  };
}

/* ساختِ ماژول از کدِ واقعی با کانفیگِ دلخواه.
   placeholder داخل JSON.parse("...") نشسته، پس باید «رشته‌ی JSON» را به‌عنوان
   یک رشته‌ی جاوااسکریپتی جایگزین کنیم (دو بار stringify) — دقیقاً همان کاری
   که renderUserPage با escape کردنِ کوتیشن‌ها انجام می‌دهد. */
function mkModule(cfgObj, depOverrides) {
  const inject = JSON.stringify(JSON.stringify(cfgObj)).slice(1, -1);
  let src = code.split('__SCANNER_CFG_JSON__').join(inject);
  const deps = Object.assign({}, baseDeps, depOverrides || {});
  const names = Object.keys(deps);
  const fn = new Function(...names, 'Image', 'fetch', 'AbortController', src +
    '\n;return { SCAN, CF_CIDRS, CF_BLOCKS, buildIpList, randCfIp, radarConfigPorts, RADAR_KEEP, radarProbeIp, pingIp, radarFoundHtml, radarSelfTest, RADAR_CONTROL_IPS, radarSavedFromLinks, radarFallbackCheck, rawResponses: function () { return radarRawResponses; }, radarAutoFloor: radarAutoFloor, radarBaseline: radarBaseline, radarBaseHost: radarBaseHost, setFloor: function (v) { radarFloor = v; }, getFloor: function () { return radarFloor; }, rejectedFast: function () { return radarRejectedFast; }, resetFast: function () { radarRejectedFast = 0; } };');
  return fn(...names.map((n) => deps[n]), makeFakeImage(), makeFakeFetch(), AbortController);
}

const DEF_CFG = { ipCount: 2048, concurrency: 8, timeout: 300, probes: 3, minRtt: 0, maxRtt: 0, keep: 3, mode: 'even', ports: [443], ranges: [] };
const M = mkModule(DEF_CFG);

/* ── درستی‌سنجیِ رنج‌های رسمیِ کلودفلر (مستقل از کد) ── */
const OFFICIAL = ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22'];
const ip2n = (s) => s.split('.').reduce((a, x) => a * 256 + Number(x), 0);
const OFF = OFFICIAL.map((c) => { const [ip, p] = c.split('/'); const size = 2 ** (32 - Number(p)); const s = ip2n(ip); return { s, e: s + size - 1 }; });
const inCF = (ip) => { const n = ip2n(ip); return OFF.some((b) => n >= b.s && n <= b.e); };

let fail = 0;
const ok = (cond, label, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : '')); if (!cond) fail++; };

console.log('== ۱) رنج‌های رسمی ==');
ok(M.CF_CIDRS.length === 15, 'همه‌ی ۱۵ رنج رسمیِ IPv4 تعریف شده‌اند', M.CF_CIDRS.length);
ok(OFFICIAL.every((c) => M.CF_CIDRS.indexOf(c) >= 0), 'فهرست دقیقاً با cloudflare.com/ips-v4 یکی است');
ok(M.CF_BLOCKS.length === 15 && M.CF_BLOCKS.total === OFF.reduce((a, b) => a + (b.e - b.s + 1), 0), 'وزنِ بلوک‌ها = مجموعِ آدرس‌ها', M.CF_BLOCKS.total);

console.log('== ۲) تعدادِ اسکن ==');
ok(M.SCAN.ipCount === 2048, 'پیش‌فرض/تنظیم‌شده ۲۰۴۸ است', M.SCAN.ipCount);
const list = M.buildIpList(M.SCAN.ipCount);
ok(list.length === 2048, '۲۰۴۸ آی‌پیِ یکتا ساخته شد', list.length);
ok(new Set(list).size === list.length, 'هیچ آی‌پیِ تکراری نیست');
const outside = list.filter((ip) => !inCF(ip));
ok(outside.length === 0, 'همه‌ی آی‌پی‌ها داخلِ رنج‌های رسمی‌اند', outside.slice(0, 3).join(','));

console.log('== ۳) پوششِ همه‌ی رنج‌ها (حالت even) ==');
const blockOf = (ip) => { const n = ip2n(ip); return OFF.findIndex((b) => n >= b.s && n <= b.e); };
const hit = new Set(list.map(blockOf));
ok(hit.size === 15, 'هر ۱۵ رنج دست‌کم یک نمونه دارند', hit.size + '/15');
const perBlock = {};
list.forEach((ip) => { const i = blockOf(ip); perBlock[i] = (perBlock[i] || 0) + 1; });
const counts = Object.values(perBlock);
ok(Math.min(...counts) >= 100, 'کمترین سهمِ یک رنج هم ≥۱۰۰ نمونه است', 'min=' + Math.min(...counts));

/* رگرسیونِ باگِ «پشت‌سرهم از یک نقطه»: در حالتِ evenِ قبلی، هر بلوک یک نقطه‌ی
   تصادفی می‌گرفت و از آنجا آدرس‌ها پشت‌سرهم برداشته می‌شدند → تقریباً همه‌ی
   نمونه‌ها جفتِ چسبیده بودند (~۲۰۰۰ جفت از ۲۰۴۸). با انتخابِ تصادفیِ درونِ هر
   بلوک این عدد به ~۲۰۰ می‌رسد (اکثراً از بلوک‌های کوچکِ /22 با ۱۰۲۴ آدرس). */
const sorted = list.map(ip2n).sort((a, b) => a - b);
let adjacent = 0;
for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] <= 2) adjacent++;
ok(adjacent <= 500, 'نمونه‌ها خوشه‌ای/متوالی نیستند (تصادفیِ درونِ هر بلوک)', adjacent + ' جفتِ چسبیده');

console.log('== ۴) حالتِ تصادفی ==');
const code2 = code.split('__SCANNER_CFG_JSON__').join(JSON.stringify(JSON.stringify(Object.assign({}, DEF_CFG, { mode: 'random' }))).slice(1, -1));
const M3 = new Function(...Object.keys(baseDeps), code2 + '\n;return { buildIpList, CF_BLOCKS };')(...Object.keys(baseDeps).map((n) => baseDeps[n]));
const rnd = M3.buildIpList(500);
ok(rnd.length === 500 && new Set(rnd).size === 500, 'حالت تصادفی هم ۵۰۰ آی‌پیِ یکتا داد', rnd.length);
ok(rnd.every(inCF), 'همه داخلِ رنج‌های رسمی‌اند');

console.log('== ۵) پروب و انتخابِ آی‌پی ==');
(async () => {
  const before = calls;
  const alive = await M.radarProbeIp('1.2.3.4', [443]);
  ok(!!alive && alive.ip === '1.2.3.4' && alive.port === 443, 'آی‌پیِ زنده تشخیص داده شد', alive && (alive.avg + 'ms'));
  ok(calls - before === M.SCAN.probes, 'برای آی‌پیِ زنده به‌اندازه‌ی probes پروب زده شد', (calls - before) + ' پروب');

  const dead = await M.radarProbeIp('9.9.9.9', [443]);
  ok(dead === null, 'آی‌پیِ بی‌پاسخ (تایم‌اوت) رد شد');

  /* یک آی‌پیِ مرده نباید برای هر پورت یک‌بار تایم‌اوت بخورد */
  const c0 = calls;
  await M.radarProbeIp('9.9.9.9', [443, 2053, 2083, 2087, 2096, 8443]);
  const used = calls - c0;
  ok(used <= 8, 'پورت‌ها موازی آزموده می‌شوند (نه ۶ تایم‌اوتِ پشت‌سرهم)', used + ' پروب');

  ok(M.radarConfigPorts().join(',') === '443', 'پورت از تنظیماتِ اسکنر می‌آید', M.radarConfigPorts().join(','));
  ok(M.RADAR_KEEP === 3, 'تعدادِ نگه‌داری از تنظیماتِ اسکنر می‌آید', M.RADAR_KEEP);

  console.log('== ۶) پورت‌ها هرگز خالی نمی‌مانند (باگِ «اسکنر کار نمی‌کند») ==');
  /* کانفیگِ کاربر پورتِ غیر-TLS دارد و تنظیماتِ اسکنر هم خالی است:
     قبلاً این حالت فهرستِ خالی برمی‌گرداند و radarRun بلافاصله رد می‌شد. */
  const MnoTls = mkModule(Object.assign({}, DEF_CFG, { ports: [] }), { parseConfigLink: () => ({ port: '80', remark: 'n' }) });
  ok(MnoTls.radarConfigPorts().join(',') === '443,2053,2083,2087,2096,8443', 'پورتِ غیر-TLS با لینکِ خالی → همه‌ی پورت‌های TLS (تک‌پورتِ 443ِ فیلترشده اسکن را صفر می‌کرد)', MnoTls.radarConfigPorts().join(','));

  const Munparsed = mkModule(Object.assign({}, DEF_CFG, { ports: [] }), { parseConfigLink: () => ({ port: undefined, remark: 'n' }) });
  ok(Munparsed.radarConfigPorts().join(',') === '443,2053,2083,2087,2096,8443', 'پورتِ پارس‌نشده → همه‌ی پورت‌های TLS', Munparsed.radarConfigPorts().join(','));

  const Mtls = mkModule(Object.assign({}, DEF_CFG, { ports: [] }), { parseConfigLink: () => ({ port: '2053', remark: 'n' }) });
  ok(Mtls.radarConfigPorts().join(',') === '2053', 'پورتِ TLS خودِ کانفیگ استفاده می‌شود', Mtls.radarConfigPorts().join(','));

  console.log('== ۷) پیش‌فرض‌های تنظیم‌نشده (تنظیماتِ خالی) ==');
  const Mdef = mkModule({});
  ok(Mdef.SCAN.timeout === 2000, 'تایم‌اوت پیش‌فرض ۲۰۰۰ms است (نه ۱۰۰۰)', Mdef.SCAN.timeout);
  ok(Mdef.SCAN.concurrency === 16, 'هم‌روندیِ پیش‌فرض ۱۶ است (نه ۶۴)', Mdef.SCAN.concurrency);
  ok(Mdef.SCAN.probes === 3, 'تعدادِ پروبِ پیش‌فرض ۳ است', Mdef.SCAN.probes);
  ok(Mdef.SCAN.ipCount === 2048, 'تعدادِ آی‌پیِ پیش‌فرض ۲۰۴۸ است', Mdef.SCAN.ipCount);
  ok(Mdef.SCAN.mode === 'smart', 'حالتِ پیش‌فرض «smart» است (نه even)', Mdef.SCAN.mode);

  console.log('== ۸) تخصیصِ «smart» — بودجه به رنج‌های پربازده می‌رود ==');
  /* داده‌ی واقعی: ~۹۶٪ آی‌پی‌های تمیزِ شناخته‌شده در ۳ رنجِ بزرگ‌اند
     (104.16.0.0/13 • 172.64.0.0/13 • 104.24.0.0/14) و ۹ رنجِ دیگر تقریباً
     خالی‌اند. «smart» باید سهمِ متناسب بدهد ولی هیچ رنجی را صفر نگذارد. */
  const Msmart = mkModule(Object.assign({}, DEF_CFG, { mode: 'smart' }));
  const list = Msmart.buildIpList(2048);
  const inRange = (ip, cidr) => {
    const [b, p] = cidr.split('/');
    const size = 2 ** (32 - Number(p));
    const n = ip2n(ip);
    return n >= ip2n(b) && n <= ip2n(b) + size - 1;
  };
  const BIG3 = ['104.16.0.0/13', '172.64.0.0/13', '104.24.0.0/14'];
  const share = (cidr) => list.filter((ip) => inRange(ip, cidr)).length;
  const big3 = BIG3.reduce((a, c) => a + share(c), 0);
  const pctBig = Math.round(100 * big3 / list.length);
  ok(list.length === 2048, '۲۰۴۸ آی‌پیِ یکتا ساخته شد', list.length);
  ok(new Set(list).size === 2048, 'بدون تکرار');
  ok(pctBig >= 70, '≥۷۰٪ بودجه به ۳ رنجِ پربازده می‌رود (even فقط ~۲۰٪ می‌داد)', pctBig + '%');
  ok(Msmart.CF_CIDRS.every((c) => share(c) > 0), 'هیچ رنجی صفر نمانده (کفِ تضمینی)',
     Msmart.CF_CIDRS.map((c) => share(c)).join(','));
  /* مقایسه با even روی همان بودجه */
  const Meven = mkModule(Object.assign({}, DEF_CFG, { mode: 'even' }));
  const elist = Meven.buildIpList(2048);
  const epct = Math.round(100 * BIG3.reduce((a, c) => a + elist.filter((ip) => inRange(ip, c)).length, 0) / elist.length);
  ok(pctBig > epct * 2, 'smart دست‌کم ۲ برابرِ even از بودجه را به رنج‌های پربازده می‌دهد', 'smart ' + pctBig + '% vs even ' + epct + '%');

  console.log('== ۹) پورت‌های غیر-TLS از تنظیماتِ ادمین فیلتر می‌شوند ==');
  /* پورتِ غیر-TLS (۸۰) روی پروبِ https با خطای SSL بی‌درنگ «پاسخ» می‌دهد و
     همه‌چیز را زنده نشان می‌دهد — پس باید فیلتر شود. */
  const MbadPort = mkModule(Object.assign({}, DEF_CFG, { ports: [80] }));
  ok(MbadPort.radarConfigPorts().join(',') === '443', 'تنظیماتِ پورتِ ۸۰ → 443 (فیلتر شد)', MbadPort.radarConfigPorts().join(','));
  const MmixPort = mkModule(Object.assign({}, DEF_CFG, { ports: [80, 2053, 8080] }));
  ok(MmixPort.radarConfigPorts().join(',') === '2053', 'فقط پورتِ TLS از میانِ مخلوط می‌ماند', MmixPort.radarConfigPorts().join(','));

  console.log('== ۱۰) خودآزماییِ پروب (تشخیصِ نتیجه‌ی بی‌اعتبار) ==');
  ok(M.RADAR_CONTROL_IPS.length === 3, 'سه آی‌پیِ آزمایشیِ RFC 5737 تعریف شده', M.RADAR_CONTROL_IPS.join(','));
  ok(M.RADAR_CONTROL_IPS.every((ip) => /^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip)),
     'آی‌پی‌های آزمایشی از بازه‌های TEST-NET هستند');
  /* در محیطِ جعلی، 192.0.2.x «زنده» دیده می‌شود (FakeImage هر چیزی جز 9.9.9.9
     را زنده می‌داند) — یعنی خودآزمایی باید «بد» را تشخیص بدهد. */
  const stBad = await M.radarSelfTest([443]);
  ok(stBad.bad === true, 'وقتی پروب به آی‌پیِ آزمایشی هم پاسخ می‌دهد، «بد» تشخیص داده می‌شود',
     stBad.bad ? stBad.ip + ' @ ' + stBad.rtt + 'ms' : 'bad=false');
  /* ماژولی که همه‌چیز را مرده می‌بیند ⇒ خودآزمایی سالم است */
  const Mdead = mkModule(Object.assign({}, DEF_CFG, { ports: [443] }), { parseConfigLink: () => ({ port: '443' }) });
  const stGood = await (async () => {
    /* 9.9.9.9 مرده است؛ با پورت‌دهی به آن، خودآزمایی نباید هشدار بدهد */
    const orig = Mdead.RADAR_CONTROL_IPS.slice();
    for (let i = 0; i < orig.length; i++) Mdead.RADAR_CONTROL_IPS[i] = '9.9.9.9';
    return Mdead.radarSelfTest([443]);
  })();
  ok(stGood.bad === false, 'وقتی هیچ آی‌پیِ آزمایشی پاسخ نمی‌دهد، هشداری داده نمی‌شود');

  console.log('== ۱۱) شمارنده‌ی پاسخ‌های خام (تشخیصِ «هیچ پاسخی نیامد») ==');
  const beforeResp = M.rawResponses();
  await M.radarProbeIp('1.2.3.4', [443]);
  ok(M.rawResponses() > beforeResp, 'پاسخِ آی‌پیِ زنده شمرده می‌شود', beforeResp + ' → ' + M.rawResponses());
  const b2 = M.rawResponses();
  await M.radarProbeIp('9.9.9.9', [443]);
  ok(M.rawResponses() === b2, 'آی‌پیِ مرده شمارنده را بالا نمی‌برد', String(M.rawResponses()));

  console.log('== ۱۲) کفِ خودکارِ تأخیر (radarAutoFloor) ==');
  ok(M.radarAutoFloor(null) === 0, 'بدون اندازه‌گیریِ پایه، کفی اعمال نمی‌شود', '0');
  ok(M.radarAutoFloor({ ms: 0 }) === 0, 'پایه‌ی صفر → بدون کف', '0');
  ok(M.radarAutoFloor({ ms: 50 }) === 20, 'کفِ حداقلیِ ۲۰ms رعایت می‌شود', String(M.radarAutoFloor({ ms: 50 })));
  ok(M.radarAutoFloor({ ms: 100 }) === 40, 'کف ≈ ۴۰٪ تأخیرِ پایه', String(M.radarAutoFloor({ ms: 100 })));
  ok(M.radarAutoFloor({ ms: 2000 }) === 200, 'سقفِ ۲۰۰ms تا شبکه‌ی کند بی‌دلیل سخت نشود', String(M.radarAutoFloor({ ms: 2000 })));

  console.log('== ۱۳) کفِ تأخیر پاسخِ بی‌درنگِ میان‌راه را رد می‌کند ==');
  M.resetFast();
  M.setFloor(20);
  const fast = await M.radarProbeIp('1.2.3.4', [443]);          /* پاسخِ ۵ms */
  ok(fast === null, 'پاسخِ ۵ms زیرِ کفِ ۲۰ms رد می‌شود (RSTِ میان‌راه، نه لبه)', String(fast));
  ok(M.rejectedFast() > 0, 'شمارنده‌ی «مردودِ سریع» بالا می‌رود', String(M.rejectedFast()));
  const slow = await M.radarProbeIp('7.7.7.7', [443]);          /* پاسخِ ۶۰ms */
  ok(slow !== null, 'لبه‌ی واقعیِ ۶۰ms بالای کف پذیرفته می‌شود', slow ? slow.avg + 'ms' : 'null');
  ok(slow !== null && slow.avg >= 20, 'میانگینِ ثبت‌شده بالای کف است', slow ? String(slow.avg) : '-');
  M.setFloor(0);

  console.log('== ۱۴) دروازه‌ی ثبات — یک پاسخ از سه پروب کافی نیست ==');
  const flaky = await M.radarProbeIp('8.8.8.8', [443]);         /* فقط پروبِ اول */
  ok(flaky === null, 'آی‌پیِ بی‌ثبات (۱ پاسخ از ۳ پروب) رد می‌شود', String(flaky));
  const stable = await M.radarProbeIp('7.7.7.7', [443]);
  ok(stable !== null && stable.loss === 0, 'آی‌پیِ باثبات افتِ صفر دارد', stable ? String(stable.loss) : '-');

  console.log('== ۱۵) تأخیرِ پایه تا دامنه‌ی ورکر ==');
  ok(M.radarBaseHost() === 'p.example', 'میزبانِ مبنا از subUrl خوانده می‌شود', M.radarBaseHost());
  const base = await M.radarBaseline();
  ok(base !== null && base.ms > 0, 'تأخیرِ پایه اندازه‌گیری می‌شود', base ? base.ms + 'ms' : 'null');

  console.log('== ۱۶) کلیدِ locale «radarStatusGuard» در هر ۴ زبان ==');
  const guardHits = (html.match(/radarStatusGuard:/g) || []).length;
  ok(guardHits === 4, 'در هر ۴ زبان تعریف شده', String(guardHits));
  ok(/radarStatusGuard \? /.test(html), 'در خطِ وضعیت با نگهبانِ undefined استفاده می‌شود');
  ok(/radarFloor = Math\.max\(SCAN\.minRtt/.test(html), 'کف از max(کفِ دستی، کفِ خودکار) حساب می‌شود');

  console.log('== ۱۷) لبه‌های تنظیمات — دروازه‌ی ثبات نباید اسکن را خالی کند ==');
  /* خطرِ واقعی: دروازه‌ی ثبات «حداقل ۲ پاسخ» می‌خواهد؛ با probes=1 این شرط
     هرگز برقرار نمی‌شود و اگر با min() محافظت نشده باشد، اسکن همیشه صفر
     نتیجه می‌دهد. پنل بازه‌ی ۱ تا ۵ را مجاز می‌گذارد، پس این حالت واقعی است. */
  const M1 = mkModule(Object.assign({}, DEF_CFG, { probes: 1 }));
  ok(M1.SCAN.probes === 1, 'probes=1 درست خوانده می‌شود', String(M1.SCAN.probes));
  const one = await M1.radarProbeIp('7.7.7.7', [443]);
  ok(one !== null, 'با probes=1 اسکن خالی نمی‌شود', one ? one.avg + 'ms' : 'null');
  ok(one !== null && one.loss === 0, 'افتِ تک‌پروبی صفر است', one ? String(one.loss) : '-');

  /* کفِ دستی هنوز به‌عنوان بازنویسی کار می‌کند */
  const M2 = mkModule(Object.assign({}, DEF_CFG, { minRtt: 0 }));
  M2.setFloor(20);
  ok(await M2.radarProbeIp('1.2.3.4', [443]) === null, 'کفِ دستی پاسخِ ۵ms را رد می‌کند');
  M2.setFloor(0);
  ok(await M2.radarProbeIp('1.2.3.4', [443]) !== null, 'برداشتنِ کف همان آی‌پی را برمی‌گرداند');

  console.log('== ۱۸) فالبکِ آی‌پی‌های ذخیره‌شده (اسکنِ تازه بی‌نتیجه) ==');
  /* نامزدها از لینک‌های فعلیِ ساب خوانده می‌شوند (vless/trojan، بدون تکرار) */
  ok(JSON.stringify(M.radarSavedFromLinks()) === JSON.stringify(['1.2.3.4']), 'آی‌پیِ لینکِ فعلی نامزدِ فالبک است', M.radarSavedFromLinks().join(','));
  const Mlinks = mkModule(DEF_CFG, { sanaeiClientData: { links: ['vless://u@1.2.3.4:443?x=1#n', 'trojan://s@5.6.7.8:443?x=1#m', 'vless://u@1.2.3.4:2053?x=1#d', 'garbage', 'vmess://eyJ9'], subUrl: 'https://p.example/sub/abc' } });
  ok(JSON.stringify(Mlinks.radarSavedFromLinks().sort()) === JSON.stringify(['1.2.3.4', '5.6.7.8']), 'trojan هم خوانده و تکراری حذف می‌شود', Mlinks.radarSavedFromLinks().join(','));
  /* فالبک با کفِ relaxed (فقط minRtt) آی‌پیِ سالمِ ذخیره‌شده را برمی‌گرداند و کف را برمی‌گرداند */
  M.setFloor(50);
  const fb = await M.radarFallbackCheck([443]);
  ok(fb.length === 1 && fb[0].ip === '1.2.3.4', 'فالبک آی‌پیِ سالمِ ذخیره‌شده را پیدا می‌کند', fb.map((r) => r.ip).join(','));
  ok(M.getFloor() === 50, 'کفِ اسکنِ اصلی بعد از فالبک برمی‌گردد', String(M.getFloor()));
  M.setFloor(0);
  /* هیچ نامزدی → فالبک خالی (نه خطا) */
  const Mempty = mkModule(DEF_CFG, { sanaeiClientData: { links: [], subUrl: 'https://p.example/sub/abc' } });
  ok((await Mempty.radarFallbackCheck([443])).length === 0, 'بدونِ نامزد، فالبک خالی برمی‌گردد');
  /* تایم‌اوتِ صریحِ پروب */
  ok(await M.radarProbeIp('7.7.7.7', [443], 300) !== null, 'پروب با تایم‌اوتِ صریح کار می‌کند');

  console.log('== ۱۹) کلیدهای locale فالبک در هر ۴ زبان ==');
  ok((html.match(/radarStatusFallback:/g) || []).length === 4, 'radarStatusFallback در هر ۴ زبان', String((html.match(/radarStatusFallback:/g) || []).length));
  ok((html.match(/radarStatusFallbackSaved:/g) || []).length === 4, 'radarStatusFallbackSaved در هر ۴ زبان', String((html.match(/radarStatusFallbackSaved:/g) || []).length));

  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})();
