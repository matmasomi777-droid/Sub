/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ به‌روزرسانی خودکار (همین ریپو)
 *  ───────────────────────────────────────────────────────────────────────────
 *  ۱) مهاجرت: نصب‌های قدیمی با upd.repo برابرِ placeholder به همین ریپو برمی‌گردند
 *  ۲) update-check با release تازه → newer=true
 *  ۳) بدونِ release، جدیدترین کامیت با BUILD مقایسه می‌شود (commit جدیدتر → newer)
 *  ۴) قطعیِ گیت‌هاب → پاسخِ ملایم (نه throw)، و نتیجه در state.updateInfo می‌نشیند
 *
 *  هر سناریو ماژولِ تازه (UPD_CACHE جدا) و D1 جدا می‌گیرد تا کشِ ۱۰ دقیقه‌ای
 *  نتیجه‌ها را قاطی نکند. fetch گیت‌هاب جعلی است؛ بقیه واقعی.
 *
 *  اجرا:  node tests-manual/update-check.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

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

/* fetch جعلیِ گیت‌هاب — حالت از بیرون تزریق می‌شود */
let ghMode = 'none';
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('api.github.com')) {
    if (ghMode === 'release' && u.includes('/releases/latest')) {
      return new Response(JSON.stringify({ tag_name: 'v9.9.9', name: 'big' }), { status: 200 });
    }
    if (ghMode === 'commit' && u.includes('/commits/main')) {
      return new Response(JSON.stringify({ sha: 'abc1234567890abcdef', commit: { author: { date: '2999-01-01T00:00:00Z' }, message: 'future fix' } }), { status: 200 });
    }
    return new Response('x', { status: 404 });
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
  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
