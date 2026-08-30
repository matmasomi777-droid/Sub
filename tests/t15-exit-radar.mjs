// TEST 15 — مرحله‌ی ۲: سرورهای خروجی VLESS (exit/outbound) و اسکنرِ آی‌پی تمیز (رادار)
//
//   الف) تنظیمات و تفکیکِ سراسری / هر کانفیگ
//   ب) ساختِ بایت‌به‌بایتِ هدرِ VLESS و کدکِ وب‌سوکت
//   ج) openExitSocket روی انتقالِ raw و ws
//   د) ورودِ بالادست به مسیر تونل + بازگشت به مسیر مستقیم هنگام خطا
//   ه) endpointهای مدیریت (add/update/delete/default/test/select)
//   و) رادار: تولیدِ کاندیدا، اندازه‌گیریِ واقعی، اسکن از مسیر خروجی، اعمال روی کانفیگ
//
// همان الگوی بقیه‌ی مجموعه‌ها: D1 واقعی (SQLite)، connect() جایگزین‌شده.
import { makeD1 } from './d1.mjs';
import { makeCtx } from './mocks.mjs';
import { __mock } from './cf-sockets.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};
const ok = (label, cond, note = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};
const td = new TextEncoder();
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

const env = { DB: makeD1() };
const HOST = 'panel.example.workers.dev';
const UUID = '11111111-2222-3333-4444-555555555555';
const ctx = makeCtx();

let loginIp = 100;
const call = async (method, path, body, token) => {
  const h = { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.7.' + (++loginIp) };
  if (token) h.authorization = 'Bearer ' + token;
  const res = await W.default.fetch(
    new Request('https://' + HOST + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }),
    env, makeCtx());
  let j = null;
  try { j = await res.json(); } catch (e) { j = {}; }
  return { status: res.status, body: j };
};

const first = await call('POST', '/api/login', { password: 'simorgh' }, null);
if (!first.body || !first.body.token) { console.log('FAIL login:', JSON.stringify(first)); process.exit(1); }
const TOK = first.body.token;
console.log('PASS  login');

await W.usageInit(env, W.seed(W.DEF()));
const addUser = await call('POST', '/api/users', { name: 'ali', uuid: UUID, secret: 'sec-ali' }, TOK);
eq('setup: user created', addUser.status, 201);

/* ══════════════════════════════════════════════════════════════
   ۱) تنظیماتِ جدید و بازگشت به عقب (normalize)
   ══════════════════════════════════════════════════════════════ */
const def = W.DEF();
eq('settings: exits present', typeof def.settings.exits, 'object');
eq('settings: exits default mode', def.settings.exits.defaultMode, 'direct');
eq('settings: exits starts with no server', def.settings.exits.servers.length, 0);
eq('settings: exits enabled by default', def.settings.exits.enabled, true);
eq('settings: radar present', typeof def.settings.radar, 'object');
ok('settings: radar has nova-style ranges', Array.isArray(def.settings.radar.ranges) && def.settings.radar.ranges.length > 10,
  String(def.settings.radar.ranges && def.settings.radar.ranges.length));
eq('settings: radar concurrency respects the worker cap',
  def.settings.radar.concurrency <= W.MAX_RADAR_CONCURRENCY, true);
eq('settings: radar ports default', def.settings.radar.ports.join(','), '443,2053,2083,2087,2096,8443');

/* تنظیماتِ قدیمی (بدون exits/radar) باید هنوز بارگذاری شود */
/* نکته: load/save یک کشِ سراسری (MEM) دارند؛ چون این دو آزمایش پایگاهِ موقتیِ
   خودشان را می‌سازند، وضعیتِ env اصلی را پیش از آن‌ها نگه می‌داریم و بعد برمی‌گردانیم. */
const keepState = W.seed(await W.load(env));
{
  const e2 = { DB: makeD1() };
  const st = W.seed(W.DEF());
  delete st.settings.exits; delete st.settings.radar;
  await W.save(e2, st);
  const back = W.seed(await W.load(e2));
  eq('normalize: exits backfilled', Array.isArray(back.settings.exits.servers), true);
  eq('normalize: radar backfilled', Array.isArray(back.settings.radar.ports), true);
  eq('normalize: radar ranges backfilled', back.settings.radar.ranges.length > 10, true);
}

/* پیش‌فرضِ سراسری به یک شناسه‌ی ناموجود اشاره کند → مستقیم */
{
  const e3 = { DB: makeD1() };
  const st = W.seed(W.DEF());
  st.settings.exits.defaultMode = 'exit';
  st.settings.exits.defaultExit = 'does-not-exist';
  await W.save(e3, st);
  const back = W.seed(await W.load(e3));
  eq('normalize: dangling default falls back to direct', back.settings.exits.defaultMode, 'direct');
  eq('normalize: dangling default id cleared', back.settings.exits.defaultExit, '');
}
await W.save(env, keepState);

/* ══════════════════════════════════════════════════════════════
   ۲) تفکیکِ سراسری / هر کانفیگ
   ══════════════════════════════════════════════════════════════ */
const SRV_A = {
  name: 'آلمان', address: 'de.example.net', port: 443,
  uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', flow: '',
  security: 'tls', transport: 'ws', path: '/ws-exit', serviceName: '',
  sni: 'de.example.net', host: 'de.example.net', label: 'خروجی آلمان',
};
const SRV_B = { ...SRV_A, name: 'فرانسه', address: 'fr.example.net', transport: 'raw' };

