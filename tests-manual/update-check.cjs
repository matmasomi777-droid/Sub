/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ به‌روزرسانی خودکار (همین ریپو)
 *  ───────────────────────────────────────────────────────────────────────────
 *  ۱) مهاجرت: نصب‌های قدیمی با upd.repo برابرِ placeholder به همین ریپو برمی‌گردند
 *  ۲) update-check با release تازه → newer=true
 *  ۳) بدونِ release، جدیدترین کامیت با BUILD مقایسه می‌شود (commit جدیدتر → newer)
 *  ۴) قطعیِ گیت‌هاب → پاسخِ ملایم (نه throw)، و نتیجه در state.updateInfo می‌نشیند
 *  ۵) version.json تازه (rev متفاوت) → newer؛ همان rev → «به‌روز» بدونِ اعلانِ کاذب
 *  ۶) بدونِ rev: سریالِ بیلد ملاکِ تازه‌بودن است
 *  ۷) توکنِ گیت‌هاب در هدرِ Authorization می‌رود و در پنل (state) ماسک می‌شود
 *  ۸) update-verify: استقرارِ آزمایشی — بدونِ آپلود، با حفظِ بایندینگ‌ها
 *  ۹) update-deploy: آپلودِ واقعی؛ بدونِ اعتبارنامه یا با خطای خواندنِ تنظیمات → آپلود نمی‌شود
 * ۱۰) update-rollback: انتشارِ کامیتِ پیشینِ version.json
 * ۱۱) سازگاریِ version.json با محتوای فعلی (هر تغییرِ کد → rev تازه)
 *
 *  هر سناریو ماژولِ تازه (UPD_CACHE جدا) و D1 جدا می‌گیرد تا کشِ ۱۰ دقیقه‌ای
 *  نتیجه‌ها را قاطی نکند. fetch گیت‌هاب جعلی است؛ بقیه واقعی.
 *
 *  اجرا:  node tests-manual/update-check.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'worker.js');
const TMP = path.join(ROOT, '.updcheck-tmp');

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : ''));
  if (!c) fail++;
};

function makeD1() {
  const db = new DatabaseSync(':memory:');
  const norm = (a) => (a === undefined ? null : a);
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a.map(norm)),
    run: async () => { db.prepare(sql).run(...args); return { success: true, meta: {} }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async (col) => {
      const row = db.prepare(sql).get(...args);
      if (row == null) return null;
      if (!col) return row;
      return row[col] === undefined ? null : row[col];
    },
  });
  return {
    prepare: (sql) => mk(sql, []),
    batch: async (s) => { const o = []; for (const x of s) o.push(await x.run()); return o; },
  };
}

function prepareDir(tag, srcText) {
  const dir = path.join(TMP, tag);
  fs.mkdirSync(dir, { recursive: true });
  const body = srcText.replace(/from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/, (m, q, raw) => {
    const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m;
  });
  fs.writeFileSync(path.join(dir, 'w.mjs'), body);
  fs.writeFileSync(path.join(dir, 'sockets.mjs'), 'export const connect = () => { throw new Error("x"); };\n');
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  return 'file:///' + path.join(dir, 'w.mjs').replace(/\\/g, '/');
}

globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = {}; } };
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

