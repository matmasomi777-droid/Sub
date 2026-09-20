/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ زنده‌ی REALITY + XTLS-Vision در برابر سرورِ واقعیِ Xray
 *  ───────────────────────────────────────────────────────────────────────────
 *  این تست کدِ واقعیِ ورکر (بلوکِ @@REALITY_BEGIN@@ + لفافِ VLESS/Vision) را
 *  روی یک اینستنسِ *واقعیِ* Xray اجرا می‌کند: همان باینری‌ای که سرورهای خروجیِ
 *  کاربر اجرا می‌کنند. هیچ سرورِ جعلی‌ای در کار نیست — اگر اینجا سبز شود،
 *  سرورِ واقعی هم همان جواب را می‌دهد.
 *
 *  پیش‌نیاز (اختیاری — اگر نباشد تست با پیامِ skip رد می‌شود):
 *    • باینریِ Xray در XRAY_BIN یا ../xray-local.exe یا ./.e2e/xray.exe
 *    • دسترسیِ خروجی به اینترنت (dest/SNI و مقصدِ freedom)
 *
 *  اجرا:  XRAY_BIN=/path/to/xray node tests-manual/reality-live-e2e.cjs
 *         E2E_DBG=1   → مقایسه‌ی رازهای کلاینت با key logِ سرور
 *         E2E_VERBOSE=1 → گزارشِ سرورِ Xray
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { webcrypto, randomBytes } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(__dirname, '.e2e');
fs.mkdirSync(TMP, { recursive: true });

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const uuidToBytes = (u) => Buffer.from(String(u).replace(/-/g, ''), 'hex');
const randomUuid = () => {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
};

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : ''));
  if (!c) fail++;
};

/* ── ۰) باینریِ Xray ── */
const XRAY = [
  process.env.XRAY_BIN,
  path.join(TMP, 'xray.exe'),
  path.join(ROOT, '..', 'xray-local.exe'),
].filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!XRAY) {
  console.log('  ↷ skip — باینریِ Xray پیدا نشد (XRAY_BIN را تنظیم کنید)');
  process.exit(0);
}

/* ── ۱) کدِ واقعیِ ورکر ── */
const SRC = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
const toU8 = (d) => {
  if (!d) return new Uint8Array(0);
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (typeof d === 'string') return new TextEncoder().encode(d);
  return new Uint8Array(0);
};
const cut = (a, b) => {
  const i = SRC.indexOf(a), j = SRC.indexOf(b);
  if (i < 0 || j < i) throw new Error('برشِ سورس پیدا نشد: ' + a);
  return SRC.slice(i, j);
};
const M = new Function('toU8', 'crypto', 'atob', 'TextDecoder', 'TextEncoder', 'console',
  cut('/* @@REALITY_BEGIN@@ */', '/* @@REALITY_END@@ */') +
  '\n; return { rlHandshake, rlWrapStreams, rlX25519Base, rlX25519, rlConcat, rlEq, rlSha256, rlHmac, rlExpandLabel, rlDbg: () => RL_DBG }'
)(toU8, webcrypto, (s) => Buffer.from(s, 'base64').toString('binary'), TextDecoder, TextEncoder, console);

const V = new Function('toU8', 'crypto', 'rlConcat', 'rlEq', 'TextDecoder', 'TextEncoder',
  cut("const VISION_FLOW = 'xtls-rprx-vision';", '/* @@VISION_END@@ */') +
  '\n; return { vlessClientWrap, visionPadBlock, visionUnwrap, vlessResponseParser, vlessUuidBytes, VISION_FLOW };'
)(toU8, webcrypto, M.rlConcat, M.rlEq, TextDecoder, TextEncoder);

/* ── ۲) کلیدها + کانفیگِ سرورِ واقعی ── */
const UUID = randomUuid();
const SNI = process.env.SNI || 'www.cloudflare.com';
const DEST = process.env.DEST || SNI + ':443';
const TARGET = process.env.TARGET || 'example.com';
const TARGET_PORT = Number(process.env.TARGET_PORT || 80);
const PORT = 18443;
let proc = null;
let srvLog = '';

