/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ موتورِ اسکنر (رادار آی‌پی تمیز)
 *  ───────────────────────────────────────────────────────────────────────────
 *  کدِ واقعیِ اسکنر از new-subscription.html استخراج و در یک محیطِ شبیه‌سازی‌شده
 *  اجرا می‌شود. بدون نیاز به مرورگر یا حساب کلادفلر.
 *
 *  پروبِ اسکنر Image است (روشِ اثبات‌شده‌ی پنل نوا)، پس اینجا یک Image جعلی
 *  ساخته می‌شود: آی‌پیِ «زنده» رویداد onerror می‌دهد (لبه TLS را کامل می‌کند و
 *  تصویر رد می‌شود) و آی‌پیِ «مرده» هیچ رویدادی نمی‌دهد تا تایم‌اوت بخورد.
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
  sanaeiClientData: { links: ['vless://uuid@1.2.3.4:443?x=1#n'], subUrl: 'https://p.example/sub/abc' },
  parseConfigLink: () => ({ port: '443', remark: 'n' }),
};

/* شمارنده‌ی پروب‌ها — بین همه‌ی ماژول‌ها مشترک است */
let calls = 0;

/* Image جعلی: 1.2.3.x و هر چیزِ دیگر «زنده»، 9.9.9.9 «مرده» */
function makeFakeImage() {
  return class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this._src = ''; }
    set src(v) {
      this._src = v;
      calls++;
      const host = String(v).replace('https://', '').split('/')[0];
      /* مرده: هیچ رویدادی نمی‌آید → تایم‌اوتِ اسکنر تعیین‌کننده است */
      if (host.startsWith('9.9.9.9')) return;
      /* زنده: گواهیِ نامطابق → onerrorِ سریع */
      setTimeout(() => { if (typeof this.onerror === 'function') this.onerror(); }, 5);
    }
    get src() { return this._src; }
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
  const fn = new Function(...names, 'Image', src +
    '\n;return { SCAN, CF_CIDRS, CF_BLOCKS, buildIpList, randCfIp, radarConfigPorts, RADAR_KEEP, radarProbeIp, pingIp, radarFoundHtml };');
  return fn(...names.map((n) => deps[n]), makeFakeImage());
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
  ok(MnoTls.radarConfigPorts().join(',') === '443', 'پورتِ غیر-TLS → فالبک به 443 (نه فهرستِ خالی)', MnoTls.radarConfigPorts().join(','));

  const Munparsed = mkModule(Object.assign({}, DEF_CFG, { ports: [] }), { parseConfigLink: () => ({ port: undefined, remark: 'n' }) });
  ok(Munparsed.radarConfigPorts().join(',') === '443', 'پورتِ پارس‌نشده → فالبک به 443', Munparsed.radarConfigPorts().join(','));

  const Mtls = mkModule(Object.assign({}, DEF_CFG, { ports: [] }), { parseConfigLink: () => ({ port: '2053', remark: 'n' }) });
  ok(Mtls.radarConfigPorts().join(',') === '2053', 'پورتِ TLS خودِ کانفیگ استفاده می‌شود', Mtls.radarConfigPorts().join(','));

  console.log('== ۷) پیش‌فرض‌های تنظیم‌نشده (تنظیماتِ خالی) ==');
  const Mdef = mkModule({});
  ok(Mdef.SCAN.timeout === 2000, 'تایم‌اوت پیش‌فرض ۲۰۰۰ms است (نه ۱۰۰۰)', Mdef.SCAN.timeout);
  ok(Mdef.SCAN.concurrency === 16, 'هم‌روندیِ پیش‌فرض ۱۶ است (نه ۶۴)', Mdef.SCAN.concurrency);
  ok(Mdef.SCAN.probes === 3, 'تعدادِ پروبِ پیش‌فرض ۳ است', Mdef.SCAN.probes);
  ok(Mdef.SCAN.ipCount === 2048, 'تعدادِ آی‌پیِ پیش‌فرض ۲۰۴۸ است', Mdef.SCAN.ipCount);

  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})();
