/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ سرتاسریِ ورکر (نسخه‌ی obfuscate‌شده = همان فایلی که در داشبورد پیست می‌شود)
 *  ───────────────────────────────────────────────────────────────────────────
 *  ماژول واقعیِ _worker.obf.js با شبیه‌سازیِ محیطِ کلادفلر بارگذاری می‌شود و
 *  صفحه‌ی کاربر («/status/<name>») ساخته می‌شود. بررسی می‌کند:
 *    ۱) placeholderها واقعاً جایگزین می‌شوند (حتی بعد از obfuscate)
 *    ۲) تنظیماتِ اسکنر به صفحه تزریق و درست پارس می‌شوند
 *    ۳) اسکریپتِ درون‌خطیِ صفحه معتبر است
 *    ۴) مسیرِ ذخیره‌ی رادار (POST /radar-ips) کار می‌کند
 *
 *  اجرا:  node tests-manual/worker-e2e.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '..');
const OBF = path.join(ROOT, '_worker.obf.js');
const SRC = path.join(ROOT, 'worker.js');
const TMP = path.join(ROOT, '.e2e-tmp');

if (!fs.existsSync(OBF)) { console.error('FATAL: _worker.obf.js نیست — اول npm run build'); process.exit(1); }

let fail = 0;
const ok = (c, label, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : '')); if (!c) fail++; };

/* ── محیطِ کلادفلر ── */
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
let code = fs.readFileSync(OBF, 'utf8');
/* import از 'cloudflare:sockets' با unicode-escape نوشته شده — نرمال‌سازی می‌کنیم */
code = code.replace(/from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/, (m, q, body) => {
  const spec = body.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (spec !== 'cloudflare:sockets') return m;
  return 'from "./sockets.cjs"';
});
fs.writeFileSync(path.join(TMP, 'obf.mjs'), code);
fs.writeFileSync(path.join(TMP, 'sockets.mjs'), 'export const connect = () => { throw new Error("no sockets in test"); };\n');
/* بدون package.json، پوشه‌ی موقت به‌عنوان CommonJS دیده می‌شود؛ type=module لازم است */
fs.writeFileSync(path.join(TMP, 'package.json'), '{ "type": "module" }\n');

