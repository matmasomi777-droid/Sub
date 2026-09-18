/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ مسیرِ واقعیِ تونل — «آیا سقفِ آی‌پی روی WebSocketِ واقعی اعمال می‌شود؟»
 *  ───────────────────────────────────────────────────────────────────────────
 *  چرا این تست جدا لازم بود: `ip-limit.cjs` تابعِ `connAcquire` و کارتِ سلامت
 *  را می‌سنجد، ولی *مسیرِ واقعیِ اتصال* را نه:
 *      درخواستِ ارتقای WebSocket → tunnelHandler → session() → dial()
 *        → clientIpOf(request) → connAcquire → ws.close(1013)
 *  اگر باگ در همین مسیر باشد (IP اشتباه خوانده شود، همهٔ کلاینت‌ها یک IP به نظر
 *  برسند، یا استثنا پیش از بررسی رخ دهد) تستِ قبلی سبز می‌ماند در حالی که در
 *  استقرارِ واقعی «هیچ بلاکی نمی‌شود». این تست همان مسیر را با یک
 *  WebSocketPairِ کارا و هندشیکِ معتبرِ VLESS اجرا می‌کند.
 *
 *  و بخشِ دوم دقیقاً همان باگی را می‌گیرد که مدتی پنهان بود: **D1 بایند است
 *  ولی کار نمی‌کند.** در آن حالت شمارش بی‌صدا به حافظهٔ همین isolate می‌افتد؛
 *  روی کلاودفلر دو دستگاه به دو isolate می‌افتند و سقف هرگز پر نمی‌شود.
 *  تست بررسی می‌کند که این وضعیت *گزارش* شود (نه سبزِ کاذب).
 *
 *  اجرا:  node tests-manual/tunnel-limit.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'worker.js');
const TMP = path.join(ROOT, '.tunnellimit-tmp');

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  \u2713 ' : '  \u2717 ') + label + (extra ? '  \u2192 ' + extra : ''));
  if (!c) fail++;
};
const strip = (s) => String(s || '').replace(/\u200c/g, '');

/* ── ۱) WebSocketPairِ کارا ──
   [0] = کلاینت (که در Response برگردانده می‌شود)، [1] = سرور (داخلِ ورکر).
   send روی هر طرف رویدادِ message طرفِ مقابل را صدا می‌زند تا بتوانیم هندشیک
   را تزریق کنیم؛ close قابلِ خواندن است تا کدِ ۱۰۱۳ را ببینیم. */
