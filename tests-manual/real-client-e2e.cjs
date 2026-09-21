/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ «کلاینتِ واقعی» — همان چیزی که کاربر با آن وصل می‌شود
 *  ───────────────────────────────────────────────────────────────────────────
 *  چرا این تست لازم شد: تستِ خروجی (exit-session-e2e) کلاینت را *خودش*
 *  شبیه‌سازی می‌کند. پس هر تفاوتی بین رفتارِ آن شبیه‌ساز و یک کلاینتِ واقعی
 *  (Xray/v2rayNG) — اندازه‌ی فریم‌ها، تقسیمِ ClientHello، نوشتن‌های پشتِ‌سرهم،
 *  خواندنِ هم‌زمان — از چشمِ تست پنهان می‌ماند در حالی که کاربر
 *  «کانفیگ پینگ می‌دهد ولی کار نمی‌کند» می‌بیند.
 *
 *  اینجا *باینریِ واقعیِ Xray* به‌عنوان کلاینت اجرا می‌شود:
 *
 *    curl/http  →  SOCKS5 (Xray client)  →  WebSocket  →  ورکرِ ما
 *               →  سرورِ خروجیِ reality+vision (Xray دوم)  →  مقصدِ HTTP
 *
 *  مسیرِ مستقیمِ ورکر (cloudflare:sockets) عمداً بسته است؛ پس سبز شدن یعنی
 *  داده واقعاً از سرورِ خروجی رد شده. علاوه بر پاسخِ کوچک، یک بدنهٔ ۲۵۶
 *  کیلوبایتی هم از تونل عبور می‌کند تا مسیرِ داده در حجمِ واقعی سنجیده شود.
 *
 *  پیش‌نیاز: XRAY_BIN یا tests-manual/.e2e/xray(.exe)
 *  اجرا:  npm run test:real   (یا XRAY_BIN=... node tests-manual/real-client-e2e.cjs)
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const tls = require('tls');
const { AsyncLocalStorage } = require('async_hooks');
const { spawn, execFileSync } = require('child_process');
const https = require('https');
const { webcrypto, randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.env.WORKER_SRC ? path.resolve(process.env.WORKER_SRC) : path.join(ROOT, 'worker.js');
const TMP = path.join(ROOT, '.realclient-tmp');
const EXIT_PORT = 18453;
const TARGET_PORT = 18089;
const TLS_PORT = 18090;   /* مقصدِ TLS 1.3 (برای مسیرِ XTLS direct copy) */
const WS_PORT = 18101;
const SOCKS_PORT = 18102;
const SNI = process.env.SNI || 'www.cloudflare.com';
const BIG = 256 * 1024;
const BODY = 'REAL-CLIENT-OK';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(50);
  }
};
const randomUuid = () => {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
};
const findXray = () => {
  if (process.env.XRAY_BIN) return process.env.XRAY_BIN;
  const cands = [
    path.join(ROOT, 'tests-manual', '.e2e', 'xray.exe'),
    path.join(ROOT, 'tests-manual', '.e2e', 'xray'),
    path.join(ROOT, 'xray.exe'), path.join(ROOT, 'xray'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
};

/* ── ۱) مقصدِ نهایی: وب‌سرورِ محلی (هم پاسخِ کوچک هم بدنهٔ ۲۵۶ کیلوبایتی) ── */
let targetHits = 0;
const bigBody = Buffer.alloc(BIG, 0x41);
const targetSrv = http.createServer((req, res) => {
  targetHits++;
  /* ⚠️ POST با بدنهٔ بزرگ — جهتِ *آپلود* هرگز آزمایش نشده بود.
     سرورِ خروجیِ reality رکوردهای TLS را خودمان می‌سازیم (rlSeal) و
     محدودیتِ ۲^۱۴ بایتِ هر رکورد اگر رعایت نشود، سرورِ Xray اتصال را
     با record_overflow می‌بندد — و همین فقط در جهتِ آپلود دیده می‌شود،
     چون جهتِ دانلود محدودیتِ طول را از خودِ سرور می‌گیرد. */
  if (req.method === 'POST' && req.url === '/up') {
    const h = crypto.createHash('sha1');
    let n = 0;
    req.on('data', (d) => { h.update(d); n += d.length; });
    req.on('end', () => {
      const body = 'UPLOAD ' + n + ' ' + h.digest('hex');
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(body.length) });
      res.end(body);
    });
    return;
  }
  if (req.url === '/big') {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(BIG), connection: 'close' });
    res.end(bigBody);
    return;
  }
  const body = BODY + ' • ' + req.url;
  res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(body.length) });
  res.end(body);
});