const addA = await call('POST', '/api/exits', { op: 'add', server: SRV_A }, TOK);
eq('exits/add: ok', addA.body.ok, true);
eq('exits/add: 201', addA.status, 201);
const A_ID = addA.body.server && addA.body.server.id;
ok('exits/add: id generated', !!A_ID, String(A_ID));
eq('exits/add: name kept', addA.body.server.name, 'آلمان');
eq('exits/add: transport', addA.body.server.transport, 'ws');
ok('exits/add: persian message', /افزوده شد/.test(String(addA.body.msg || '')), String(addA.body.msg));

const addB = await call('POST', '/api/exits', { op: 'add', server: { ...SRV_B, id: 'fixed-b' } }, TOK);
eq('exits/add: second ok', addB.body.ok, true);
eq('exits/add: explicit id honoured', addB.body.server.id, 'fixed-b');

/* تکراری رد شود */
const dup = await call('POST', '/api/exits', { op: 'add', server: SRV_A }, TOK);
eq('exits/add: duplicate rejected', dup.status, 409);

/* ورودیِ نامعتبر — پیام فارسی */
const badUuid = await call('POST', '/api/exits', { op: 'add', server: { ...SRV_A, address: 'x.test', uuid: 'nope' } }, TOK);
eq('exits/add: bad uuid rejected', badUuid.status, 400);
ok('exits/add: persian validation error', /یو‌یو‌آی‌دی/.test(String(badUuid.body.error || '')), String(badUuid.body.error));
const noAddr = await call('POST', '/api/exits', { op: 'add', server: { ...SRV_A, address: '' } }, TOK);
eq('exits/add: missing address rejected', noAddr.status, 400);

/* پارامترهای ناشناخته نباید دور ریخته شوند (طراحی برای آینده) */
const withParams = await call('POST', '/api/exits',
  { op: 'add', server: { ...SRV_A, address: 'jp.example.net', futureFlag: 7, extra: { a: 1 } } }, TOK);
eq('exits/add: unknown keys accepted', withParams.status, 201);
eq('exits/add: unknown key kept in params', withParams.body.server.params.futureFlag, 7);
eq('exits/add: nested param kept', withParams.body.server.params.extra.a, 1);

/* انتخابِ سراسری */
const setDef = await call('POST', '/api/exits/default', { mode: 'exit', exitId: A_ID }, TOK);
eq('exits/default: ok', setDef.body.ok, true);
eq('exits/default: mode', setDef.body.defaultMode, 'exit');
eq('exits/default: id', setDef.body.defaultExit, A_ID);
ok('exits/default: persian message', /پیش‌فرضِ سراسری/.test(String(setDef.body.msg || '')), String(setDef.body.msg));

const setDefBad = await call('POST', '/api/exits/default', { mode: 'exit', exitId: 'nope' }, TOK);
eq('exits/default: unknown server rejected', setDefBad.status, 404);

/* تفکیک: inherit / exit / direct */
{
  const st = W.seed(await W.load(env));
  const u = st.users.find((x) => x.uuid === UUID);
  ok('resolve: user exists', !!u, JSON.stringify(st.users.map((x) => x.uuid)));
  eq('resolve: inherit follows the global default', W.resolveExit(st, u).id, A_ID);
  eq('resolve: per-config direct wins', W.resolveExit(st, { ...u, exitMode: 'direct' }).mode, 'direct');
  eq('resolve: per-config exit wins', W.resolveExit(st, { ...u, exitMode: 'exit', exitId: 'fixed-b' }).id, 'fixed-b');
  const dangling = W.resolveExit(st, { ...u, exitMode: 'exit', exitId: 'gone' });
  eq('resolve: dangling per-config id falls back to direct', dangling.mode, 'direct');
  ok('resolve: dangling reason recorded', /یافت نشد/.test(String(dangling.reason || '')), String(dangling.reason));
}

/* از راهِ API هم */
const sel = await call('POST', '/api/exits', { op: 'select', uuid: UUID, mode: 'exit', exitId: 'fixed-b' }, TOK);
eq('exits/select: ok', sel.body.ok, true);
eq('exits/select: effective id', sel.body.effective.id, 'fixed-b');
ok('exits/select: persian message', /خروجیِ کانفیگ/.test(String(sel.body.msg || '')), String(sel.body.msg));
const selBad = await call('POST', '/api/exits', { op: 'select', uuid: UUID, mode: 'exit', exitId: 'nope' }, TOK);
eq('exits/select: unknown server rejected', selBad.status, 404);
const selMode = await call('POST', '/api/exits', { op: 'select', uuid: UUID, mode: 'inherit' }, TOK);
eq('exits/select: back to inherit', selMode.body.effective.id, A_ID);
const selWrong = await call('POST', '/api/exits', { op: 'select', uuid: UUID, mode: 'whatever' }, TOK);
eq('exits/select: invalid mode rejected', selWrong.status, 400);

/* ویرایش و حذف */
const upd = await call('POST', '/api/exits', { op: 'update', id: A_ID, server: { name: 'آلمان ۲', port: 8443 } }, TOK);
eq('exits/update: ok', upd.body.ok, true);
eq('exits/update: name changed', upd.body.server.name, 'آلمان ۲');
eq('exits/update: port changed', upd.body.server.port, 8443);
eq('exits/update: untouched field kept', upd.body.server.address, 'de.example.net');
eq('exits/update: unknown id rejected', (await call('POST', '/api/exits', { op: 'update', id: 'nope', server: {} }, TOK)).status, 404);

const del = await call('POST', '/api/exits', { op: 'delete', id: 'fixed-b' }, TOK);
eq('exits/delete: ok', del.body.ok, true);
eq('exits/delete: unknown id rejected', (await call('POST', '/api/exits', { op: 'delete', id: 'fixed-b' }, TOK)).status, 404);
eq('exits: operation required', (await call('POST', '/api/exits', { op: 'nope' }, TOK)).status, 400);

