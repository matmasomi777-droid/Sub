/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ سرتاسریِ «ترافیک از سرورِ خروجی» — همان مسیری که با تنظیمِ exit می‌شکست
 *  ───────────────────────────────────────────────────────────────────────────
 *  چرا این تست لازم است: «تستِ اتصالِ سرور خروجی» در پنل فقط سوکت را باز
 *  می‌کند و هندشیک را می‌سنجد؛ هیچ داده‌ای از تونل رد نمی‌شود. پس هر باگی که
 *  بعد از هندشیک رخ می‌دهد (خط‌لوله‌ی relay، بلوکِ اولِ Vision، حذفِ هدرِ
 *  پاسخ، ترتیبِ فریم‌ها) با تستِ پنل سبز می‌ماند در حالی که کانفیگِ کاربر
 *  کار نمی‌کند.
 *
 *  اینجا مسیرِ واقعیِ تولید شبیه‌سازی می‌شود، با باینریِ واقعیِ Xray:
 *
 *    کلاینت (VLESS روی WebSocket) → sessionِ ورکر → سرورِ خروجیِ reality+vision
 *    (Xray واقعی) → مقصدِ HTTP محلی
 *
 *  ⚠️ مسیرِ مستقیم عمداً بسته است: شبیه‌سازِ سوکت هر اتصالی جز پورتِ سرورِ
 *     خروجی را رد می‌کند. پس سبز شدن یعنی «داده واقعاً از خروجی رد شده»،
 *     نه fallback به مستقیم. آمارِ /api/exits هم همین را تأیید می‌کند
 *     (tunnels > 0 و fallbacks == 0).
 *
 *  پیش‌نیاز: باینریِ Xray در XRAY_BIN یا tests-manual/.e2e/xray.exe
 *            (اگر نباشد تست با پیامِ skip رد می‌شود)
 *  اجرا:  XRAY_BIN=/path/to/xray node tests-manual/exit-session-e2e.cjs
 *         E2E_VERBOSE=1 → گزارشِ سرورِ Xray
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const { webcrypto, randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
/* WORKER_SRC: تست روی یک بازبینیِ دیگر (مثلاً بیلدِ مستقرشده) — برای مقایسهٔ قبل/بعد */
const SRC = process.env.WORKER_SRC ? path.resolve(process.env.WORKER_SRC) : path.join(ROOT, 'worker.js');
const TMP = path.join(ROOT, '.exitsess-tmp');
const EXIT_PORT = 18443;
const TARGET_PORT = 18088;
const BODY = 'EXIT-TUNNEL-OK';
const SNI = process.env.SNI || 'www.cloudflare.com';

/* سوکت‌های شبیه‌ساز در پایانِ تست ECONNRESET می‌دهند (طرفِ مقابل بسته می‌شود)
   — بی‌اثر است و نباید نتیجه را خراب کند */
process.on('uncaughtException', (e) => {
  const m = String((e && e.message) || e);
  if (/ECONNRESET|EPIPE|closed/i.test(m)) return;
  console.log('  ✗ خطای کنترل‌نشده: ' + m);
});

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : ''));
  if (!c) fail++;
};
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const uuidToBytes = (u) => Buffer.from(String(u).replace(/-/g, ''), 'hex');
const randomUuid = () => {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(40);
  }
};

/* ── ۰) باینریِ Xray ── */
const XRAY = [
  process.env.XRAY_BIN,
  path.join(__dirname, '.e2e', 'xray.exe'),
  path.join(ROOT, '..', 'xray-local.exe'),
].filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!XRAY) {
  console.log('  ↷ skip — باینریِ Xray پیدا نشد (XRAY_BIN را تنظیم کنید)');
  process.exit(0);
}

/* ── ۱) مقصدِ محلی (Xray به آن وصل می‌شود) ── */
let targetHits = 0;
const targetSrv = http.createServer((req, res) => {
  targetHits++;
  res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(BODY)) });
  res.end(BODY);
});
targetSrv.on('clientError', (e, sock) => { try { sock.destroy(); } catch (e2) {} });

/* ── ۱ب) «خروجیِ ساده»: یک سرورِ VLESS خامِ بدونِ رمزنگاری (security=none)
   که هدرِ VLESSِ فرستادهٔ ورکر را *روی سیم* می‌خواند. تنها راهِ اثباتِ این‌که
   مقصدِ آی‌پی/پورتِ ۸۰ درست کدگذاری می‌شود (در مسیرِ reality همه‌چیز داخلِ TLS
   است و از بیرون دیده نمی‌شود). این همان گیرندهٔ رگرسیونِ باگِ «آی‌پی مقصد»
   است: قبلاً IP به www.<ip>.sslip.io تبدیل می‌شد و سرورِ داخلِ ایران نمی‌توانست
   آن را حل کند → هیچ داده‌ای رد نمی‌شد.
   سرورِ VLESS فرمت را وضع می‌کند: تمامِ طولانی است، پس یک پارسرِ مستقل اینجا
   نوشته شده (اگر ورکر فرمت را عوض کند، اینجا قرمز می‌شود). */