/* ── ۱.۵) مقصدِ HTTPS: TLS ۱٫۳ واقعی با پاس‌خِ دو‌تکه
   ═════════════════════════════════════════════════════════════════════════
   ⚠️ چرا این مقصد لازم شد — ریشه‌ی «تست سبز، کانفیگِ reality مرده»:
   سرورِ خروجیِ Xray با flow=xtls-rprx-vision وقتی داخلِ تونل یک هندشیکِ
   *TLS 1.3* کامل ببیند (ClientHello + ServerHello با supported_versions
   0x0304) پرچمِ EnableXtls را ست می‌کند و در نخستین رکوردِ app-data مقصد
   یک بلوکِ Vision با فرمانِ ۲ (CommandPaddingDirect) می‌فرستد و بلافاصله
   نوشتنتگرِ خود را به NetConn خام سوئیچ می‌کند: از آن لحظه رکوردهای TLSِ
   مقصد *بدونِ* رمزنگاریِ بیرونی روی سوکت می‌آیند (فلسفه‌ی XTLS: حذفِ
   رمزنگاریِ دوبل).
   تست‌های قبلی همه با HTTPِ ساده بودند یا پاسخِ TLS در همان یک بلوکِ
   padding می‌آمد؛ پس هرگز بایتِ خامِ پس از سوئیچ دیده نمی‌شد. این مقصد
   پاسخ را در دو نوشتنِ جدا (۴۰۰ms فاصله) می‌فرستد: تکهٔ اول سوئیچ را
   فعال می‌کند و تکهٔ دوم بی‌قید و شرط *خام* می‌آید. */
const TLS_BODY = 'TLS-SPLICE-OK';
/* بدنهٔ بزرگِ پس از سوئیچ: دانلودِ واقعیِ مرورگر روی همان مسیری که دیگر
   رمزنگاریِ بیرونی ندارد — باید بی‌کم‌وکاست برسد (نه فقط «چند بایتِ اول»). */
const TLS_BIG = 384 * 1024;
const tlsBigBody = Buffer.alloc(TLS_BIG, 0x5a);
let tlsHits = 0;
function startTlsTarget() {
  const key = path.join(TMP, 'target-key.pem'), cert = path.join(TMP, 'target-cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=tls.local'], { stdio: 'ignore' });
  }
  const srv = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    tlsHits++;
    if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(TLS_BIG) });
      res.write(tlsBigBody.subarray(0, 128));
      setTimeout(() => { try { res.end(tlsBigBody.subarray(128)); } catch (e) {} }, 400);
      return;
    }
    const body = TLS_BODY + '•' + req.url;
    res.writeHead(200, {
      'content-type': 'text/plain',
      'content-length': String(body.length * 2),
    });
    res.write(body);
    setTimeout(() => { try { res.end(body); } catch (e) {} }, 400);
  });
  srv.keepAliveTimeout = 30000;
  return srv;
}

/* ── ۲) سرورِ خروجیِ واقعی: Xray با reality + vision (همان کانفیگِ کاربر) ── */
const UUID = randomUuid();
let exitProc = null, clientProc = null, exitLog = '', clientLog = '';