/* ══════════════════════════════════════════════════════════════
   ۳) هدرِ VLESS سمت‌کلاینت — بایت‌به‌بایت
   ══════════════════════════════════════════════════════════════ */
const srvT = W.normalizeExit({ address: 'x.test', uuid: '00112233-4455-6677-8899-aabbccddeeff' }, 'id1');
{
  const h = W.vlessRequestHeader(srvT, '1.2.3.4', 443, new Uint8Array([0xaa]));
  eq('vless header: total length (IPv4)', h.length, 1 + 16 + 1 + 1 + 2 + 1 + 4 + 1);
  eq('vless header: version', h[0], 0);
  eq('vless header: uuid bytes', hex(h.slice(1, 17)), '00112233445566778899aabbccddeeff');
  eq('vless header: addons length', h[17], 0);
  eq('vless header: command TCP', h[18], 1);
  eq('vless header: port high', h[19], 1);
  eq('vless header: port low', h[20], 187);      // 443 = 0x01bb
  eq('vless header: atyp IPv4', h[21], 1);
  eq('vless header: address', [...h.slice(22, 26)].join('.'), '1.2.3.4');
  eq('vless header: payload last', h[h.length - 1], 0xaa);
}
{
  const h = W.vlessRequestHeader(srvT, 'example.com', 80, new Uint8Array(0));
  eq('vless header: atyp domain', h[21], 2);
  eq('vless header: domain length', h[22], 'example.com'.length);
  eq('vless header: domain', new TextDecoder().decode(h.slice(23, 23 + 11)), 'example.com');
  eq('vless header: port 80', (h[19] << 8) | h[20], 80);
}
{
  const h = W.vlessRequestHeader(srvT, '2606:4700:4700::1111', 443, new Uint8Array(0));
  eq('vless header: atyp IPv6', h[21], 3);
  eq('vless header: IPv6 expanded to 16 bytes', hex(h.slice(22, 38)), '26064700470000000000000000001111');
}
{
  const srvF = W.normalizeExit({ address: 'x.test', uuid: '00112233-4455-6677-8899-aabbccddeeff', flow: 'xtls-rprx-vision' }, 'id2');
  const h = W.vlessRequestHeader(srvF, '1.2.3.4', 443, new Uint8Array(0));
  const flowLen = 'xtls-rprx-vision'.length;
  eq('vless header: addons length with flow', h[17], 2 + flowLen);
  eq('vless header: addon type = flow', h[18], 1);
  eq('vless header: addon length', h[19], flowLen);
  eq('vless header: addon value', new TextDecoder().decode(h.slice(20, 20 + flowLen)), 'xtls-rprx-vision');
  eq('vless header: command still TCP after addons', h[20 + flowLen], 1);
  eq('vless header: port after addons', (h[21 + flowLen] << 8) | h[22 + flowLen], 443);
}
eq('ipv6: compressed form', hex(W.ipv6ToBytes('::1')), '00000000000000000000000000000001');
eq('ipv6: full form', hex(W.ipv6ToBytes('2001:db8::ff00:42:8329')), '20010db8000000000000ff0000428329');
eq('ipv6: mapped ipv4', hex(W.ipv6ToBytes('::ffff:1.2.3.4')), '00000000000000000000ffff01020304');
eq('ipv6: bracketed', hex(W.ipv6ToBytes('[2606::1]')), '26060000000000000000000000000001');
eq('ipv6: garbage rejected', W.ipv6ToBytes('not-an-ip'), null);

/* کدکِ وب‌سوکت */
{
  const data = new Uint8Array(300).fill(0x5a);
  const frame = W.wsFrame(data, 2);
  eq('ws frame: FIN+opcode', frame[0], 0x82);
  eq('ws frame: masked bit set', (frame[1] & 0x80) !== 0, true);
  eq('ws frame: extended length used for 300', frame[1] & 0x7f, 126);
  const unwrap = W.makeWsUnwrap();
  const { frames } = unwrap.feed(frame);
  eq('ws codec: one frame recovered', frames.length, 1);
  eq('ws codec: payload round-trips', hex(frames[0]), hex(data));
}
{
  const unwrap = W.makeWsUnwrap();
  const a = W.wsFrame(td.encode('ab'), 2);
  const b = W.wsFrame(td.encode('cd'), 2);
  const r1 = unwrap.feed(a.slice(0, 5));                  // نیمه‌ی اولِ قاب
  eq('ws codec: partial frame yields nothing', r1.frames.length, 0);
  const r2 = unwrap.feed(a.slice(5));
  eq('ws codec: frame completed on the rest', new TextDecoder().decode(r2.frames[0]), 'ab');
  /* دو قاب در یک تکه + باقی‌مانده‌ی سرِ HTTP */
  const both = new Uint8Array(a.length + b.length);
  both.set(a); both.set(b, a.length);
  const r3 = unwrap.feed(both);
  eq('ws codec: two frames in one chunk', r3.frames.length, 2);
  eq('ws codec: second frame', new TextDecoder().decode(r3.frames[1]), 'cd');
}
{
  /* قابِ بزرگ (۱۰ بایت سر) هم باید درست جداسازی شود */
  const big = new Uint8Array(70000).fill(7);
  const unwrap = W.makeWsUnwrap();
  const { frames } = unwrap.feed(W.wsFrame(big, 2));
  eq('ws codec: 64-bit length frame', frames.length === 1 && frames[0].length, 70000);
}

/* ══════════════════════════════════════════════════════════════
   ۴) openExitSocket — انتقالِ raw و ws
   ══════════════════════════════════════════════════════════════ */