const STUB_PORT = 18099;
const STUB_UUID = randomUuid();
/* UUID جدا برای خروجیِ Vision — پنل سرورِ تکراری (uuid+آدرس) را قبول نمی‌کند */
const STUB_VIS_UUID = randomUuid();
let stubHdr = null;
let stubPayload = '';
function parseStubHeader(buf) {
  if (buf.length < 19) return null;
  if (buf[0] !== 0) return null;
  const addonsLen = buf[17];
  const p = 18 + addonsLen;
  if (buf.length < p + 4) return null;
  const cmd = buf[p];
  const port = (buf[p + 1] << 8) | buf[p + 2];
  const atyp = buf[p + 3];
  let addr = '', end = p + 4;
  if (atyp === 1) {
    if (buf.length < end + 4) return null;
    addr = [buf[end], buf[end + 1], buf[end + 2], buf[end + 3]].join('.');
    end += 4;
  } else if (atyp === 2) {
    if (buf.length < end + 1) return null;
    const l = buf[end];
    if (buf.length < end + 1 + l) return null;
    addr = buf.slice(end + 1, end + 1 + l).toString('latin1');
    end += 1 + l;
  } else { return null; }
  return { cmd, port, atyp, addr, end };
}
let stubAfter = Buffer.alloc(0);          /* هرچه بعد از هدرِ VLESS روی سیم آمد */
const stubSrv = net.createServer((sock) => {
  let buf = Buffer.alloc(0), done = false;
  sock.on('error', () => {});
  sock.on('data', (d) => {
    if (done) { stubAfter = Buffer.concat([stubAfter, d]); return; }
    buf = Buffer.concat([buf, d]);
    const h = parseStubHeader(buf);
    if (!h) return;
    done = true;
    stubHdr = h;
    stubPayload = buf.slice(h.end).toString('latin1');
    stubAfter = Buffer.from(buf.slice(h.end));
    /* پاسخِ VLESS: [نسخه، طولِ addons] + نشانه — دقیقاً همان چیزی که یک
       سرورِ VLESS روی TCP خام می‌فرستد */
    try { sock.write(Buffer.concat([Buffer.from([0, 0]), Buffer.from('STUB-OK')])); } catch (e) {}
  });
});

/* ── ۲) سرورِ خروجیِ واقعی: Xray با reality + vision ── */
const UUID = randomUuid();
let proc = null;
let srvLog = '';