async function startExitServer() {
  const kp = await webcrypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const srvPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const pk8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const config = {
    log: { loglevel: process.env.E2E_VERBOSE ? 'debug' : 'warning' },
    inbounds: [{
      listen: '127.0.0.1', port: EXIT_PORT, protocol: 'vless',
      settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none' },
      streamSettings: {
        network: 'raw', security: 'reality',
        realitySettings: { dest: SNI + ':443', xver: 0, serverNames: [SNI], privateKey: b64u(pk8.slice(pk8.length - 32)), shortIds: ['', 'dead3611ae00'] },
      },
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct' }],
  };
  const p = path.join(TMP, 'exit-server.json');
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
  exitProc = spawn(findXray(), ['run', '-c', p], { cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'] });
  exitProc.stdout.on('data', (d) => { exitLog += d.toString(); });
  exitProc.stderr.on('data', (d) => { exitLog += d.toString(); });
  return { pbk: b64u(srvPub) };
}

function startXrayClient() {
  const config = {
    log: { loglevel: process.env.E2E_VERBOSE ? 'debug' : 'warning' },
    inbounds: [{ listen: '127.0.0.1', port: SOCKS_PORT, protocol: 'socks', settings: { auth: 'noauth', udp: false } }],
    outbounds: [{
      protocol: 'vless',
      settings: { vnext: [{ address: '127.0.0.1', port: WS_PORT, users: [{ id: UUID, encryption: 'none' }] }] },
      streamSettings: { network: 'ws', security: 'none', wsSettings: { path: '/sg', host: 'panel.test' } },
    }],
  };
  const p = path.join(TMP, 'client.json');
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
  clientProc = spawn(findXray(), ['run', '-c', p], { cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'] });
  clientProc.stdout.on('data', (d) => { clientLog += d.toString(); });
  clientProc.stderr.on('data', (d) => { clientLog += d.toString(); });
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
    await sleep(150);
  }
};

/* ── ۳) محیطِ ورکر: D1 در حافظه + سوکتِ شبیه‌ساز + پلِ وب‌سوکتِ واقعی ── */
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
  return { prepare: (sql) => mk(sql, []), batch: async (s) => { const o = []; for (const x of s) o.push(await x.run()); return o; } };
}

/* فقط پورتِ سرورِ خروجی باز است — مسیرِ مستقیمِ ورکر عمداً بسته است. */
function socketsShim() {
  return [
    "import net from 'node:net';",
    'const OPEN_PORTS = [' + EXIT_PORT + '];',
    'const blocked = (why) => {',
    '  const opened = Promise.reject(new Error(why)); opened.catch(() => {});',
    '  return { opened, closed: Promise.resolve(),',
    '    readable: new ReadableStream({ start(c) { c.close(); } }),',
    '    writable: new WritableStream({ write() { throw new Error(why); } }),',
    '    close() {}, startTls() { throw new Error(why); } };',
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
    '    write(chunk) { return new Promise((res, rej) => sock.write(Buffer.from(chunk), (e) => (e ? rej(e) : res()))); },',
    '    close() { try { sock.end(); } catch (e) {} },',
    '    abort() { try { sock.destroy(); } catch (e) {} },',
    '  });',
    '  return { opened, closed: Promise.resolve(), readable, writable, close: () => sock.destroy(), startTls() { throw new Error("no tls"); } };',
    '};',
  ].join('\n');
}

function prepareDir() {
  fs.mkdirSync(TMP, { recursive: true });
  let body = fs.readFileSync(SRC, 'utf8').replace(/from\s*(['"])((?:\\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/, (m, q, raw) => {
    const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m;
  });
  body = body.replace(".catch(() => { try { server.close(); } catch (e) {} });",
    '.catch((e) => { console.log("[TEST] session threw: " + ((e && (e.stack || e.message)) || e)); try { server.close(); } catch (e2) {} });');
  /* نشانه‌های تشخیصی — فقط در کپیِ آزمایشیِ کد، خودِ worker.js دست‌نخورده است */
  const marks = [
    ['const ex = resolveExit(st, user);', 'const ex = resolveExit(st, user); console.log("[TEST] resolveExit: " + ex.mode + " " + ((ex.server && ex.server.name) || "-") + " " + (ex.reason || ""));'],
    ['EXIT_STATS.tunnels++;', 'EXIT_STATS.tunnels++; console.log("[TEST] exit tunnel open: " + info.addr + ":" + info.port);'],
    ['const v = parseVless(buf);', 'const v = parseVless(buf); console.log("[TEST] vless: " + (v ? (v.cmd + " " + v.addr + ":" + v.port + " payload=" + ((v.payload && v.payload.length) || 0)) : "null"));'],
  ];
  for (const [from, to] of marks) body = body.replace(from, to);
  console.log('  • نشانه‌های تشخیصی در کدِ آزمایشی: ' + ((body.match(/\[TEST\]/g) || []).length));
  fs.writeFileSync(path.join(TMP, 'w.mjs'), body);
  fs.writeFileSync(path.join(TMP, 'sockets.mjs'), socketsShim());
  fs.writeFileSync(path.join(TMP, 'package.json'), '{ "type": "module" }\n');
  return 'file:///' + path.join(TMP, 'w.mjs').replace(/\\/g, '/');
}

/* ── پلِ واقعیِ WebSocket: قابِ RFC6455 روی TCP ↔ جفتِ شبیه‌سازِ ورکر ──
   ورکر `const [client, server] = new WebSocketPair()` می‌سازد و روی `server`
   می‌نویسد/می‌خواند. اینجا همان `server` به سوکتِ TCP وصل می‌شود. */
const wsStore = new AsyncLocalStorage();
function installGlobals() {
  globalThis.fetch = async () => new Response('offline', { status: 404 });
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.WebSocketPair = function WebSocketPair() {
    const ctx = wsStore.getStore();
    const sock = ctx && ctx.sock;
    const listeners = { message: [], close: [], error: [] };
    const pending = [];
    const remote = {
      binaryType: '',
      readyState: 1,
      accept() {},
      send(data) {
        if (!sock || sock.destroyed) return;
        try { sock.write(wsFrame(data)); } catch (e) {}
      },
      close() {
        this.readyState = 3;
        try { sock.write(Buffer.from([0x88, 0x00])); sock.end(); } catch (e) {}
        listeners.close.forEach((f) => { try { f({ code: 1000, reason: '' }); } catch (e) {} });
      },
      addEventListener(t, f) {
        if (t === 'message') {
          listeners.message.push(f);
          while (pending.length) { const d = pending.shift(); try { f({ data: d }); } catch (e) {} }
        } else if (listeners[t]) listeners[t].push(f);
      },
    };
    const local = {
      binaryType: '', readyState: 1, accept() {}, send() {}, close() {},
      addEventListener() {},
    };
    if (sock) {
      sock.on('data', (d) => {
        let frames;
        try { frames = wsParse(d, ctx); } catch (e) { return; }
        for (const f of frames) {
          const u8 = new Uint8Array(f);
          if (listeners.message.length) listeners.message.forEach((fn) => { try { fn({ data: u8 }); } catch (e) {} });
          else pending.push(u8);
        }
      });
      sock.on('close', () => { remote.readyState = 3; listeners.close.forEach((f) => { try { f({ code: 1006, reason: '' }); } catch (e) {} }); });
      sock.on('error', (e) => { listeners.error.forEach((f) => { try { f(e); } catch (e2) {} }); });
    }
    return [local, remote];
  };
}

/* قابِ سرور→کلاینت (بدونِ ماسک) */
function wsFrame(payload) {
  const p = Buffer.from(payload);
  const op = 0x2;
  let head;
  if (p.length < 126) head = Buffer.from([0x80 | op, p.length]);
  else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(p.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(p.length), 2); }
  return Buffer.concat([head, p]);
}

/* پارسرِ قاب‌های کلاینت (ماسک‌شده) — بافر در ctx می‌ماند */
function wsParse(d, ctx) {
  ctx.wsBuf = ctx.wsBuf && ctx.wsBuf.length ? Buffer.concat([ctx.wsBuf, d]) : Buffer.from(d);
  const out = [];
  for (;;) {
    const b = ctx.wsBuf;
    if (b.length < 2) break;
    const op = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) break; len = Number(b.readBigUInt64BE(2)); off = 10; }
    let mask = null;
    if (masked) { if (b.length < off + 4) break; mask = b.slice(off, off + 4); off += 4; }
    if (b.length < off + len) break;
    const data = Buffer.from(b.slice(off, off + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    ctx.wsBuf = b.slice(off + len);
    if (op === 0x2 || op === 0x0) out.push(data);
    else if (op === 0x8) ctx.sock.end();
  }
  return out;
}

/* ── سرورِ وب‌سوکتِ واقعی: ارتقای HTTP → پلِ ورکر ── */
function startWsServer(handler, env, ctxObj) {
  const srv = http.createServer((req, res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('decoy'); });
  srv.on('upgrade', (req, sock, head) => {
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const wsCtx = { sock, wsBuf: head && head.length ? Buffer.from(head) : Buffer.alloc(0) };
    const request = new Request('https://panel.test' + req.url, {
      headers: {
        upgrade: 'websocket', connection: 'Upgrade',
        'sec-websocket-key': String(key), 'sec-websocket-version': '13',
        'user-agent': String(req.headers['user-agent'] || 'xray'),
        'cf-connecting-ip': '203.0.113.7', host: 'panel.test',
      },
    });
    wsStore.run(wsCtx, () => Promise.resolve(handler.fetch(request, env, ctxObj)).catch(() => {}));
  });
  return srv;
}

/* ── کلاینتِ SOCKS5 کوچک برای هدایتِ درخواست‌های HTTP از داخلِ Xray ── */
function socksConnect(destHost, destPort) {
  return new Promise((res, rej) => {
    const s = net.connect({ host: '127.0.0.1', port: SOCKS_PORT });
    let stage = 0;
    s.on('error', rej);
    s.on('connect', () => s.write(Buffer.from([5, 1, 0])));
    s.on('data', (d) => {
      if (stage === 0) {
        if (d[0] !== 5 || d[1] !== 0) return rej(new Error('SOCKS: روشِ احراز هویت پذیرفته نشد'));
        stage = 1;
        const ip = /^(\d{1,3}\.){3}\d{1,3}$/.test(destHost);
        const addr = ip ? Buffer.from(destHost.split('.').map(Number)) : Buffer.concat([Buffer.from([destHost.length]), Buffer.from(destHost)]);
        const rq = Buffer.concat([Buffer.from([5, 1, 0, ip ? 1 : 3]), addr, Buffer.from([(destPort >> 8) & 255, destPort & 255])]);
        s.write(rq);
        return;
      }
      if (stage === 1) {
        if (d[1] !== 0) return rej(new Error('SOCKS: اتصال رد شد (code=' + d[1] + ')'));
        stage = 2;
        s.removeAllListeners('data');
        res(s);
      }
    });
  });
}

/* درخواستِ HTTPS از داخلِ SOCKS: Node خودش ClientHello می‌سازد، پس همان
   جریانی را می‌سازد که مرورگر/کلاینتِ واقعی روی خروجیِ vision می‌فرستد. */
const tlsThroughSocks = async (host, port, request, timeoutMs) => {
  let raw = null, t = null;
  try {
    raw = await socksConnect(host, port);
    t = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false, ALPNProtocols: ['http/1.1'] });
    await new Promise((res, rej) => { t.once('secureConnect', res); t.once('error', rej); setTimeout(() => rej(new Error('TLS handshake timeout')), timeoutMs); });
    t.write(request);
    let head = '';
    await new Promise((res) => {
      t.on('data', (d) => {
        if (!head) head = d.toString('latin1').split('\r\n')[0] || '';
        res();
      });
      t.on('close', res);
      t.on('error', res);
      setTimeout(res, timeoutMs);
    });
    return { head };
  } catch (e) {
    return { head: '', err: String((e && e.message) || e) };
  } finally {
    try { if (t) t.destroy(); } catch (e) {}
    try { if (raw) raw.destroy(); } catch (e) {}
  }
};

const httpRaw = (sock, reqBuf, timeoutMs) => new Promise((res, rej) => {
  let buf = Buffer.alloc(0);
  const onData = (d) => {
    buf = Buffer.concat([buf, d]);
    const i = buf.indexOf('\r\n\r\n');
    if (i < 0) return;
    const head = buf.slice(0, i).toString('latin1');
    const m = /content-length:\s*(\d+)/i.exec(head);
    const need = m ? Number(m[1]) : 0;
    if (buf.length - (i + 4) >= need) {
      sock.removeListener('data', onData);
      res({ head, body: buf.slice(i + 4, i + 4 + need), status: (head.split('\r\n')[0] || '').trim() });
    }
  };
  sock.on('data', onData);
  sock.on('error', rej);
  sock.write(reqBuf);
  setTimeout(() => { sock.removeListener('data', onData); rej(new Error('timeout')); }, timeoutMs || 15000);
});

const httpGet = (sock, p) => httpRaw(sock, 'GET ' + p + ' HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');

/* ── اتصالِ TLS ۱٫۳ از داخلِ SOCKS (کلاینتِ واقعی) ── */
const tlsConnectSocks = async (host, port, timeoutMs) => {
  const raw = await socksConnect(host, port);
  const t = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false, ALPNProtocols: ['http/1.1'] });
  await new Promise((res, rej) => {
    t.once('secureConnect', res);
    t.once('error', rej);
    setTimeout(() => rej(new Error('زمانِ هندشیکِ TLS تمام شد')), timeoutMs);
  });
  return t;
};