/** سوکتِ ساختگی با صفِ ورودی — تونل باز می‌ماند */
function makeSock() {
  const written = [];
  const queue = [];
  let notify = null, ctrlRef = null, closed = false;
  const readable = new ReadableStream({
    start(c) { ctrlRef = c; },
    pull(c) {
      if (queue.length) { while (queue.length) c.enqueue(queue.shift()); return; }
      return new Promise((res) => { notify = res; });
    },
  });
  const writable = new WritableStream({ write(chunk) { written.push(new Uint8Array(chunk)); } });
  return {
    opened: Promise.resolve(), readable, writable, written,
    close() { closed = true; this.closed = true; },
    closed,
    feed(u8) { queue.push(u8); if (notify) { const n = notify; notify = null; n(); } },
    end() { if (ctrlRef) { try { ctrlRef.close(); } catch (e) {} } },
  };
}

const WS_101 = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n';
/** مانندِ makeSock، اما به درخواستِ ارتقای وب‌سوکت پاسخِ ۱۰۱ می‌دهد */
function makeWsSock() {
  const s = makeSock();
  setTimeout(() => s.feed(td.encode(WS_101)), 5);
  return s;
}

/* ── raw: هندشیک مستقیماً روی TCP نوشته می‌شود ── */
{
  let seen = null;
  const sock = makeSock();
  __mock.connect = (addr, opts) => { seen = { addr, opts }; return sock; };
  const srv = W.normalizeExit({ address: 'raw.test', port: 2053, uuid: '00112233-4455-6677-8899-aabbccddeeff', security: 'none', transport: 'raw' }, 'raw1');
  const payload = td.encode('GET / HTTP/1.1\r\n\r\n');
  const exit = await W.openExitSocket(srv, { addr: '93.184.216.34', port: 443, cmd: 1, payload });
  eq('exit raw: connect host', seen.addr.hostname, 'raw.test');
  eq('exit raw: connect port', seen.addr.port, 2053);
  eq('exit raw: plaintext transport', seen.opts.secureTransport, 'off');
  eq('exit raw: one write', sock.written.length, 1);
  eq('exit raw: written bytes are the VLESS request', hex(sock.written[0]),
    hex(W.vlessRequestHeader(srv, '93.184.216.34', 443, payload)));
  ok('exit raw: facade looks like a socket',
    !!(exit.readable && exit.writable && typeof exit.close === 'function'));
  exit.close();
  eq('exit raw: close reaches the socket', sock.closed, true);
}

/* ── ws: ارتقا، سپس هندشیک داخلِ اولین قاب ── */
{
  let seen = null;
  const sock = makeSock();
  __mock.connect = (addr, opts) => { seen = { addr, opts }; return sock; };
  const srv = W.normalizeExit({ address: 'ws.test', port: 443, uuid: '00112233-4455-6677-8899-aabbccddeeff', security: 'tls', transport: 'ws', path: '/exit-ws', host: 'cdn.example.org' }, 'ws1');
  const payload = td.encode('HELLO');
  const opening = W.openExitSocket(srv, { addr: 'example.org', port: 443, cmd: 1, payload });
  /* سرور خروجی پاسخِ ۱۰۱ را می‌فرستد */
  setTimeout(() => sock.feed(td.encode('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')), 10);
  const exit = await opening;
  eq('exit ws: TLS transport requested', seen.opts.secureTransport, 'on');
  eq('exit ws: upgrade request written', /^GET \/exit-ws HTTP\/1\.1\r\n/.test(new TextDecoder().decode(sock.written[0])), true);
  ok('exit ws: Host header from the config', /Host: cdn\.example\.org\r\n/.test(new TextDecoder().decode(sock.written[0])),
    new TextDecoder().decode(sock.written[0]).split('\r\n')[1]);
  ok('exit ws: Sec-WebSocket-Key present', /Sec-WebSocket-Key: /.test(new TextDecoder().decode(sock.written[0])));
  eq('exit ws: handshake inside a binary frame', sock.written.length, 2);
  const unwrap = W.makeWsUnwrap();
  const got = unwrap.feed(sock.written[1]);
  eq('exit ws: second write is one frame', got.frames.length, 1);
  eq('exit ws: frame carries the VLESS request', hex(got.frames[0]),
    hex(W.vlessRequestHeader(srv, 'example.org', 443, payload)));

  /* داده‌ی سرور (قاب‌بندی‌شده) باید بدونِ هدر به تونل برسد */
  const reader = exit.readable.getReader();
  const incoming = W.wsFrame(td.encode('RESPONSE-BYTES'), 2);
  setTimeout(() => sock.feed(incoming), 5);
  const chunk = await Promise.race([
    reader.read(),
    new Promise((_, rj) => setTimeout(() => rj(new Error('چیزی از خروجی نرسید')), 2000)),
  ]);
  eq('exit ws: server frame unwrapped', new TextDecoder().decode(chunk.value), 'RESPONSE-BYTES');
  reader.releaseLock();

  /* نوشتن در خروجی باید قاب‌بندی شود */
  const w = exit.writable.getWriter();
  await w.write(td.encode('CLIENT-BYTES'));
  w.releaseLock();
  const last = sock.written[sock.written.length - 1];
  const back = W.makeWsUnwrap().feed(last);
  eq('exit ws: client write is framed', new TextDecoder().decode(back.frames[0]), 'CLIENT-BYTES');
  exit.close();
}