/* fetch جعلی: فایل‌های گیت‌هاب از دیسکِ محلی سرو می‌شوند تا تمپلیتِ واقعی تست شود */
globalThis.fetch = async (url) => {
  const u = String(url);
  const m = u.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/([^?#]+)/);
  if (m) {
    const f = path.join(ROOT, decodeURIComponent(m[1]));
    if (fs.existsSync(f)) return new Response(fs.readFileSync(f, 'utf8'), { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return new Response('not found', { status: 404 });
  }
  return new Response('offline', { status: 404 });
};
globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = {}; } };
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

(async () => {
  /* ── ۱) هر دو نسخه باید بارگذاری شوند ── */
  const load = async (srcFile, outFile) => {
    let body = fs.readFileSync(srcFile, 'utf8');
    /* specifier ممکن است خام یا unicode-escape شده باشد */
    body = body.replace(/from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/, (m2, q, raw) => {
      const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m2;
    });
    fs.writeFileSync(path.join(TMP, outFile), body);
    return import('file:///' + path.join(TMP, outFile).replace(/\\/g, '/'));
  };

  const env = {};
  const ctx = { waitUntil() {}, passThroughFunction() {} };

  for (const [tag, src, out] of [['_worker.obf.js', OBF, 'obf.mjs'], ['worker.js', SRC, 'src.mjs']]) {
    console.log('== ' + tag + ' ==');
    let mod;
    try { mod = await load(src, out); } catch (e) { ok(false, 'بارگذاریِ ماژول', e.message); continue; }
    const handler = mod.default || mod;
    ok(typeof handler.fetch === 'function', 'handler.fetch موجود است');

    let res, html = '';
    try {
      res = await handler.fetch(new Request('https://panel.example.com/status/admin'), env, ctx);
      html = await res.text();
    } catch (e) { ok(false, 'ساختِ صفحه‌ی کاربر', e.message); continue; }
    ok(res.status === 200 && html.length > 5000, 'صفحه‌ی کاربر ساخته شد', res.status + ' • ' + html.length + ' بایت');

    /* ── ۲) placeholderها ── */
    const leftovers = (html.match(/__[A-Z0-9_]+__/g) || []);
    ok(leftovers.length === 0, 'هیچ placeholder جایگزین‌نشده‌ای نمانده', leftovers.slice(0, 4).join(','));

    /* ── ۳) تنظیماتِ اسکنر تزریق شده و پارس می‌شود ── */
    const mm = html.match(/JSON\.parse\("((?:[^"\\]|\\.)*ipCount(?:[^"\\]|\\.)*)"\)/);
    ok(!!mm, 'فراخوانِ JSON.parse در صفحه هست');
    let cfg = null;
    if (mm) { try { cfg = JSON.parse(JSON.parse('"' + mm[1] + '"')); } catch (e) { ok(false, 'پارسِ تنظیماتِ اسکنر', e.message); } }
    if (cfg) {
      ok(cfg.ipCount === 2048, 'ipCount = ۲۰۴۸', cfg.ipCount);
      ok(cfg.mode === 'even', 'حالت پیش‌فرض even', cfg.mode);
      ok(cfg.concurrency > 0 && cfg.timeout > 0 && cfg.probes >= 1, 'هم‌روندی/تایم‌اوت/پروب معتبر', cfg.concurrency + '/' + cfg.timeout + '/' + cfg.probes);
      ok(cfg.minRtt === 0, 'فیلترِ تأخیر خاموش است (minRtt=0)', cfg.minRtt);
    }

    /* ── ۴) موتورِ اسکنر در صفحه هست ── */
    ok(html.includes('CF_CIDRS') && html.includes('buildIpList'), 'موتورِ اسکنر در صفحه هست');
    const cidrs = html.match(/'1[0-9.]+\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+'/g) || [];
    ok(cidrs.length >= 15, 'تمامِ ۱۵ رنج رسمی در صفحه هست', cidrs.length + ' رنج');
    ok(!/'104\.0\.0\.0\/8'/.test(html), 'رنجِ غلطِ قبلی (104.0.0.0/8) حذف شده');

    /* ── ۴ب) پروبِ Image و فالبکِ پورت (دو باگِ «اسکنر کار نمی‌کند») ──
       پروبِ fetch به آی‌پیِ خام روی شبکه‌ی ایران نتیجه‌ی ناپایدار می‌دهد؛
       مرجعِ اثبات‌شده (پنل نوا) Image است. و اگر فهرستِ پورت خالی بماند،
       اسکن بی‌صدا رد می‌شود — پس باید همیشه ۴۴۳ فالبک شود. */
    ok(html.includes('new Image()'), 'پروبِ اسکنر Image است (نه fetch)');
    ok(!/fetch\('https:\/\/' \+ host/.test(html), 'پروبِ fetchِ آی‌پیِ خام حذف شده');
    ok(/if \(!ports\.length\) ports\.push\(443\)/.test(html), 'فالبکِ پورت به ۴۴۳ در موتور هست');
    ok(html.includes('concurrency: 16'), 'هم‌روندیِ پیش‌فرض ۱۶ است (نه ۶۴)');
    ok(html.includes('timeout: 2000'), 'تایم‌اوتِ پیش‌فرض ۲۰۰۰ms است (نه ۱۰۰۰)');
    ok(/results\.length < RADAR_KEEP\) results\.push/.test(html), 'نتایج از سقفِ نگه‌داری بیشتر نمی‌شوند');

    /* ── ۵) اسکریپتِ درون‌خطی معتبر است ── */
    const scripts = html.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || [];
    let bad = 0;
    scripts.forEach((s) => {
      const body = s.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
      try { acorn.parse(body, { ecmaVersion: 'latest' }); } catch (e) { bad++; console.log('      خطای اسکریپت: ' + e.message); }
    });
    ok(scripts.length > 0 && bad === 0, 'اسکریپت‌های درون‌خطی معتبرند', scripts.length + ' بلوک');

    /* ── ۶) ذخیره‌ی رادار ── */
    const idm = html.match(/\/sub\/([A-Za-z0-9_-]{6,})/);
    if (!idm) { ok(false, 'شناسه‌ی کاربر در صفحه پیدا شد'); continue; }
    const uid = idm[1];
    const saveRes = await handler.fetch(new Request('https://panel.example.com/sub/' + uid + '/radar-ips', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ips: ['104.16.1.1', '172.64.1.2', 'bogus'] }),
    }), env, ctx);
    const sj = await saveRes.json().catch(() => ({}));
    ok(saveRes.status === 200 && sj.ok === true, 'POST /radar-ips ذخیره کرد', JSON.stringify(sj));

    /* بعد از ذخیره، آی‌پی‌ها باید در سابِ همان کاربر ظاهر شوند */
    const subRes = await handler.fetch(new Request('https://panel.example.com/sub/' + uid + '?format=raw'), env, ctx);
    const subTxt = await subRes.text();
    ok(subTxt.includes('104.16.1.1'), 'آی‌پیِ تازه در سابِ کاربر اعمال شد');
    ok(!subTxt.includes('bogus'), 'آی‌پیِ نامعتبر رد شد');
    console.log('');
  }

  /* ── سناریوی فالبک: گیت‌هاب در دسترس نیست → تمپلیتِ داخلیِ USER_PAGE ──
     این مسیر قبلاً با دو regexِ کم‌escape‌شده کلِ اسکریپتِ صفحه را می‌شکست
     (replace(/\/$/, '') داخل تمپلیت → replace(//$, '') → SyntaxError). */
  console.log('== USER_PAGE (فالبکِ داخلی — گیت‌هاب در دسترس نیست) ==');
  globalThis.fetch = async () => new Response('offline', { status: 404 });
  let modF;
  try { modF = await load(SRC, 'src_fallback.mjs'); } catch (e) { ok(false, 'بارگذاریِ ماژولِ فالبک', e.message); }
  if (modF) {
    const hF = modF.default || modF;
    let htmlF = '';
    try { htmlF = await (await hF.fetch(new Request('https://panel.example.com/status/admin'), env, ctx)).text(); }
    catch (e) { ok(false, 'ساختِ صفحه‌ی فالبک', e.message); }
    if (htmlF) {
      ok(htmlF.includes('id="radar-card"'), 'کارتِ رادار در فالبک هست');
      ok(htmlF.includes('CF_CIDRS') && htmlF.includes('buildIpList'), 'موتورِ اسکنر در فالبک هست');
      ok(htmlF.includes('new Image()'), 'پروبِ Image در فالبکِ داخلی هست');
      ok(/if \(!ports\.length\) ports\.push\(443\)/.test(htmlF), 'فالبکِ پورت به ۴۴۳ در فالبکِ داخلی هست');
      ok((htmlF.match(/'1[0-9.]+\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+'/g) || []).length >= 15, 'تمامِ ۱۵ رنج رسمی در فالبک هست');
      const sc = htmlF.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/i);
      let badF = 0;
      if (sc) {
        const bodyF = sc[0].replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
        try { acorn.parse(bodyF, { ecmaVersion: 'latest' }); } catch (e) { badF++; console.log('      خطای اسکریپت: ' + e.message); }
      }
      ok(sc && badF === 0, 'اسکریپتِ فالبک معتبر است (باگِ regexِ کم‌escape رفع شد)');
      ok((htmlF.match(/__[A-Z0-9_]+__/g) || []).length === 0, 'placeholderهای فالبک هم جایگزین شدند');
    }
  }

  /* ── سناریوی دومِ فالبک: فقط ui/user.html در دسترس است ── */
  console.log('== ui/user.html (فالبکِ دوم) ==');
  const realFetch = async (url) => {
    const u = String(url);
    if (u.includes('new-subscription.html')) return new Response('gone', { status: 404 });
    const m = u.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/([^?#]+)/);
    if (m) {
      const f = path.join(ROOT, decodeURIComponent(m[1]));
      if (fs.existsSync(f)) return new Response(fs.readFileSync(f, 'utf8'), { status: 200 });
    }
    return new Response('offline', { status: 404 });
  };
  globalThis.fetch = realFetch;
  let modU;
  try { modU = await load(SRC, 'src_user.mjs'); } catch (e) { ok(false, 'بارگذاریِ ماژول', e.message); }
  if (modU) {
    const hU = modU.default || modU;
    let htmlU = '';
    try { htmlU = await (await hU.fetch(new Request('https://panel.example.com/status/admin'), env, ctx)).text(); }
    catch (e) { ok(false, 'ساختِ صفحه', e.message); }
    if (htmlU) {
      ok(htmlU.includes('id="radar-card"') && htmlU.includes('CF_CIDRS'), 'کارت و موتورِ اسکنر در ui/user.html هست');
      ok(htmlU.includes('new Image()'), 'پروبِ Image در ui/user.html هست');
      ok(/if \(!ports\.length\) ports\.push\(443\)/.test(htmlU), 'فالبکِ پورت به ۴۴۳ در ui/user.html هست');
      ok((htmlU.match(/'1[0-9.]+\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+'/g) || []).length >= 15, 'تمامِ ۱۵ رنج رسمی هست');
      const scU = htmlU.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/i);
      let badU = 0;
      if (scU) {
        try { acorn.parse(scU[0].replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, ''), { ecmaVersion: 'latest' }); }
        catch (e) { badU++; console.log('      خطای اسکریپت: ' + e.message); }
      }
      ok(scU && badU === 0, 'اسکریپتِ ui/user.html معتبر است');
    }
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fail ? fail + ' تست ناموفق ✗' : 'همه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})();