/* یک پاسخِ HTTP روی همان سوکتِ TLS — تا کامل‌شدنِ body بر اساسِ Content-Length */
/* بدنهٔ پاسخ با UTF-8 (متنِ تست نویسه‌های غیر-ASCII دارد؛ latin1 آن را دو
   بایتی می‌کند و مقایسهٔ رشته‌ای دروغین «شکست» می‌دهد در حالی که داده سالم است) */
const bodyBufOf = (r) => {
  const i = r.buf.indexOf('\r\n\r\n');
  return i < 0 ? Buffer.alloc(0) : r.buf.slice(i + 4);
};
const bodyOf = (r) => bodyBufOf(r).toString('utf8');

const tlsHttp = (t, request, timeoutMs) => new Promise((res) => {
  let buf = Buffer.alloc(0), done = false;
  const finish = (why) => {
    if (done) return;
    done = true;
    t.removeListener('data', onData);
    res({ buf, why });
  };
  const onData = (d) => {
    buf = Buffer.concat([buf, d]);
    const i = buf.indexOf('\r\n\r\n');
    if (i < 0) return;
    const head = buf.slice(0, i).toString('latin1');
    const m = /content-length:\s*(\d+)/i.exec(head);
    if (m && buf.length - (i + 4) >= Number(m[1])) finish('');
  };
  t.on('data', onData);
  t.on('error', (e) => finish('خطا: ' + String((e && e.message) || e)));
  t.on('close', () => finish('اتصال بسته شد'));
  t.write(request);
  setTimeout(() => finish('زمان تمام شد'), timeoutMs || 15000);
});