/* ── ws: پاسخِ غیرِ ۱۰۱ باید خطا بدهد (تا مسیر مستقیم جایگزین شود) ── */
{
  const sock = makeSock();
  __mock.connect = () => sock;
  const srv = W.normalizeExit({ address: 'ws2.test', uuid: '00112233-4455-6677-8899-aabbccddeeff', security: 'none', transport: 'ws', path: '/' }, 'ws2');
  const opening = W.openExitSocket(srv, { addr: 'example.org', port: 443, cmd: 1, payload: new Uint8Array(0) });
  setTimeout(() => sock.feed(td.encode('HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\n\r\n')), 5);
  let err = null;
  try { await opening; } catch (e) { err = e; }
  ok('exit ws: non-101 rejected', !!err, String(err && err.message));
  ok('exit ws: error mentions the upgrade', /وب‌سوکت/.test(String(err && err.message)), String(err && err.message));
}

/* ── grpc پشتیبانی نمی‌شود → خطای صریح (مسیر مستقیم جایگزین می‌شود) ── */
{
  __mock.connect = () => makeSock();
  const srv = W.normalizeExit({ address: 'g.test', uuid: '00112233-4455-6677-8899-aabbccddeeff', transport: 'grpc', serviceName: 'svc' }, 'g1');
  let err = null;
  try { await W.openExitSocket(srv, { addr: 'a.b', port: 443, cmd: 1, payload: new Uint8Array(0) }); } catch (e) { err = e; }
  ok('exit grpc: explicit error', !!err && /grpc/.test(String(err.message)), String(err && err.message));
}

/* ── شکستِ خودِ connect باید خطا بدهد ── */
{
  __mock.connect = () => { throw new Error('دسترسی به سرور خروجی ممکن نیست'); };
  const srv = W.normalizeExit({ address: 'down.test', uuid: '00112233-4455-6677-8899-aabbccddeeff', security: 'none', transport: 'raw' }, 'd1');
  let err = null;
  try { await W.openExitSocket(srv, { addr: 'a.b', port: 443, cmd: 1, payload: new Uint8Array(0) }); } catch (e) { err = e; }
  eq('exit down: error surfaces', String(err && err.message), 'دسترسی به سرور خروجی ممکن نیست');
}

/* ── POST /api/exits/test — اندازه‌گیریِ واقعی ── */
{
  let seen = null;
  __mock.connect = (addr) => { seen = addr; return makeWsSock(); };
  const t = await call('POST', '/api/exits/test', { id: A_ID }, TOK);
  eq('exits/test: ok', t.body.ok, true);
  eq('exits/test: reachable', t.body.reachable, true);
  ok('exits/test: ms is a real number', typeof t.body.ms === 'number' && t.body.ms >= 0, String(t.body.ms));
  ok('exits/test: persian message', /زمان پاسخ/.test(String(t.body.msg || '')), String(t.body.msg));
  eq('exits/test: probed the exit host', seen.hostname, 'de.example.net');

  /* تستِ یک سرورِ ذخیره‌نشده */
  const t2 = await call('POST', '/api/exits/test',
    { server: { address: 'probe.test', uuid: '00112233-4455-6677-8899-aabbccddeeff', security: 'none', transport: 'raw' } }, TOK);
  eq('exits/test: ad-hoc server ok', t2.body.reachable, true);

  /* شکست */
  __mock.connect = () => { throw new Error('اتصال رد شد'); };
  const t3 = await call('POST', '/api/exits/test', { id: A_ID }, TOK);
  eq('exits/test: unreachable reported', t3.body.reachable, false);
  ok('exits/test: persian failure message', /برقرار نشد/.test(String(t3.body.msg || '')), String(t3.body.msg));
  eq('exits/test: unknown id rejected', (await call('POST', '/api/exits/test', { id: 'nope' }, TOK)).status, 404);
}

/* ══════════════════════════════════════════════════════════════
   ۵) ورودِ بالادست به مسیر تونل — و بازگشت به مستقیم هنگام خطا
   ══════════════════════════════════════════════════════════════ */
const SUCCESSES = [];

/** باز کردنِ یک تونل کامل از ورودیِ fetch و تحویلِ هدرِ VLESS */
async function openTunnel(tip, headerBuf, waitMs = 220) {
  const tctx = makeCtx();
  const res = await W.default.fetch(new Request('https://' + HOST + '/sg', {
    headers: { upgrade: 'websocket', connection: 'Upgrade', host: HOST, 'cf-connecting-ip': tip },
  }), env, tctx);
  const ws = res.webSocket;
  await new Promise((r) => setTimeout(r, 50));
  ws.deliver(headerBuf);
  await new Promise((r) => setTimeout(r, waitMs));
  await tctx._settle();
  return { ws, ctx: tctx };
}
const mkHeader = (addr, port, payload) => {
  const h = W.vlessHeader({ uuid: UUID }, addr, port, payload);
  return h.buffer.slice(h.byteOffset, h.byteOffset + h.byteLength);
};

/* الف) خروجیِ سراسری تنظیم شده باشد → تونل باید به «سرور خروجی» وصل شود */
{
  const st = W.seed(await W.load(env));
  st.settings.exits.defaultMode = 'exit';
  st.settings.exits.defaultExit = A_ID;
  st.users.find((x) => x.uuid === UUID).exitMode = 'inherit';
  await W.save(env, st);

  let seen = null;
  const sock = makeWsSock();
  __mock.connect = (addr) => { seen = addr; return sock; };
  const payload = td.encode('GET /via-exit HTTP/1.1\r\nHost: example.org\r\n\r\n');
  const t = await openTunnel('203.0.113.10', mkHeader('example.org', 443, payload));
  eq('tunnel via exit: socket opened to the exit host', seen && seen.hostname, 'de.example.net');
  eq('tunnel via exit: socket port from the exit config', seen && seen.port, 8443);
  ok('tunnel via exit: not the real destination', seen && seen.hostname !== 'example.org', String(seen && seen.hostname));
  ok('tunnel via exit: VLESS handshake written to the exit',
    sock.written.length >= 2 && hex(sock.written[1] ? W.makeWsUnwrap().feed(sock.written[1]).frames[0] : new Uint8Array(0)).length > 0);
  ok('tunnel via exit: stats counted', W.EXIT_STATS.tunnels > 0, 'tunnels=' + W.EXIT_STATS.tunnels);
  t.ws.close();
  await new Promise((r) => setTimeout(r, 60));
  await t.ctx._settle();
  SUCCESSES.push('exit');
}

