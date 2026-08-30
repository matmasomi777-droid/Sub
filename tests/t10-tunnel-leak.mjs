// TEST 10 — the tunnel entrypoint must never leave a live-connection row behind
import { makeD1 } from './d1.mjs';
import { makeCtx, fakeSocket } from './mocks.mjs';
import { __mock } from './cf-sockets.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const chk = (label, cond, note = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};

const HOST = 'panel.example.workers.dev';
const UUID = 'aaaaaaaa-1111-2222-3333-444444444444';

const rows = async (env) => {
  try {
    const r = await env.DB.prepare('SELECT uuid, ip, conn_id FROM conns').all();
    return (r.results || []).map((x) => x.ip + '/' + x.conn_id);
  } catch (e) { return []; }          // جدول هنوز ساخته نشده = هیچ ردیفی نیست
};

async function setup() {
  const env = { DB: makeD1() };
  const st = W.seed(W.DEF());
  st.users = [{ id: 'u1', name: 'ali', uuid: UUID, secret: 'sec', enabled: true,
    ipLimit: 1, up: 0, down: 0, totalReq: 0, quotaGB: 0, dailyQuotaMB: 0, expiryAt: null }];
  await W.save(env, st);
  return env;
}

const payload = new TextEncoder().encode('GET /x HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n');
const header = W.vlessHeader({ uuid: UUID }, 'example.com', 443, payload);
const buf = header.buffer.slice(header.byteOffset, header.byteOffset + header.byteLength);

async function openTunnel(env, ip) {
  const ctx = makeCtx();
  const req = new Request('https://' + HOST + '/sg', {
    headers: { upgrade: 'websocket', connection: 'Upgrade', host: HOST, 'cf-connecting-ip': ip },
  });
  const res = await W.default.fetch(req, env, ctx);
  const ws = res.webSocket;
  await new Promise((r) => setTimeout(r, 40));
  ws.deliver(buf);
  await new Promise((r) => setTimeout(r, 120));
  await ctx._settle();
  return { ws, ctx };
}

/* ── ۱) درخواستِ عادی که تمام می‌شود → هیچ ردیفی نماند ── */
{
  const env = await setup();
  __mock.connect = () => fakeSocket(4096, 4096, false);      // مقصد بعد از پاسخ می‌بندد
  const t = await openTunnel(env, '203.0.113.70');
  chk('1) normal request: no row left', (await rows(env)).length === 0, JSON.stringify(await rows(env)));
  chk('1) ws closed by the worker', t.ws.closed === true || t.ws.readyState === 3);
}

/* ── ۲) کلاینت ناگهان قطع می‌شود (اتصالِ مقصد هنوز باز است) → ردیف آزاد شود ── */
{
  const env = await setup();
  __mock.connect = () => fakeSocket(4096, 4096, true);       // تونلِ زنده
  const t = await openTunnel(env, '203.0.113.71');
  chk('2) row held while the tunnel is live', (await rows(env)).length === 1, JSON.stringify(await rows(env)));
  t.ws.close();                                              // کلاینت رفت
  await new Promise((r) => setTimeout(r, 60));
  await t.ctx._settle();
  chk('2) row released when the client disappears', (await rows(env)).length === 0, JSON.stringify(await rows(env)));
  const t2 = await openTunnel(env, '203.0.113.72');
  chk('2) a different IP can connect afterwards', t2.ws.closed === false);
}

/* ── ۳) یو‌یو‌آی‌دیِ غلط → ردیفی ساخته نشود ── */
{
  const env = await setup();
  __mock.connect = () => fakeSocket(4096, 4096, false);
  const bad = W.vlessHeader({ uuid: '00000000-0000-0000-0000-000000000000' }, 'example.com', 443, payload);
  const badBuf = bad.buffer.slice(bad.byteOffset, bad.byteOffset + bad.byteLength);
  const ctx = makeCtx();
  const res = await W.default.fetch(new Request('https://' + HOST + '/sg', {
    headers: { upgrade: 'websocket', connection: 'Upgrade', host: HOST, 'cf-connecting-ip': '203.0.113.73' },
  }), env, ctx);
  await new Promise((r) => setTimeout(r, 40));
  res.webSocket.deliver(badBuf);
  await new Promise((r) => setTimeout(r, 80));
  await ctx._settle();
  chk('3) bad UUID leaves no row', (await rows(env)).length === 0, JSON.stringify(await rows(env)));
}

/* ── ۴) مسیرِ رد از درون تونل: ردیفی از آی‌پیِ ردشده نماند ── */
{
  const env = await setup();
  __mock.connect = () => fakeSocket(4096, 4096, true);
  const a = await openTunnel(env, '203.0.113.80');
  const b = await openTunnel(env, '203.0.113.81');
  chk('4) second IP rejected through the tunnel', b.ws.closed === true, 'code=' + b.ws.closeCode);
  const r = await rows(env);
  chk('4) only the admitted IP has a row', r.length === 1 && r[0].startsWith('203.0.113.80'), JSON.stringify(r));
}

/* ── ۵) ردیفِ جامانده با ضربانِ قدیمی بعد از TTL آزاد می‌شود ── */
{
  const env = await setup();
  __mock.connect = () => fakeSocket(4096, 4096, true);
  const t = await openTunnel(env, '203.0.113.90');
  chk('5) row present', (await rows(env)).length === 1);
  /* شبیه‌سازیِ قطعِ بی‌خبر: ضربان قطع می‌شود و زمان می‌گذرد */
  await env.DB.prepare('UPDATE conns SET last_ts = ?').bind(Date.now() - (W.CONN_TTL + 5000)).run();
  await W.liveSweep(env, null);
  chk('5) stale row swept after TTL', (await rows(env)).length === 0);
  const t2 = await openTunnel(env, '203.0.113.91');
  chk('5) new IP admitted after the sweep', t2.ws.closed === false);
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL TUNNEL-LEAK TESTS PASSED');
process.exit(fails ? 1 : 0);
