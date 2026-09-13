/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ رگرسیونِ «سقفِ آی‌پی» (محدودیتِ تعداد نفرات/دستگاه برای هر کانفیگ)
 *  ───────────────────────────────────────────────────────────────────────────
 *  باگ‌هایی که این تست از آن‌ها محافظت می‌کند:
 *  ۱) پنجره‌ی زمانیِ ۳ ثانیه‌ای که «بی‌ترافیک» را با «مرده» یکی می‌گرفت:
 *     ردیفِ یک تونلِ باز ولی ساکت در پاک‌سازی حذف می‌شد، جایش به آی‌پیِ تازه
 *     داده می‌شد و سقف عملاً بی‌اثر می‌شد.
 *  ۲) رگرسیونِ «حذفِ wrangler»: کامیتِ 360e05c فایلِ wrangler.toml را پاک کرد
 *     و با آن بایندینگ‌های LIMITER (شیءِ ماندگار) و DB (D1) ناپدید شدند. از آن
 *     لحظه هر isolate حافظه‌ی خودش را می‌شمارد و سقف بی‌صدا اعمال نمی‌شود.
 *     بخشِ «ب» همین وضعیت را می‌سنجد: کارتِ سلامت باید صریحاً شکست بخورد و
 *     /health باید limitEnforced=false بدهد — نه سبزِ کاذب.
 *
 *  چطور کار می‌کند: ورکرِ واقعی (worker.js خام — همان موتورِ پنل) با یک D1
 *  واقعی (SQLite درون‌حافظه از node:sqlite) بالا می‌آورد و سناریوها را از
 *  مسیرِ رسمیِ خودِ پنل اجرا می‌کند: POST /api/login → POST /api/action
 *  با {act:"usage-health"}. هیچ بخشی از منطقِ محدودیت در تست بازنویسی نشده —
 *  همان کدی اجرا می‌شود که در استقرار واقعی اجرا می‌شود.
 *
 *  و برای اینکه تست خودش هم بی‌ارزش نباشد، در پایان همین سناریو روی نسخه‌ای
 *  با پنجره‌ی قدیمی (۳ ثانیه) اجرا می‌شود و انتظار داریم شکست بخورد.
 *
 *  اجرا:  node tests-manual/ip-limit.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'worker.js');
const TMP = path.join(ROOT, '.iplimit-tmp');

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  \u2713 ' : '  \u2717 ') + label + (extra ? '  \u2192 ' + extra : ''));
  if (!c) fail++;
};
/* نامِ چک‌ها نیم‌فاصله (ZWNJ) دارد؛ برای مقایسه نرمال می‌کنیم */
const strip = (s) => String(s || '').replace(/\u200c/g, '');

/* ── ۱) D1 جعلی روی یک SQLite واقعی ──
   فقط سطحِ API خودِ D1 شبیه‌سازی می‌شود (prepare/bind/run/all/first/batch)؛
   خودِ SQL را SQLite اجرا می‌کند، پس رفتارِ typeof/ON CONFLICT/GROUP BY
   دقیقاً همان چیزی است که در استقرار واقعی دیده می‌شود. */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const norm = (a) => (a === undefined ? null : a);
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a.map(norm)),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number((r && r.changes) || 0) } };
    },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async (col) => {
      const row = db.prepare(sql).get(...args);
      if (row === undefined || row === null) return null;
      if (!col) return row;
      return row[col] === undefined ? null : row[col];
    },
  });
  return {
    prepare: (sql) => mk(sql, []),
    batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    exec: async (sql) => { db.exec(sql); return { count: 0 }; },
    /* فقط برای تست: خواندنِ خامِ جدولِ اتصال‌ها */
    __rows: (sql, ...a) => db.prepare(sql).all(...a),
  };
}

/* ── ۲) KV جعلی ── */
function makeKV() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    list: async (o) => {
      const p = (o && o.prefix) || '';
      const keys = [...m.keys()].filter((k) => k.startsWith(p)).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
  };
}

/* ── ۳) بارگذاریِ ماژولِ واقعیِ ورکر ──
   مثل tests-manual/worker-e2e.cjs: import از 'cloudflare:sockets' به یک بدلِ
   محلی هدایت می‌شود و پوشه‌ی موقت type=module می‌گیرد. */