/* ب) سرور خروجی از دسترس خارج شود → مسیر مستقیم ادامه می‌دهد (اتصال قطع نمی‌شود) */
{
  const before = W.EXIT_STATS.fallbacks;
  let seen = null;
  __mock.connect = (addr) => {
    seen = addr;
    if (addr.hostname === 'de.example.net') throw new Error('سرور خروجی در دسترس نیست');
    const s = makeSock();
    s.feed(new Uint8Array(512).fill(0x41));       // مقصد پاسخ می‌دهد
    return s;
  };
  const payload = td.encode('GET /direct HTTP/1.1\r\nHost: example.org\r\n\r\n');
  const t = await openTunnel('203.0.113.11', mkHeader('example.org', 443, payload));
  eq('fallback: destination used instead', seen && seen.hostname, 'example.org');
  eq('fallback: recorded', W.EXIT_STATS.fallbacks > before, true);
  ok('fallback: error logged for the report', /سرور خروجی/.test(String(W.EXIT_LAST_ERR || '')), String(W.EXIT_LAST_ERR));
  eq('fallback: connection stayed open', t.ws.closed, false);
  ok('fallback: data still reached the client', t.ws.recvBytes > 0, 'recv=' + t.ws.recvBytes);
  t.ws.close();
  await new Promise((r) => setTimeout(r, 60));
  await t.ctx._settle();
  SUCCESSES.push('fallback');
}

/* ج) انتخابِ هر کانفیگ روی «مستقیم» → خروجیِ سراسری نادیده گرفته شود */
{
  const st = W.seed(await W.load(env));
  st.users.find((x) => x.uuid === UUID).exitMode = 'direct';
  await W.save(env, st);
  let seen = null;
  __mock.connect = (addr) => { seen = addr; const s = makeSock(); s.feed(new Uint8Array(64)); return s; };
  const t = await openTunnel('203.0.113.12', mkHeader('example.org', 443, td.encode('GET / HTTP/1.0\r\n\r\n')));
  eq('per-config direct: exit skipped', seen && seen.hostname, 'example.org');
  t.ws.close();
  await new Promise((r) => setTimeout(r, 40));
  await t.ctx._settle();
  const st2 = W.seed(await W.load(env));
  st2.users.find((x) => x.uuid === UUID).exitMode = 'inherit';
  await W.save(env, st2);
}

/* د) با خاموش بودنِ exits.enabled هیچ‌وقت سراغِ خروجی نمی‌رویم */
{
  const st = W.seed(await W.load(env));
  st.settings.exits.enabled = false;
  await W.save(env, st);
  eq('exits.enabled=false: routing disabled', W.exitRoutingEnabled(st), false);
  let seen = null;
  __mock.connect = (addr) => { seen = addr; const s = makeSock(); s.feed(new Uint8Array(64)); return s; };
  const t = await openTunnel('203.0.113.13', mkHeader('example.org', 443, td.encode('GET / HTTP/1.0\r\n\r\n')));
  eq('exits.enabled=false: direct used', seen && seen.hostname, 'example.org');
  t.ws.close();
  await new Promise((r) => setTimeout(r, 40));
  await t.ctx._settle();
  const st2 = W.seed(await W.load(env));
  st2.settings.exits.enabled = true;
  await W.save(env, st2);
}

/* ══════════════════════════════════════════════════════════════
   ۶) رادار — تولیدِ کاندیدا و اندازه‌گیریِ واقعی
   ══════════════════════════════════════════════════════════════ */
{
  const cfg = {
    pools: [], cidrs: [],
    ranges: [{ prefix: '10.0.', from: 5, to: 6 }],
    count: 40, ports: [443], probes: 1, concurrency: 6, timeoutMs: 500, keep: 8, tls: false, exitId: '',
  };
  const ips = W.radarCandidates(cfg, 12);
  eq('candidates: count honoured', ips.length, 12);
  ok('candidates: inside the configured range',
    ips.every((ip) => /^10\.0\.([56])\.\d{1,3}$/.test(ip)), JSON.stringify(ips.slice(0, 4)));
  eq('candidates: unique', new Set(ips).size, 12);
}
{
  const cfg = { pools: ['1.1.1.1', '9.9.9.9'], ranges: [], cidrs: [], count: 10 };
  eq('candidates: explicit pool first', W.radarCandidates(cfg, 10).join(','), '1.1.1.1,9.9.9.9');
}
{
  const r = W.cidrToRange('104.16.0.0/13');
  eq('cidr: start', r.start, (104 << 24) | (16 << 16));
  eq('cidr: size', r.size, Math.pow(2, 19));
  eq('cidr: invalid rejected', W.cidrToRange('104.16.0.0/40'), null);
  const cfg = { pools: [], ranges: [], cidrs: ['192.0.2.0/24'], count: 20 };
  const ips = W.radarCandidates(cfg, 20);
  ok('cidr: candidates inside the block', ips.length === 20 && ips.every((ip) => ip.startsWith('192.0.2.')), JSON.stringify(ips.slice(0, 3)));
}