/* fetch جعلی — گیت‌هاب، raw و API کلاودفلر؛ حالتِ هرکدام از بیرون تزریق می‌شود */
let ghMode = 'none';   /* release | commit | none */
let rawMode = 'none';  /* ok → version.json و بستهٔ کد از raw سرو می‌شوند */
let cfMode = 'ok';     /* ok | fail — خواندنِ تنظیماتِ اسکریپت از API کلاودفلر */
let verJson = null;    /* بدنهٔ version.json جعلی */
let rollList = null;   /* پاسخِ commits?path=version.json (برای بازگشت) */
let uploads = 0;       /* تعدادِ PUT به کلاودفلر */
let putMeta = null;    /* متادیتای آپلود (برای راستی‌آزماییِ حفظِ بایندینگ‌ها) */
let rawUrls = [];      /* آدرس‌های raw دیده‌شده */
let rawHdrs = [];      /* هدرهای درخواست‌های raw (برای آزمونِ توکن) */
const OBF_BUNDLE = '/* fake bundle */\n' + 'x'.repeat(3000);
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const hdrs = (init && init.headers) || {};
  if (u.includes('raw.githubusercontent.com')) {
    rawUrls.push(u);
    rawHdrs.push({ url: u, headers: hdrs });
    if (rawMode !== 'ok') return new Response('offline', { status: 404 });
    if (u.includes('version.json')) return new Response(JSON.stringify(verJson || {}), { status: 200 });
    return new Response(OBF_BUNDLE, { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  if (u.includes('api.github.com') && u.includes('commits?path=version.json')) {
    return new Response(JSON.stringify(rollList || []), { status: 200 });
  }
  if (u.includes('api.github.com')) {
    if (ghMode === 'release' && u.includes('/releases/latest')) {
      return new Response(JSON.stringify({ tag_name: 'v9.9.9', name: 'big' }), { status: 200 });
    }
    if (ghMode === 'commit' && u.includes('/commits/main')) {
      return new Response(JSON.stringify({ sha: 'abc1234567890abcdef', commit: { author: { date: '2999-01-01T00:00:00Z' }, message: 'future fix' } }), { status: 200 });
    }
    return new Response('x', { status: 404 });
  }
  if (u.includes('api.cloudflare.com')) {
    if (cfMode === 'fail') return new Response(JSON.stringify({ success: false, errors: [{ message: 'forbidden' }] }), { status: 403 });
    if (init && String(init.method || '').toUpperCase() === 'PUT') {
      uploads++;
      try { putMeta = JSON.parse(await init.body.get('metadata').text()); } catch (e) { putMeta = null; }
      return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true, result: {
      bindings: [{ type: 'd1', name: 'DB' }, { type: 'durable_object_namespace', name: 'LIMITER' }],
      compatibility_date: '2026-01-01',
    } }), { status: 200 });
  }
  return new Response('offline', { status: 404 });
};

const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughFunction() {} };
const jreq = (url, method, body, token) => new Request(url, {
  method,
  headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
  body: body ? JSON.stringify(body) : undefined,
});