class FakeWS {
  constructor() { this._l = {}; this.closed = null; this._peer = null; }
  accept() {}
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  removeEventListener(t, fn) { const a = this._l[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  _emit(t, ev) { for (const fn of (this._l[t] || []).slice()) { try { fn(ev); } catch (e) {} } }
  send(d) { if (this._peer) this._peer._emit('message', { data: d }); }
  close(code, reason) {
    if (this.closed) return;
    this.closed = { code, reason: reason || '' };
    this._emit('close', { code, reason: reason || '' });
    if (this._peer && !this._peer.closed) {
      this._peer.closed = { code, reason: reason || '' };
      this._peer._emit('close', { code, reason: reason || '' });
    }
  }
}
globalThis.WebSocketPair = class {
  constructor() { const a = new FakeWS(), b = new FakeWS(); a._peer = b; b._peer = a; this[0] = a; this[1] = b; }
  /* ⚠️ ورکر با `const [client, server] = new WebSocketPair()` بازش می‌کند، پس
     این شیء باید iterable باشد. بدونِ Symbol.iterator، destructuring استثنا
     می‌دهد و مسیرِ تونل هرگز اجرا نمی‌شود (کلِ تست بی‌معنا می‌شد). */
  [Symbol.iterator]() { return [this[0], this[1]][Symbol.iterator](); }
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
globalThis.fetch = async () => new Response('offline', { status: 404 });
const ctx = { waitUntil() {}, passThroughFunction() {} };

/* ── ۲) بدلِ Response برای کدِ ۱۰۱ ──
   ⚠️ ورکر با `new Response(null, { status: 101, webSocket: client })` پاسخِ
   ارتقا را می‌سازد، ولی Responseِ استانداردِ Node وضعیتِ ۱۰۱ را رد می‌کند
   («init["status"] must be in the range of 200 to 599»). بدونِ این بدل،
   tunnelHandler استثنا می‌دهد، صفحهٔ استتار برمی‌گردد و تست هیچ‌وقت تونلِ
   واقعی را نمی‌بیند. */
const RealResponse = globalThis.Response;
globalThis.Response = class extends RealResponse {
  constructor(body, init) {
    if (init && init.status === 101) {
      super(null, { status: 200 });
      Object.defineProperty(this, 'status', { value: 101, configurable: true });
      this.webSocket = init.webSocket || null;
      return;
    }
    super(body, init);
  }
};

/* ── ۳) D1 جعلی روی SQLiteِ واقعی، و یک D1ِ خراب ── */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const norm = (a) => (a === undefined ? null : a);
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a.map(norm)),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number((r && r.changes) || 0) } }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async (col) => { const row = db.prepare(sql).get(...args); if (row === undefined || row === null) return null; if (!col) return row; return row[col] === undefined ? null : row[col]; },
  });
  return {
    prepare: (sql) => mk(sql, []),
    batch: async (ss) => { const o = []; for (const s of ss) o.push(await s.run()); return o; },
    exec: async (sql) => { db.exec(sql); return { count: 0 }; },
    __rows: (sql, ...a) => db.prepare(sql).all(...a),
  };
}
/** بایند است ولی هر عملیاتش شکست می‌خورد — پایگاهِ اشتباه، DDLِ رد‌شده، … */
function makeBrokenD1() {
  const boom = () => { throw new Error('D1_ERROR: not authorized to perform this operation'); };
  const mk = () => ({ bind: () => mk(), run: async () => boom(), all: async () => boom(), first: async () => boom() });
  return { prepare: () => mk(), batch: async () => boom(), exec: async () => boom() };
}

/* ── ۴) بارگذاریِ ورکر با بدلِ سوکت ──
   ⚠️ بدلِ سوکت باید «باز بماند»: اگر connect خطا بدهد، finish() اجرا می‌شود،
   ردیفِ اتصال آزاد می‌شود و سقف هیچ‌وقت پر نمی‌شود — تست بی‌معنا می‌شد. */
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
function prepareDir(tag, srcText) {
  const dir = path.join(TMP, tag);
  fs.mkdirSync(dir, { recursive: true });
  const body = srcText.replace(/from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/, (m, q, raw) => {
    const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m;
  });
  fs.writeFileSync(path.join(dir, 'w.mjs'), body);
  fs.writeFileSync(path.join(dir, 'sockets.mjs'), SOCKETS_STUB);
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  return 'file:///' + path.join(dir, 'w.mjs').replace(/\\/g, '/');
}

/* ── ۵) هندشیکِ معتبرِ VLESS (همان ساختاری که parseVless می‌خواند) ──
   [0]=version  [1..16]=uuid(16 بایت)  [17]=طولِ opt  [18]=cmd
   [19..20]=port  [21]=atyp(1=IPv4)  [22..25]=آدرس  [26..29]=payload */