function prepareDir(tag, srcText) {
  const dir = path.join(TMP, tag);
  fs.mkdirSync(dir, { recursive: true });
  const body = srcText.replace(
    /from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/,
    (m, q, raw) => {
      const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m;
    }
  );
  fs.writeFileSync(path.join(dir, 'w.mjs'), body);
  fs.writeFileSync(path.join(dir, 'sockets.mjs'),
    'export const connect = () => { throw new Error("no sockets in test"); };\n');
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  return 'file:///' + path.join(dir, 'w.mjs').replace(/\\/g, '/');
}

/* ── ۴) محیطِ کلادفلر ── */
globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = {}; } };
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
globalThis.fetch = async () => new Response('offline', { status: 404 });

const ctx = { waitUntil() {}, passThroughFunction() {} };
const jreq = (url, method, body, token) => new Request(url, {
  method,
  headers: Object.assign({ 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    token ? { authorization: 'Bearer ' + token } : {}),
  body: body ? JSON.stringify(body) : undefined,
});

/** ورود به پنل و گرفتنِ نتیجه‌ی کارتِ سلامتِ محدودیت */
async function runHealth(mod, env) {
  const handler = mod.default || mod;
  const login = await handler.fetch(jreq('https://panel.test/api/login', 'POST', { password: 'simorgh' }), env, ctx);
  const lj = await login.json().catch(() => ({}));
  if (!lj.token) throw new Error('ورود ناموفق: ' + JSON.stringify(lj));
  const res = await handler.fetch(jreq('https://panel.test/api/action', 'POST', { act: 'usage-health' }, lj.token), env, ctx);
  return await res.json();
}

const pick = (out, needle) => (out.checks || []).find((c) => strip(c.name).includes(strip(needle)));

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  const srcText = fs.readFileSync(SRC, 'utf8');

  /* ═══ الف) استقرارِ واقعی: فقط D1 بایند است (رایج‌ترین حالت) ═══ */
  console.log('== A) استقرارِ D1 (جدولِ conns — مرجعِ سراسری) ==');
  const modA = await import(prepareDir('d1', srcText));
  const envA = { DB: makeD1(), KV: makeKV() };
  const outA = await runHealth(modA, envA);

  const c1 = pick(outA, 'سقف ۱ IP');
  const c2 = pick(outA, 'سقف ۲ IP');
  const cIdle = pick(outA, 'اتصالِ بازِ بی‌ترافیک');
  const cSrc = pick(outA, 'مرجعِ مشترکِ محدودیت');

  ok(!!c1 && c1.ok, 'سقف ۱ آی‌پی: اتصالِ دوم از همان آی‌پی مجاز، از آی‌پیِ دیگر رد', c1 && c1.note);
  ok(!!c2 && c2.ok, 'سقف ۲ آی‌پی: آی‌پیِ سوم رد، بعد از آزادسازی مجاز', c2 && c2.note);
  ok(!!cIdle, 'چکِ «اتصالِ بازِ بی‌ترافیک» در کارتِ سلامت وجود دارد');
  ok(!!cIdle && cIdle.ok, '\u2605 آی‌پیِ بی‌ترافیک اما باز، سهمیه‌اش را نگه می‌دارد', cIdle && cIdle.note);
  ok(!!cSrc && cSrc.ok, 'مرجعِ شمارش سراسری است (D1)', cSrc && cSrc.note);
  ok(outA.limiter === 'd1', 'کارتِ سلامت مرجع را d1 گزارش می‌کند', outA.limiter);

  /* ردیف‌های probe نباید در جدول جا بمانند */
  const left = envA.DB.__rows('SELECT uuid, ip FROM conns');
  ok(left.filter((r) => r.uuid === '__limit_probe__').length === 0,
    'هیچ ردیفِ probe‌ای در جدولِ اتصال‌ها جا نماند', left.length + ' ردیفِ باقی‌مانده');

  /* ═══ ب) استقرارِ بدونِ بایندینگ: فقط حافظهٔ همین isolate ═══
     ⚠️ این همان رگرسیونی است که کامیتِ 360e05c ساخت: با حذفِ wrangler.toml
     بایندینگ‌های LIMITER و DB ناپدید شدند و محدودیت بی‌صدا از کار افتاد.
     تست باید تضمین کند که این وضعیت «دیده می‌شود»، نه اینکه سبزِ کاذب بدهد. */
  console.log('\n== B) بدونِ D1/KV (فقط حافظهٔ isolate) ==');
  const modB = await import(prepareDir('mem', srcText));
  const outB = await runHealth(modB, {});
  const bIdle = pick(outB, 'اتصالِ بازِ بی‌ترافیک');
  const bShared = pick(outB, 'مرجعِ مشترکِ محدودیت');
  ok(!!bIdle && bIdle.ok, '\u2605 همان محافظت روی مسیرِ حافظه هم برقرار است', bIdle && bIdle.note);
  ok(outB.limiter === 'mem', 'کارتِ سلامت مرجع را mem گزارش می‌کند', outB.limiter);
  ok(strip(outB.limiterLabel || '').includes('حافظه'), 'مسیرِ حافظه درست تشخیص داده شد', outB.limiterLabel);
  /* ★ هسته‌ی این مرحله: کارت باید صریحاً «اعمال نمی‌شود» بگوید و شکست بخورد */
  ok(!!bShared && bShared.ok === false,
    '\u2605 چکِ «مرجعِ مشترکِ محدودیت» در استقرارِ بدونِ بایندینگ شکست می‌خورد (هشدارِ صریح، نه سبزِ کاذب)',
    bShared && bShared.note);
  ok(outB.ok === false, 'کلِ کارتِ سلامت ناموفق است تا کاربر متوجه شود', 'ok=' + outB.ok);
  ok(!!outB.diag && outB.diag.bound && !outB.diag.bound.DB && !outB.diag.bound.LIMITER && !outB.diag.bound.KV,
    'تشخیصِ بایندینگ‌ها هر سه را «بسته‌نشده» می‌گوید', JSON.stringify(outB.diag && outB.diag.bound));

  /* ═══ ب-۲) همان تشخیص از مسیرِ /health (بدونِ ورود) ═══
     کاربر باید بتواند فقط با یک curl بفهمد بایندینگ‌ها درست‌اند یا نه.
     ⚠️ هر دو شکلِ مسیر آزموده می‌شود: /api/health و /health — دومی همان
     چیزی است که README برای مانیتورینگ معرفی می‌کند و قبلاً ۴۰۴ می‌داد. */
  const handlerB = modB.default || modB;
  for (const hp of ['/api/health', '/health']) {
    const hres = await handlerB.fetch(new Request('https://panel.test' + hp), {}, ctx);
    ok(hres.status === 200, 'مسیرِ سلامت ' + hp + ' جواب می‌دهد (نه ۴۰۴)', 'HTTP ' + hres.status);
    const hj = await hres.json().catch(() => ({}));
    ok(hj.limiter === 'mem', hp + ' مرجع را mem گزارش می‌کند', hj.limiter);
    ok(hj.limitEnforced === false, '\u2605 ' + hp + ' صریحاً می‌گوید سقف اعمال نمی‌شود (limitEnforced=false)');
    ok(hj.db && hj.db.do === false && hj.db.bound === false, hp + ' بایندینگ‌ها را نشان می‌دهد', JSON.stringify(hj.db));
  }

  /* ═══ ج) اثباتِ ارزشِ تست: با پنجره‌ی باگ‌دارِ ۳ ثانیه باید شکست بخورد ═══ */
  console.log('\n== C) کنترل: نسخه‌ی باگ‌دار (CONN_TTL = ۳ ثانیه) ==');
  const buggy = srcText.replace('const CONN_TTL = 90000;', 'const CONN_TTL = 3000;');
  if (buggy === srcText) {
    ok(false, 'جایگزینیِ CONN_TTL برای ساختِ نسخه‌ی کنترل — ثابتِ کد پیدا نشد');
  } else {
    const modC = await import(prepareDir('buggy', buggy));
    const outC = await runHealth(modC, { DB: makeD1(), KV: makeKV() });
    const cIdleC = pick(outC, 'اتصالِ بازِ بی‌ترافیک');
    ok(!!cIdleC && cIdleC.ok === false,
      'با پنجره‌ی ۳ ثانیه‌ای، همین چک شکست می‌خورد (پس تست واقعاً باگ را می‌گیرد)', cIdleC && cIdleC.note);
  }

  /* ═══ د) یکسان‌سازیِ آی‌پی — پیش‌نیازِ درست‌شمردن ═══
     بدون این، یک دستگاه می‌تواند چند «آی‌پی» شمرده شود (و کلِ سقف را تنهایی
     پر کند) یا یک آی‌پی دو کلیدِ جدا بسازد. تابعِ خالصِ worker.js استخراج و
     مستقیم آزموده می‌شود. */
  console.log('\n== D) یکسان‌سازیِ آی‌پی (normIp) ==');
  const startM = srcText.indexOf('const IPV6_GROUP64 = true;');
  const endM = srcText.indexOf('/** IP واقعی کلاینت');
  if (startM < 0 || endM < startM) {
    ok(false, 'استخراجِ بلوکِ normIp از worker.js');
  } else {
    const slice = srcText.slice(startM, endM);
    const normIp = new Function(slice + '; return normIp;')();
    const eq = (input, want, label) => ok(normIp(input) === want, label, JSON.stringify(input) + ' → ' + normIp(input) + (normIp(input) === want ? '' : ' (انتظار: ' + want + ')'));
    eq('1.2.3.4', '1.2.3.4', 'IPv4 دست‌نخورده');
    eq('  1.2.3.4  ', '1.2.3.4', 'فاصله‌ی اضافی پاک می‌شود');
    eq('1.2.3.4:8080', '1.2.3.4', 'پورتِ چسبیده به IPv4 پاک می‌شود');
    eq('[2001:db8::1]', '2001:db8:0:0::/64', 'براکتِ IPv6 پاک و روی /64 گروه می‌شود');
    eq('2001:DB8::1', '2001:db8:0:0::/64', 'حروفِ بزرگ و کوچکِ IPv6 یکی است');
    eq('2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0::/64', 'شکلِ کاملِ IPv6 با شکلِ کوتاه یکی است');
    eq('fe80::1%eth0', 'fe80:0:0:0::/64', 'zone-id حذف می‌شود');
    eq('::ffff:1.2.3.4', '1.2.3.4', 'IPv4-mapped به IPv4 برمی‌گردد');
    ok(normIp('2001:db8::aaaa') === normIp('2001:db8::bbbb'),
      'دو آدرسِ موقتِ IPv6 در یک /64 = یک نقطه‌ی اتصال (معادلِ NAT)');
    ok(normIp('2001:db8:1::1') !== normIp('2001:db8:2::1'),
      'دو /64 متفاوت همچنان دو آی‌پیِ متفاوت‌اند');
  }

  /* ═══ ه) همان تشخیص روی باندلِ واقعیِ مستقرشده (_worker.obf.js) ═══
     ⚠️ این مهم‌ترین بخشِ این تست است: چیزی که کاربر واقعاً در داشبورد پیست
     می‌کند همین باندلِ obfuscate‌شده است، نه worker.js. اگر obfuscator دسترسیِ
     `env.LIMITER` / `env.DB` را خراب کند، محدودیت در استقرارِ واقعی از کار
     می‌افتد در حالی که تستِ سورس سبز است. پس باندل هم مستقیماً آزموده می‌شود.
     اگر باندل ساخته نشده باشد، این بخش با هشدار رد می‌شود (نه شکست). */
  console.log('\n== E) باندلِ واقعیِ مستقرشده (_worker.obf.js) ==');
  const obfPath = path.join(ROOT, '_worker.obf.js');
  if (!fs.existsSync(obfPath)) {
    console.log('  (باندل ساخته نشده — `npm run build` را بزنید؛ این بخش رد شد)');
  } else {
    const obfText = fs.readFileSync(obfPath, 'utf8');
    const modO = await import(prepareDir('obf', obfText));
    ok(typeof (modO.ConnLimiter) === 'function' || typeof (modO.ConnLimiter) === 'object',
      'export کلاسِ ConnLimiter در باندل دست‌نخورده مانده');
    /* با D1 بایند: باید دقیقاً مثل سورس رفتار کند */
    const outO = await runHealth(modO, { DB: makeD1(), KV: makeKV() });
    const oShared = pick(outO, 'مرجعِ مشترکِ محدودیت');
    const oIdle = pick(outO, 'اتصالِ بازِ بی‌ترافیک');
    ok(outO.limiter === 'd1', '\u2605 باندلِ obfuscate‌شده بایندینگِ DB را می‌بیند (محدودیت در استقرارِ واقعی فعال است)', outO.limiter);
    ok(!!oShared && oShared.ok, 'چکِ مرجعِ مشترک در باندل هم سبز است', oShared && oShared.note);
    ok(!!oIdle && oIdle.ok, 'محافظتِ اتصالِ بی‌ترافیک در باندل هم برقرار است', oIdle && oIdle.note);
    /* و بدون بایند: باید صریحاً هشدار بدهد */
    const outO2 = await runHealth(modO, {});
    ok(outO2.limiter === 'mem' && outO2.ok === false,
      '\u2605 باندل بدونِ بایندینگ هم هشدار می‌دهد (سکوتِ کاذب ندارد)', 'limiter=' + outO2.limiter + ' ok=' + outO2.ok);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fail ? '\n' + fail + ' تست ناموفق \u2717' : '\nهمه‌ی تست‌ها موفق \u2713');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
