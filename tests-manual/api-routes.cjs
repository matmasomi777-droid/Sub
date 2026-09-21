/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ سرتاسریِ API پنل — «آیا همه‌ی مسیرهای مستندشده واقعاً کار می‌کنند؟»
 *  ───────────────────────────────────────────────────────────────────────────
 *  چرا لازم بود:
 *    ۱) کلیدهای API ساخته می‌شدند و در پنل نمایش داده می‌شدند ولی هیچ‌جای
 *       کد بررسی نمی‌شدند؛ پس هر درخواست با `Bearer sk_...` همیشه ۴۰۱
 *       می‌گرفت — «کلیدِ API بی‌فایده است».
 *    ۲) /api/usage بدونِ احرازِ هویت باز بود و فقط فیلدهای blob را زیاد
 *       می‌کرد، در حالی که پنل از جدولِ usage می‌خواند — یعنی «ثبت شد» ولی
 *       هیچ‌جا دیده نمی‌شد.
 *    ۳) /api/state برای هر کاربر جداگانه سه پرس‌وجوی زنجیره‌ای به D1 می‌زد
 *       (N+1)؛ با چند ده کانفیگ از timeout مرورگر رد می‌شد.
 *
 *  این تست با یک D1 واقعی (SQLite در حافظه) ورکر را بالا می‌آورد و:
 *    • هر مسیر را با نشستِ ورود صدا می‌زند و کدِ وضعیت/بدنه را می‌سنجد
 *    • احرازِ هویت را برای هر مسیر نوشتنی بدون اعتبارنامه بررسی می‌کند (۴۰۱)
 *    • کلیدِ API (کامل و فقط‌خواندنی) را واقعاً در همه‌ی هدرها/پارامترها می‌سنجد
 *    • مرزِ «فقط با نشستِ پنل» (کلیدها، رمز، ریست، بازیابی) را بررسی می‌کند
 *    • شمارِ پرس‌وجوهای D1 در state را می‌شمارد تا باگِ N+1 برنگردد
 *
 *  اجرا:  node tests-manual/api-routes.cjs                        (worker.js)
 *         node tests-manual/api-routes.cjs _worker.obf.js        (همان فایلِ
 *         obfuscate‌شده‌ای که در داشبورد کلادفلر پیست می‌شود — چون در استقرارِ
 *         واقعی همین اجرا می‌شود، نه سورس. این حالت قبلاً باگ‌هایی را گرفته که
 *         فقط در بستهٔ obfuscate‌شده دیده می‌شدند.)
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.apiroutes-tmp');
/* مسیرِ سوژه از خطِ فرمان: worker.js (پیش‌فرض) یا _worker.obf.js */
const TARGET = process.argv[2] || 'worker.js';

let fail = 0, pass = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  \u2713 ' : '  \u2717 ') + label + (extra !== undefined && extra !== '' ? '  \u2192 ' + extra : ''));
  if (c) pass++; else fail++;
};
const section = (t) => console.log('\n== ' + t + ' ==');

/* ── محیطِ کلادفلر ── */
globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = {}; } };
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
globalThis.fetch = async () => new Response('offline', { status: 404 });
const ctx = { waitUntil() {}, passThroughFunction() {} };

/* ── D1 جعلی روی SQLiteِ واقعی + شمارنده‌ی پرس‌وجوها ── */
const dbStat = { prepares: 0, runs: 0, alls: 0 };
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const norm = (a) => (a === undefined ? null : a);
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a.map(norm)),
    run: async () => { dbStat.runs++; const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number((r && r.changes) || 0) } }; },
    all: async () => { dbStat.alls++; return { results: db.prepare(sql).all(...args) }; },
    first: async (col) => { dbStat.alls++; const row = db.prepare(sql).get(...args); if (row === undefined || row === null) return null; if (!col) return row; return row[col] === undefined ? null : row[col]; },
  });
  return {
    prepare: (sql) => { dbStat.prepares++; return mk(sql, []); },
    batch: async (ss) => { const o = []; for (const s of ss) o.push(await s.run()); return o; },
    exec: async (sql) => { db.exec(sql); return { count: 0 }; },
    __query: (sql, ...a) => db.prepare(sql).all(...a),
  };
}

const SOCKETS_STUB = `
export const connect = () => ({
  readable: new ReadableStream({ start() {} }),
  writable: new WritableStream({ write() {} }),
  opened: Promise.resolve(),
  closed: new Promise(() => {}),
  close() {},
  startTls() { return this; },
});
`;
function prepareDir(srcText) {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const body = srcText.replace(/from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/, (m, q, raw) => {
    const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m;
  });
  fs.writeFileSync(path.join(TMP, 'w.mjs'), body);
  fs.writeFileSync(path.join(TMP, 'sockets.mjs'), SOCKETS_STUB);
  fs.writeFileSync(path.join(TMP, 'package.json'), '{ "type": "module" }\n');
  return 'file:///' + path.join(TMP, 'w.mjs').replace(/\\/g, '/');
}

const DB = makeD1();
const env = { DB };                       // بایندینگِ D1 → backendOf = 'd1'
const PW = 'simorgh';                     // رمزِ پیش‌فرضِ ورکر