(async () => {
  const XRAY = findXray();
  if (!XRAY) {
    console.log('  ⚠ باینریِ Xray پیدا نشد — تست رد شد (XRAY_BIN را ست کنید)');
    process.exit(0);
  }
  fs.mkdirSync(TMP, { recursive: true });

  const tlsTarget = startTlsTarget();
  await new Promise((r) => targetSrv.listen(TARGET_PORT, '127.0.0.1', r));
  await new Promise((r) => tlsTarget.listen(TLS_PORT, '127.0.0.1', r));
  console.log('  • مقصدِ نهایی: 127.0.0.1:' + TARGET_PORT + '  («' + BODY + '» + بدنهٔ ' + (BIG / 1024) + ' کیلوبایتی)');
  console.log('  • مقصدِ TLS ۱٫۳ (دو تکه با فاصله): 127.0.0.1:' + TLS_PORT);

  const { pbk } = await startExitServer();
  if (!(await waitPort(EXIT_PORT, 12000))) {
    console.log('  ✗ سرورِ خروجی بالا نیامد\n' + exitLog.slice(0, 800));
    process.exit(1);
  }
  console.log('  • سرورِ خروجیِ واقعیِ Xray: reality + vision (127.0.0.1:' + EXIT_PORT + ')');

  installGlobals();
  const mod = await import(prepareDir());
  const handler = mod.default || mod;
  const env = { DB: makeD1() };
  const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughFunction() {} };

  const wsSrv = startWsServer(handler, env, ctx);
  await new Promise((r) => wsSrv.listen(WS_PORT, '127.0.0.1', r));
  console.log('  • ورکر (با کدِ ' + path.basename(SRC) + ') پشتِ وب‌سوکت: 127.0.0.1:' + WS_PORT + '/sg');

  /* ── پنل: کاربر و سرورِ خروجی ── */
  const jreq = (url, body, token) => new Request(url, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(body),
  });
  const login = await (await handler.fetch(jreq('https://panel.test/api/login', { password: 'simorgh' }), env, ctx)).json();
  const token = login.token;
  ok(!!token, 'ورود به پنل');
  const api = async (route, body) => (await handler.fetch(jreq('https://panel.test' + route, body, token), env, ctx)).json();

  const link = 'vless://' + UUID + '@127.0.0.1:' + EXIT_PORT
    + '?encryption=none&flow=xtls-rprx-vision&security=reality&sni=' + SNI + '&fp=chrome&pbk=' + pbk + '&type=tcp#Xray-real-client';
  const added = await api('/api/exits', { op: 'add', link });
  ok(added.ok === true, 'سرورِ خروجیِ reality+vision ثبت شد', added.ok ? added.server.name : JSON.stringify(added).slice(0, 120));
  const masterRes = await api('/api/exits', { op: 'master', enabled: true });
  const dfltRes = await api('/api/exits/default', { mode: 'exit', exitId: added.server.id });
  const usr = await api('/api/users', { name: 'real-client', uuid: UUID });
  ok(!!(usr.user && usr.user.uuid), 'کاربر با همان UUIDِ کلاینتِ Xray ساخته شد', (usr.user || {}).uuid || JSON.stringify(usr).slice(0, 100));
  if (fail) console.log('    دیباگ: master=' + JSON.stringify(masterRes).slice(0, 120) + ' • default=' + JSON.stringify(dfltRes).slice(0, 140));
  /* حالتِ ذخیره‌شده باید همان باشد که انتظار داریم — وگرنه تست بی‌معنا می‌شود */
  const before = await (await handler.fetch(new Request('https://panel.test/api/exits', { headers: { authorization: 'Bearer ' + token } }), env, ctx)).json();
  if (!(before.enabled && before.defaultMode === 'exit' && before.effective && before.effective.mode === 'exit')) {
    fail++;
    console.log('  ✗ وضعیتِ پنل پیش از شروعِ تست درست ست نشده بود → ' + JSON.stringify({ enabled: before.enabled, defaultMode: before.defaultMode, defaultExit: before.defaultExit, effective: before.effective, per: before.perConfig }));
  }

  /* ── کلاینتِ واقعیِ Xray ── */
  startXrayClient();
  if (!(await waitPort(SOCKS_PORT, 12000))) {
    console.log('  ✗ کلاینتِ Xray بالا نیامد\n' + clientLog.slice(0, 600));
    process.exit(1);
  }
  console.log('  • کلاینتِ واقعیِ Xray: SOCKS5 روی 127.0.0.1:' + SOCKS_PORT + ' → ws://panel.test/sg');

  const results = [];
  const logSink = [];
  const realLog = console.log;
  console.log = (...a) => { logSink.push(a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ')); };

  /* ۱) درخواستِ کوچک */
  let sock = await socksConnect('127.0.0.1', TARGET_PORT);
  const r1 = await httpGet(sock, '/').catch((e) => ({ err: String(e.message) }));
  results.push(['درخواستِ کوچک از تونلِ خروجی', r1.err ? false : (r1.body.toString().indexOf(BODY) === 0)]);
  /* ۲) سه درخواستِ پشتِ‌سرهم روی همان اتصال (کلاینت‌های واقعی keep-alive می‌کنند) */
  let keepAliveOk = true;
  for (let i = 0; i < 3; i++) {
    const r = await httpGet(sock, '/p' + i).catch(() => ({ err: 'timeout' }));
    if (r.err || r.body.toString().indexOf(BODY) !== 0) keepAliveOk = false;
  }
  results.push(['سه درخواستِ پیاپی روی یک اتصال (keep-alive)', keepAliveOk]);
  /* ۳) بدنهٔ ۲۵۶ کیلوبایتی — مسیرِ داده در حجمِ واقعی */
  const rBig = await httpGet(sock, '/big').catch((e) => ({ err: String(e.message) }));
  const bigOk = !rBig.err && rBig.body.length === BIG && crypto.createHash('sha1').update(rBig.body).digest('hex') === crypto.createHash('sha1').update(bigBody).digest('hex');
  results.push(['بدنهٔ ' + (BIG / 1024) + ' کیلوبایتی بی‌کم‌وکاست رسید', bigOk]);
  try { sock.destroy(); } catch (e) {}

  /* ═══ ۳.۵) جهتِ آپلود ═══════════════════════════════════════════════
     همه‌ی تست‌های قبلی فقط *دانلود* را می‌سنجیدند. در جهتِ آپلود، بایت‌ها
     را ورکر با رکوردهای TLS خودش می‌فرستد و محدودیتِ طولِ رکورد (۲^۱۴ بایت
     در TLS 1.3) اگر رعایت نشود، سرورِ خروجی اتصال را می‌بندد. */
  for (const [label, size] of [['۶۴ کیلوبایتی', 64 * 1024], ['۵۱۲ کیلوبایتی', 512 * 1024]]) {
    const up = Buffer.alloc(size, 0x42);
    const s = await socksConnect('127.0.0.1', TARGET_PORT);
    const want = 'UPLOAD ' + size + ' ' + crypto.createHash('sha1').update(up).digest('hex');
    const r = await httpRaw(s,
      Buffer.concat([Buffer.from('POST /up HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/octet-stream\r\nContent-Length: ' + size + '\r\n\r\n'), up]),
      20000).catch((e) => ({ err: String(e.message) }));
    try { s.destroy(); } catch (e) {}
    results.push(['آپلودِ بدنهٔ ' + label + ' از تونلِ خروجی (رکوردهای TLSِ خودمان)', !r.err && String(r.body) === want]);
    if (r.err || String(r.body) !== want) console.log('      ↳ پاسخ: ' + JSON.stringify(String(r.body || r.err).slice(0, 80)));
  }

  /* ۴) اتصالِ تازه (بدونِ keep-alive) — مثلِ بازکردنِ یک تبِ جدید */
  const sock2 = await socksConnect('127.0.0.1', TARGET_PORT);
  const r2 = await httpGet(sock2, '/fresh').catch((e) => ({ err: String(e.message) }));
  results.push(['اتصالِ دوم (نشستِ تازه)', !r2.err && r2.body.toString().indexOf(BODY) === 0]);
  try { sock2.destroy(); } catch (e) {}

  /* ۵) ترافیکِ TLS از داخلِ تونل — همان چیزی که کاربر واقعاً می‌فرستد.
     خروجی‌های flow=xtls-rprx-vision دقیقاً روی ClientHello و TLS-in-TLS
     کار می‌کنند، ولی تست‌های قبلی همه با HTTPِ ساده بودند؛ پس کلِ مسیرِ
     واقعیِ «مرورِ سایت‌های HTTPS» آزمایش نشده بود. */
  const tlsRes = await tlsThroughSocks('www.cloudflare.com', 443, 'GET / HTTP/1.1\r\nHost: www.cloudflare.com\r\nUser-Agent: real-client-e2e\r\nConnection: close\r\n\r\n', 20000);
  results.push(['TLS واقعی از تونلِ vision عبور کرد (ClientHello + پاسخ)', !!tlsRes.head]);
  results.push(['پاسخِ HTTPSِ مقصد درست بود', /^HTTP\/1\.[01] (200|301|302|403)/.test(tlsRes.head || '')]);
  results.push(['دامنه برای سرورِ خروجی حل شد (SNI/HTTPِ درست)', (tlsRes.head || '').length > 0 && !/^\(?err/.test(String(tlsRes.err || ''))]);

  /* ۶) ═══ مسیرِ XTLS «direct copy» (splice) ═══
     سرورِ خروجی پس از دیدنِ هندشیکِ TLS 1.3 داخلِ تونل، نوشتنتگرش را به
     سوکتِ خام سوئیچ می‌کند (فرمانِ ۲ در بلوکِ Vision) و از آن لحظه بایت‌های
     مقصد بدونِ رمزنگاریِ بیرونی می‌آیند. اگر ورکر آن‌ها را «رکوردِ رمزشده»
     فرض کند، رمزگشایی شکست می‌خورد و نشست وسطِ کار می‌مرد — همان «کانفیگ
     پینگ می‌دهد ولی کار نمی‌کند» با مرورگر. تکهٔ دومِ پاسخ (۴۰۰ms بعد)
     و درخواستِ دومِ keep-alive هر دو *بعد* از سوئیچ می‌آیند. */
  let spliceErr = '';
  try {
    const t = await tlsConnectSocks('127.0.0.1', TLS_PORT, 20000);
    const a = await tlsHttp(t, 'GET /one HTTP/1.1\r\nHost: tls.local\r\nConnection: keep-alive\r\n\r\n', 12000);
    const aBody = bodyOf(a);
    results.push(['TLS 1.3: پاسخِ کاملِ دو‌تکه‌ای پس از سوئیچِ direct copy', aBody === (TLS_BODY + '•/one').repeat(2), a.why || ('body=' + JSON.stringify(aBody.slice(0, 40)))]);
    const b = await tlsHttp(t, 'GET /two HTTP/1.1\r\nHost: tls.local\r\nConnection: keep-alive\r\n\r\n', 12000);
    const bBody = bodyOf(b);
    results.push(['TLS 1.3: درخواستِ دومِ keep-alive روی همان اتصال', bBody === (TLS_BODY + '•/two').repeat(2), b.why || ('body=' + JSON.stringify(bBody.slice(0, 40)))]);
    /* دانلودِ واقعی روی همان مسیرِ spliced — نباید فقط «بایتِ اول» برسد */
    const c = await tlsHttp(t, 'GET /big HTTP/1.1\r\nHost: tls.local\r\nConnection: close\r\n\r\n', 25000);
    const cBody = bodyBufOf(c);
    const cHashOk = cBody.length === TLS_BIG
      && crypto.createHash('sha1').update(cBody).digest('hex') === crypto.createHash('sha1').update(tlsBigBody).digest('hex');
    results.push(['TLS 1.3: بدنهٔ ' + (TLS_BIG / 1024) + ' کیلوبایتی از مسیرِ پس از سوئیچ بی‌کم‌وکاست', cHashOk, c.why || ('bytes=' + cBody.length)]);
    try { t.destroy(); } catch (e) {}
  } catch (e) { spliceErr = String((e && e.message) || e); }
  if (spliceErr) {
    results.push(['TLS 1.3: پاسخِ کاملِ دو‌تکه‌ای پس از سوئیچِ direct copy', false, spliceErr]);
    results.push(['TLS 1.3: درخواستِ دومِ keep-alive روی همان اتصال', false, spliceErr]);
    results.push(['TLS 1.3: بدنهٔ ' + (TLS_BIG / 1024) + ' کیلوبایتی از مسیرِ پس از سوئیچ بی‌کم‌وکاست', false, spliceErr]);
  }

  console.log = realLog;
  const t0 = Date.now();
  await waitFor(() => targetHits >= 5, 5000);
  for (const [label, good, extra] of results) ok(good, label, good ? '' : (extra || 'شکست'));
  ok(targetHits > 0, 'درخواست‌ها واقعاً به مقصدِ نهایی رسیدند', targetHits + ' درخواست در ' + (Date.now() - t0) + 'ms');

  /* ═══ تستِ خودِ پنل — همان دکمه‌ای که کاربر می‌زند ═══
     ⚠️ تا امروز این تست فقط چند بایت می‌فرستاد و «سبز» می‌شد، در حالی که
     تونلِ vision وسطِ ترافیکِ پرحجم می‌مرد. حالا باید *حجمِ واقعی* (آپلودِ
     ۱۲۸ کیلوبایتی + پاسخِ مقصد) را هم تأیید کند — وگرنه سبز بودنش بی‌معناست. */
  const tst = await api('/api/exits/test', { id: added.server.id });
  ok(tst.ok === true && tst.reachable === true, 'تستِ پنل: سرورِ خروجی «سالم» شد', (tst && (tst.error || tst.msg) || '').toString().slice(0, 140));
  ok(tst.volumeOk === true, 'تستِ پنل: عبورِ ترافیکِ پرحجم (آپلود ' + Math.round((tst.volumeUpload || 0) / 1024) + 'KB + پاسخِ ' + (tst.volumeStatus || '—') + ')', tst.volumeError || '');

  const ex = await (await handler.fetch(new Request('https://panel.test/api/exits', { headers: { authorization: 'Bearer ' + token } }), env, ctx)).json();
  const st = (ex && ex.stats) || {};
  ok(Number(st.tunnels) >= 1, 'شمارندهٔ تونلِ خروجی بالا رفت', JSON.stringify({ tunnels: st.tunnels, fallbacks: st.fallbacks, strictCloses: st.strictCloses, lastError: st.lastError }));
  /* سوئیچِ XTLS باید *دیده* شود: اگر شمارنده‌اش صفر باشد، این تست مسیرِ
     واقعیِ مرورگر را نسنجیده و سبز بودنش بی‌معناست. */
  ok(Number(st.splice) >= 1, 'سوئیچِ XTLS direct copy در ورکر ثبت شد', JSON.stringify({ splice: st.splice, spliceBytes: st.spliceBytes }));
  ok(Number(st.spliceBytes) > 0, 'بایت‌های مسیرِ پس از سوئیچ خام پاس شدند', JSON.stringify({ spliceBytes: st.spliceBytes }));
  ok(!st.fallbacks && !st.strictCloses, 'هیچ بازگشتی به مسیرِ مستقیم/بستنِ سخت‌گیر رخ نداد');

  if (fail) {
    console.log('\n  ── گزارشِ ورکر (نشانه‌های TEST) ──');
    logSink.filter((l) => /\[TEST\]/.test(l)).slice(-25).forEach((l) => console.log('    ' + l));
    if (clientLog.trim()) {
      console.log('  ── گزارشِ کلاینتِ Xray ──');
      clientLog.split('\n').filter((l) => l.trim()).slice(-25).forEach((l) => console.log('    ' + l));
    }
  }
  /* ⚠️ گزارشِ سرورِ خروجی حتی در حالتِ سبز هم مفید است: تنها مرجعِ بیرونی برای
     این‌که بفهمیم Xray واقعاً «padding پایان» یا «direct copy» را فعال کرده یا
     نه (XtlsPadding/XtlsFilterTls در سطحِ debug لاگ می‌شوند). */
  if (process.env.E2E_VERBOSE && exitLog.trim()) {
    console.log('  ── گزارشِ سرورِ خروجی ──');
    const lines = exitLog.split('\n').filter((l) => l.trim());
    const keep = lines.filter((l) => /Xtls|Direct|Splice|splice|tls 1\.3|filter|padding/i.test(l));
    (keep.length ? keep : lines).slice(-25).forEach((l) => console.log('    ' + l));
  }

  targetSrv.close(); wsSrv.close();
  if (exitProc) exitProc.kill();
  if (clientProc) clientProc.kill();
  await sleep(300);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fail ? '\n  نتیجه: ' + fail + ' مورد شکست ✗' : '\n  نتیجه: همه سبز ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('  ✗ خطای غیرمنتظره: ' + ((e && e.stack) || e));
  try { targetSrv.close(); } catch (e2) {}
  if (exitProc) exitProc.kill();
  if (clientProc) clientProc.kill();
  process.exit(1);
});