/* اندازه‌گیریِ واقعی با connect() موک‌شده */
{
  let n = 0;
  __mock.connect = () => { n++; return makeSock(); };
  const fast = await W.probeIp('1.1.1.1', 443, { timeoutMs: 1000, tls: true });
  eq('probe: ok', fast.ok, true);
  ok('probe: ms measured', typeof fast.ms === 'number' && fast.ms >= 0, String(fast.ms));
  eq('probe: one socket opened', n, 1);

  __mock.connect = () => { throw new Error('رد شد'); };
  const dead = await W.probeIp('1.1.1.1', 443, { timeoutMs: 1000 });
  eq('probe: failure reported', dead.ok, false);
  ok('probe: failure has a reason', !!dead.error, String(dead.error));
}

/* اسکنِ کامل — مرتب‌سازی و شمارش */
{
  const st = W.seed(await W.load(env));
  st.settings.radar.pools = ['203.0.113.1', '203.0.113.2', '198.51.100.5'];
  st.settings.radar.ranges = [];
  st.settings.radar.cidrs = [];
  st.settings.radar.ports = [443];
  st.settings.radar.probes = 2;
  st.settings.radar.count = 3;
  st.settings.radar.keep = 5;
  st.settings.radar.concurrency = 6;
  st.settings.radar.timeoutMs = 1500;
  st.settings.radar.tls = false;
  st.settings.radar.exitId = '';
  await W.save(env, st);

  /* آی‌پیِ وسطی مرده است — بقیه سالم */
  __mock.connect = (addr) => {
    if (addr.hostname === '198.51.100.5') throw new Error('رد شد');
    return makeSock();
  };
  const scan = await call('POST', '/api/radar/scan', { ips: ['203.0.113.1', '203.0.113.2', '198.51.100.5'], probes: 2 }, TOK);
  eq('scan: ok', scan.body.ok, true);
  eq('scan: tested count', scan.body.tested, 3);
  eq('scan: alive count', scan.body.alive, 2);
  eq('scan: failed count', scan.body.failed, 1);
  ok('scan: duration measured', typeof scan.body.scanMs === 'number' && scan.body.scanMs >= 0, String(scan.body.scanMs));
  eq('scan: via direct', scan.body.via, 'direct');
  const res = scan.body.results || [];
  eq('scan: results kept', res.length, 3);
  ok('scan: healthy first, dead last', res[0].ok === true && res[res.length - 1].ok === false,
    JSON.stringify(res.map((r) => ({ ip: r.ip, ok: r.ok }))));
  ok('scan: latency is a real number', res.every((r) => r.ok === false || typeof r.ms === 'number'), JSON.stringify(res));
  ok('scan: jitter present', res.every((r) => r.ok === false || typeof r.jitter === 'number'));
  ok('scan: loss present', res.every((r) => typeof r.loss === 'number'));
  ok('scan: best is healthy', scan.body.best && scan.body.best.ok === true, JSON.stringify(scan.body.best));
  ok('scan: persian summary', /آی‌پی سالم/.test(String(scan.body.msg || '')), String(scan.body.msg));
  /* تأخیرها باید صعودی باشند */
  const ms = res.filter((r) => r.ok).map((r) => r.score);
  eq('scan: sorted best to worst', JSON.stringify(ms), JSON.stringify([...ms].sort((a, b) => a - b)));

  /* concurrency بیشتر از سقفِ ورکرز محدود می‌شود */
  const capped = await call('POST', '/api/radar/scan',
    { ips: ['203.0.113.1'], concurrency: 99, count: 9999 }, TOK);
  eq('scan: concurrency capped', capped.body.config.concurrency, W.MAX_RADAR_CONCURRENCY);
  eq('scan: count capped', capped.body.config.count <= W.MAX_RADAR_COUNT, true);
}

/* اسکن از مسیرِ سرور خروجی */
{
  let seen = [];
  __mock.connect = (addr) => { seen.push(addr.hostname); return makeWsSock(); };
  const st = W.seed(await W.load(env));
  st.settings.radar.exitId = A_ID;
  await W.save(env, st);
  const scan = await call('POST', '/api/radar/scan', { ips: ['203.0.113.20'], ports: [443], probes: 1 }, TOK);
  eq('scan via exit: ok', scan.body.ok, true);
  eq('scan via exit: labelled', scan.body.via, 'exit:آلمان ۲');
  ok('scan via exit: probed through the exit host', seen.every((h) => h === 'de.example.net'), JSON.stringify(seen));
  ok('scan via exit: latency measured', scan.body.results[0] && typeof scan.body.results[0].ms === 'number');

  /* شناسه‌ی خروجیِ نامعتبر باید خطا بدهد، بی‌آنکه چیزی را خراب کند */
  const st2 = W.seed(await W.load(env));
  st2.settings.radar.exitId = 'nope';
  await W.save(env, st2);
  const bad = await call('POST', '/api/radar/scan', { ips: ['203.0.113.20'] }, TOK);
  eq('scan via exit: unknown id rejected', bad.status, 400);
  ok('scan via exit: persian error', /سرور خروجی/.test(String(bad.body.error || '')), String(bad.body.error));
  const st3 = W.seed(await W.load(env));
  st3.settings.radar.exitId = '';
  await W.save(env, st3);
}

/* تنظیماتِ رادار در دسترس باشند */
{
  const cfg = await call('GET', '/api/radar/config', null, TOK);
  eq('radar/config: ok', cfg.body.ok, true);
  eq('radar/config: max concurrency', cfg.body.maxConcurrency, W.MAX_RADAR_CONCURRENCY);
  ok('radar/config: exits listed for scanning through', Array.isArray(cfg.body.exits));
  ok('radar/config: persian message', /سقفِ اتصال/.test(String(cfg.body.msg || '')), String(cfg.body.msg));
}