(async () => {
  const srcPath = path.join(ROOT, TARGET);
  if (!fs.existsSync(srcPath)) { console.error('FATAL: ' + TARGET + ' پیدا نشد — اول npm run build'); process.exit(1); }
  console.log('سوژهٔ تست: ' + TARGET);
  const mod = await import(prepareDir(fs.readFileSync(srcPath, 'utf8')));
  const handler = mod.default;

  const call = async (pathname, method = 'GET', body = null, headers = {}) => {
    const req = new Request('https://panel.test' + pathname, {
      method,
      headers: Object.assign({ 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, headers),
      body: body === null || body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await handler.fetch(req, env, ctx);
    let j = null;
    try { j = await res.clone().json(); } catch (e) { j = null; }
    return { status: res.status, j };
  };
  const bearer = (t) => ({ authorization: 'Bearer ' + t });
  /* مسیرهای نوشتنی که باید بدونِ اعتبارنامه ۴۰۱ بدهند */
  const WRITES = [
    ['/api/settings', 'PUT', { settings: { tls: true } }],
    ['/api/users', 'POST', { name: 'x' }],
    ['/api/usage', 'POST', { uuid: 'x', up: 1 }],
    ['/api/upd/cfcheck', 'POST', { token: 'x' }],
    ['/api/exits', 'POST', { op: 'add', link: 'vless://u@e.com:443' }],
    ['/api/exits/default', 'POST', { mode: 'direct' }],
    ['/api/exits/test', 'POST', {}],
    ['/api/password', 'POST', { current: PW, newPassword: 'abcdef' }],
    ['/api/proxyips/test', 'POST', {}],
    ['/api/restore', 'POST', { data: {} }],
    ['/api/keys', 'POST', {}],
    ['/api/keys?id=none', 'DELETE', null],
    ['/api/panels', 'POST', { name: 'n', url: 'u' }],
    ['/api/panels?id=none', 'DELETE', null],
    ['/api/action', 'POST', { act: 'logs-clear' }],
  ];

  section('۱) مسیرهای عمومی و ردِ درخواست‌های بدونِ اعتبارنامه');
  {
    const h1 = await call('/health');
    ok(h1.status === 200 && h1.j && h1.j.ok === true, 'GET /health آزاد است', 'status=' + h1.status);
    const h2 = await call('/api/health');
    ok(h2.status === 200 && h2.j && h2.j.ok === true, 'GET /api/health همان است', 'storage=' + (h2.j && h2.j.storage));
    const s0 = await call('/api/state');
    ok(s0.status === 401, 'GET /api/state بدونِ توکن → ۴۰۱', 'status=' + s0.status);
    const s1 = await call('/api/state', 'GET', null, bearer('sk_deadbeef'));
    ok(s1.status === 401, 'کلیدِ API نامعتبر → ۴۰۱', 'status=' + s1.status);
    const s2 = await call('/api/state', 'GET', null, bearer('not.a.token'));
    ok(s2.status === 401, 'توکنِ بی‌معنا → ۴۰۱', 'status=' + s2.status);
    for (const [p, m, b] of WRITES) {
      const r = await call(p, m, b);
      ok(r.status === 401, 'بدونِ اعتبارنامه ' + m + ' ' + p + ' → ۴۰۱', 'status=' + r.status);
    }
    const l1 = await call('/api/login', 'POST', { password: 'wrong-password' });
    ok(l1.status === 401, 'ورود با رمزِ نادرست → ۴۰۱', 'status=' + l1.status);
    const nf = await call('/api/nope');
    ok(nf.status === 404 && nf.j && Array.isArray(nf.j.routes), 'مسیرِ ناشناخته → ۴۰۴ با فهرستِ مسیرها');
    const routes = (nf.j && nf.j.routes) || [];
    const wanted = ['/api/login', '/api/health', '/api/state', '/api/settings', '/api/users', '/api/keys', '/api/panels',
      '/api/action', '/api/connections', '/api/password', '/api/backup', '/api/restore', '/api/usage',
      '/api/exits', '/api/exits/test', '/api/exits/default', '/api/proxyips/test', '/api/upd/cfcheck', '/api/upd/tokenurl'];
    const missing = wanted.filter((w) => !routes.includes(w));
    ok(missing.length === 0, 'همه‌ی مسیرهای مستندشده در فهرستِ روتر هستند', missing.length ? 'کم: ' + missing.join(', ') : routes.length + ' مسیر');
  }

  section('۲) ورود و گردشِ کاملِ API با نشستِ پنل');
  let token = '';
  {
    const l = await call('/api/login', 'POST', { password: PW });
    token = (l.j && l.j.token) || '';
    ok(l.status === 200 && token.includes('.'), 'ورود با رمزِ درست → توکن', 'idleMin=' + (l.j && l.j.idleMin));
  }

  /* ── state ── */
  {
    const s = await call('/api/state', 'GET', null, bearer(token));
    ok(s.status === 200 && s.j && Array.isArray(s.j.users), 'GET /api/state');
    ok(!!(s.j && s.j.settings && s.j.settings.auth && s.j.settings.auth.password === undefined), 'رمزِ مدیر در state لو نمی‌رود');
    ok(!!(s.j && Array.isArray(s.j.keys)), 'state فهرستِ کلیدها را دارد');
  }

  /* ── settings ── */
  {
    const r = await call('/api/settings', 'PUT', { settings: { panel: { name: 'تست API' } } }, bearer(token));
    ok(r.status === 200 && r.j.ok === true, 'PUT /api/settings', 'storage=' + (r.j && r.j.storage));
    const s = await call('/api/state', 'GET', null, bearer(token));
    ok(s.j.settings.panel.name === 'تست API', 'تنظیمات واقعاً ذخیره شد');
  }

  /* ── users ── */
  let uuid = '', uid = '';
  {
    const c = await call('/api/users', 'POST', { name: 'کاربر تست' }, bearer(token));
    uuid = (c.j && c.j.user && c.j.user.uuid) || '';
    uid = (c.j && c.j.user && c.j.user.id) || '';
    ok(c.status === 201 && uuid && (c.j.subscription || '').includes(uuid), 'POST /api/users (ساخت)', 'uuid=' + uuid.slice(0, 8) + '…');
    const up = await call('/api/users', 'POST', { id: uid, op: 'update', patch: { name: 'تست۲', quotaMB: 2048 } }, bearer(token));
    const u2 = (up.j.users || []).find((x) => x.id === uid);
    ok(up.status === 200 && u2 && u2.name === 'تست۲' && u2.quotaMB === 2048, 'POST /api/users op=update (نام و سهمیه)');
    const tg = await call('/api/users', 'POST', { id: uid, op: 'toggle' }, bearer(token));
    const u3 = (tg.j.users || []).find((x) => x.id === uid);
    ok(tg.status === 200 && u3 && u3.enabled === false, 'POST /api/users op=toggle (غیرفعال شد)');
    await call('/api/users', 'POST', { id: uid, op: 'toggle' }, bearer(token));
    const rs = await call('/api/users', 'POST', { id: uid, op: 'reset' }, bearer(token));
    ok(rs.status === 200 && rs.j.ok === true, 'POST /api/users op=reset');
    const bad = await call('/api/users', 'POST', { id: 'nope', op: 'delete' }, bearer(token));
    ok(bad.status === 404, 'کاربرِ ناموجود → ۴۰۴', 'status=' + bad.status);
  }

  /* ── usage: باید در همان جدولی بنشیند که پنل می‌خواند ── */
  {
    const r = await call('/api/usage', 'POST', { uuid, up: 1024, down: 2048 }, bearer(token));
    ok(r.status === 200 && r.j.ok === true && r.j.recorded !== false, 'POST /api/usage (ثبت در جدولِ usage)', 'recorded=' + (r.j && r.j.recorded));
    const s = await call('/api/state', 'GET', null, bearer(token));
    const u = (s.j.users || []).find((x) => x.uuid === uuid);
    ok(!!u && u.up === 1024 && u.down === 2048, 'مصرفِ ثبت‌شده در state دیده می‌شود (قبلاً هیچ‌جا دیده نمی‌شد)', u ? 'up=' + u.up + ' down=' + u.down : 'کاربر پیدا نشد');
    const neg = await call('/api/usage', 'POST', { uuid, up: -999999 }, bearer(token));
    ok(neg.status === 400, 'مقدارِ منفی رد می‌شود (قبلاً سهمیه را بی‌اثر می‌کرد)', 'status=' + neg.status);
    const nc = await call('/api/usage', 'POST', { uuid: '11111111-2222-3333-4444-555555555555', up: 1 }, bearer(token));
    ok(nc.status === 404, 'uuidِ ناشناخته → ۴۰۴', 'status=' + nc.status);
  }

  /* ── connections ── */
  {
    const r = await call('/api/connections', 'GET', null, bearer(token));
    ok(r.status === 200 && r.j && Array.isArray(r.j.sessions), 'GET /api/connections', 'sessions=' + ((r.j && r.j.sessions) || []).length);
  }

  /* ── panels ── */
  {
    const a = await call('/api/panels', 'GET', null, bearer(token));
    ok(a.status === 200 && Array.isArray(a.j.panels), 'GET /api/panels');
    const c = await call('/api/panels', 'POST', { name: 'پنل دوم', url: 'https://two.workers.dev' }, bearer(token));
    const pid = ((c.j.panels || [])[0] || {}).id || '';
    ok(c.status === 200 && pid, 'POST /api/panels (لینک‌کردن)');
    const sy = await call('/api/panels', 'POST', { id: pid, op: 'sync' }, bearer(token));
    ok(sy.status === 200 && ((sy.j.panels || [])[0] || {}).lastSync > 0, 'POST /api/panels op=sync');
    const d = await call('/api/panels?id=' + pid, 'DELETE', null, bearer(token));
    ok(d.status === 200 && (d.j.panels || []).length === 0, 'DELETE /api/panels');
  }

  section('۳) کلیدهای API — ساخت با نشست، استفادهٔ واقعی، مرزِ فقط‌خواندنی');
  let fullKey = '', roKey = '', roId = '', fullId = '';
  {
    const c1 = await call('/api/keys', 'POST', { name: 'کلید کامل' }, bearer(token));
    fullKey = (c1.j && c1.j.key && c1.j.key.key) || '';
    fullId = (c1.j && c1.j.key && c1.j.key.id) || '';
    ok(c1.status === 201 && /^sk_/.test(fullKey), 'POST /api/keys → کلیدِ sk_…', fullKey.slice(0, 10) + '…');
    ok(c1.j.key.ro === false, 'پیش‌فرضِ کلید = دسترسیِ کامل (قبلاً زوج/فرد تصادفی بود)');
    ok(!!(c1.j.usage && c1.j.usage.header), 'پاسخ نمونهٔ استفاده را برمی‌گرداند', (c1.j.usage || {}).example);

    const c2 = await call('/api/keys', 'POST', { name: 'کلید مانیتور', ro: true }, bearer(token));
    roKey = (c2.j && c2.j.key && c2.j.key.key) || '';
    roId = (c2.j && c2.j.key && c2.j.key.id) || '';
    ok(c2.status === 201 && c2.j.key.ro === true, 'POST /api/keys با ro=true → فقط‌خواندنی');

    /* ── همین‌جا باگِ اصلی: کلید تا امروز هیچ‌جا بررسی نمی‌شد ── */
    const s = await call('/api/state', 'GET', null, bearer(fullKey));
    ok(s.status === 200 && s.j && Array.isArray(s.j.users), '🚨 کلیدِ API در /api/state کار می‌کند (قبلاً ۴۰۱)');
    const sx = await call('/api/state', 'GET', null, { 'x-api-key': fullKey });
    ok(sx.status === 200, 'هدرِ x-api-key هم پذیرفته می‌شود');
    const sq = await call('/api/state?key=' + encodeURIComponent(fullKey));
    ok(sq.status === 200, 'پارامترِ ?key= هم پذیرفته می‌شود');
    const conns = await call('/api/connections', 'GET', null, bearer(fullKey));
    ok(conns.status === 200, 'کلیدِ کامل: GET /api/connections');

    const w = await call('/api/settings', 'PUT', { settings: { sub: { path: 'sub2' } } }, bearer(fullKey));
    ok(w.status === 200, 'کلیدِ کامل: نوشتنِ تنظیمات مجاز است');
    const ew = await call('/api/exits', 'POST', { op: 'add', link: 'vless://11111111-1111-4111-8111-111111111111@exit.example.com:443?encryption=none&security=tls&type=ws&path=%2F#Exit' }, bearer(fullKey));
    const exitId = (ew.j && ew.j.server && ew.j.server.id) || '';
    ok(ew.status === 201 && exitId, 'کلیدِ کامل: افزودنِ سرورِ خروجی', 'id=' + exitId);

    const roRead = await call('/api/state', 'GET', null, bearer(roKey));
    ok(roRead.status === 200, 'کلیدِ فقط‌خواندنی: خواندن مجاز است');
    const roWrite = await call('/api/settings', 'PUT', { settings: { tls: false } }, bearer(roKey));
    ok(roWrite.status === 403 && roWrite.j.readOnly === true, 'کلیدِ فقط‌خواندنی: نوشتن → ۴۰۳ (نه ۴۰۱)', 'status=' + roWrite.status);
    const roUsage = await call('/api/usage', 'POST', { uuid, up: 5 }, bearer(roKey));
    ok(roUsage.status === 403, 'کلیدِ فقط‌خواندنی: /api/usage → ۴۰۳');
    const roExit = await call('/api/exits', 'POST', { op: 'master', enabled: false }, bearer(roKey));
    ok(roExit.status === 403, 'کلیدِ فقط‌خواندنی: تغییرِ مسیرِ خروجی → ۴۰۳');

    /* مسیرهای حساس باید نشست بخواهند، نه کلید */
    const kc = await call('/api/keys', 'POST', {}, bearer(fullKey));
    ok(kc.status === 403 && kc.j.sessionOnly === true, 'کلیدِ API نمی‌تواند کلیدِ تازه بسازد (۴۰۳)', 'status=' + kc.status);
    const pd = await call('/api/password', 'POST', { current: PW, newPassword: 'abcdef' }, bearer(fullKey));
    ok(pd.status === 403, 'کلیدِ API نمی‌تواند رمزِ مدیر را عوض کند (۴۰۳)');
    const fa = await call('/api/action', 'POST', { act: 'factory' }, bearer(fullKey));
    ok(fa.status === 403, 'کلیدِ API نمی‌تواند ریستِ کارخانه‌ای بزند (۴۰۳)');

    /* آخرین استفاده — تا پنل بتواند نشان دهد کلید واقعاً کار می‌کند */
    const st = await call('/api/state', 'GET', null, bearer(token));
    const krec = (st.j.keys || []).find((k) => k.id === fullId);
    ok(!!krec && Number(krec.lastUsedAt) > 0, 'lastUsedAt کلید بعد از استفاده ثبت می‌شود', krec ? new Date(krec.lastUsedAt).toISOString() : '—');

    /* تغییرِ دسترسیِ همان کلید (بدونِ ساختِ کلیدِ تازه) */
    const sw1 = await call('/api/keys', 'POST', { id: fullId, ro: true }, bearer(token));
    ok(sw1.status === 200 && sw1.j.ro === true, 'POST /api/keys {id, ro:true} → دسترسیِ کلید عوض می‌شود');
    const wNow = await call('/api/settings', 'PUT', { settings: { tls: true } }, bearer(fullKey));
    ok(wNow.status === 403, 'کلیدِ فقط‌خواندنی‌شده دیگر نمی‌نویسد', 'status=' + wNow.status);
    const stillReads = await call('/api/state', 'GET', null, bearer(fullKey));
    ok(stillReads.status === 200, 'و همان کلید همچنان می‌خواند (مقدارِ کلید عوض نشد)');
    const sw2 = await call('/api/keys', 'POST', { id: fullId, ro: false }, bearer(token));
    ok(sw2.status === 200 && sw2.j.ro === false, 'برگرداندن به دسترسیِ کامل');
    const wBack = await call('/api/settings', 'PUT', { settings: { tls: true } }, bearer(fullKey));
    ok(wBack.status === 200, 'همان کلید دوباره می‌نویسد');
    const sw404 = await call('/api/keys', 'POST', { id: 'nope', ro: true }, bearer(token));
    ok(sw404.status === 404, 'تغییرِ دسترسیِ شناسهٔ ناموجود → ۴۰۴', 'status=' + sw404.status);

    /* باطل‌شدن کلید: حذف ⇒ بلافاصله ۴۰۱ */
    const del = await call('/api/keys?id=' + roId, 'DELETE', null, bearer(token));
    ok(del.status === 200 && del.j.removed === 1, 'DELETE /api/keys');
    const after = await call('/api/state', 'GET', null, bearer(roKey));
    ok(after.status === 401, 'کلیدِ حذف‌شده بلافاصله بی‌اعتبار می‌شود', 'status=' + after.status);
    const del404 = await call('/api/keys?id=nope', 'DELETE', null, bearer(token));
    ok(del404.status === 404, 'حذفِ شناسهٔ ناموجود → ۴۰۴', 'status=' + del404.status);
  }

  section('۴) سرورهای خروجی، پشتیبان، بازیابی و اقدام‌ها');
  {
    const g = await call('/api/exits', 'GET', null, bearer(token));
    ok(g.status === 200 && Array.isArray(g.j.servers), 'GET /api/exits', 'servers=' + (g.j.servers || []).length);
    const id = ((g.j.servers || [])[0] || {}).id || '';
    const t = await call('/api/exits', 'POST', { op: 'toggle', id, enabled: false }, bearer(token));
    ok(t.status === 200 && t.j.enabled === false, 'POST /api/exits op=toggle');
    await call('/api/exits', 'POST', { op: 'toggle', id, enabled: true }, bearer(token));
    const st1 = await call('/api/exits', 'POST', { op: 'strict', enabled: true }, bearer(token));
    ok(st1.status === 200 && st1.j.strict === true, 'POST /api/exits op=strict');
    const iw = await call('/api/exits', 'POST', { op: 'ipwrap', id, ipWrap: 'auto' }, bearer(token));
    ok(iw.status === 200 && iw.j.ok === true, 'POST /api/exits op=ipwrap');
    const sel = await call('/api/exits', 'POST', { op: 'select', uuid, mode: 'exit', exitId: id }, bearer(token));
    ok(sel.status === 200 && sel.j.effective && sel.j.effective.id === id, 'POST /api/exits op=select (بستنِ کانفیگ به سرور)');
    const dem = await call('/api/exits/default', 'POST', { mode: 'exit', exitId: id }, bearer(token));
    ok(dem.status === 200 && dem.j.defaultExit === id, 'POST /api/exits/default (پیش‌فرضِ سراسری)');
    const all = await call('/api/exits', 'POST', { op: 'select-all', mode: 'inherit' }, bearer(token));
    ok(all.status === 200 && all.j.ok === true, 'POST /api/exits op=select-all');
    const mst = await call('/api/exits', 'POST', { op: 'master', enabled: true, }, bearer(token));
    ok(mst.status === 200 && mst.j.ok === true, 'POST /api/exits op=master');
    const badLink = await call('/api/exits', 'POST', { op: 'add', link: 'http://not-vless' }, bearer(token));
    ok(badLink.status === 400, 'لینکِ نامعتبر سرورِ خروجی → ۴۰۰', 'status=' + badLink.status);
    const t404 = await call('/api/exits/test', 'POST', { id: 'nope' }, bearer(token));
    ok(t404.status === 404, 'GET /api/exits/test با شناسهٔ ناموجود → ۴۰۴ (مسیر سیم‌کشی شده)', 'status=' + t404.status);
    const noPx = await call('/api/proxyips/test', 'POST', {}, bearer(token));
    ok(noPx.status === 200 && Array.isArray(noPx.j.results) && noPx.j.total === noPx.j.results.length,
      'POST /api/proxyips/test واقعاً هر Proxy IP را می‌سنجد (آفلاین ⇒ timeout طبیعی است)',
      (noPx.j && noPx.j.total) + ' مورد • در دسترس: ' + (noPx.j && noPx.j.reachable));
    const del = await call('/api/exits', 'POST', { op: 'delete', id }, bearer(token));
    ok(del.status === 200 && (del.j.servers || []).length === 0, 'POST /api/exits op=delete');

    const bk = await call('/api/backup', 'GET', null, bearer(token));
    ok(bk.status === 200 && bk.j.data && Array.isArray(bk.j.data.users), 'GET /api/backup', 'users=' + (bk.j.data.users || []).length);
    const rs = await call('/api/restore', 'POST', { data: bk.j.data, mode: 'merge' }, bearer(token));
    ok(rs.status === 200 && rs.j.ok === true, 'POST /api/restore (ادغام)');
    const rsBad = await call('/api/restore', 'POST', { data: { settings: { nope: 1 } }, mode: 'merge' }, bearer(token));
    ok(rsBad.status === 400 && Array.isArray(rsBad.j.errors), 'پشتیبانِ نامعتبر رد می‌شود و چیزی نمی‌نویسد', 'errors=' + ((rsBad.j && rsBad.j.errors) || []).join(' • '));

    const tu = await call('/api/upd/tokenurl', 'GET', null, bearer(token));
    ok(tu.status === 200 && /^https:\/\//.test(tu.j.url || ''), 'GET /api/upd/tokenurl', (tu.j || {}).url);
    const cf = await call('/api/upd/cfcheck', 'POST', { token: 'x' }, bearer(token));
    ok(cf.status === 200 && cf.j && (cf.j.msg !== undefined || cf.j.error !== undefined), 'POST /api/upd/cfcheck پاسخِ روشن می‌دهد (آفلاین → نامعتبر)');

    const rp = await call('/api/action', 'POST', { act: 'rotate-path' }, bearer(token));
    ok(rp.status === 200 && (rp.j.path || '').length > 0, 'POST /api/action act=rotate-path');
    const pn = await call('/api/action', 'POST', { act: 'panic' }, bearer(token));
    ok(pn.status === 200 && pn.j.panic === true, 'act=panic (روشن)');
    await call('/api/action', 'POST', { act: 'panic' }, bearer(token));
    const dc = await call('/api/action', 'POST', { act: 'decoy-test' }, bearer(token));
    ok(dc.status === 200 && dc.j.ok === true, 'act=decoy-test', 'mode=' + dc.j.mode);
    const dh = await call('/api/action', 'POST', { act: 'domain-health' }, bearer(token));
    ok(dh.status === 200 && Array.isArray(dh.j.checks) && dh.j.checks.length >= 3, 'act=domain-health', 'checks=' + (dh.j.checks || []).length);
    const uh = await call('/api/action', 'POST', { act: 'usage-health' }, bearer(token));
    const uhChecks = (uh.j && uh.j.checks) || [];
    const dbChecks = uhChecks.filter((c) => /جدول مصرف|sessions/.test(c.name));
    const badChecks = uhChecks.filter((c) => !c.ok).map((c) => c.name);
    ok(uh.status === 200 && uh.j.storage === 'd1' && dbChecks.length >= 2 && dbChecks.every((c) => c.ok),
      'act=usage-health: جدول‌های D1 روی نصبِ تازه هم خوانده می‌شوند (قبلاً ❝no such table❞ می‌داد)',
      badChecks.length
        ? dbChecks.length + ' جدول ✓ • هشدارهای عمدی: ' + badChecks.join(' | ')
        : 'همه‌ی ' + uhChecks.length + ' بررسی سبز');
    const uk = await call('/api/action', 'POST', { act: 'no-such-action' }, bearer(token));
    ok(uk.status === 400, 'اقدامِ ناشناخته → ۴۰۰', 'status=' + uk.status);
    const lc = await call('/api/action', 'POST', { act: 'logs-clear' }, bearer(token));
    ok(lc.status === 200 && lc.j.ok === true, 'act=logs-clear');
  }

  section('۵) بارِ D1 در /api/state — نگهبانِ باگِ N+1');
  {
    /* ۲۵ کاربر تازه تا مسیرِ حلقه واقعاً کشیده شود */
    for (let i = 0; i < 25; i++) await call('/api/users', 'POST', { name: 'load-' + i }, bearer(token));
    const before = dbStat.prepares + dbStat.alls;
    const s = await call('/api/state', 'GET', null, bearer(token));
    const used = (dbStat.prepares + dbStat.alls) - before;
    ok(s.status === 200 && (s.j.users || []).length >= 26, 'state با ' + (s.j.users || []).length + ' کاربر پاسخ می‌دهد');
    ok(used <= 15, 'state برای ' + s.j.users.length + ' کاربر حداکثر ۱۵ پرس‌وجوی D1 می‌زند', 'پرس‌وجو=' + used + ' (روشِ قدیمی: حداقل ' + (s.j.users.length * 3) + ')');
  }

  section('۶) تغییرِ رمز (فقط با نشست) و ریستِ کارخانه‌ای');
  {
    const bad = await call('/api/password', 'POST', { current: 'wrong', newPassword: 'newpass1' }, bearer(token));
    ok(bad.status === 403, 'رمزِ فعلیِ نادرست → ۴۰۳', 'status=' + bad.status);
    const sh = await call('/api/password', 'POST', { current: PW, newPassword: 'abc' }, bearer(token));
    ok(sh.status === 400, 'رمزِ کوتاه → ۴۰۰', 'status=' + sh.status);
    const ch = await call('/api/password', 'POST', { current: PW, newPassword: 'newpass1' }, bearer(token));
    ok(ch.status === 200 && ch.j.relogin === true, 'تغییرِ رمز موفق', ch.j && ch.j.msg);
    const oldTok = await call('/api/state', 'GET', null, bearer(token));
    ok(oldTok.status === 401, 'توکنِ قبلی بعد از تغییرِ رمز بی‌اعتبار می‌شود');
    const nl = await call('/api/login', 'POST', { password: 'newpass1' });
    const tok2 = (nl.j && nl.j.token) || '';
    ok(nl.status === 200 && tok2, 'ورود با رمزِ تازه');
    const back = await call('/api/password', 'POST', { current: 'newpass1', newPassword: PW }, bearer(tok2));
    ok(back.status === 200, 'رمز به حالتِ اول برگشت');
    const tok3 = ((await call('/api/login', 'POST', { password: PW })).j || {}).token || '';
    ok(!!tok3, 'ورود دوباره با رمزِ اصلی');
    const f = await call('/api/action', 'POST', { act: 'factory' }, bearer(tok3));
    ok(f.status === 200 && f.j.ok === true, 'act=factory با نشستِ پنل');
    const stAfter = await call('/api/state', 'GET', null, bearer(tok3));
    ok(stAfter.status === 200, 'پنل بعد از ریستِ کارخانه‌ای بالا می‌آید');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     بخشِ ۷ — لاگِ دقیقِ API
     ───────────────────────────────────────────────────────────────────────
     چرا: تا امروز لاگِ پنل فقط رویدادهای «دستی» را داشت؛ درخواستِ بدونِ
     اعتبارنامه، کلیدِ نامعتبر، کلیدِ فقط‌خواندنی که نوشتن خواسته، مسیرِ
     ناشناخته و اقدامِ ناشناخته هیچ‌جا نمی‌نشستند و ادمین نمی‌توانست بفهمد
     «چه کسی، از کجا، با کدام اعتبارنامه چه چیزی صدا زد و چه گرفت».
     این بخش همان چیزها را می‌سنجد — و این‌که هیچ اعتبارنامه‌ای داخلِ لاگ نمی‌نشیند.
     ═══════════════════════════════════════════════════════════════════════ */
  section('۷) لاگِ دقیقِ API — چه کسی، از کجا، با کدام اعتبارنامه، و چه گرفت');
  {
    const tok = ((await call('/api/login', 'POST', { password: PW })).j || {}).token || '';
    ok(!!tok, 'ورودِ تازه برای بخشِ لاگ');
    const readState = async () => ((await call('/api/state', 'GET', null, bearer(tok))).j) || {};

    /* ۱) درخواستِ بدونِ اعتبارنامه — قبلاً کاملاً بی‌صدا بود */
    const anon = await call('/api/settings', 'PUT', { settings: { tls: true } });
    ok(anon.status === 401, 'نوشتنِ بدونِ اعتبارنامه → ۴۰۱', 'status=' + anon.status);

    /* ۲) کلیدِ نامعتبر و مسیرِ ناشناخته */
    const badKey = await call('/api/state', 'GET', null, bearer('sk_deadbeef'));
    ok(badKey.status === 401, 'کلیدِ نامعتبر → ۴۰۱', 'status=' + badKey.status);
    const nf = await call('/api/nope-route');
    ok(nf.status === 404, 'مسیرِ ناشناخته → ۴۰۴', 'status=' + nf.status);

    /* ۳) کلیدِ فقط‌خواندنی که نوشتن خواسته */
    const roCreate = await call('/api/keys', 'POST', { name: 'لاگ‌رو', ro: true }, bearer(tok));
    const roKey2 = (((roCreate.j || {}).key) || {}).key || '';
    const roWrite = await call('/api/settings', 'PUT', { settings: { tls: true } }, bearer(roKey2));
    ok(roWrite.status === 403 && !!roKey2, 'کلیدِ فقط‌خواندنی: نوشتن → ۴۰۳', 'status=' + roWrite.status);

    /* ۴) کلیدِ کامل: سه پرس‌وجوی یکسان → باید یک رکورد با شمارنده باشد */
    const fullCreate = await call('/api/keys', 'POST', { name: 'لاگ‌بات' }, bearer(tok));
    const fk = (((fullCreate.j || {}).key) || {}).key || '';
    ok(/^sk_/.test(fk), 'کلیدِ کامل برای سنجشِ لاگِ بات', fk.slice(0, 10) + '…');
    for (let i = 0; i < 3; i++) await call('/api/state', 'GET', null, bearer(fk));

    /* ۵) اقدامِ ناشناخته */
    const uk = await call('/api/action', 'POST', { act: 'zzz-unknown' }, bearer(tok));
    ok(uk.status === 400, 'اقدامِ ناشناخته → ۴۰۰', 'status=' + uk.status);

    const d = await readState();
    const logs = d.logs || [], apiLog = d.apiLog || [], apiStats = d.apiStats || {};
    const find = (list, f) => list.filter(f)[0] || null;
    ok(apiLog.length > 0, 'apiLog در /api/state برمی‌گردد', 'رکورد=' + apiLog.length);

    const badRows = apiLog.filter((e) => !e || !e.ip || !e.m || !e.p || !e.st || typeof e.ms !== 'number' || !e.who);
    ok(badRows.length === 0, 'هر رکوردِ apiLog آی‌پی + روش + مسیر + کد + زمانِ پاسخ + اعتبارنامه دارد',
      badRows.length ? JSON.stringify(badRows[0]) : apiLog.length + ' رکوردِ کامل');

    const a = find(apiLog, (e) => e.p === '/api/settings' && e.m === 'PUT' && e.st === 401);
    ok(!!a && a.who === 'anon' && a.ip === '203.0.113.7', 'ردِ درخواستِ بی‌اعتبارنامه با آی‌پی و برچسبِ anon', a ? 'who=' + a.who + ' ip=' + a.ip : 'ثبت نشده');

    const bk = find(apiLog, (e) => e.who === 'bad-key');
    ok(!!bk && bk.st === 401, 'کلیدِ نامعتبر با برچسبِ bad-key ثبت می‌شود', bk ? bk.m + ' ' + bk.p : 'ثبت نشده');

    const rf = find(apiLog, (e) => e.p === '/api/nope-route' && e.st === 404);
    ok(!!rf, 'مسیرِ ناشناخته در apiLog ثبت شده', rf ? rf.m + ' ' + rf.p : 'ثبت نشده');

    const ro = find(apiLog, (e) => /^key:ro:/.test(e.who || ''));
    ok(!!ro && ro.st === 403, 'کلیدِ فقط‌خواندنی با برچسبِ key:ro:… ثبت می‌شود', ro ? ro.who : 'ثبت نشده');

    const pol = apiLog.filter((e) => e.p === '/api/state' && /^key:/.test(e.who || ''));
    ok(pol.length === 1 && (pol[0].n || 0) >= 3, 'سه پرس‌وجوی یکسان با کلید = یک رکورد با شمارنده (×n)',
      pol.length ? 'رکورد=' + pol.length + ' n=' + pol[0].n : 'رکوردی نیست');
    ok(!apiLog.some((e) => e.p === '/api/state' && e.who === 'session'), 'pollِ موفقِ نشست، رینگِ apiLog را پر نمی‌کند');
    ok(!!(apiStats['GET /api/state'] || {}).n, 'شمارندهٔ هر مسیر در apiStats هست',
      apiStats['GET /api/state'] ? 'GET /api/state: n=' + apiStats['GET /api/state'].n + ' ok=' + apiStats['GET /api/state'].ok : '—');
    ok(((apiStats['PUT /api/settings'] || {}).err || 0) >= 1, 'خطاها در شمارندهٔ همان مسیر هم می‌نشینند',
      apiStats['PUT /api/settings'] ? 'err=' + apiStats['PUT /api/settings'].err : '—');

    /* ۶) لاگِ فعالیت: ردیف‌های امنیتی با بافتِ کامل */
    const denied = find(logs, (l) => l.actor === 'api' && l.status === 401 && l.path === '/api/settings');
    ok(!!denied && denied.ip === '203.0.113.7' && denied.path === '/api/settings',
      'ردِ درخواستِ بی‌اعتبارنامه در لاگِ فعالیت با آی‌پی + مسیر',
      denied ? denied.method + ' ' + denied.path + ' • ' + denied.ip : 'ثبت نشده');
    const unk = find(logs, (l) => l.actor === 'api' && l.status === 404);
    ok(!!unk, 'مسیرِ ناشناخته در لاگِ فعالیت هم هست', unk ? unk.detail : 'ثبت نشده');
    const act400 = find(logs, (l) => l.actor === 'api' && /ناشناخته/.test(l.action || ''));
    ok(!!act400 && /zzz-unknown/.test(act400.detail || ''), 'اقدامِ ناشناخته با نامِ خودش ثبت شده', act400 ? act400.detail : 'ثبت نشده');
    const keyLog = find(logs, (l) => /کلید API ساخته شد/.test(l.action || ''));
    ok(!!keyLog && keyLog.path === '/api/keys' && keyLog.who === 'session' && !!keyLog.ip,
      'هر رویدادِ نوشتنی بافتِ درخواست (مسیر + اعتبارنامه + آی‌پی) دارد',
      keyLog ? keyLog.method + ' ' + keyLog.path + ' • ' + keyLog.who + ' • ' + keyLog.ip : 'ثبت نشده');

    /* ۷) هیچ اعتبارنامه‌ای داخلِ لاگ نمی‌نشیند (?key=/?token= نباید لاگ شوند) */
    await call('/api/state?key=' + encodeURIComponent(fk));
    await call('/api/state?token=' + encodeURIComponent(tok));
    const d2 = await readState();
    const dump = JSON.stringify({ logs: d2.logs, apiLog: d2.apiLog, apiStats: d2.apiStats });
    ok(!dump.includes(fk) && !dump.includes('sk_') && !dump.includes('key=') && !dump.includes('token='),
      'هیچ کلید/توکن/query داخلِ لاگ‌ها نیست', 'طولِ dump=' + dump.length);

    /* ۸) پاک‌کردنِ لاگ خودش را ثبت می‌کند و apiLog را پاک نمی‌کند */
    const before = (d2.apiLog || []).length;
    const lc = await call('/api/action', 'POST', { act: 'logs-clear' }, bearer(tok));
    const d3 = await readState();
    ok(lc.status === 200 && (d3.logs || []).length === 1 && /پاک شد/.test(((d3.logs[0] || {}).action) || ''),
      'لاگِ فعالیت پاک شد ولی یک ردیفِ توضیحی باقی می‌ماند', ((d3.logs[0] || {}).action) || '—');
    ok((d3.apiLog || []).length >= before && before > 0, 'apiLog بعد از پاک‌کردنِ لاگِ فعالیت باقی می‌ماند', before + ' → ' + (d3.apiLog || []).length);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\n' + (fail ? 'FAILED: ' + fail + ' از ' + (pass + fail) : 'ALL ' + pass + ' API TESTS PASSED (' + TARGET + ')'));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL: ' + ((e && e.stack) || e));
  process.exit(1);
});