async function freshHandler(tag) {
  const mod = await import(prepareDir(tag, fs.readFileSync(SRC, 'utf8')));
  const h = mod.default || mod;
  const env = { DB: makeD1() };
  const login = await h.fetch(jreq('https://p.test/api/login', 'POST', { password: 'simorgh' }), env, ctx);
  const { token } = await login.json().catch(() => ({}));
  if (!token) throw new Error('login failed');
  return { h, env };
}
const act = (h, env, token, a) => h.fetch(jreq('https://p.test/api/action', 'POST', { act: a }, token), env, ctx)
  .then((r) => r.json());

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log('== ۱) مهاجرتِ مخزنِ قدیمی به همین ریپو ==');
  {
    const { h, env } = await freshHandler('migrate');
    const login = await h.fetch(jreq('https://p.test/api/login', 'POST', { password: 'simorgh' }), env, ctx);
    const { token } = await login.json();
    await h.fetch(jreq('https://p.test/api/settings', 'PUT', { settings: { upd: { repo: 'user/simorgh' } } }, token), env, ctx);
    const st = await (await h.fetch(jreq('https://p.test/api/state', 'GET', null, token), env, ctx)).json();
    ok(st.settings.upd.repo === 'matmasomi777-droid/Sub', 'placeholder به همین ریپو مهاجرت کرد', st.settings.upd.repo);
    ok(st.settings.upd.auto === true, 'auto پیش‌فرض روشن است');
    ok(st.settings.upd.interval === 60, 'interval معتبر ماند', String(st.settings.upd.interval));
  }

  console.log('== ۲) release تازه → newer ==');
  {
    ghMode = 'release';
    const { h, env } = await freshHandler('release');
    const login = await h.fetch(jreq('https://p.test/api/login', 'POST', { password: 'simorgh' }), env, ctx);
    const { token } = await login.json();
    const r = await act(h, env, token, 'update-check');
    ok(r.source === 'release' && r.latest === 'v9.9.9' && r.newer === true, 'release تازه گزارش شد', r.latest);
  }

  console.log('== ۳) بدونِ release: کامیت در برابرِ BUILD ==');
  {
    ghMode = 'commit';
    const { h, env } = await freshHandler('commit');
    const login = await h.fetch(jreq('https://p.test/api/login', 'POST', { password: 'simorgh' }), env, ctx);
    const { token } = await login.json();
    const r = await act(h, env, token, 'update-check');
    ok(r.source === 'commit' && r.newer === true, 'کامیتِ آینده‌دار تازه‌تر دیده شد', r.latest);
    const st = await (await h.fetch(jreq('https://p.test/api/state', 'GET', null, token), env, ctx)).json();
    ok(st.updateInfo && st.updateInfo.newer === true && st.updateInfo.source === 'commit', 'نتیجه در state.updateInfo نشست');
  }

  console.log('== ۴) قطعیِ گیت‌هاب → ملایم، بدونِ throw ==');
  {
    ghMode = 'none';
    const { h, env } = await freshHandler('offline');
    const login = await h.fetch(jreq('https://p.test/api/login', 'POST', { password: 'simorgh' }), env, ctx);
    const { token } = await login.json();
    const r = await act(h, env, token, 'update-check');
    ok(r.source === 'none' && r.newer === false && !r.latest, 'پاسخِ ملایمِ «نامشخص»', r.msg);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  /* ── ابزارِ مشترکِ بخش‌های ۵ به بعد ── */
  const tokOf = async (h, env) => (await (await h.fetch(jreq('https://p.test/api/login', 'POST', { password: 'simorgh' }), env, ctx)).json()).token;
  const putSettings = (h, env, token, settings) => h.fetch(jreq('https://p.test/api/settings', 'PUT', { settings }, token), env, ctx);
  const SRC_TEXT = fs.readFileSync(SRC, 'utf8');
  const VER_MINE = (SRC_TEXT.match(/const VERSION = '([^']*)';/) || [, ''])[1];
  const REV_MINE = (SRC_TEXT.match(/const BUILD_REV = '([^']*)';/) || [, ''])[1];
  const SERIAL_MINE = Number(String(VER_MINE).split('.')[2] || '') || 0;
  const CREDS = { cfToken: 'cf_secret', cfAccount: 'acct123', script: 'sub-panel' };
  const freshVer = (o) => Object.assign({
    version: '9.9.9', serial: 99, rev: 'f'.repeat(64), build: '2099.01.01-00:00',
    at: '2099-01-01T00:00:00Z', sha: 'abc1234', note: 'بیلدِ آزمون',
  }, o || {});

  console.log('== ۵) version.json تازه (rev متفاوت) → newer ==');
  {
    ghMode = 'none'; rawMode = 'ok'; verJson = freshVer();
    const { h, env } = await freshHandler('ver-new');
    const token = await tokOf(h, env);
    const r = await act(h, env, token, 'update-check');
    ok(r.source === 'version.json' && r.newer === true && r.latest === 'v9.9.9', 'version.json تازه گزارش شد', r.source + ' • ' + r.latest);
    const st = await (await h.fetch(jreq('https://p.test/api/state', 'GET', null, token), env, ctx)).json();
    ok(!!(st.updateInfo && st.updateInfo.newer === true && st.updateInfo.source === 'version.json' && st.updateInfo.rev === 'f'.repeat(64)), 'نتیجه (rev/source) در state.updateInfo نشست');
  }

  console.log('== ۶) همان rev → «به‌روز» (اعلانِ کاذب نمی‌آید) ==');
  {
    ghMode = 'none'; rawMode = 'ok';
    verJson = freshVer({ version: VER_MINE || '3.0.1', serial: SERIAL_MINE || 1, rev: REV_MINE, build: '2000.01.01-00:00' });
    const { h, env } = await freshHandler('ver-same');
    const token = await tokOf(h, env);
    const r = await act(h, env, token, 'update-check');
    ok(r.source === 'version.json' && r.newer === false, 'rev یکسان → not-newer', String(r.latest));
    ok(/آخرین نسخه/.test(String(r.msg)), 'پیامِ «در آخرین نسخه هستید»', String(r.msg).slice(0, 60));
  }

  console.log('== ۷) بدونِ rev: مقایسهٔ سریالِ بیلد ==');
  if (!SERIAL_MINE) {
    console.log('  ↷ skip — VERSION سریال ندارد (پیش از نخستین npm run build)');
  } else {
    ghMode = 'none'; rawMode = 'ok';
    verJson = freshVer({ version: '3.0.' + (SERIAL_MINE + 3), serial: SERIAL_MINE + 3, rev: '', build: '2000.01.01-00:00' });
    {
      const { h, env } = await freshHandler('ser-new');
      const token = await tokOf(h, env);
      const r = await act(h, env, token, 'update-check');
      ok(r.newer === true, 'سریالِ بزرگ‌تر → تازه', 'serial ' + (SERIAL_MINE + 3) + ' > ' + SERIAL_MINE);
    }
    verJson = freshVer({ version: VER_MINE, serial: SERIAL_MINE, rev: '', build: '2000.01.01-00:00' });
    {
      const { h, env } = await freshHandler('ser-same');
      const token = await tokOf(h, env);
      const r = await act(h, env, token, 'update-check');
      ok(r.newer === false, 'سریالِ برابر → به‌روز', 'serial ' + SERIAL_MINE);
    }
  }

  console.log('== ۸) توکنِ گیت‌هاب: هدرِ Authorization + ماسکِ پنل ==');
  {
    ghMode = 'none'; rawMode = 'ok'; verJson = freshVer();
    const { h, env } = await freshHandler('token');
    const token = await tokOf(h, env);
    await putSettings(h, env, token, { upd: { token: 'ghp_secret123' } });
    const st = await (await h.fetch(jreq('https://p.test/api/state', 'GET', null, token), env, ctx)).json();
    ok(st.settings.upd.token === '•••••', 'توکن در state ماسک می‌شود', st.settings.upd.token);
    rawHdrs = [];
    await act(h, env, token, 'update-check');
    const last = rawHdrs.filter((x) => x.url.includes('version.json')).pop() || { headers: {} };
    ok(String(last.headers.authorization || '') === 'Bearer ghp_secret123', 'توکنِ ذخیره‌شده در هدرِ raw فرستاده شد', String(last.headers.authorization || '—'));
    /* ⚠️ PUT با مقدارِ ماسک نباید توکنِ واقعی را پاک کند (وگرنه ریپوی خصوصی می‌شکند) */
    await putSettings(h, env, token, { upd: { token: '•••••' } });
    rawHdrs = [];
    await act(h, env, token, 'update-check');
    ok(rawHdrs.some((x) => String(x.headers.authorization) === 'Bearer ghp_secret123'), 'ماسک، توکنِ ذخیره‌شده را پاک نکرد');
  }

  console.log('== ۹) update-verify — حالتِ آزمایشی، بدونِ آپلود ==');
  {
    ghMode = 'none'; rawMode = 'ok'; cfMode = 'ok'; verJson = freshVer(); uploads = 0; putMeta = null; rawUrls = [];
    const { h, env } = await freshHandler('verify');
    const token = await tokOf(h, env);
    await putSettings(h, env, token, { upd: CREDS });
    const r = await act(h, env, token, 'update-verify');
    ok(r.ok === true, 'verify موفق', String(r.msg).slice(0, 60));
    ok(r.steps.some((x) => x.step === 'حالتِ آزمایشی'), 'گامِ «حالتِ آزمایشی» هست');
    ok(uploads === 0, 'هیچ آپلودی انجام نشد (dry-run)', 'uploads=' + uploads);
    const bs = r.steps.find((x) => x.step === 'خواندنِ تنظیمات');
    ok(!!(bs && bs.ok && /بایندینگ/.test(bs.note)), 'بایندینگ‌های موجود حفظ می‌شوند', bs ? bs.note : '—');
  }

  console.log('== ۱۰) update-deploy — آپلودِ واقعی با حفظِ بایندینگ‌ها ==');
  {
    ghMode = 'none'; rawMode = 'ok'; cfMode = 'ok'; verJson = freshVer(); uploads = 0; putMeta = null; rawUrls = [];
    const { h, env } = await freshHandler('deploy');
    const token = await tokOf(h, env);
    await putSettings(h, env, token, { upd: CREDS });
    const r = await act(h, env, token, 'update-deploy');
    ok(r.ok === true && uploads === 1, 'استقرار انجام شد', 'uploads=' + uploads);
    ok(rawUrls.some((u) => u.includes('_worker.obf.js')), 'بستهٔ کد (_worker.obf.js) از مخزن خوانده شد');
    ok(!!(putMeta && Array.isArray(putMeta.bindings) && putMeta.bindings.length === 2), 'بایندینگ‌ها همراهِ آپلود فرستاده شدند', putMeta ? putMeta.bindings.length + ' بایندینگ' : '—');
    ok(!!(putMeta && putMeta.main_module === 'worker.js'), 'ماژولِ اصلی درست اعلام شد', putMeta && putMeta.main_module);
    const st = await (await h.fetch(jreq('https://p.test/api/state', 'GET', null, token), env, ctx)).json();
    ok(!!(st.updateInfo && st.updateInfo.deployOk === true && st.updateInfo.deployedAt), 'نتیجهٔ استقرار در state نشست');
  }

  console.log('== ۱۱) استقرار بدونِ اعتبارنامه → توقف، بدونِ آپلود ==');
  {
    ghMode = 'none'; rawMode = 'ok'; cfMode = 'ok'; verJson = freshVer(); uploads = 0;
    const { h, env } = await freshHandler('nocreds');
    const token = await tokOf(h, env);
    const r = await act(h, env, token, 'update-deploy');
    ok(r.ok === false && uploads === 0, 'آپلود نشد', 'uploads=' + uploads);
    const bad = r.steps.find((x) => x.ok === false);
    ok(!!(bad && /cfToken/.test(bad.note)), 'پیامِ گویا دربارهٔ اعتبارنامه‌ها', bad ? bad.note.slice(0, 70) : '—');
  }

  console.log('== ۱۲) شکستِ خواندنِ تنظیماتِ کلاودفلر → آپلود متوقف می‌شود (بایندینگ‌ها نمی‌سوزند) ==');
  {
    ghMode = 'none'; rawMode = 'ok'; cfMode = 'fail'; verJson = freshVer(); uploads = 0;
    const { h, env } = await freshHandler('cffail');
    const token = await tokOf(h, env);
    await putSettings(h, env, token, { upd: CREDS });
    const r = await act(h, env, token, 'update-deploy');
    ok(r.ok === false && uploads === 0, 'هیچ آپلودی انجام نشد', 'uploads=' + uploads);
    const bad = r.steps.filter((x) => x.ok === false).pop();
    ok(!!(bad && /متوقف/.test(bad.note)), 'دلیلش صریح گفته می‌شود', bad ? bad.note.slice(0, 70) : '—');
  }

  console.log('== ۱۳) بازگشت (rollback) به کامیتِ قبلیِ version.json ==');
  {
    ghMode = 'none'; rawMode = 'ok'; cfMode = 'ok'; uploads = 0; rawUrls = [];
    verJson = freshVer({ sha: 'aaaaaaa1111' });
    rollList = [
      { sha: 'aaaaaaa1111', commit: { author: { date: '2026-09-20T00:00:00Z' } } },
      { sha: 'bbbbbbb2222', commit: { author: { date: '2026-09-19T00:00:00Z' } } },
    ];
    const { h, env } = await freshHandler('rollback');
    const token = await tokOf(h, env);
    await putSettings(h, env, token, { upd: CREDS });
    const r = await act(h, env, token, 'update-rollback');
    ok(r.ok === true && uploads === 1, 'بازگشت انجام شد', 'uploads=' + uploads);
    ok(rawUrls.some((u) => u.includes('bbbbbbb2222')), 'نسخهٔ قبلی (کامیتِ پیشینِ version.json) منتشر شد', rawUrls.filter((u) => u.includes('_worker.obf.js')).join(' ').slice(0, 80));
  }

  console.log('== ۱۴) سازگاریِ version.json با محتوا (هر تغییر → rev تازه) ==');
  {
    const vf = path.join(ROOT, 'version.json');
    if (!fs.existsSync(vf)) {
      console.log('  ↷ skip — version.json ساخته نشده (npm run build را بزنید)');
    } else {
      /* ⚠️ همان محاسبهٔ scripts/build-obfuscated.mjs — اگر کسی محتوا را عوض کند و
         بیلد نزند، نسخه در پنل تغییر نمی‌کند و این تست همان را لو می‌دهد. */
      const meta = JSON.parse(fs.readFileSync(vf, 'utf8'));
      const norm = (x) => x
        .replace(/const VERSION = '[^']*';/, "const VERSION = '';")
        .replace(/const BUILD = '[^']*';/, "const BUILD = '';")
        .replace(/const BUILD_REV = '[^']*';/, "const BUILD_REV = '';");
      const dir = (d, re) => { try { return fs.readdirSync(d).filter((f) => re.test(f)).map((f) => path.join(d, f)); } catch (e) { return []; } };
      const files = [SRC, ...dir(path.join(ROOT, 'ui'), /\.(js|html|css)$/), ...dir(ROOT, /\.html$/)].sort();
      const hh = createHash('sha256');
      for (const f of files) {
        let x = '';
        try { x = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
        hh.update(f === SRC ? norm(x) : x);
        hh.update('\u0000');
      }
      const fp = hh.digest('hex');
      ok(meta.rev === fp, 'rev مخزن = اثرِ انگشتِ محتوای فعلی (بیلد به‌روز است)', String(meta.rev).slice(0, 10) + ' / ' + fp.slice(0, 10));
      ok(meta.rev === REV_MINE, 'BUILD_REV ورکر با version.json یکی است');
      ok(String(meta.version) === VER_MINE, 'نسخهٔ worker.js با version.json یکی است', VER_MINE);
      ok(files.length >= 5, 'اثرِ انگشت روی worker.js + ui + htmlها حساب می‌شود', files.length + ' فایل');
    }
  }

  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