async function startServer() {
  const kp = await webcrypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const srvPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const pk8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const srvPriv = pk8.slice(pk8.length - 32); /* در Node، کلیدِ خصوصیِ X25519 فقط با pkcs8 صادر می‌شود */
  const config = {
    log: { loglevel: process.env.E2E_VERBOSE ? 'debug' : 'warning' },
    inbounds: [{
      listen: '127.0.0.1', port: PORT, protocol: 'vless',
      settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none' },
      streamSettings: {
        network: 'raw',
        security: 'reality',
        realitySettings: {
          show: !!process.env.XRAY_SHOW,
          dest: DEST, xver: 0,
          serverNames: [SNI],
          privateKey: b64u(srvPriv),
          shortIds: ['', 'dead3611ae00'],
          masterKeyLog: process.env.E2E_DBG ? path.join(TMP, 'keylog.txt') : '',
        },
      },
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct' }],
  };
  const cfgPath = path.join(TMP, 'server.json');
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
  if (process.env.E2E_DBG) { try { fs.unlinkSync(path.join(TMP, 'keylog.txt')); } catch (e) {} }
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
    await new Promise((r) => setTimeout(r, 200));
  }
};

/* ── ۳) io روی سوکتِ Node (هم‌شکل با rlMakeSockIo) ── */
function nodeIo(sock, timeout) {
  let buf = Buffer.alloc(0);
  const waiters = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (waiters.length && buf.length >= waiters[0].n) {
      const w = waiters.shift();
      const out = buf.subarray(0, w.n); buf = buf.subarray(w.n);
      clearTimeout(w.t); w.res(out);
    }
  });
  sock.on('close', () => { while (waiters.length) { const w = waiters.shift(); clearTimeout(w.t); w.rej(new Error('closed')); } });
  const readExact = (n, tmo) => new Promise((res, rej) => {
    if (buf.length >= n) { const out = buf.subarray(0, n); buf = buf.subarray(n); return res(out); }
    const w = { n, res, rej };
    w.t = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); rej(new Error('timeout')); }, tmo || timeout);
    waiters.push(w);
  });
  return {
    readExact,
    write: (b) => new Promise((res, rej) => sock.write(Buffer.from(b), (e) => (e ? rej(e) : res()))),
    close: () => sock.destroy(),
  };
}

const readAll = async (reader, ms) => {
  const chunks = [];
  const t0 = Date.now();
  for (;;) {
    const r = await Promise.race([
      reader.read(),
      new Promise((res) => setTimeout(() => res({ timeout: true }), Math.max(0, ms - (Date.now() - t0)))),
    ]);
    if (!r || r.timeout) break;
    if (r.done) break;
    if (r.value) chunks.push(Buffer.from(r.value));
  }
  return Buffer.concat(chunks);
};

