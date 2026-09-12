/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ موتورِ اسکنر (رادار آی‌پی تمیز)
 *  ───────────────────────────────────────────────────────────────────────────
 *  کدِ واقعیِ اسکنر از new-subscription.html استخراج و در یک محیطِ شبیه‌سازی‌شده
 *  اجرا می‌شود. بدون نیاز به مرورگر یا حساب کلادفلر.
 *
 *  اجرا:  node tests-manual/scanner-engine.js
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'new-subscription.html'), 'utf8');

/* ── استخراجِ بلوکِ اسکنر از فایلِ واقعی ── */
const START = html.indexOf('const SCAN = (function () {');
const END = html.indexOf('async function radarRun');
if (START < 0 || END < 0) { console.error('FATAL: بلوکِ اسکنر در new-subscription.html پیدا نشد'); process.exit(1); }
let code = html.slice(START, END);

/* placeholder باید مثل خودِ ورکر جایگزین شود (رشته‌ی JSON داخل کوتیشن) */
const CFG = process.env.SCAN_CFG || JSON.stringify({ ipCount: 2048, concurrency: 8, timeout: 300, probes: 1, minRtt: 0, maxRtt: 0, keep: 3, mode: 'even', ports: [443], ranges: [] });
code = code.split('__SCANNER_CFG_JSON__').join(JSON.stringify(CFG).slice(1, -1));

/* ── محیطِ شبیه‌سازی‌شده ── */
const deps = {
  performance: { now: () => Date.now() },
  AbortController: class { constructor() { this.signal = {}; } abort() { this.aborted = true; } },
  sanaeiClientData: { links: ['vless://uuid@1.2.3.4:443?x=1#n'], subUrl: 'https://p.example/sub/abc' },
  parseConfigLink: () => ({ port: '443', remark: 'n' }),
};
const names = Object.keys(deps);
const fn = new Function(...names, code + '\n;return { SCAN, CF_CIDRS, CF_BLOCKS, buildIpList, randCfIp, radarConfigPorts, RADAR_KEEP, radarProbeIp, pingIp, radarFoundHtml };');
const M = fn(...names.map((n) => deps[n]));

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
const hit = new Set();
list.forEach((ip) => { const n = ip2n(ip); const i = OFF.findIndex((b) => n >= b.s && n <= b.e); if (i >= 0) hit.add(i); });
ok(hit.size === 15, 'هر ۱۵ رنج دست‌کم یک نمونه دارند', hit.size + '/15');
const perBlock = {};
list.forEach((ip) => { const n = ip2n(ip); const i = OFF.findIndex((b) => n >= b.s && n <= b.e); perBlock[i] = (perBlock[i] || 0) + 1; });
const counts = Object.values(perBlock);
ok(Math.min(...counts) >= 100, 'کمترین سهمِ یک رنج هم ≥۱۰۰ نمونه است', 'min=' + Math.min(...counts));

console.log('== ۴) حالتِ تصادفی ==');
const code2 = code.replace("mode: c.mode === 'random' ? 'random' : 'even'", "mode: 'random'");
const M3 = new Function(...names, code2 + '\n;return { buildIpList, CF_BLOCKS };')(...names.map((n) => deps[n]));
const rnd = M3.buildIpList(500);
ok(rnd.length === 500 && new Set(rnd).size === 500, 'حالت تصادفی هم ۵۰۰ آی‌پیِ یکتا داد', rnd.length);
ok(rnd.every(inCF), 'همه داخلِ رنج‌های رسمی‌اند');

console.log('== ۵) پروب و انتخابِ آی‌پی ==');
/* fetch جعلی: 1.2.3.x زنده (خطای گواهیِ سریع)، 9.9.9.x تایم‌اوت */
let calls = 0;
global.fetch = (url, opt) => {
  calls++;
  const host = String(url).replace('https://', '').split('/')[0];
  if (host.startsWith('9.9.9.9')) return new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), 400));
  return new Promise((_, rej) => setTimeout(() => rej(new TypeError('Failed to fetch')), 5));
};
global.AbortController = deps.AbortController;
global.performance = deps.performance;
const M4 = new Function(...names, 'fetch', 'AbortController', 'performance', code + '\n;return { radarProbeIp, pingIp, radarConfigPorts, RADAR_KEEP, SCAN };')(
  ...names.map((n) => deps[n]), global.fetch, global.AbortController, global.performance);

(async () => {
  const before = calls;
  const alive = await M4.radarProbeIp('1.2.3.4', [443]);
  ok(!!alive && alive.ip === '1.2.3.4' && alive.port === 443, 'آی‌پیِ زنده تشخیص داده شد', alive && (alive.avg + 'ms'));
  const dead = await M4.radarProbeIp('9.9.9.9', [443]);
  ok(dead === null, 'آی‌پیِ بی‌پاسخ (تایم‌اوت) رد شد');
  /* یک آی‌پیِ مرده نباید برای هر پورت یک‌بار تایم‌اوت بخورد */
  const c0 = calls;
  await M4.radarProbeIp('9.9.9.9', [443, 2053, 2083, 2087, 2096, 8443]);
  const used = calls - c0;
  ok(used <= 8, 'پورت‌ها موازی آزموده می‌شوند (نه ۶ تایم‌اوتِ پشت‌سرهم)', used + ' درخواست');
  ok(M4.radarConfigPorts().join(',') === '443', 'پورت از تنظیماتِ اسکنر می‌آید', M4.radarConfigPorts().join(','));
  ok(M4.RADAR_KEEP === 3, 'تعدادِ نگه‌داری از تنظیماتِ اسکنر می‌آید', M4.RADAR_KEEP);

  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})();