function vlessHandshake(uuid, host, port) {
  const b = new Uint8Array(30);
  b[0] = 0;
  const hex = String(uuid).replace(/-/g, '');
  for (let i = 0; i < 16; i++) b[1 + i] = parseInt(hex.substr(i * 2, 2), 16);
  b[18] = 1;
  b[19] = (port >> 8) & 0xff; b[20] = port & 0xff;
  b[21] = 1;
  const p = host.split('.').map(Number);
  b[22] = p[0]; b[23] = p[1]; b[24] = p[2]; b[25] = p[3];
  b[26] = 1; b[27] = 2; b[28] = 3; b[29] = 4;
  return b;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitClosed(server, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (server && server.closed) return server.closed; await sleep(5); }
  return server ? server.closed : null;
}
const jreq = (url, method, body, token) => new Request(url, {
  method,
  headers: Object.assign({ 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    token ? { authorization: 'Bearer ' + token } : {}),
  body: body ? JSON.stringify(body) : undefined,
});

/** یک اتصالِ تونلِ واقعی از یک IP مشخص باز می‌کند */
async function openTunnel(handler, env, uuid, ip) {
  const req = new Request('https://panel.test/tunnel', {
    headers: {
      upgrade: 'websocket', connection: 'upgrade',
      'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'cf-connecting-ip': ip,
    },
  });
  const res = await handler.fetch(req, env, ctx);
  const client = res && res.webSocket;
  if (!client) return { res, client: null, server: null, closed: null };
  const server = client._peer;
  client.send(vlessHandshake(uuid, '1.1.1.1', 443));
  await waitClosed(server, 1500);
  return { res, client, server, closed: server.closed };
}

/** ورود + ساخت/تنظیمِ کاربر با سقفِ مشخص */
async function setup(handler, env, ipLimit, name) {
  const lj = await (await handler.fetch(jreq('https://panel.test/api/login', 'POST', { password: 'simorgh' }), env, ctx)).json();
  if (!lj.token) throw new Error('ورود ناموفق: ' + JSON.stringify(lj));
  const mk = await (await handler.fetch(jreq('https://panel.test/api/users', 'POST', { name }, lj.token), env, ctx)).json();
  const u = mk.user;
  if (!u) throw new Error('ساختِ کاربر ناموفق: ' + JSON.stringify(mk));
  await handler.fetch(jreq('https://panel.test/api/users', 'POST', { id: u.id, op: 'update', patch: { ipLimit } }, lj.token), env, ctx);
  return { token: lj.token, user: u };
}
const health = async (handler, env) => await (await handler.fetch(new Request('https://panel.test/health'), env, ctx)).json();
const pick = (out, needle) => (out.checks || []).find((c) => strip(c.name).includes(strip(needle)));

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  const srcText = fs.readFileSync(SRC, 'utf8');
  const ipA = '198.51.100.10', ipB = '198.51.100.11';

  /* ═══ الف) سقف روی مسیرِ واقعیِ تونل (D1ِ سالم) ═══ */
  console.log('== A) سقف روی مسیرِ واقعیِ WebSocket (D1 سالم) ==');
  const modA = await import(prepareDir('tun', srcText));
  const hA = modA.default || modA;
  const envA = { DB: makeD1() };
  const a = await setup(hA, envA, 1, 'tun-a-' + Date.now());

  const c1 = await openTunnel(hA, envA, a.user.uuid, ipA);
  ok(!!c1.client, 'اتصالِ WebSocket برقرار شد (Response با webSocket)');
  ok(!c1.closed || c1.closed.code !== 1013, '\u2605 اتصالِ اول از IP اول پذیرفته شد', c1.closed ? ('کد ' + c1.closed.code) : 'باز ماند');

  const c2 = await openTunnel(hA, envA, a.user.uuid, ipA);
  ok(!c2.closed || c2.closed.code !== 1013,
    '\u2605 اتصالِ دوم از همان IP هم پذیرفته شد (سقف = تعداد IP، نه تعداد اتصال)',
    c2.closed ? ('کد ' + c2.closed.code) : 'باز ماند');

  const c3 = await openTunnel(hA, envA, a.user.uuid, ipB);
  ok(!!c3.closed && c3.closed.code === 1013,
    '\u2605\u2605 اتصال از IP دوم با کدِ ۱۰۱۳ رد شد — همان چیزی که کاربر باید ببیند',
    c3.closed ? ('کد ' + c3.closed.code + ' • ' + c3.closed.reason) : 'باز ماند (باید رد می‌شد!)');

  const liveIps = [...new Set(envA.DB.__rows('SELECT ip FROM conns').map((r) => r.ip))];
  ok(liveIps.length === 1 && liveIps[0] === ipA, 'جدولِ conns فقط IP اول را نگه داشته', JSON.stringify(liveIps));

  if (c1.server) c1.server.close(1000, 'x');
  if (c2.server) c2.server.close(1000, 'x');
  await sleep(150);
  const c4 = await openTunnel(hA, envA, a.user.uuid, ipB);
  ok(!c4.closed || c4.closed.code !== 1013,
    'پس از بسته شدنِ همهٔ اتصال‌های IP اول، IP دوم پذیرفته می‌شود', c4.closed ? ('کد ' + c4.closed.code) : 'باز ماند');
  if (c4.server) c4.server.close(1000, 'x');

  /* ═══ ب) سقفِ صفر = نامحدود (تلهٔ «هیچ بلاکی نمی‌شود») ═══ */
  console.log('\n== B) سقفِ صفر یعنی نامحدود (رفتارِ درست، نه باگ) ==');
  const b = await setup(hA, envA, 0, 'tun-zero-' + Date.now());
  const z1 = await openTunnel(hA, envA, b.user.uuid, ipA);
  const z2 = await openTunnel(hA, envA, b.user.uuid, ipB);
  ok(!z1.closed || z1.closed.code !== 1013, 'با سقفِ ۰، IP اول پذیرفته می‌شود');
  ok(!z2.closed || z2.closed.code !== 1013,
    '\u2605 با سقفِ ۰ هیچ بلاکی نمی‌شود — این «باگ» نیست، یعنی سقفی تنظیم نشده',
    z2.closed ? ('کد ' + z2.closed.code) : 'باز ماند');
  if (z1.server) z1.server.close(1000, 'x');
  if (z2.server) z2.server.close(1000, 'x');

  /* ═══ ج) ★★★ D1 بایند است ولی کار نمی‌کند — باگِ «هیچ بلاکی نمی‌شود» ═══
     اگر D1 خراب باشد، `connAcquire` بی‌صدا به حافظه می‌افتد. در همان isolate
     تست سبز می‌شود، ولی روی کلاودفلر isolateها جدا هستند و سقف هرگز پر
     نمی‌شود. پس مهم‌ترین انتظار این است که این وضعیت *گزارش* شود. */
  console.log('\n== C) \u2605\u2605\u2605 D1 بایند است ولی کار نمی‌کند ==');
  const modC = await import(prepareDir('tunbroken', srcText));
  const hC = modC.default || modC;
  const envC = { DB: makeBrokenD1() };
  const c = await setup(hC, envC, 1, 'tun-broken-' + Date.now());

  const hRes = await hC.fetch(new Request('https://panel.test/health'), envC, ctx);
  const hj = await hRes.json();
  ok(hRes.status === 200, '/health پاسخ می‌دهد', 'HTTP ' + hRes.status);
  ok(hj.limiter === 'mem',
    '\u2605 /health بک‌اندِ *کارکننده* را می‌گوید نه بایندشده (قبلاً d1 بود و دروغ می‌گفت)', 'limiter=' + hj.limiter);
  ok(hj.limiterIntended === 'd1', 'بایندینگِ موجود جداگانه گزارش می‌شود', 'intended=' + hj.limiterIntended);
  ok(hj.limiterVerified === false && hj.limiterDegraded === true,
    '\u2605 افتِ بی‌صدا صریحاً علامت خورده', 'verified=' + hj.limiterVerified + ' degraded=' + hj.limiterDegraded);
  ok(!!hj.limiterError && /D1_ERROR/.test(hj.limiterError), 'خطای واقعیِ D1 برگردانده می‌شود', String(hj.limiterError).slice(0, 70));
  ok(hj.limitEnforced === false, '\u2605 limitEnforced دیگر دروغ نمی‌گوید', 'limitEnforced=' + hj.limitEnforced);

  const stC = await (await hC.fetch(jreq('https://panel.test/api/state', 'GET', null, c.token), envC, ctx)).json();
  ok(stC.limiterDegraded === true && stC.limiter === 'mem',
    '\u2605 پنل هم همین را می‌بیند (بنرِ قرمز با توضیحِ درست)',
    'limiter=' + stC.limiter + ' degraded=' + stC.limiterDegraded);

  const uh = await (await hC.fetch(jreq('https://panel.test/api/action', 'POST', { act: 'usage-health' }, c.token), envC, ctx)).json();
  const cShared = pick(uh, 'مرجعِ مشترکِ محدودیت');
  ok(!!cShared && cShared.ok === false,
    '\u2605 کارتِ سلامت شکست می‌خورد — نه سبزِ کاذب', cShared && String(cShared.note).slice(0, 100));

  /* تونل در همین isolate هنوز کار می‌کند (شبکهٔ ایمنیِ حافظه) — ولی حالا صریح */
  const k1 = await openTunnel(hC, envC, c.user.uuid, ipA);
  const k2 = await openTunnel(hC, envC, c.user.uuid, ipB);
  ok(!k1.closed || k1.closed.code !== 1013, 'شبکهٔ ایمنی: داخلِ همین isolate اتصالِ اول پذیرفته می‌شود');
  ok(!!k2.closed && k2.closed.code === 1013,
    'شبکهٔ ایمنی: داخلِ همین isolate IP دوم رد می‌شود (اما بین isolateها بی‌اعتبار است — و حالا گزارش می‌شود)',
    k2.closed ? ('کد ' + k2.closed.code) : 'باز ماند');
  if (k1.server) k1.server.close(1000, 'x');

  /* ═══ د) همان مسیر روی باندلِ مستقرشده ═══
     چیزی که روی کلاودفلر اجرا می‌شود `_worker.obf.js` است، نه worker.js.
     ⚠️ نمی‌توان با grep فهمید باندل درست است: در scripts/build-obfuscated.mjs
     گزینهٔ stringArray با رمزِ rc4 و threshold:1 روشن است، پس هیچ رشته‌ای
     خوانا نیست و grep همیشه صفر می‌دهد. تنها راهِ معتبر، اجرای خودِ باندل است. */
  const obfPath = path.join(ROOT, '_worker.obf.js');
  console.log('\n== D) همان سناریو روی باندلِ مستقرشده (_worker.obf.js) ==');
  if (!fs.existsSync(obfPath)) {
    ok(false, 'باندلِ _worker.obf.js موجود است (npm run build را اجرا کنید)');
  } else {
    const modD = await import(prepareDir('tunobf', fs.readFileSync(obfPath, 'utf8')));
    const hD = modD.default || modD;
    const envD = { DB: makeD1() };
    const d = await setup(hD, envD, 1, 'tun-obf-' + Date.now());
    const d1 = await openTunnel(hD, envD, d.user.uuid, ipA);
    const d2 = await openTunnel(hD, envD, d.user.uuid, ipB);
    ok(!d1.closed || d1.closed.code !== 1013, 'باندلِ obf: اتصالِ اول از IP اول پذیرفته شد', d1.closed ? ('کد ' + d1.closed.code) : 'باز ماند');
    ok(!!d2.closed && d2.closed.code === 1013,
      '\u2605\u2605 باندلِ obf: اتصال از IP دوم رد شد — همین فایلی که روی کلاودفلر است',
      d2.closed ? ('کد ' + d2.closed.code + ' • ' + d2.closed.reason) : 'باز ماند');
    if (d1.server) d1.server.close(1000, 'x');

    const modE = await import(prepareDir('tunobfbroken', fs.readFileSync(obfPath, 'utf8')));
    const hE = modE.default || modE;
    const hjE = await health(hE, { DB: makeBrokenD1() });
    ok(hjE.limiter === 'mem' && hjE.limiterDegraded === true && hjE.limitEnforced === false,
      '\u2605\u2605 باندلِ obf هم افتِ بی‌صدا را لو می‌دهد (نه سکوتِ کاذب)',
      'limiter=' + hjE.limiter + ' degraded=' + hjE.limiterDegraded);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fail ? '\n' + fail + ' تست ناموفق \u2717' : '\nهمه‌ی تست‌ها موفق \u2713');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
});