async function startXray() {
  const kp = await webcrypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const srvPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const pk8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const srvPriv = pk8.slice(pk8.length - 32);
  const config = {
    log: { loglevel: process.env.E2E_VERBOSE ? 'debug' : 'warning' },
    inbounds: [{
      listen: '127.0.0.1', port: EXIT_PORT, protocol: 'vless',
      settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none' },
      streamSettings: {
        network: 'raw', security: 'reality',
        realitySettings: { dest: SNI + ':443', xver: 0, serverNames: [SNI], privateKey: b64u(srvPriv), shortIds: ['', 'dead3611ae00'] },
      },
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct' }],
  };
  const cfgPath = path.join(TMP, 'xray-server.json');
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
  proc = spawn(XRAY, ['run', '-c', cfgPath], { cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', (d) => { srvLog += d.toString(); });
  proc.stderr.on('data', (d) => { srvLog += d.toString(); });
  return { pbk: b64u(srvPub) };
}

const waitPort = async (port, ms) => {
  const t0 = Date.now();
  for (;;) {
    const up = await new Promise((res) => {
      const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); res(true); });
      s.on('error', () => res(false));
      s.setTimeout(400, () => { s.destroy(); res(false); });
    });
    if (up) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(200);
  }
};

/* ── ۳) محیطِ ورکر: D1 در حافظه + شبیه‌سازِ وب‌سوکت + سوکتِ واقعیِ TCP ── */
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

function prepareDir() {
  const dir = TMP;
  fs.mkdirSync(dir, { recursive: true });
  let body = fs.readFileSync(SRC, 'utf8').replace(/from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/, (m, q, raw) => {
    const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m;
  });
  /* فقط برای تست: خطایی که tunnelHandler بی‌صدا می‌بلعد را چاپ می‌کنیم
     (خودِ کد دست‌نخورده می‌ماند — فقط همین catch گزارشگر می‌شود) */
  body = body.replace(".catch(() => { try { server.close(); } catch (e) {} });",
    '.catch((e) => { console.log("[TEST] session threw: " + ((e && (e.stack || e.message)) || e)); try { server.close(); } catch (e2) {} });');
  /* نقاطِ کلیدی هم گزارش‌گر می‌شوند تا اگر داده‌ای رد و بدل نشد، بدانیم کجا گم شد */
  body = body.replace('pipeReady = true;', 'pipeReady = true; console.log("[TEST] pipe ready, early=" + earlyBuf.length);');
  body = body.replace('await handle(chunk);', 'console.log("[TEST] pipe write len=" + ((chunk && (chunk.byteLength || 0)))); await handle(chunk);');
  body = body.replace('const v = parseVless(buf);', 'const v = parseVless(buf); console.log("[TEST] parseVless: " + (v ? (v.uuid + " cmd=" + v.cmd + " addr=" + v.addr + ":" + v.port + " payload=" + ((v.payload && v.payload.length) || 0)) : "null"));');
  body = body.replace('const ex = resolveExit(st, user);', 'const ex = resolveExit(st, user); console.log("[TEST] resolveExit: " + ex.mode + " " + ((ex.server && ex.server.name) || "-") + " " + (ex.reason || ""));');
  body = body.replace('const [client, server] = new WebSocketPair();', 'console.log("[TEST] tunnelHandler start"); const [client, server] = new WebSocketPair();');
  body = body.replace('if (boot) await boot;', 'if (boot) { console.log("[TEST] awaiting boot"); await boot; console.log("[TEST] boot done"); }');
  body = body.replace('const users = state.users.filter((u) => u.enabled && expOk(u));', 'const users = state.users.filter((u) => u.enabled && expOk(u)); console.log("[TEST] session users=" + users.length + " early=" + earlyBuf.length);');
  body = body.replace('catch (eTunnel) { return await decoyPage(s, false, request, url); }',
    'catch (eTunnel) { console.log("[TEST] tunnel threw: " + ((eTunnel && (eTunnel.stack || eTunnel.message)) || eTunnel)); return await decoyPage(s, false, request, url); }');
  console.log('  • نقاطِ گزارش‌گر در کدِ آزمایشی: ' + ((body.match(/\[TEST\]/g) || []).length)
    + ' • awaiting-boot=' + (body.includes('awaiting boot') ? 'ok' : 'MISSING')
    + ' • pipe-ready=' + (body.includes('[TEST] pipe ready') ? 'ok' : 'MISSING')
    + ' • parseVless=' + (body.includes('[TEST] parseVless') ? 'ok' : 'MISSING')
    + ' • resolveExit=' + (body.includes('[TEST] resolveExit') ? 'ok' : 'MISSING')
    + ' • users=' + (body.includes('[TEST] session users') ? 'ok' : 'MISSING'));
  fs.writeFileSync(path.join(dir, 'w.mjs'), body);
  fs.writeFileSync(path.join(dir, 'sockets.mjs'), socketsShim());
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  return 'file:///' + path.join(dir, 'w.mjs').replace(/\\/g, '/');
}

/* ⚠️ فقط پورتِ سرورِ خروجی باز است — مسیرِ مستقیم عمداً بسته است تا سبز شدنِ
   تست واقعاً یعنی «داده از خروجی رد شده» و fallback آن را پنهان نکند. */
function socketsShim() {
  return [
    "import net from 'node:net';",
    'const OPEN_PORTS = [' + EXIT_PORT + ', ' + STUB_PORT + '];',
    'const blocked = (why) => {',
    '  const opened = Promise.reject(new Error(why)); opened.catch(() => {});',
    '  return {',
    '    opened, closed: Promise.resolve(),',
    '    readable: new ReadableStream({ start(c) { c.close(); } }),',
    '    writable: new WritableStream({ write() { throw new Error(why); } }),',
    '    close() {}, startTls() { throw new Error(why); },',
    '  };',
    '};',
    'export const connect = (addr) => {',
    '  const port = Number(addr && addr.port) || 0;',
    '  if (OPEN_PORTS.indexOf(port) < 0) return blocked("مسیرِ مستقیم در تست بسته است (port=" + port + ")");',
    '  const sock = net.connect({ host: "127.0.0.1", port });',
    '  sock.on("error", () => {});',
    '  const opened = new Promise((res, rej) => { sock.once("connect", res); sock.once("error", rej); });',
    '  opened.catch(() => {});',
    '  const readable = new ReadableStream({',
    '    start(c) {',
    '      sock.on("data", (d) => { try { c.enqueue(new Uint8Array(d)); } catch (e) {} });',
    '      sock.on("close", () => { try { c.close(); } catch (e) {} });',
    '      sock.on("error", (e) => { try { c.error(e); } catch (e2) {} });',
    '    },',
    '    cancel() { try { sock.destroy(); } catch (e) {} },',
    '  });',
    '  const writable = new WritableStream({',
    '    write(chunk) { (globalThis.__shimLog = globalThis.__shimLog || []).push((chunk && chunk.length) || 0); return new Promise((res, rej) => sock.write(Buffer.from(chunk), (e) => (e ? rej(e) : res()))); },',
    '    close() { try { sock.end(); } catch (e) {} },',
    '    abort() { try { sock.destroy(); } catch (e) {} },',
    '  });',
    '  return { opened, closed: Promise.resolve(), readable, writable, close: () => sock.destroy(), startTls() { throw new Error("no tls"); } };',
    '};',
  ].join('\n');
}

function installGlobals() {
  globalThis.fetch = async () => new Response('offline', { status: 404 });
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  /* تابع (نه class) و برگردانندهٔ آرایه — کدِ ورکر `const [client, server] = new WebSocketPair()`
     می‌نویسد، پس نتیجه باید iterable باشد. */
  globalThis.WebSocketPair = function WebSocketPair() {
    {
      const side = (own, other) => ({
        readyState: 1,
        accept() {},
        send(data) {
          const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
          other.msg.slice().forEach((f) => { try { f({ data: u8 }); } catch (e) {} });
        },
        close(code, reason) {
          this.readyState = 3;
          other.close.slice().forEach((f) => { try { f({ code, reason }); } catch (e) {} });
        },
        addEventListener(t, f) {
          if (t === 'message') own.msg.push(f);
          else if (t === 'close') own.close.push(f);
        },
      });
      const A = { msg: [], close: [] }, B = { msg: [], close: [] };
      const arr = [side(A, B), side(B, A)];
      globalThis.__wsPair = { client: arr[0], server: arr[1], A, B };
      return arr;
    }
  };
}

const jreq = (url, method, body, token) => new Request(url, {
  method,
  headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
  body: body ? JSON.stringify(body) : undefined,
});

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  await new Promise((r) => targetSrv.listen(TARGET_PORT, '127.0.0.1', r));
  console.log('  • مقصدِ محلی: 127.0.0.1:' + TARGET_PORT + '  («' + BODY + '»)');
  await new Promise((r) => stubSrv.listen(STUB_PORT, '127.0.0.1', r));
  console.log('  • خروجیِ سادهٔ VLESS (بدونِ رمزنگاری): 127.0.0.1:' + STUB_PORT + '  (خواندنِ هدرِ VLESS روی سیم)');

  const { pbk } = await startXray();
  const up = await waitPort(EXIT_PORT, 12000);
  console.log('  • سرورِ خروجیِ واقعیِ Xray: 127.0.0.1:' + EXIT_PORT + ' (reality، vision، sni=' + SNI + ')');
  if (!up) {
    console.log('  ✗ سرور بالا نیامد\n' + srvLog.slice(0, 800));
    if (proc) proc.kill();
    process.exit(1);
  }

  installGlobals();
  const mod = await import(prepareDir());
  const handler = mod.default || mod;
  const env = { DB: makeD1() };
  const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughFunction() {} };

  const login = await (await handler.fetch(jreq('https://panel.test/api/login', 'POST', { password: 'simorgh' }), env, ctx)).json();
  const token = login.token;
  ok(!!token, 'ورود به پنل', String(token || '').slice(0, 8) + '…');

  const api = async (route, body) => (await handler.fetch(jreq('https://panel.test' + route, 'POST', body, token), env, ctx)).json();

  /* ── سرورِ خروجی: همان کانفیگِ کاربر (reality + vision) ── */
  const link = 'vless://' + UUID + '@127.0.0.1:' + EXIT_PORT
    + '?encryption=none&flow=xtls-rprx-vision&security=reality&sni=' + SNI + '&fp=chrome&pbk=' + pbk
    + '&type=tcp&headerType=none#Xray-e2e';
  const added = await api('/api/exits', { op: 'add', link });
  ok(added.ok === true, 'سرور خروجی افزوده شد', added.ok ? added.server.name + ' • ' + added.server.address + ':' + added.server.port : JSON.stringify(added));
  if (!added.ok) { if (proc) proc.kill(); process.exit(1); }
  const exitId = added.server.id;

  await api('/api/exits', { op: 'master', enabled: true });
  if (process.env.E2E_STRICT) {
    await api('/api/exits', { op: 'strict', strict: true });
    console.log('  • حالتِ سخت‌گیر روشن شد (شکستِ خروجی = بستنِ شفافِ اتصال، بدونِ fallback)');
  }
  const dflt = await api('/api/exits/default', { mode: 'exit', exitId });
  ok(dflt.ok === true, 'پیش‌فرضِ سراسری روی سرور خروجی تنظیم شد', JSON.stringify(dflt.mode || dflt.effective || dflt).slice(0, 80));

  /* ── کاربر ── */
  const usrRes = await api('/api/users', { name: 'e2e-exit' });
  const usr = (usrRes && usrRes.user) || usrRes || {};
  ok(!!usr.uuid, 'کاربر ساخته شد', usr.uuid || JSON.stringify(usrRes).slice(0, 120));
  if (!usr.uuid) { if (proc) proc.kill(); process.exit(1); }

  const logs = [];
  const realLog = console.log;
  console.log = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ')); };

  /* ── درایورِ نشست: کلاینت VLESS روی WebSocket، هدر در فریمِ اول و داده در
     فریمِ بعدی — مثل کلاینت‌های واقعی. destAddr می‌تواند آی‌پی یا دامنه باشد؛
     خودِ کلاینتِ واقعی هم برای اکثرِ ترافیک آی‌پی می‌فرستد (DNS را از تونل
     گرفته) و همین مسیر با باگِ sslip.io می‌مرد. */
  const runSession = async (destAddr, destPort, payloadBuf, expectRe) => {
    const isV4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(destAddr);
    const ab = isV4 ? Buffer.from(destAddr.split('.').map(Number)) : Buffer.from(destAddr);
    /* ⚠️ قالبِ VLESS: atyp=1 (IPv4) ⇒ دقیقاً ۴ بایت بدونِ طول؛ atyp=2 (دامنه)
       ⇒ یک بایتِ طول و بعد نام. اشتباه در همین یک بایت، مقصد را جابه‌جا
       می‌کرد و کلِ تست بی‌معنا می‌شد. */
    const addrField = isV4 ? ab : Buffer.concat([Buffer.from([ab.length]), ab]);
    const header = Buffer.concat([
      Buffer.from([0]), uuidToBytes(usr.uuid), Buffer.from([0]),
      Buffer.from([1, (destPort >> 8) & 255, destPort & 255, isV4 ? 1 : 2]), addrField,
    ]);
    const chunks = [];
    globalThis.__wsPair = null;
    const req = new Request('https://panel.test/sg', {
      headers: {
        upgrade: 'websocket', connection: 'Upgrade',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13',
        'user-agent': 'Go-http-client/1.1', host: 'panel.test',
      },
    });
    const fetchP = handler.fetch(req, env, ctx);
    fetchP.then((r) => { if (r && r.status !== 101) logs.push('[TEST] پاسخِ ارتقا: HTTP ' + r.status); }).catch(() => {});
    const pair = await waitFor(() => globalThis.__wsPair, 3000);
    if (!pair) return { ok: false, all: Buffer.alloc(0), text: '' };
    pair.client.addEventListener('message', (ev) => { chunks.push(Buffer.from(ev.data)); });
    await fetchP.catch(() => {});
    pair.client.send(new Uint8Array(header));
    await sleep(60);
    if (payloadBuf && payloadBuf.length) pair.client.send(new Uint8Array(payloadBuf));
    await waitFor(() => expectRe.test(Buffer.concat(chunks).toString('latin1')) ? true : null, 8000);
    const all = Buffer.concat(chunks);
    return { ok: expectRe.test(all.toString('latin1')), all, text: all.toString('latin1') };
  };

  /* ── موردِ اصلی: مقصدِ محلی روی سرور خروجیِ واقعیِ Xray (reality+vision) ── */
  globalThis.__shimLog = [];
  const r0 = await runSession('127.0.0.1', TARGET_PORT,
    Buffer.from('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'),
    /HTTP\/1\.[01] \d\d\d/);
  const text = r0.text, all = r0.all;
  ok(r0.ok, 'پاسخِ HTTP از مسیرِ خروجی برگشت', JSON.stringify((text.split('\r\n')[0] || text.slice(0, 60)).trim()));

  console.log = realLog;
  console.log('    بایت‌های نوشته‌شده روی سوکتِ خروجی (ترتیبِ نوشتن): ' + ((globalThis.__shimLog || []).join(', ') || '—'));
  ok(targetHits > 0, 'درخواستِ کاربر واقعاً به مقصدِ نهایی رسید (سرورِ مقصد آن را دید)',
    targetHits + ' درخواست • از اینجا معلوم می‌شود فرستادنِ *دادهٔ بعدی* از تونل کار کرد یا نه');
  ok(text.includes(BODY), 'بدنهٔ مقصد بی‌کم‌وکاست رسید', all.length + ' بایت');
  ok(all.length >= 2 && all[0] === 0 && all[1] === 0, 'هدرِ پاسخِ VLESS درست است', 'اولین بایت‌ها: ' + all.slice(0, 4).toString('hex'));
  ok(!text.includes('HTTP/1.1 502'), 'فالبکِ 502 (شکستِ مسیر) رخ نداد');

  /* ═══════════ موردِ دوم: کدگذاریِ مقصد روی سیم ══════════════════════════
     با یک خروجیِ VLESS خام (security=none) هدری که ورکر برای سرورِ خروجی
     می‌سازد قابلِ خواندن است. اینجا دقیقاً همان باگی می‌شود که تجربهٔ کاربر را
     خراب می‌کرد: مقصدِ آی‌پی به www.<ip>.sslip.io تبدیل می‌شد و سرورِ خروجی
     (واقع در ایران) نمی‌توانست آن دامنه را resolve کند → صفر بایت ترافیک، در
     حالی که کاوشِ دامنه‌ای پنل سبز بود. */
  console.log('\n  ── کدگذاریِ مقصد برای سرورِ خروجی ──');
  const stubLink = 'vless://' + STUB_UUID + '@127.0.0.1:' + STUB_PORT
    + '?encryption=none&security=none&type=tcp#stub';
  const addedStub = await api('/api/exits', { op: 'add', link: stubLink });
  ok(addedStub.ok === true, 'خروجیِ سادهٔ VLESS (بدونِ رمزنگاری) افزوده شد',
    addedStub.ok ? (addedStub.server.name + ' • ' + addedStub.server.transport + '/' + addedStub.server.security) : JSON.stringify(addedStub));
  const stubId = addedStub.ok ? addedStub.server.id : '';
  if (!stubId) { if (proc) proc.kill(); process.exit(1); }
  await api('/api/exits/default', { mode: 'exit', exitId: stubId });

  stubHdr = null;
  const rIp = await runSession('9.9.9.9', 443, Buffer.from('PING'), /STUB-OK/);
  await waitFor(() => stubHdr, 2500);
  ok(!!stubHdr && stubHdr.atyp === 1 && stubHdr.addr === '9.9.9.9',
    'مقصدِ آی‌پی به‌صورتِ *آی‌پی* به سرورِ خروجی می‌رود (بدونِ sslip.io)',
    stubHdr ? ('atyp=' + stubHdr.atyp + ' addr=' + stubHdr.addr) : 'هدری نرسید');
  ok(rIp.text.includes('STUB-OK'), 'داده از خروجیِ ساده رد شد (هدرِ پاسخ درست)', rIp.all.length + ' بایت');

  stubHdr = null;
  const rDom = await runSession('example.com', 443, Buffer.from('PING'), /STUB-OK/);
  await waitFor(() => stubHdr, 2500);
  ok(!!stubHdr && stubHdr.atyp === 2 && stubHdr.addr === 'example.com',
    'مقصدِ دامنه‌ای به‌صورتِ دامنه فرستاده می‌شود', stubHdr ? ('atyp=' + stubHdr.atyp + ' addr=' + stubHdr.addr) : 'هدری نرسید');
  ok(rDom.ok, 'مسیرِ دامنه‌ای هم ترافیک می‌دهد');

  stubHdr = null;
  const r80 = await runSession('9.9.9.9', 80, Buffer.from('GET / HTTP/1.0\r\n\r\n'), /STUB-OK/);
  await waitFor(() => stubHdr, 2500);
  ok(!!stubHdr && stubHdr.port === 80, 'پورت ۸۰ روی سرورِ واقعی رد نمی‌شود (ترافیکِ HTTPِ کاربر زنده می‌ماند)',
    stubHdr ? ('port=' + stubHdr.port) : 'هدری نرسید');
  ok(r80.ok, 'ترافیکِ پورت ۸۰ از خروجی عبور می‌کند');

  /* ── سنجشِ قالبِ Vision روی سیم ────────────────────────────────────────
     مسیرِ reality رمزنگاری‌شده است و از بیرون دیده نمی‌شود؛ با خروجیِ ساده و
     flow=xtls-rprx-vision بایت‌های واقعیِ بلوک‌ها خوانده می‌شوند. اینجا معلوم
     شد که در بستهٔ obfuscate‌شدهٔ مستقر روی کلاودفلر، بلوکِ اولِ Vision پدینگِ
     بلند ندارد (`o.long` در کدِ obfuscate گم می‌شود) — همان چیزی که مسیرِ
     داده را در نصبِ واقعی می‌کشت. */
  const visLink = 'vless://' + STUB_VIS_UUID + '@127.0.0.1:' + STUB_PORT
    + '?encryption=none&security=none&type=tcp&flow=xtls-rprx-vision#stub-vision';
  const addedVis = await api('/api/exits', { op: 'add', link: visLink });
  ok(addedVis.ok === true, 'خروجیِ ساده با flow=xtls-rprx-vision افزوده شد', addedVis.ok ? addedVis.server.flow : JSON.stringify(addedVis));
  const visId = addedVis.ok ? addedVis.server.id : '';
  if (visId) {
    await api('/api/exits/default', { mode: 'exit', exitId: visId });
    stubHdr = null; stubAfter = Buffer.alloc(0);
    await runSession('9.9.9.9', 443, Buffer.from('GET /v HTTP/1.0\r\n\r\n'), /STUB-OK/);
    await waitFor(() => stubAfter.length > 40, 2500);
    const b = stubAfter;
    /* بلوکِ اول: UUID(16) + cmd(1) + contentLen(2) + paddingLen(2) + content + padding */
    const b1 = (b.length >= 21) ? { cmd: b[16], cLen: (b[17] << 8) | b[18], pLen: (b[19] << 8) | b[20], at: 21 } : null;
    const uuidOk = b.length >= 16 && Buffer.from(b.slice(0, 16)).toString('hex') === String((addedVis.server || {}).uuid || '').replace(/-/g, '');
    ok(uuidOk, 'بلوکِ اولِ Vision با UUIDِ کارفرما شروع می‌شود', b.slice(0, 16).toString('hex'));
    ok(!!b1 && b1.pLen >= 500, 'بلوکِ اولِ Vision پدینگِ بلند دارد (مطابقِ XtlsPaddingِ Xray)',
      b1 ? ('cmd=' + b1.cmd + ' contentLen=' + b1.cLen + ' paddingLen=' + b1.pLen) : 'بلوک کامل نرسید');
    /* محتوا ممکن است داخلِ بلوکِ اول بیاید (وقتی هدر و دادهٔ کلاینت با هم برسند)
       یا در بلوکِ بعدی — هر دو حالت درست است؛ مهم این است که در جایی از
       استریمِ Vision دست‌نخورده باشد. */
    let found = '';
    if (b1) {
      const c1 = b.slice(21, 21 + b1.cLen).toString('latin1');
      if (c1.indexOf('GET /v') === 0) found = c1;
      let off = b1.at + b1.cLen + b1.pLen;
      for (let g = 0; g < 6 && off + 5 <= b.length; g++) {
        const cLen = (b[off + 1] << 8) | b[off + 2], pLen = (b[off + 3] << 8) | b[off + 4];
        const content = b.slice(off + 5, off + 5 + cLen).toString('latin1');
        if (content.indexOf('GET /v') === 0) found = content;
        off += 5 + cLen + pLen;
      }
    }
    ok(!!found, 'دادهٔ کلاینت بی‌کم‌وکاست داخلِ بلوک‌های Vision می‌نشیند',
      found ? JSON.stringify(found.slice(0, 24)) : ('کلِ بلوک‌ها: ' + b.length + ' بایت'))
    await api('/api/exits/default', { mode: 'exit', exitId: stubId });
  }

  const wrapped = await api('/api/exits', { op: 'ipwrap', id: stubId, ipWrap: 'always' });
  ok(wrapped.ok === true && wrapped.effective === true, 'تنظیمِ دستیِ پوششِ آی‌پی (always) پذیرفته شد', JSON.stringify(wrapped.ipWrap));
  stubHdr = null;
  await runSession('9.9.9.9', 443, Buffer.from('PING'), /STUB-OK/);
  await waitFor(() => stubHdr, 2500);
  ok(!!stubHdr && stubHdr.atyp === 2 && stubHdr.addr === 'www.9.9.9.9.sslip.io',
    'با always، پوششِ sslip.io عیناً مثل قبل برمی‌گردد (سازگاری با خروجی‌های قبلی)',
    stubHdr ? ('atyp=' + stubHdr.atyp + ' addr=' + stubHdr.addr) : 'هدری نرسید');
  await api('/api/exits', { op: 'ipwrap', id: stubId, ipWrap: 'auto' });

  /* پورتِ HTTP روی خروجیِ *روی کلاودفلر* باید هنوز رد شود (وگرنه آنجا
     connect() قطعاً شکست می‌خورد و کاربر خطای مبهم می‌گیرد) */
  const cfTest = await api('/api/exits/test', {
    server: { name: 'cf-fronted', address: 'example.workers.dev', port: STUB_PORT, uuid: STUB_UUID, transport: 'ws', security: 'tls', sni: 'example.workers.dev' },
    port: 80,
  });
  ok(cfTest.reachable === false && /HTTP/.test(String(cfTest.error || '')),
    'پورت ۸۰ روی خروجیِ روی کلاودفلر همچنان با پیامِ گویا رد می‌شود',
    JSON.stringify({ phase: cfTest.phase, error: cfTest.error }).slice(0, 140));

  /* بازگشت به سرورِ خروجیِ واقعی برای ادامهٔ تست‌ها */
  await api('/api/exits/default', { mode: 'exit', exitId });

  /* ── تستِ خودِ پنل: باید هندشیک *و* عبورِ داده را با هم بسنجد ──
     (قبلاً فقط سوکت باز می‌شد و تست سبز می‌ماند در حالی که ترافیک رد نمی‌شد) */
  const t1 = await api('/api/exits/test', { id: exitId });
  ok(t1.reachable === true && Number(t1.bytes) > 0, 'تستِ پنل: هندشیک + عبورِ داده',
    'reachable=' + t1.reachable + ' bytes=' + t1.bytes + ' head=' + JSON.stringify(t1.head || ''));
  ok(t1.reachable === true && !t1.phase, 'تستِ پنل بدونِ فازِ خطا سبز شد', String(t1.phase || '—'));
  ok(t1.ipOk === true, 'تستِ پنل مقصدِ *آی‌پی* را هم می‌سنجد (نه فقط دامنه)',
    'ipOk=' + t1.ipOk + ' ipBytes=' + t1.ipBytes + ' dest=' + JSON.stringify(t1.dest || ''));

  /* آزمونِ منفی: پیکربندیِ ناقصِ reality باید صریحاً «ناموفق» گزارش شود و
     هرگز سبز نشود. (pbk غلط معیارِ خوبی نیست: reality عمداً کلاینت را به
     مقصدِ واقعی پروکسی می‌کند و آنجا هم داده برمی‌گردد — رفتارِ خودِ پروتکل.) */
  const broken = await api('/api/exits/test', { server: Object.assign({}, added.server, { sni: '' }) });
  ok(broken.reachable === false && /SNI/.test(String(broken.error || '')), 'پیکربندیِ ناقص → ناموفق گزارش می‌شود',
    JSON.stringify(broken).slice(0, 120));

  /* ── آمارِ پنل: تأییدِ اینکه واقعاً از خروجی رد شده ── */
  const ex = await (await handler.fetch(new Request('https://panel.test/api/exits', { headers: { authorization: 'Bearer ' + token } }), env, ctx)).json();
  const st = (ex && ex.stats) || {};
  ok(st.tunnels >= 1, 'شمارندهٔ تونلِ خروجی بالا رفت', JSON.stringify({ tunnels: st.tunnels, fallbacks: st.fallbacks, strictCloses: st.strictCloses, lastError: st.lastError }));
  ok(!st.fallbacks, 'هیچ fallbackای به مسیرِ مستقیم رخ نداد');
  ok(!!(ex.effective && ex.effective.mode === 'exit'), 'پیش‌فرضِ مؤثرِ پنل = خروجی', JSON.stringify(ex.effective || {}).slice(0, 80));

  if (fail) {
    console.log('\n  ── گزارشِ ورکر ──');
    logs.filter((l) => l.trim()).slice(-25).forEach((l) => console.log('    ' + l));
    if (process.env.E2E_VERBOSE && srvLog.trim()) {
      console.log('  ── گزارشِ سرورِ Xray ──');
      srvLog.split('\n').filter((l) => l.trim()).slice(-30).forEach((l) => console.log('    ' + l));
    }
  }

  targetSrv.close();
  if (proc) proc.kill();
  await sleep(300);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fail ? '\n  نتیجه: ' + fail + ' مورد شکست ✗' : '\n  نتیجه: همه سبز ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('  ✗ خطای غیرمنتظره: ' + ((e && e.stack) || e));
  try { targetSrv.close(); } catch (e2) {}
  if (proc) proc.kill();
  process.exit(1);
});