/* ══════════════════════════════════════════════════════════════
   ۷) اعمالِ آی‌پیِ پیشنهادی روی کانفیگ(ها)
   ══════════════════════════════════════════════════════════════ */
{
  const U2 = '22222222-3333-4444-5555-666666666666';
  await call('POST', '/api/users', { name: 'سارا', uuid: U2, secret: 'sec-sara' }, TOK);

  const one = await call('POST', '/api/radar/apply', { uuid: UUID, ips: ['104.17.1.1', '172.64.32.7'] }, TOK);
  eq('apply: ok', one.body.ok, true);
  eq('apply: one config updated', one.body.updated, 1);
  eq('apply: ips stored', one.body.ips.length, 2);
  ok('apply: persian message', /اعمال شد/.test(String(one.body.msg || '')), String(one.body.msg));

  let st = W.seed(await W.load(env));
  const u = st.users.find((x) => x.uuid === UUID);
  eq('apply: cleanIPs replaced', (u.cleanIPs || []).length, 2);
  ok('apply: label attached', /^104\.17\.1\.1#./.test(String((u.cleanIPs || [])[0])), String((u.cleanIPs || [])[0]));
  eq('apply: other config untouched', (st.users.find((x) => x.uuid === U2).cleanIPs || []).length, 0);

  /* برچسبِ آی‌پیِ تکراری حفظ شود */
  st.users.find((x) => x.uuid === UUID).cleanIPs = ['104.17.1.1#برچسبِ من'];
  await W.save(env, st);
  await call('POST', '/api/radar/apply', { uuid: UUID, ips: ['104.17.1.1', '203.0.113.9'] }, TOK);
  st = W.seed(await W.load(env));
  const kept = st.users.find((x) => x.uuid === UUID).cleanIPs;
  eq('apply: existing label preserved', kept[0], '104.17.1.1#برچسبِ من');
  ok('apply: new ip gets a label', /^203\.0\.113\.9#.+/.test(String(kept[1])), String(kept[1]));

  /* روی همه‌ی کانفیگ‌ها */
  const all = await call('POST', '/api/radar/apply', { all: true, ips: ['188.114.97.3'] }, TOK);
  eq('apply all: ok', all.body.ok, true);
  ok('apply all: every config updated', all.body.updated >= 2, 'updated=' + all.body.updated);
  st = W.seed(await W.load(env));
  ok('apply all: all users carry the ip',
    st.users.filter((x) => (x.cleanIPs || []).some((c) => String(c).startsWith('188.114.97.3#'))).length >= 2,
    JSON.stringify(st.users.map((x) => x.cleanIPs)));

  /* ورودیِ نامعتبر */
  const none = await call('POST', '/api/radar/apply', { uuid: UUID, ips: [] }, TOK);
  eq('apply: empty list rejected', none.status, 400);
  const noTarget = await call('POST', '/api/radar/apply', { ips: ['1.1.1.1'] }, TOK);
  eq('apply: missing target rejected', noTarget.status, 400);
  ok('apply: persian error', /کانفیگ/.test(String(noTarget.body.error || '')), String(noTarget.body.error));
}

/* ══════════════════════════════════════════════════════════════
   ۸) فهرست، احراز هویت و یکپارچگی
   ══════════════════════════════════════════════════════════════ */
{
  const list = await call('GET', '/api/exits', null, TOK);
  eq('exits/list: ok', list.body.ok, true);
  ok('exits/list: servers returned', Array.isArray(list.body.servers) && list.body.servers.length >= 2, String((list.body.servers || []).length));
  eq('exits/list: effective mode', list.body.effective.mode, 'exit');
  eq('exits/list: effective id', list.body.effective.id, A_ID);
  ok('exits/list: per-config selection reported',
    (list.body.perConfig || []).some((p) => p.uuid === UUID || p.id), JSON.stringify((list.body.perConfig || []).slice(0, 1)));
  ok('exits/list: stats present', typeof list.body.stats === 'object');
}

for (const p of ['/api/exits', '/api/radar/config']) {
  eq('auth: GET ' + p + ' guarded', (await call('GET', p, null, null)).status, 401);
}
for (const p of ['/api/exits', '/api/exits/default', '/api/exits/test', '/api/radar/scan', '/api/radar/apply']) {
  eq('auth: POST ' + p + ' guarded', (await call('POST', p, {}, null)).status, 401);
}

/* هسته‌ی VPN دست‌نخورده مانده: شمارشِ مصرف و محدودساز هنوز کار می‌کنند */
{
  const row = await W.usageFresh(env, UUID);
  ok('core untouched: usage row still written by the tunnel', !!row, JSON.stringify(row));
  eq('core untouched: acquire still admits', (await W.connAcquire(env, UUID, '203.0.113.77', 1, 't15-1')).ok, true);
  eq('core untouched: second ip denied at the cap', (await W.connAcquire(env, UUID, '203.0.113.78', 1, 't15-2')).ok, false);
  await W.connRelease(env, UUID, '203.0.113.77', 't15-1');
}

/* هیچ تایمر ضربان‌قلبی‌ای اضافه نشده — فقط setTimeout برای زمانِ انتظارِ اتصال */
{
  const src = await (await import('node:fs/promises')).readFile(new URL('../worker.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('سرورهای خروجی VLESS (exit / outbound) — مرحله‌ی ۲'));
  ok('no heartbeat: no setInterval in the new code', !/setInterval/.test(block));
  ok('no base64 blobs in the new code', !/[A-Za-z0-9+/]{120,}={0,2}/.test(block));
}

await ctx._settle();
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL EXIT + RADAR TESTS PASSED');
process.exit(fails ? 1 : 0);