(async () => {
  const { pbk } = await startServer();
  if (!(await waitPort(PORT, 10000))) {
    console.log('  ✗ سرور بالا نیامد\n' + srvLog.slice(0, 800));
    if (proc) proc.kill();
    process.exit(1);
  }
  console.log('  • سرور واقعی Xray روی ' + PORT + ' (sni=' + SNI + ', مقصد=' + TARGET + ':' + TARGET_PORT + ')');

  const srv = {
    address: '127.0.0.1', port: PORT, uuid: UUID, flow: 'xtls-rprx-vision',
    security: 'reality', transport: 'raw', sni: SNI, pbk, sid: '', dbg: !!process.env.E2E_DBG,
  };

  /* ── هندشیکِ reality ── */
  const sock = net.connect({ host: '127.0.0.1', port: PORT });
  await new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); });
  const io = nodeIo(sock, 8000);
  let keys = null, err = null;
  try { keys = await M.rlHandshake(io, srv, 8000); } catch (e) { err = e; }
  ok(!!keys, 'هندشیکِ REALITY با سرورِ واقعی (گیتِ ML-KEM + Finished)', err ? String(err.message) : 'برقرار شد');

  if (process.env.E2E_DBG) {
    try {
      const kl = fs.readFileSync(path.join(TMP, 'keylog.txt'), 'utf8').trim().split('\n').slice(-4);
      console.log('  ── رازهای سرور (keylog) ──');
      kl.forEach((l) => console.log('    ' + l));
    } catch (e) { console.log('    (keylog خالی)'); }
    const dbg = (keys && keys.dbg) || M.rlDbg();
    if (dbg) {
      const hx = (b) => Buffer.from(b).toString('hex');
      console.log('  ── رازهای کلاینتِ ورکر (' + dbg.phase + ') ──');
      console.log('    sHs  ' + hx(dbg.sHs));
      console.log('    cHs  ' + hx(dbg.cHs));
    }
  }
  const dumpLog = (n) => {
    if (!process.env.E2E_VERBOSE || !srvLog.trim()) return;
    console.log('  ── گزارشِ سرورِ Xray ──');
    console.log(srvLog.split('\n').filter((l) => l.trim()).slice(-(n || 40)).map((l) => '    ' + l).join('\n'));
  };
  if (!keys) { dumpLog(); sock.destroy(); proc.kill(); process.exit(1); }

  /* ── VLESS + XTLS-Vision: یک درخواستِ HTTP واقعی از تونل ── */
  const flow = Buffer.from('xtls-rprx-vision');
  const header = Buffer.concat([
    Buffer.from([0]), uuidToBytes(UUID),
    /* addons به‌شکلِ protobufِ Xray: فیلد ۱ (Flow) → [0x0a][len][رشته] */
    Buffer.from([2 + flow.length, 0x0a, flow.length]), flow,
    /* فرمان ۱ (TCP) → پورت → atyp (VLESS/Xray: ۱=IPv4، ۲=دومین، ۳=IPv6) → آدرس */
    Buffer.from([1, (TARGET_PORT >> 8) & 255, TARGET_PORT & 255, 2, TARGET.length]), Buffer.from(TARGET),
  ]);
  const pair = M.rlWrapStreams(io, keys.cAp, keys.sAp);
  const wrapped = V.vlessClientWrap(pair, { header, flow: 'xtls-rprx-vision', uuid: uuidToBytes(UUID) });
  const w = wrapped.writable.getWriter();
  await w.write(new Uint8Array(Buffer.from('GET / HTTP/1.1\r\nHost: ' + TARGET + '\r\nUser-Agent: e2e\r\nConnection: close\r\n\r\n')));
  const reader = wrapped.readable.getReader();
  const resp = await readAll(reader, 8000);
  const text = resp.toString('latin1');
  ok(/^HTTP\/1\.[01] \d\d\d/.test(text), 'پاسخِ HTTP از تونل (VLESS + Vision)', JSON.stringify(text.split('\r\n')[0] || text.slice(0, 60)));
  ok(resp.length > 100, 'بدنه‌ی پاسخ از تونل برگشت', resp.length + ' بایت');
  ok(!/^\x00|^HTTP\/1\.[01] \d\d\d.*[\s\S]*HTTP\/1\.[01]/.test(text.slice(20)), 'هدرِ پاسخِ VLESS به جریانِ کاربر تزریق نشد');

  dumpLog(25);
  sock.destroy();
  if (proc) proc.kill();
  await new Promise((r) => setTimeout(r, 300));
  console.log(fail ? '\n  نتیجه: ' + fail + ' مورد شکست' : '\n  نتیجه: همه سبز');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('  ✗ خطای غیرمنتظره: ' + ((e && e.stack) || e));
  const dbg = M.rlDbg();
  if (dbg && dbg.records) {
    console.log('  ── رکوردهای دیده‌شده ──');
    dbg.records.forEach((r, i) => console.log('    #' + i + ' ct=' + r.ct + ' len=' + r.n + ' head=' + Buffer.from(r.head).toString('hex')));
  }
  if (process.env.E2E_VERBOSE && srvLog.trim()) {
    console.log('  ── گزارشِ سرورِ Xray (پایان) ──');
    console.log(srvLog.split('\n').filter((l) => l.trim()).slice(-30).map((l) => '    ' + l).join('\n'));
  }
  if (proc) proc.kill();
  process.exit(1);
});
